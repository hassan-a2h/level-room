import { Router } from 'express'
import { get, run, all } from '../db.js'

const router = Router()

const MAX_ACTIVE_TOPICS = 3

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
        ...stats,
      }
    })
    return res.json({ topics: enriched })
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
    const topic = get('SELECT * FROM topics ORDER BY last_active_at DESC, created_at DESC LIMIT 1')
    if (!topic) {
      return res.status(404).json({ error: 'No topics found.' })
    }
    const stats = getTopicProgress(topic.id)
    return res.json({ topic: { ...topic, ...stats } })
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
        `SELECT l.id, l.lesson_index, l.title, l.depth, l.estimated_time, l.outcomes, l.prerequisites
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
          outcomes: lesson.outcomes,
          prerequisites,
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
        skill_outcomes: mod.skill_outcomes,
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
    const activeCount = get("SELECT COUNT(*) as count FROM topics WHERE status = 'active'")
    if (activeCount.count >= MAX_ACTIVE_TOPICS) {
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

    run('DELETE FROM topics WHERE id = ?', topicId)
    return res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/topics/:id error:', err.message)
    return res.status(500).json({ error: 'Failed to delete topic.' })
  }
})

/**
 * PUT /api/topics/:id/lessons/:lid/state
 * Update a lesson's state (for testing / demo / graph updates).
 */
router.put('/topics/:id/lessons/:lid/state', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)
    const { state } = req.body

    const VALID_STATES = ['not_started', 'practicing', 'passed', 'skipped', 'tested_out', 'quiz_pending', 'remediating']
    if (!VALID_STATES.includes(state)) {
      return res.status(400).json({ error: `Invalid state. Must be one of: ${VALID_STATES.join(', ')}` })
    }

    const topic = get('SELECT id FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const lesson = get('SELECT id FROM lessons WHERE id = ?', lessonId)
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' })
    }

    // Upsert progress row
    const existing = get('SELECT id FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    if (existing) {
      run(
        'UPDATE progress SET state = ?, completed_at = ? WHERE id = ?',
        state,
        ['passed', 'tested_out'].includes(state) ? new Date().toISOString() : null,
        existing.id
      )
    } else {
      run(
        'INSERT INTO progress (topic_id, lesson_id, state, started_at, completed_at) VALUES (?, ?, ?, ?, ?)',
        topicId,
        lessonId,
        state,
        ['practicing', 'quiz_pending', 'remediating'].includes(state) ? new Date().toISOString() : null,
        ['passed', 'tested_out'].includes(state) ? new Date().toISOString() : null
      )
    }

    const updated = get(
      'SELECT state, completed_at FROM progress WHERE topic_id = ? AND lesson_id = ?',
      topicId, lessonId
    )

    return res.json({ ok: true, lessonId, state: updated.state })
  } catch (err) {
    console.error('PUT /api/topics/:id/lessons/:lid/state error:', err.message)
    return res.status(500).json({ error: 'Failed to update lesson state.' })
  }
})

export default router
