import { Router } from 'express'
import db, { all, run, transaction } from '../db.js'
import { normalizeLane } from '../utils/course-lineage.js'

const router = Router()

const TABLES = [
  'topics',
  'modules',
  'lessons',
  'progress',
  'messages',
  'srs_queue',
  'artifacts',
  'llm_settings',
  'mistakes_log',
  'streaks',
  'exam_attempts',
  'course_links',
]

const REQUIRED_TABLES = TABLES

const LEGACY_DISCARDED_SETTINGS_FIELDS = new Set(['api_key'])

const IMPORT_COLUMNS = {
  topics: new Set(['id', 'title', 'slug', 'status', 'level', 'goal', 'time_per_week', 'deadline', 'tone', 'focus', 'mode', 'created_at', 'last_active_at', 'interaction_mode', 'difficulty', 'consecutive_passes', 'consecutive_fails', 'course_kind', 'course_stage', 'course_focus', 'course_summary', 'course_completed_at', 'curriculum_state', 'curriculum_draft', 'curriculum_error']),
  modules: new Set(['id', 'topic_id', 'module_index', 'title', 'summary', 'skill_outcomes', 'status', 'completed_at']),
  lessons: new Set(['id', 'module_id', 'lesson_index', 'title', 'depth', 'estimated_time', 'outcomes', 'prerequisites', 'artifact_required', 'artifact_type', 'artifact_rubric', 'task_spec']),
  progress: new Set(['id', 'topic_id', 'lesson_id', 'state', 'artifact_passed', 'started_at', 'completed_at', 'activity_state']),
  messages: new Set(['id', 'topic_id', 'lesson_id', 'role', 'content', 'created_at']),
  srs_queue: new Set(['id', 'topic_id', 'lesson_id', 'module_id', 'interval_index', 'due_date', 'status', 'last_reviewed', 'score', 'review_type', 'review_history']),
  artifacts: new Set(['id', 'progress_id', 'content', 'rubric_scores', 'passed', 'feedback', 'attempt_number', 'created_at']),
  llm_settings: new Set(['id', 'provider', 'model', 'reasoning_effort', 'created_at']),
  mistakes_log: new Set(['id', 'topic_id', 'lesson_id', 'description', 'recurring', 'cleared_after', 'created_at']),
  streaks: new Set(['id', 'current_streak', 'max_streak', 'last_active_date']),
  exam_attempts: new Set(['id', 'topic_id', 'module_id', 'questions', 'answers', 'evaluation', 'status', 'type', 'parent_exam_id', 'created_at']),
  course_links: new Set(['child_topic_id', 'parent_topic_id', 'lane', 'normalized_lane', 'created_at']),
}

const EXPORT_QUERIES = {
  topics: 'SELECT id, title, slug, status, level, goal, time_per_week, deadline, tone, focus, mode, created_at, last_active_at, interaction_mode, difficulty, consecutive_passes, consecutive_fails, course_kind, course_stage, course_focus, course_summary, course_completed_at, curriculum_state, curriculum_draft, curriculum_error FROM topics',
  modules: 'SELECT id, topic_id, module_index, title, summary, skill_outcomes, status, completed_at FROM modules',
  lessons: 'SELECT id, module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites, artifact_required, artifact_type, artifact_rubric, task_spec FROM lessons',
  progress: 'SELECT id, topic_id, lesson_id, state, artifact_passed, started_at, completed_at, activity_state FROM progress',
  messages: 'SELECT id, topic_id, lesson_id, role, content, created_at FROM messages',
  srs_queue: 'SELECT id, topic_id, lesson_id, module_id, interval_index, due_date, status, last_reviewed, score, review_type, review_history FROM srs_queue',
  artifacts: 'SELECT id, progress_id, content, rubric_scores, passed, feedback, attempt_number, created_at FROM artifacts',
  llm_settings: 'SELECT id, provider, model, reasoning_effort, created_at FROM llm_settings',
  mistakes_log: 'SELECT id, topic_id, lesson_id, description, recurring, cleared_after, created_at FROM mistakes_log',
  streaks: 'SELECT id, current_streak, max_streak, last_active_date FROM streaks',
  exam_attempts: 'SELECT id, topic_id, module_id, questions, answers, evaluation, status, type, parent_exam_id, created_at FROM exam_attempts WHERE status <> \'pending\'',
  course_links: 'SELECT child_topic_id, parent_topic_id, lane, normalized_lane, created_at FROM course_links',
}

