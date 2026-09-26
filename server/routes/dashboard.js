import { Router } from 'express'
import { get, run, all } from '../db.js'
import { getLineage, getActiveRootTrailCount, CourseLineageError } from '../utils/course-lineage.js'
import { isGenerationStale } from '../utils/curriculum-recovery.js'
import { publicOutcome } from '../utils/outcome-manifest.js'
import { deriveNextAction, deriveWeeklyRhythm } from '../utils/dashboard-summary.js'
import { isValidDate } from '../utils/streak-tracker.js'

const router = Router()

const MAX_ACTIVE_TOPICS = 3
const MAX_DASHBOARD_EVENTS = 500

function calendarDateForZone(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function dashboardCalendar(query = {}) {
  let timeZone = typeof query.timeZone === 'string' && query.timeZone.length <= 80 ? query.timeZone.trim() : 'UTC'
  try { new Intl.DateTimeFormat('en-US', { timeZone }) } catch { timeZone = 'UTC' }
  if (!timeZone) timeZone = 'UTC'
  let localDate = typeof query.localDate === 'string' && isValidDate(query.localDate) ? query.localDate : null
  if (!localDate) localDate = calendarDateForZone(timeZone)
  return { localDate, timeZone }
}

function currentActivityTitle(activityBlocks, activityState) {
  if (typeof activityBlocks !== 'string' || typeof activityState !== 'string') return ''
  try {
    const document = JSON.parse(activityBlocks)
    const state = JSON.parse(activityState)
    if (typeof state.currentBlockId !== 'string' || !Array.isArray(document.blocks)) return ''
    const block = document.blocks.find((item) => item?.id === state.currentBlockId)
    return typeof block?.title === 'string' ? block.title.slice(0, 120) : ''
  } catch {
    return ''
  }
}

function parseCourseSummary(value) {
  if (!value) return null
  try {
    const summary = typeof value === 'string' ? JSON.parse(value) : value
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null
    return {
      outcomes: Array.isArray(summary.outcomes) ? summary.outcomes.slice(0, 12) : [],
      strengths: Array.isArray(summary.strengths) ? summary.strengths.slice(0, 8) : [],
      gaps: Array.isArray(summary.gaps) ? summary.gaps.slice(0, 8) : [],
      artifactFeedback: Array.isArray(summary.artifactFeedback) ? summary.artifactFeedback.slice(0, 5) : [],
    }
  } catch {
    return null
  }
}

function parsePublicOutcomes(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.map(publicOutcome).filter(Boolean) : []
  } catch {
    return []
  }
}

function getTopicLineageRefs(topicId) {
  let lineage = []
  try {
    lineage = getLineage(topicId).map((entry) => ({
      id: entry.id,
      title: entry.title,
      status: entry.status,
      courseKind: entry.course_kind || 'core',
      courseStage: entry.course_stage || 0,
      courseFocus: entry.course_focus || '',
      courseSummary: parseCourseSummary(entry.course_summary),
    }))
  } catch {
    lineage = []
  }
  const parent = get(
    `SELECT t.id, t.title, t.status, t.course_kind, t.course_stage, t.course_focus, t.course_summary, cl.lane
     FROM course_links cl JOIN topics t ON t.id = cl.parent_topic_id
     WHERE cl.child_topic_id = ?`,
    topicId,
  )
  const children = all(
    `SELECT t.id, t.title, t.status, t.course_kind, t.course_stage, t.course_focus, t.course_summary, cl.lane
     FROM course_links cl JOIN topics t ON t.id = cl.child_topic_id
     WHERE cl.parent_topic_id = ? ORDER BY t.created_at, t.id`,
    topicId,
  ).map((child) => ({
    id: child.id,
    title: child.title,
    status: child.status,
    courseKind: child.course_kind || 'advanced',
    courseStage: child.course_stage || 0,
    courseFocus: child.course_focus || '',
    courseSummary: parseCourseSummary(child.course_summary),
    lane: child.lane,
  }))
  return {
    lineage,
    parent: parent ? {
      id: parent.id,
      title: parent.title,
      status: parent.status,
      courseKind: parent.course_kind || 'core',
      courseStage: parent.course_stage || 0,
      courseFocus: parent.course_focus || '',
      courseSummary: parseCourseSummary(parent.course_summary),
      lane: parent.lane,
    } : null,
    children,
  }
}

function serializeCourseFields(topic) {
  return {
    courseKind: topic.course_kind || 'core',
    courseStage: topic.course_stage || 0,
    courseFocus: topic.course_focus || '',
    courseSummary: topic.course_summary || '',
    courseCompletedAt: topic.course_completed_at || null,
  }
}

