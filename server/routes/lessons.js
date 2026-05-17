import { Router } from 'express'
import { get, run, all } from '../db.js'
import { streamText, LlmClientError } from '../llm/client.js'

const router = Router()

const MAX_MESSAGE_LENGTH = 2000
const DEFAULT_TOTAL_CHUNKS = 3

/**
 * Technical topic keywords for mode inference.
 */
const TECH_KEYWORDS = [
  'python', 'javascript', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'php',
  'swift', 'kotlin', 'typescript', 'scala', 'r ', 'matlab', 'sql', 'html',
  'css', 'react', 'angular', 'vue', 'svelte', 'node', 'django', 'flask',
  'rails', 'spring', 'laravel', 'docker', 'kubernetes', 'aws', 'gcp', 'azure',
  'linux', 'git', 'api', 'database', 'algorithm', 'data structure',
  'machine learning', 'deep learning', 'neural network', 'blockchain',
  'devops', 'frontend', 'backend', 'fullstack', 'web dev', 'mobile dev',
  'ios', 'android', 'shell', 'bash', 'script', 'programming', 'coding',
  'software', 'engineering', 'computer science', 'compiler', 'network',
  'security', 'testing', 'ci/cd', 'microservice', 'architecture',
]

/**
 * Soft-skill topic keywords for mode inference.
 */
const SOFT_SKILL_KEYWORDS = [
  'negotiation', 'leadership', 'communication', 'presentation', 'teamwork',
  'collaboration', 'empathy', 'conflict resolution', 'coaching', 'mentoring',
  'public speaking', 'interview', 'networking', 'influence', 'persuasion',
  'emotional intelligence', 'time management', 'productivity', 'stress',
  'mindfulness', 'creativity', 'problem solving', 'critical thinking',
  'decision making', 'adaptability', 'resilience', 'feedback', 'performance',
  'management', 'supervision', 'delegation', 'motivation', 'culture',
  'diversity', 'inclusion', 'sales', 'customer service', 'relationship',
  'nursing', 'caregiving', 'therapy', 'counseling', 'social work',
]

/**
 * Infer interaction mode from topic title.
 */
function inferInteractionMode(title) {
  const lower = (title || '').toLowerCase()
  if (TECH_KEYWORDS.some((kw) => lower.includes(kw))) {
    return 'code'
  }
  if (SOFT_SKILL_KEYWORDS.some((kw) => lower.includes(kw))) {
    return 'scenario'
  }
  return 'socratic'
}

/**
 * Build the system prompt for a lesson chunk.
 */
function buildSystemPrompt({ mode, lessonTitle, lessonOutcomes, chunkNum, totalChunks, isFinal }) {
  const base = `You are an expert tutor teaching the lesson "${lessonTitle}".
Learning outcomes: ${lessonOutcomes.join('; ')}.
This is chunk ${chunkNum} of ${totalChunks}.`

  if (isFinal) {
    return `${base}
This is the FINAL chunk. Summarize the key concepts and then ask the learner if they're ready to check their understanding with a short quiz. Be encouraging. Keep your response to 1-2 short paragraphs.`
  }

  switch (mode) {
    case 'code':
      return `${base}
You are teaching a technical topic. Provide concise, practical explanations with code examples where helpful. Use markdown code blocks for code. Focus on ONE concept per message. Keep each message under ~500 characters or 3 short paragraphs.`
    case 'scenario':
      return `${base}
You are coaching a soft skill. Present a realistic scenario and ask the learner how they would respond. Or if continuing a scenario, give constructive feedback on their previous response and present the next part. Focus on ONE scenario element per message. Keep each message under ~500 characters or 3 short paragraphs.`
    case 'socratic':
    default:
      return `${base}
You are a Socratic tutor. Ask clarifying questions BEFORE giving direct answers. Help the learner discover concepts through guided inquiry. Focus on ONE concept per message. Keep each message under ~500 characters or 3 short paragraphs.`
  }
}

/**
 * Check if a lesson's prerequisites are met.
 */
function checkPrerequisites(topicId, lesson) {
  let prerequisites = []
  try {
    prerequisites = lesson.prerequisites ? JSON.parse(lesson.prerequisites) : []
  } catch {
    prerequisites = []
  }

  for (const pr of prerequisites) {
    const prereqProg = get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, pr.lessonId)
    if (!prereqProg || !['passed', 'tested_out'].includes(prereqProg.state)) {
      return { locked: true, unmet: prerequisites.filter((p) => {
        const pp = get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, p.lessonId)
        return !pp || !['passed', 'tested_out'].includes(pp.state)
      }) }
    }
  }
  return { locked: false, unmet: [] }
}

/**
 * GET /api/topics/:id/lessons/:lid
 * Get lesson details, messages, and progress.
 */
