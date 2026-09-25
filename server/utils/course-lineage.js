import { all, get, run, transaction } from '../db.js'
import { publicOutcome } from './outcome-manifest.js'

const MAX_SUMMARY_ITEMS = 20
const MAX_SUMMARY_TEXT = 500
const MAX_SUMMARY_OUTCOMES = 50

export class CourseLineageError extends Error {
  constructor(message, code, status = 409) {
    super(message)
    this.name = 'CourseLineageError'
    this.code = code
    this.status = status
  }
}

export function normalizeLane(lane) {
  if (typeof lane !== 'string') return ''
  return lane.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function parseJson(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function capText(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_SUMMARY_TEXT) : ''
}

function appendUnique(target, value) {
  const text = capText(value)
  if (text && !target.includes(text) && target.length < MAX_SUMMARY_ITEMS) target.push(text)
}

function appendUniqueOutcome(target, seen, value) {
  if (typeof value === 'string') {
    const title = capText(value)
    const key = `title:${title.normalize('NFKC').toLocaleLowerCase('en-US')}`
    if (!title || seen.has(key) || target.length >= MAX_SUMMARY_OUTCOMES) return
    seen.add(key)
    target.push(title)
    return
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || typeof value.title !== 'string') return
  if (seen.has(value.id) || target.length >= MAX_SUMMARY_OUTCOMES) return
  seen.add(value.id)
  target.push(publicOutcome(value))
}

export function getActiveRootTrailCount() {
  return get(
    `SELECT COUNT(*) AS count
     FROM topics t
     WHERE t.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM course_links cl WHERE cl.child_topic_id = t.id)`,
  ).count
}

export function getCourseReadiness(topicId) {
  const course = get('SELECT * FROM topics WHERE id = ?', Number(topicId))
  if (!course) {
    return { eligible: false, reason: 'Topic not found.', course: null, modules: [] }
  }

  const modules = all(
    'SELECT id, module_index, title, status, completed_at FROM modules WHERE topic_id = ? ORDER BY module_index',
    course.id,
  )
  if (modules.length === 0) {
    return { eligible: false, reason: 'The course has no module checkpoints yet.', course, modules }
  }

  const incomplete = modules.filter((module) => module.status !== 'completed')
  if (incomplete.length > 0) {
    return {
      eligible: false,
      reason: `${incomplete.length} module checkpoint${incomplete.length === 1 ? '' : 's'} remain.`,
      course,
      modules,
    }
  }

  return { eligible: true, course, modules }
}

export function buildCourseSummary(topicId) {
  const course = get('SELECT * FROM topics WHERE id = ?', Number(topicId))
  if (!course) throw new CourseLineageError('Topic not found.', 'TOPIC_NOT_FOUND', 404)

  const outcomes = []
  const outcomeIds = new Set()
  const strengths = []
  const strengthIds = new Set()
  const gaps = []
  const feedback = []
  const moduleOutcomeRows = all('SELECT skill_outcomes FROM modules WHERE topic_id = ? ORDER BY module_index', course.id)
  for (const moduleRow of moduleOutcomeRows) {
    const declaredOutcomes = parseJson(moduleRow.skill_outcomes, [])
    for (const outcome of Array.isArray(declaredOutcomes) ? declaredOutcomes : []) appendUniqueOutcome(outcomes, outcomeIds, outcome)
  }
  const lessonRows = all(
    `SELECT l.id, l.title, l.outcomes, p.state, p.quiz_score, p.last_gaps
     FROM lessons l
     JOIN modules m ON m.id = l.module_id
     LEFT JOIN progress p ON p.topic_id = ? AND p.lesson_id = l.id
     WHERE m.topic_id = ?
     ORDER BY m.module_index, l.lesson_index`,
    course.id,
    course.id,
  )

  for (const lesson of lessonRows) {
    const lessonOutcomes = parseJson(lesson.outcomes, [])
    if (['passed', 'tested_out'].includes(lesson.state)) {
      for (const outcome of Array.isArray(lessonOutcomes) ? lessonOutcomes : []) appendUniqueOutcome(strengths, strengthIds, outcome)
    }
    if (typeof lesson.quiz_score === 'number' && lesson.quiz_score < 75) appendUnique(gaps, `${lesson.title}: quiz score ${lesson.quiz_score}`)
    const lessonGaps = parseJson(lesson.last_gaps, [])
    for (const gap of Array.isArray(lessonGaps) ? lessonGaps : []) appendUnique(gaps, gap)
  }

  const artifactRows = all(
    `SELECT a.feedback FROM artifacts a
     JOIN progress p ON p.id = a.progress_id
     WHERE p.topic_id = ? AND a.feedback IS NOT NULL
     ORDER BY a.created_at DESC LIMIT ?`,
    course.id,
    MAX_SUMMARY_ITEMS,
  )
  for (const artifact of artifactRows) appendUnique(feedback, artifact.feedback)

  const examRows = all(
    'SELECT evaluation FROM exam_attempts WHERE topic_id = ? AND evaluation IS NOT NULL ORDER BY created_at DESC LIMIT ?',
    course.id,
    MAX_SUMMARY_ITEMS,
  )
  for (const exam of examRows) {
    const evaluation = parseJson(exam.evaluation, {})
    for (const gap of Array.isArray(evaluation.gaps) ? evaluation.gaps : []) appendUnique(gaps, gap)
    for (const item of Array.isArray(evaluation.feedback) ? evaluation.feedback : []) {
      if (typeof item === 'string') appendUnique(feedback, item)
      else appendUnique(feedback, item?.explanation)
    }
  }

  const mistakes = all(
    'SELECT description FROM mistakes_log WHERE topic_id = ? ORDER BY recurring DESC, created_at DESC LIMIT ?',
    course.id,
    MAX_SUMMARY_ITEMS,
  )
  for (const mistake of mistakes) appendUnique(gaps, mistake.description)

  return {
    topicId: course.id,
    title: course.title,
    courseKind: course.course_kind || 'core',
    courseStage: course.course_stage || 0,
    focus: course.course_focus || '',
    outcomes,
    strengths,
    gaps,
    artifactFeedback: feedback,
    generatedAt: new Date().toISOString(),
  }
}

function completeCourseIfEligibleInner(topicId) {
  const readiness = getCourseReadiness(topicId)
  if (!readiness.eligible || readiness.course.status !== 'active') return false

  const summary = buildCourseSummary(topicId)
  const result = run(
    `UPDATE topics
     SET status = 'completed', course_completed_at = COALESCE(course_completed_at, CURRENT_TIMESTAMP), course_summary = ?
     WHERE id = ? AND status = 'active'`,
    JSON.stringify(summary),
    Number(topicId),
  )
  return result.changes === 1
}

export function completeCourseIfEligible(topicId) {
  return transaction(() => completeCourseIfEligibleInner(topicId))()
}

export function completeCourseIfEligibleInTransaction(topicId) {
  return completeCourseIfEligibleInner(topicId)
}

export function getLineage(topicId) {
  const current = get('SELECT * FROM topics WHERE id = ?', Number(topicId))
  if (!current) throw new CourseLineageError('Topic not found.', 'TOPIC_NOT_FOUND', 404)

  const chain = []
  const visited = new Set()
  let node = current
  while (node) {
    if (visited.has(node.id)) throw new CourseLineageError('Course lineage contains a cycle.', 'LINEAGE_CYCLE')
    visited.add(node.id)
    chain.unshift(node)
    const link = get('SELECT parent_topic_id FROM course_links WHERE child_topic_id = ?', node.id)
    node = link ? get('SELECT * FROM topics WHERE id = ?', link.parent_topic_id) : null
    if (link && !node) throw new CourseLineageError('Course lineage references a missing parent.', 'LINEAGE_PARENT_MISSING')
  }
  return chain
}

export function collectLineageOutcomes(topicId) {
  const ancestors = getLineage(topicId).slice(0, -1)
  const outcomes = []
  const ids = new Set()
  for (const course of ancestors) {
    const modules = all('SELECT skill_outcomes FROM modules WHERE topic_id = ? ORDER BY module_index', course.id)
    for (const module of modules) {
      const declaredOutcomes = parseJson(module.skill_outcomes, [])
      for (const outcome of Array.isArray(declaredOutcomes) ? declaredOutcomes : []) {
        if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome) || typeof outcome.id !== 'string' || typeof outcome.title !== 'string' || ids.has(outcome.id)) continue
        ids.add(outcome.id)
        outcomes.push({ id: outcome.id, title: outcome.title })
      }
    }
  }
  return outcomes
}