function serializeCurriculumRecoveryFields(topic) {
  const hasCurriculum = Boolean(get('SELECT 1 FROM modules WHERE topic_id = ? LIMIT 1', topic.id))
  const curriculumState = hasCurriculum ? 'confirmed' : (topic.curriculum_state || 'setup')
  const stale = curriculumState === 'generating' && isGenerationStale(topic.curriculum_generation_started_at)
  return {
    curriculumState,
    curriculumError: topic.curriculum_error || null,
    hasCurriculumDraft: Boolean(topic.curriculum_draft),
    resumeAvailable: !hasCurriculum && (['setup', 'ready_to_generate', 'failed', 'draft_ready'].includes(curriculumState) || stale),
  }
}

/**
 * Compute progress stats for a topic.
 */
function getTopicProgress(topicId) {
  const lessons = all(
    `SELECT COUNT(*) as total FROM lessons l
     JOIN modules m ON l.module_id = m.id
     WHERE m.topic_id = ?`,
    topicId
  )
  const total = lessons[0]?.total || 0

  const passed = all(
    `SELECT COUNT(*) as passed FROM progress
     WHERE topic_id = ? AND state = 'passed'`,
    topicId
  )
  const passedCount = passed[0]?.passed || 0

  return {
    totalLessons: total,
    passedLessons: passedCount,
    progress: total > 0 ? Math.floor((passedCount / total) * 100) : 0,
  }
}

/**
 * Get active mistakes for a topic.
 */
function getTopicMistakes(topicId) {
  return all(
    'SELECT id, lesson_id, description, recurring, cleared_after, created_at FROM mistakes_log WHERE topic_id = ? AND cleared_after < 2 ORDER BY recurring DESC, created_at DESC',
    topicId,
  )
}

/**
 * GET /api/topics
 * List all topics with basic progress info.
 */
router.get('/topics', (_req, res) => {
  try {
    const topics = all('SELECT * FROM topics ORDER BY last_active_at DESC, created_at DESC')
    const protectedTopicIds = new Set(all('SELECT DISTINCT parent_topic_id FROM course_links').map((row) => row.parent_topic_id))
    const enriched = topics.map((topic) => {
      const stats = getTopicProgress(topic.id)
      return {
        id: topic.id,
        title: topic.title,
        status: topic.status,
        last_active_at: topic.last_active_at,
        created_at: topic.created_at,
        hasChildren: protectedTopicIds.has(topic.id),
        difficulty: topic.difficulty || 'normal',
        consecutivePasses: topic.consecutive_passes || 0,
        consecutiveFails: topic.consecutive_fails || 0,
        ...serializeCourseFields(topic),
        ...serializeCurriculumRecoveryFields(topic),
        ...stats,
      }
    })
    const activeTopics = enriched.filter((topic) => topic.status === 'active')
    const completedTopics = enriched.filter((topic) => topic.status === 'completed')
    return res.json({ topics: enriched, activeTopics, completedTopics })
  } catch (err) {
    console.error('GET /api/topics error:', err.message)
    return res.status(500).json({ error: 'Failed to load topics.' })
  }
})

/**
 * GET /api/topics/default
 * Return the most recently active topic.
 */
router.get('/topics/default', (_req, res) => {
  try {
    const topic = get("SELECT * FROM topics ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, last_active_at DESC, created_at DESC LIMIT 1")
    if (!topic) {
      return res.status(404).json({ error: 'No topics found.' })
    }
    const stats = getTopicProgress(topic.id)
    return res.json({ topic: {
      id: topic.id,
      title: topic.title,
      status: topic.status,
      last_active_at: topic.last_active_at,
      created_at: topic.created_at,
      difficulty: topic.difficulty || 'normal',
      consecutivePasses: topic.consecutive_passes || 0,
      consecutiveFails: topic.consecutive_fails || 0,
      ...serializeCourseFields(topic),
      ...serializeCurriculumRecoveryFields(topic),
      ...stats,
      ...getTopicLineageRefs(topic.id),
    } })
  } catch (err) {
    console.error('GET /api/topics/default error:', err.message)
    return res.status(500).json({ error: 'Failed to load default topic.' })
  }
})

/**
 * GET /api/topics/:id/dashboard
 * Full dashboard data for a topic (modules, lessons, progress).
 */