router.get('/topics/:id/lessons/:lid', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)

    const topic = get('SELECT id, title, interaction_mode FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const lesson = get(
      `SELECT l.id, l.title, l.depth, l.estimated_time, l.outcomes, l.prerequisites, l.artifact_required, l.artifact_type,
              m.title as module_title, m.id as module_id
       FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE l.id = ? AND m.topic_id = ?`,
      lessonId, topicId
    )
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' })
    }

    const progress = get(
      'SELECT state, current_chunk, total_chunks, quiz_score, quiz_attempts, started_at, completed_at FROM progress WHERE topic_id = ? AND lesson_id = ?',
      topicId, lessonId
    ) || { state: 'not_started', current_chunk: 0, total_chunks: 0, quiz_score: null, quiz_attempts: 0 }

    const prereqCheck = checkPrerequisites(topicId, lesson)
    if (prereqCheck.locked) {
      let prereqList = []
      try {
        prereqList = lesson.prerequisites ? JSON.parse(lesson.prerequisites) : []
      } catch {
        prereqList = []
      }
      return res.status(403).json({
        locked: true,
        prerequisites: prereqList,
        unmetPrerequisites: prereqCheck.unmet,
        lesson: {
          id: lesson.id,
          title: lesson.title,
          depth: lesson.depth,
          estimated_time: lesson.estimated_time,
          module_title: lesson.module_title,
        },
      })
    }

    const messages = all(
      'SELECT id, role, content, created_at FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id ASC',
      topicId, lessonId
    )

    let outcomes = []
    try {
      outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
    } catch {
      outcomes = []
    }

    const interactionMode = topic.interaction_mode || inferInteractionMode(topic.title)

    return res.json({
      lesson: {
        id: lesson.id,
        title: lesson.title,
        depth: lesson.depth,
        estimated_time: lesson.estimated_time,
        outcomes,
        module_title: lesson.module_title,
        artifact_required: !!lesson.artifact_required,
        artifact_type: lesson.artifact_type,
      },
      progress,
      messages,
      interactionMode,
      locked: false,
    })
  } catch (err) {
    console.error('GET /api/topics/:id/lessons/:lid error:', err.message)
    return res.status(500).json({ error: 'Failed to load lesson.' })
  }
})

/**
 * POST /api/topics/:id/lessons/:lid/chat
 * Send a user message and stream the tutor response via SSE.
 */