function persistCurriculumInTransaction(topicId, curriculum) {
  const modules = Array.isArray(curriculum?.modules) ? curriculum.modules : []
  const lessonIdMap = new Map()
  const moduleRows = []

  for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex += 1) {
    const module = modules[moduleIndex]
    const moduleResult = run(
      'INSERT INTO modules (topic_id, module_index, title, summary, skill_outcomes) VALUES (?, ?, ?, ?, ?)',
      topicId,
      moduleIndex,
      module.title,
      module.summary || '',
      Array.isArray(module.skill_outcomes) ? JSON.stringify(module.skill_outcomes) : (module.skill_outcomes || ''),
    )
    const moduleId = Number(moduleResult.lastInsertRowid)
    moduleRows.push({ id: moduleId, lessons: Array.isArray(module.lessons) ? module.lessons : [] })

    for (let lessonIndex = 0; lessonIndex < moduleRows[moduleRows.length - 1].lessons.length; lessonIndex += 1) {
      const lesson = moduleRows[moduleRows.length - 1].lessons[lessonIndex]
      const task = lesson.task_spec ?? lesson.task ?? ''
      const taskJson = typeof task === 'string' ? task : JSON.stringify(task)
      const lessonResult = run(
        `INSERT INTO lessons
          (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites, artifact_required, artifact_type, artifact_rubric, task_spec)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        moduleId,
        lessonIndex,
        lesson.title,
        lesson.depth || '',
        lesson.estimated_time || 0,
        JSON.stringify(Array.isArray(lesson.outcomes) ? lesson.outcomes : []),
        JSON.stringify(Array.isArray(lesson.prerequisites) ? lesson.prerequisites : []),
        (lesson.artifact_required || taskJson) ? 1 : 0,
        lesson.artifact_type || (taskJson ? 'task_evidence' : ''),
        lesson.artifact_rubric || '',
        taskJson,
      )
      lessonIdMap.set(lesson.title, Number(lessonResult.lastInsertRowid))
    }
  }

  for (const moduleRow of moduleRows) {
    const lessons = all('SELECT id, title FROM lessons WHERE module_id = ? ORDER BY lesson_index', moduleRow.id)
    for (let lessonIndex = 0; lessonIndex < moduleRow.lessons.length; lessonIndex += 1) {
      const lesson = moduleRow.lessons[lessonIndex]
      const prerequisites = (Array.isArray(lesson.prerequisites) ? lesson.prerequisites : [])
        .map((prerequisite) => {
          const title = typeof prerequisite === 'string' ? prerequisite : prerequisite?.title
          const id = lessonIdMap.get(title)
          return id ? { lessonId: id, title } : null
        })
        .filter(Boolean)
      run('UPDATE lessons SET prerequisites = ? WHERE id = ?', JSON.stringify(prerequisites), lessons[lessonIndex].id)
    }
  }

  const lessonRows = all(
    `SELECT l.id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.topic_id = ? ORDER BY m.module_index, l.lesson_index`,
    topicId,
  )
  for (const lesson of lessonRows) run('INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)', topicId, lesson.id, 'not_started')

  const first = get(
    `SELECT l.id FROM lessons l JOIN modules m ON m.id = l.module_id
     WHERE m.topic_id = ? AND (l.prerequisites = '[]' OR l.prerequisites = '')
     ORDER BY m.module_index, l.lesson_index LIMIT 1`,
    topicId,
  )
  return first?.id || null
}

export function createLinkedCourse(parentTopicId, { lane, level = null, timeCommitment = null, curriculum } = {}) {
  const normalizedLane = normalizeLane(lane)
  if (normalizedLane !== 'balanced-next') throw new CourseLineageError('Continuation Tracks use the balanced-next lane.', 'INVALID_LANE', 400)
  if (!curriculum || !Array.isArray(curriculum.modules) || curriculum.modules.length === 0) {
    throw new CourseLineageError('A prepared curriculum is required.', 'INVALID_CURRICULUM', 400)
  }

  return transaction(() => {
    const parent = get('SELECT * FROM topics WHERE id = ?', Number(parentTopicId))
    if (!parent) throw new CourseLineageError('The prerequisite course was not found.', 'PARENT_NOT_FOUND', 404)
    const readiness = getCourseReadiness(parentTopicId)
    if (!readiness.eligible || parent.status !== 'completed') {
      throw new CourseLineageError('The prerequisite course is not complete.', 'PARENT_NOT_COMPLETE', 409)
    }
    if (get('SELECT 1 FROM course_links WHERE parent_topic_id = ?', parentTopicId)) {
      throw new CourseLineageError('This Track already has its one continuation.', 'TRAIL_ALREADY_CONTINUED', 409)
    }
    const title = String(curriculum.title || `${parent.title}: ${lane}`).trim().slice(0, 100)
    const child = run(
      `INSERT INTO topics (title, status, level, time_per_week, goal, course_kind, course_stage, course_focus, last_active_at)
       VALUES (?, 'active', ?, ?, ?, 'advanced', ?, ?, ?)`,
      title,
      level || parent.level || null,
      timeCommitment || parent.time_per_week || null,
      curriculum.goal || '',
      (parent.course_stage || 0) + 1,
      lane.trim(),
      new Date().toISOString(),
    )
    const childId = Number(child.lastInsertRowid)
    try {
      run(
        'INSERT INTO course_links (child_topic_id, parent_topic_id, lane, normalized_lane) VALUES (?, ?, ?, ?)',
        childId,
        Number(parentTopicId),
        lane.trim(),
        normalizedLane,
      )
    } catch (error) {
      if (/unique/i.test(error.message || '')) throw new CourseLineageError('A course already exists for this lane.', 'DUPLICATE_LANE', 409)
      throw error
    }
    const firstLessonId = persistCurriculumInTransaction(childId, curriculum)
    return { topic: get('SELECT * FROM topics WHERE id = ?', childId), firstLessonId }
  })()
}

export { persistCurriculumInTransaction }