router.get('/topics/:id/dashboard', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const topic = get('SELECT * FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const { localDate, timeZone } = dashboardCalendar(req.query)
    const modules = all('SELECT * FROM modules WHERE topic_id = ? ORDER BY module_index', topicId)
    const pendingCheckpoints = all(
      `SELECT e.id, e.module_id AS moduleId, e.status, e.created_at, m.title AS moduleTitle
       FROM exam_attempts e JOIN modules m ON m.id = e.module_id
       WHERE e.topic_id = ? AND e.status = 'pending'
       ORDER BY m.module_index, e.id DESC LIMIT 100`,
      topicId,
    )
    const reviewCounts = get(
      `SELECT
         SUM(CASE WHEN due_date = ? THEN 1 ELSE 0 END) AS dueToday,
         SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) AS overdue,
         COUNT(*) AS totalDue
       FROM srs_queue WHERE topic_id = ? AND status = 'pending' AND due_date <= ?`,
      localDate, localDate, topicId, localDate,
    )
    const reviewSummary = {
      dueToday: reviewCounts?.dueToday || 0,
      overdue: reviewCounts?.overdue || 0,
      totalDue: reviewCounts?.totalDue || 0,
    }
    const recentReviews = all(
      `SELECT id, last_reviewed FROM srs_queue
       WHERE topic_id = ? AND last_reviewed IS NOT NULL
       ORDER BY last_reviewed DESC, id DESC LIMIT ?`,
      topicId,
      MAX_DASHBOARD_EVENTS,
    )
    const recentProgress = all(
      `SELECT p.id, p.lesson_id, p.started_at, p.completed_at
       FROM progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id
       WHERE p.topic_id = ? AND (p.started_at IS NOT NULL OR p.completed_at IS NOT NULL)
       ORDER BY COALESCE(p.completed_at, p.started_at) DESC, p.id DESC LIMIT ?`,
      topicId,
      MAX_DASHBOARD_EVENTS,
    )
    const completedCheckpoints = all(
      `SELECT id AS module_id, completed_at FROM modules
       WHERE topic_id = ? AND status = 'completed' AND completed_at IS NOT NULL
       ORDER BY completed_at DESC, id DESC LIMIT ?`,
      topicId,
      MAX_DASHBOARD_EVENTS,
    )

    const modulesWithLessons = modules.map((mod) => {
      const lessons = all(
        `SELECT l.id, l.lesson_index, l.title, l.depth, l.estimated_time, l.outcomes, l.prerequisites,
                l.task_spec, l.artifact_required, l.artifact_type, l.activity_blocks
         FROM lessons l
         WHERE l.module_id = ?
         ORDER BY l.lesson_index`,
        mod.id
      )

      const lessonsWithProgress = lessons.map((lesson) => {
        const prog = get(
          `SELECT state, started_at, completed_at, activity_state
           FROM progress
           WHERE topic_id = ? AND lesson_id = ?`,
          topicId, lesson.id
        )

        const state = prog?.state || 'not_started'
        let prerequisites = []
        try {
          prerequisites = lesson.prerequisites ? JSON.parse(lesson.prerequisites) : []
        } catch {
          prerequisites = []
        }
        let taskSpec = null
        try {
          taskSpec = lesson.task_spec ? JSON.parse(lesson.task_spec) : null
        } catch {
          taskSpec = null
        }

        // Determine if lesson is locked (prerequisites not met)
        const locked = prerequisites.some((pr) => {
          const prereqProg = get(
            'SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?',
            topicId, pr.lessonId
          )
          return !prereqProg || prereqProg.state !== 'passed'
        })

        return {
          id: lesson.id,
          title: lesson.title,
          depth: lesson.depth,
          estimated_time: lesson.estimated_time,
          outcomes: parsePublicOutcomes(lesson.outcomes),
          prerequisites,
          task_spec: taskSpec,
          buildRequired: lesson.artifact_required === 1,
          buildType: lesson.artifact_type || '',
          state,
          locked,
          started_at: prog?.started_at ?? null,
          completed_at: prog?.completed_at ?? null,
          currentActivity: state === 'practicing' ? currentActivityTitle(lesson.activity_blocks, prog?.activity_state) : '',
        }
      })

      // Compute exam readiness for this module
      const totalLessons = lessons.length
      const passedLessons = lessons.filter((l) => {
        const prog = get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, l.id)
        return prog?.state === 'passed'
      }).length
      const examReady = totalLessons > 0 && passedLessons === totalLessons
      const examStatus = get('SELECT status, completed_at FROM modules WHERE id = ?', mod.id)

      return {
        id: mod.id,
        title: mod.title,
        summary: mod.summary,
        skill_outcomes: parsePublicOutcomes(mod.skill_outcomes),
        status: examStatus?.status || 'active',
        completedAt: examStatus?.completed_at || null,
        examReady,
        checkpointStatus: pendingCheckpoints.some((checkpoint) => checkpoint.moduleId === mod.id)
          ? 'in_progress'
          : examStatus?.status === 'completed'
            ? 'completed'
            : examReady ? 'ready' : 'locked',
        lessonsRemaining: totalLessons - passedLessons,
        lessons: lessonsWithProgress,
      }
    })

    const stats = getTopicProgress(topicId)
    const mistakes = getTopicMistakes(topicId)
    const difficulty = topic.difficulty || 'normal'
    const consecutivePasses = topic.consecutive_passes || 0
    const consecutiveFails = topic.consecutive_fails || 0
    const sessions = modulesWithLessons.flatMap((module) => module.lessons.map((lesson) => ({
      ...lesson,
      moduleId: module.id,
      moduleTitle: module.title,
    })))
    const nextAction = deriveNextAction({
      topic,
      modules: modulesWithLessons,
      sessions,
      checkpoints: pendingCheckpoints,
      overdueReviews: reviewSummary.overdue,
    })
    const weeklyRhythm = deriveWeeklyRhythm({
      localDate,
      timeZone,
      sessions: recentProgress,
      checkpoints: completedCheckpoints,
      reviews: recentReviews,
    })
    const focusAreas = mistakes.slice(0, 3).map((mistake) => {
      const session = sessions.find((item) => item.id === mistake.lesson_id)
      return {
        id: mistake.id,
        lessonId: mistake.lesson_id,
        description: mistake.description,
        recurring: Boolean(mistake.recurring),
        sessionTitle: session?.title || '',
        chapterTitle: session?.moduleTitle || '',
      }
    })

    return res.json({
      topic: {
        id: topic.id,
        title: topic.title,
        status: topic.status,
        last_active_at: topic.last_active_at,
        created_at: topic.created_at,
        difficulty,
        consecutivePasses,
        consecutiveFails,
        ...serializeCourseFields(topic),
        ...serializeCurriculumRecoveryFields(topic),
        ...getTopicLineageRefs(topic.id),
        ...stats,
      },
      modules: modulesWithLessons,
      mistakes,
      nextAction,
      weeklyRhythm,
      reviewSummary,
      focusAreas,
    })
  } catch (err) {
    console.error('GET /api/topics/:id/dashboard error:', err.message)
    return res.status(500).json({ error: 'Failed to load dashboard.' })
  }
})