router.post('/topics/:id/lessons/:lid/chat', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)
    const { content } = req.body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required.' })
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message exceeds ${MAX_MESSAGE_LENGTH} character limit.` })
    }

    const topic = get('SELECT id, title, interaction_mode FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const lesson = get(
      `SELECT l.id, l.title, l.depth, l.estimated_time, l.outcomes, l.prerequisites
       FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE l.id = ? AND m.topic_id = ?`,
      lessonId, topicId
    )
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' })
    }

    // Check prerequisites
    const prereqCheck = checkPrerequisites(topicId, lesson)
    if (prereqCheck.locked) {
      return res.status(403).json({ error: 'This lesson is locked. Complete the prerequisites first.' })
    }

    // Upsert progress and transition state if needed
    let progress = get('SELECT id, state, current_chunk, total_chunks FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    if (!progress) {
      const result = run(
        'INSERT INTO progress (topic_id, lesson_id, state, started_at, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?, ?)',
        topicId, lessonId, 'practicing', new Date().toISOString(), 1, DEFAULT_TOTAL_CHUNKS
      )
      progress = { id: result.lastInsertRowid, state: 'practicing', current_chunk: 1, total_chunks: DEFAULT_TOTAL_CHUNKS }
    } else if (progress.state === 'not_started') {
      run(
        'UPDATE progress SET state = ?, started_at = ?, current_chunk = ?, total_chunks = ? WHERE id = ?',
        'practicing', new Date().toISOString(), 1, DEFAULT_TOTAL_CHUNKS, progress.id
      )
      progress = { ...progress, state: 'practicing', current_chunk: 1, total_chunks: DEFAULT_TOTAL_CHUNKS }
    }

    // Persist user message
    run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'user', content.trim())

    // Build conversation history for LLM
    const history = all(
      'SELECT role, content FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id ASC',
      topicId, lessonId
    )

    const settings = get('SELECT provider, api_key, model FROM llm_settings LIMIT 1')
    if (!settings || !settings.api_key) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    let outcomes = []
    try {
      outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
    } catch {
      outcomes = []
    }

    const interactionMode = topic.interaction_mode || inferInteractionMode(topic.title)
    const isFinalChunk = progress.current_chunk >= progress.total_chunks

    const system = buildSystemPrompt({
      mode: interactionMode,
      lessonTitle: lesson.title,
      lessonOutcomes: outcomes,
      chunkNum: progress.current_chunk,
      totalChunks: progress.total_chunks,
      isFinal: isFinalChunk,
    })

    const streamResult = await streamText({
      provider: settings.provider,
      apiKey: settings.api_key,
      model: settings.model,
      system,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    })

    // Stream SSE and collect text for persistence
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    let assistantText = ''
    try {
      for await (const chunk of streamResult.textStream) {
        const text = typeof chunk === 'string' ? chunk : ''
        assistantText += text
        res.write(`data: ${JSON.stringify(text)}\n\n`)
      }
      res.write(`data: ${JSON.stringify('[DONE]')}\n\n`)
      res.end()
    } catch (err) {
      if (err instanceof LlmClientError) {
        res.write(`event: error\n`)
        res.write(`data: ${JSON.stringify({ message: err.message, code: err.code, retryable: err.retryable })}\n\n`)
      } else {
        res.write(`event: error\n`)
        res.write(`data: ${JSON.stringify({ message: err.message || 'Streaming failed.', code: 'STREAM_ERROR', retryable: true })}\n\n`)
      }
      res.end()
      return
    }

    // Persist assistant message after streaming
    if (assistantText.trim()) {
      run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'assistant', assistantText.trim())
    }
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/chat error:', err.message)
    if (!res.headersSent) {
      if (err instanceof LlmClientError) {
        return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
      }
      return res.status(500).json({ error: 'Failed to process chat message.' })
    }
    // Headers already sent - try to write SSE error
    try {
      res.write(`event: error\n`)
      res.write(`data: ${JSON.stringify({ message: err.message || 'Server error.', code: 'SERVER_ERROR' })}\n\n`)
      res.end()
    } catch {}
  }
})

/**
 * POST /api/topics/:id/lessons/:lid/continue
 * Advance to the next chunk and stream the tutor response via SSE.
 */
router.post('/topics/:id/lessons/:lid/continue', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)

    const topic = get('SELECT id, title, interaction_mode FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const lesson = get(
      `SELECT l.id, l.title, l.depth, l.estimated_time, l.outcomes, l.prerequisites
       FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE l.id = ? AND m.topic_id = ?`,
      lessonId, topicId
    )
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' })
    }

    // Check prerequisites
    const prereqCheck = checkPrerequisites(topicId, lesson)
    if (prereqCheck.locked) {
      return res.status(403).json({ error: 'This lesson is locked. Complete the prerequisites first.' })
    }

    const progress = get('SELECT id, state, current_chunk, total_chunks FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    if (!progress || progress.state !== 'practicing') {
      return res.status(400).json({ error: 'Lesson must be in practicing state to continue.' })
    }

    const nextChunk = (progress.current_chunk || 0) + 1
    run('UPDATE progress SET current_chunk = ? WHERE id = ?', nextChunk, progress.id)

    // Persist a synthetic user "continue" message for context
    run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'user', '[Continue]')

    // Build conversation history for LLM
    const history = all(
      'SELECT role, content FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id ASC',
      topicId, lessonId
    )

    const settings = get('SELECT provider, api_key, model FROM llm_settings LIMIT 1')
    if (!settings || !settings.api_key) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    let outcomes = []
    try {
      outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
    } catch {
      outcomes = []
    }

    const interactionMode = topic.interaction_mode || inferInteractionMode(topic.title)
    const isFinalChunk = nextChunk >= (progress.total_chunks || DEFAULT_TOTAL_CHUNKS)

    const system = buildSystemPrompt({
      mode: interactionMode,
      lessonTitle: lesson.title,
      lessonOutcomes: outcomes,
      chunkNum: nextChunk,
      totalChunks: progress.total_chunks || DEFAULT_TOTAL_CHUNKS,
      isFinal: isFinalChunk,
    })

    const streamResult = await streamText({
      provider: settings.provider,
      apiKey: settings.api_key,
      model: settings.model,
      system,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    })

    // Stream SSE and collect text for persistence
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    let assistantText = ''
    try {
      for await (const chunk of streamResult.textStream) {
        const text = typeof chunk === 'string' ? chunk : ''
        assistantText += text
        res.write(`data: ${JSON.stringify(text)}\n\n`)
      }
      res.write(`data: ${JSON.stringify('[DONE]')}\n\n`)
      res.end()
    } catch (err) {
      if (err instanceof LlmClientError) {
        res.write(`event: error\n`)
        res.write(`data: ${JSON.stringify({ message: err.message, code: err.code, retryable: err.retryable })}\n\n`)
      } else {
        res.write(`event: error\n`)
        res.write(`data: ${JSON.stringify({ message: err.message || 'Streaming failed.', code: 'STREAM_ERROR', retryable: true })}\n\n`)
      }
      res.end()
      return
    }

    // Persist assistant message after streaming
    if (assistantText.trim()) {
      run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'assistant', assistantText.trim())
    }
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/continue error:', err.message)
    if (!res.headersSent) {
      if (err instanceof LlmClientError) {
        return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
      }
      return res.status(500).json({ error: 'Failed to continue lesson.' })
    }
    try {
      res.write(`event: error\n`)
      res.write(`data: ${JSON.stringify({ message: err.message || 'Server error.', code: 'SERVER_ERROR' })}\n\n`)
      res.end()
    } catch {}
  }
})

export default router
