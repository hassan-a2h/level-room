import { Router } from 'express'
import { get, run, all } from '../db.js'
import { getLineage, getActiveRootTrailCount, CourseLineageError } from '../utils/course-lineage.js'
import { isGenerationStale } from '../utils/curriculum-recovery.js'
import { publicOutcome } from '../utils/outcome-manifest.js'

const router = Router()

const MAX_ACTIVE_TOPICS = 3

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
      courseKind: entry.course_kind || 'core',
      courseStage: entry.course_stage || 0,
      courseFocus: entry.course_focus || '',
    }))
  } catch {
    lineage = []
  }
  const parent = get(
    `SELECT t.id, t.title, cl.lane
     FROM course_links cl JOIN topics t ON t.id = cl.parent_topic_id
     WHERE cl.child_topic_id = ?`,
    topicId,
  )
  const children = all(
    `SELECT t.id, t.title, t.status, t.course_kind, t.course_stage, t.course_focus, cl.lane
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
    lane: child.lane,
  }))
  return {
    lineage,
    parent: parent ? { id: parent.id, title: parent.title, lane: parent.lane } : null,
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
     WHERE topic_id = ? AND state IN ('passed', 'tested_out')`,
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
    const enriched = topics.map((topic) => {
      const stats = getTopicProgress(topic.id)
      return {
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

    const modules = all('SELECT * FROM modules WHERE topic_id = ? ORDER BY module_index', topicId)

    const modulesWithLessons = modules.map((mod) => {
      const lessons = all(
        `SELECT l.id, l.lesson_index, l.title, l.depth, l.estimated_time, l.outcomes, l.prerequisites, l.task_spec
         FROM lessons l
         WHERE l.module_id = ?
         ORDER BY l.lesson_index`,
        mod.id
      )

      const lessonsWithProgress = lessons.map((lesson) => {
        const prog = get(
          `SELECT state, quiz_score, quiz_attempts, started_at, completed_at
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
          return !prereqProg || !['passed', 'tested_out'].includes(prereqProg.state)
        })

        return {
          id: lesson.id,
          title: lesson.title,
          depth: lesson.depth,
          estimated_time: lesson.estimated_time,
          outcomes: parsePublicOutcomes(lesson.outcomes),
          prerequisites,
          task_spec: taskSpec,
          state,
          locked,
          quiz_score: prog?.quiz_score ?? null,
          quiz_attempts: prog?.quiz_attempts ?? 0,
          started_at: prog?.started_at ?? null,
          completed_at: prog?.completed_at ?? null,
        }
      })

      // Compute exam readiness for this module
      const totalLessons = lessons.length
      const passedLessons = lessons.filter((l) => {
        const prog = get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, l.id)
        return ['passed', 'tested_out'].includes(prog?.state)
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
        lessonsRemaining: totalLessons - passedLessons,
        lessons: lessonsWithProgress,
      }
    })

    const stats = getTopicProgress(topicId)
    const mistakes = getTopicMistakes(topicId)
    const difficulty = topic.difficulty || 'normal'
    const consecutivePasses = topic.consecutive_passes || 0
    const consecutiveFails = topic.consecutive_fails || 0

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