function sanitizeCompletedCheckpoint(row) {
  if (!['passed', 'failed'].includes(row.status) || typeof row.questions !== 'string') return null
  let envelope
  try { envelope = JSON.parse(row.questions) } catch { return null }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || envelope.schemaVersion !== 1 || !Array.isArray(envelope.publicQuestions)) return null
  if (Object.keys(envelope).some((key) => !['schemaVersion', 'publicQuestions', 'answerKey'].includes(key))) return null
  return { ...row, questions: JSON.stringify({ schemaVersion: 1, publicQuestions: envelope.publicQuestions }) }
}

function normalizeImportedProgress(row) {
  const completed = row.state === 'passed'
  return {
    ...row,
    state: completed ? 'passed' : 'not_started',
    artifact_passed: completed ? Number(row.artifact_passed || 0) : 0,
    started_at: completed ? row.started_at ?? null : null,
    completed_at: completed ? row.completed_at ?? null : null,
    activity_state: '{}',
  }
}

function prepareImportRows(backup) {
  const prepared = {}
  for (const table of TABLES) {
    if (backup[table] !== undefined && !Array.isArray(backup[table])) {
      return { error: `Invalid backup: "${table}" must be an array.` }
    }
    const rows = backup[table] || []
    prepared[table] = []
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return { error: `Invalid backup: each "${table}" row must be an object.` }
      }
      const cleanRow = {}
      for (const [column, value] of Object.entries(row)) {
        if (table === 'llm_settings' && LEGACY_DISCARDED_SETTINGS_FIELDS.has(column.toLowerCase())) continue
        if (isCredentialColumn(column) || !IMPORT_COLUMNS[table].has(column)) {
          return { error: 'Invalid backup: credential data or unsupported fields are not accepted.' }
        }
        cleanRow[column] = value
      }
      if (table === 'exam_attempts') {
        if (cleanRow.status === 'pending') continue
        if (typeof cleanRow.questions !== 'string') return { error: 'Invalid backup: completed checkpoints must contain a sanitized outcome envelope.' }
        let envelope
        try { envelope = JSON.parse(cleanRow.questions) } catch { return { error: 'Invalid backup: completed checkpoints must contain a sanitized outcome envelope.' } }
        if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || envelope.schemaVersion !== 1 || !Array.isArray(envelope.publicQuestions) || Object.keys(envelope).some((key) => key !== 'schemaVersion' && key !== 'publicQuestions')) {
          return { error: 'Invalid backup: completed checkpoints must contain a sanitized outcome envelope.' }
        }
      }
      if (table === 'progress') Object.assign(cleanRow, normalizeImportedProgress(cleanRow))
      prepared[table].push(cleanRow)
    }
  }
  return { rows: prepared }
}

function validateLineageRows(topics, links) {
  if (!Array.isArray(links)) return { error: 'Invalid backup: "course_links" must be an array.' }
  const topicIds = new Set(topics.map((topic) => topic.id))
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]))
  const topicOrder = new Map(topics.map((topic, index) => [topic.id, index]))
  const childIds = new Set()
  const laneKeys = new Set()
  const parentByChild = new Map()

  for (const [index, link] of links.entries()) {
    if (!link || typeof link !== 'object' || Array.isArray(link)) return { error: `Invalid backup: course_links row ${index + 1} is invalid.` }
    const { child_topic_id: childId, parent_topic_id: parentId } = link
    if (!topicIds.has(childId) || !topicIds.has(parentId)) return { error: 'Invalid backup: course_links reference missing topics.' }
    if (childId === parentId) return { error: 'Invalid backup: a course cannot link to itself.' }
    if (topicOrder.get(parentId) >= topicOrder.get(childId)) return { error: 'Invalid backup: parent topics must appear before child topics.' }
    if (childIds.has(childId)) return { error: 'Invalid backup: a child topic may have only one parent.' }
    childIds.add(childId)
    const lane = typeof link.lane === 'string' ? link.lane.trim().replace(/\s+/g, ' ') : ''
    const normalizedLane = normalizeLane(lane)
    if (!lane || !normalizedLane || link.normalized_lane !== normalizedLane) return { error: 'Invalid backup: course link lane is not canonical.' }
    const laneKey = `${parentId}:${normalizedLane}`
    if (laneKeys.has(laneKey)) return { error: 'Invalid backup: duplicate course lane.' }
    laneKeys.add(laneKey)
    parentByChild.set(childId, parentId)

    const child = topicsById.get(childId)
    const parent = topicsById.get(parentId)
    const childStage = Number(child?.course_stage ?? 0)
    const parentStage = Number(parent?.course_stage ?? 0)
    if (!Number.isInteger(childStage) || !Number.isInteger(parentStage) || childStage !== parentStage + 1) return { error: 'Invalid backup: course stages must increase by one along every link.' }
  }

  for (const childId of parentByChild.keys()) {
    const visited = new Set()
    let node = childId
    while (parentByChild.has(node)) {
      if (visited.has(node)) return { error: 'Invalid backup: course lineage contains a cycle.' }
      visited.add(node)
      node = parentByChild.get(node)
    }
  }
  return { valid: true }
}