/**
 * POST /api/topics
 * Create a new topic.
 */
router.post('/topics', (req, res) => {
  try {
    const { title } = req.body

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Topic name is required.' })
    }

    const trimmed = title.trim()
    if (trimmed.length > 100) {
      return res.status(400).json({ error: 'Topic name is too long (max 100 characters).' })
    }

    // Basic XSS sanitization: strip HTML tags
    const sanitized = trimmed.replace(/<[^>]+>/g, '')

    // Check active topic limit
    const activeCount = getActiveRootTrailCount()
    if (activeCount >= MAX_ACTIVE_TOPICS) {
      return res.status(400).json({
        error: `You can have up to ${MAX_ACTIVE_TOPICS} active topics. Archive one to start another.`,
      })
    }

    const result = run('INSERT INTO topics (title, status, last_active_at) VALUES (?, ?, ?)', sanitized, 'active', new Date().toISOString())
    const topic = get('SELECT * FROM topics WHERE id = ?', result.lastInsertRowid)

    return res.status(201).json({ topic })
  } catch (err) {
    console.error('POST /api/topics error:', err.message)
    return res.status(500).json({ error: 'Failed to create topic.' })
  }
})

/**
 * POST /api/topics/:id/select
 * Mark a topic as the most recently active.
 */
router.post('/topics/:id/select', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const topic = get('SELECT id FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    run('UPDATE topics SET last_active_at = ? WHERE id = ?', new Date().toISOString(), topicId)
    return res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/topics/:id/select error:', err.message)
    return res.status(500).json({ error: 'Failed to select topic.' })
  }
})

/**
 * DELETE /api/topics/:id
 * Delete a topic (cascades to related rows via FK).
 */
router.delete('/topics/:id', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const topic = get('SELECT id FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const children = get('SELECT 1 FROM course_links WHERE parent_topic_id = ? LIMIT 1', topicId)
    if (children) {
      return res.status(409).json({ error: 'Cannot delete a prerequisite course with linked children.', code: 'COURSE_HAS_CHILDREN' })
    }

    run('DELETE FROM topics WHERE id = ?', topicId)
    return res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/topics/:id error:', err.message)
    if (err instanceof CourseLineageError) {
      return res.status(err.status).json({ error: err.message, code: err.code })
    }
    if (/FOREIGN KEY constraint failed/i.test(err.message)) {
      return res.status(409).json({ error: 'Cannot delete a prerequisite course with linked children.', code: 'COURSE_HAS_CHILDREN' })
    }
    return res.status(500).json({ error: 'Failed to delete topic.' })
  }
})

export default router