function isCredentialColumn(column) {
  const normalized = column.toLowerCase().replace(/[^a-z]/g, '')
  return ['access', 'refresh', 'refreshtoken', 'token', 'credential', 'accountid', 'authorization', 'apikey'].includes(normalized)
}

router.get('/export', (_req, res) => {
  try {
    const result = {
      backupVersion: 2,
      exported_at: new Date().toISOString(),
    }

    for (const table of TABLES) {
      const rows = all(EXPORT_QUERIES[table])
      if (table === 'progress') {
        result[table] = rows.map(normalizeImportedProgress)
      } else if (table === 'exam_attempts') {
        result[table] = rows.map(sanitizeCompletedCheckpoint).filter(Boolean)
      } else {
        result[table] = rows
      }
    }

    return res.json(result)
  } catch (err) {
    console.error('Export error:', err.message)
    return res.status(500).json({ error: 'Failed to export data.' })
  }
})

router.post('/import', (req, res) => {
  try {
    const backup = req.body

    if (!backup || typeof backup !== 'object') {
      return res.status(400).json({ error: 'Invalid backup: must be a JSON object.' })
    }

    if (backup.backupVersion !== 2) {
      return res.status(400).json({ error: 'Backup version is unsupported.', code: 'BACKUP_VERSION_UNSUPPORTED' })
    }

    if (Object.hasOwn(backup, 'quiz_attempts')) {
      return res.status(400).json({ error: 'Backup contains retired per-Session quiz data.' })
    }

    for (const table of REQUIRED_TABLES) {
      if (!(table in backup)) {
        return res.status(400).json({ error: `Invalid backup: missing table "${table}".` })
      }
      if (!Array.isArray(backup[table])) {
        return res.status(400).json({ error: `Invalid backup: "${table}" must be an array.` })
      }
    }

    const validated = prepareImportRows(backup)
    if (validated.error) return res.status(400).json({ error: validated.error })

    const lineageValidation = validateLineageRows(validated.rows.topics, validated.rows.course_links)
    if (lineageValidation.error) return res.status(400).json({ error: lineageValidation.error })

    const counts = {}

    const tx = transaction(() => {
      // Clear all tables in reverse dependency order
      run('DELETE FROM quiz_attempts')
      const clearOrder = [...TABLES].reverse()
      for (const table of clearOrder) {
        run(`DELETE FROM ${table}`)
      }

      // Reset sqlite_sequence for auto-increment tables
      const seqCheck = all("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'")
      if (seqCheck.length > 0) {
        const placeholders = TABLES.map(() => '?').join(', ')
        run(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`, ...TABLES)
      }

      // Insert data in dependency order
      for (const table of TABLES) {
        const rows = validated.rows[table]
        if (rows.length === 0) {
          counts[table] = 0
          continue
        }

        for (const row of rows) {
          const columns = Object.keys(row)
          if (columns.length === 0) {
            db.prepare(`INSERT INTO "${table}" DEFAULT VALUES`).run()
            continue
          }
          const columnSql = columns.map((column) => `"${column}"`).join(', ')
          const placeholders = columns.map(() => '?').join(', ')
          const insertSql = `INSERT INTO "${table}" (${columnSql}) VALUES (${placeholders})`
          db.prepare(insertSql).run(...columns.map((column) => row[column] ?? null))
        }

        counts[table] = rows.length
      }
    })

    tx()

    return res.json({ success: true, counts })
  } catch (err) {
    console.error('Import error:', err.message)
    return res.status(400).json({ error: 'Invalid backup data. No changes were imported.' })
  }
})

export default router
