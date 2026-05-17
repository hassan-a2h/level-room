import { Router } from 'express'
import { get, run, all } from '../db.js'
import { streamText, generateText, LlmClientError } from '../llm/client.js'

const router = Router()

const MAX_MESSAGE_LENGTH = 2000
const DEFAULT_TOTAL_CHUNKS = 3
const QUIZ_PASS_THRESHOLD = 80
const SRS_INTERVALS = [1, 3, 7, 14, 30]

/**
 * Quiz question type weights per spec.
 */
const QUESTION_TYPE_WEIGHTS = {
  Recall: 1,
  Explain: 2,
  Apply: 2,
  Diagnose: 2,
  Transfer: 3,
}

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

/**
 * Build quiz generation prompt from lesson context.
 */
function buildQuizPrompt({ lessonTitle, lessonOutcomes, messages }) {
  const context = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
  return `You are an expert tutor. Based on the following lesson context, generate 3-8 free-text quiz questions that test the learner's understanding of what was taught.

Lesson: ${lessonTitle}
Outcomes: ${lessonOutcomes.join('; ')}

Conversation context:
${context}

Generate a JSON object with a "questions" array. Each question must have:
- id (string)
- text (string, the question prompt)
- type (one of: Recall, Explain, Apply, Diagnose, Transfer)
- weight (integer: Recall=1, Explain=2, Apply=2, Diagnose=2, Transfer=3)

All questions must be free-text (no multiple choice). Make them context-aware and related to the lesson content. Return ONLY valid JSON.`
}

/**
 * Build quiz evaluation prompt from lesson context.
 */
function buildEvaluationPrompt({ lessonTitle, lessonOutcomes, questions, answers, messages }) {
  const context = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
  const qaPairs = questions.map((q) => {
    const ans = answers[q.id] || ''
    return `Q: ${q.text}\nType: ${q.type} (weight ${q.weight})\nA: ${ans}`
  }).join('\n\n')

  return `You are an expert tutor. Evaluate the following quiz answers against the lesson content.

Lesson: ${lessonTitle}
Outcomes: ${lessonOutcomes.join('; ')}

Conversation context:
${context}

Questions and answers:
${qaPairs}

Return a JSON object with exactly this structure:
{
  "overallScore": number (0-100),
  "passed": boolean,
  "criticalGap": boolean,
  "feedback": [
    {
      "questionId": string,
      "correctness": "correct" | "partial" | "incorrect",
      "score": number,
      "explanation": string
    }
  ],
  "gaps": [string]
}

Scoring rules:
- Weighted: Recall=1, Explain=2, Apply=2, Diagnose=2, Transfer=3
- Pass threshold: overallScore >= 80 AND no critical gaps
- criticalGap = true if any "Recall" or "Explain" question is fully incorrect, or if a learner shows a fundamental misunderstanding
Return ONLY valid JSON.`
}

/**
 * POST /api/topics/:id/lessons/:lid/quiz
 * Generate quiz questions via LLM, transition state to quiz_pending.
 */
router.post('/topics/:id/lessons/:lid/quiz', async (req, res) => {
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
      return res.status(400).json({ error: 'Lesson must be in practicing state to start a quiz.' })
    }

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

    const messages = all(
      'SELECT role, content FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id ASC',
      topicId, lessonId
    )

    const system = buildQuizPrompt({
      lessonTitle: lesson.title,
      lessonOutcomes: outcomes,
      messages,
    })

    const result = await generateText({
      provider: settings.provider,
      apiKey: settings.api_key,
      model: settings.model,
      system,
      messages: [{ role: 'user', content: 'Generate the quiz questions as JSON.' }],
    })

    let parsed
    try {
      const text = result.text || '{}'
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Failed to parse quiz questions from LLM. Please try again.' })
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : []
    if (questions.length === 0) {
      return res.status(500).json({ error: 'LLM returned no quiz questions. Please try again.' })
    }

    // Validate question structure
    const validQuestions = questions.filter((q) => q.id && q.text && q.type && typeof q.weight === 'number')
    if (validQuestions.length === 0) {
      return res.status(500).json({ error: 'LLM returned malformed quiz questions. Please try again.' })
    }

    // Transition state to quiz_pending
    run('UPDATE progress SET state = ? WHERE id = ?', 'quiz_pending', progress.id)

    // Persist quiz questions
    const questionsJson = JSON.stringify(validQuestions)
    run(
      'INSERT INTO quiz_attempts (topic_id, lesson_id, questions) VALUES (?, ?, ?)',
      topicId, lessonId, questionsJson
    )

    return res.json({ questions: validQuestions })
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/quiz error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to generate quiz.' })
  }
})

/**
 * GET /api/topics/:id/lessons/:lid/quiz
 * Return the latest quiz for this lesson.
 */
router.get('/topics/:id/lessons/:lid/quiz', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)

    const attempt = get(
      'SELECT questions, answers, evaluation FROM quiz_attempts WHERE topic_id = ? AND lesson_id = ? ORDER BY id DESC',
      topicId, lessonId
    )

    if (!attempt) {
      return res.status(404).json({ error: 'No quiz found for this lesson.' })
    }

    let questions = []
    let answers = {}
    let evaluation = null
    try {
      questions = attempt.questions ? JSON.parse(attempt.questions) : []
    } catch {}
    try {
      answers = attempt.answers ? JSON.parse(attempt.answers) : {}
    } catch {}
    try {
      evaluation = attempt.evaluation ? JSON.parse(attempt.evaluation) : null
    } catch {}

    return res.json({ questions, answers, evaluation })
  } catch (err) {
    console.error('GET /api/topics/:id/lessons/:lid/quiz error:', err.message)
    return res.status(500).json({ error: 'Failed to load quiz.' })
  }
})

/**
 * POST /api/topics/:id/lessons/:lid/quiz/submit
 * Evaluate answers, update lesson state, schedule SRS.
 */
router.post('/topics/:id/lessons/:lid/quiz/submit', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)
    const { answers } = req.body

    if (!answers || typeof answers !== 'object' || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: 'Please answer at least one question before submitting.' })
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

    const progress = get('SELECT id, state, quiz_attempts FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    if (!progress || progress.state !== 'quiz_pending') {
      return res.status(400).json({ error: 'Lesson must be in quiz_pending state to submit answers.' })
    }

    const attempt = get(
      'SELECT id, questions FROM quiz_attempts WHERE topic_id = ? AND lesson_id = ? ORDER BY id DESC',
      topicId, lessonId
    )
    if (!attempt) {
      return res.status(404).json({ error: 'No quiz found for this lesson.' })
    }

    let questions = []
    try {
      questions = attempt.questions ? JSON.parse(attempt.questions) : []
    } catch {
      questions = []
    }

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

    const messages = all(
      'SELECT role, content FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id ASC',
      topicId, lessonId
    )

    const system = buildEvaluationPrompt({
      lessonTitle: lesson.title,
      lessonOutcomes: outcomes,
      questions,
      answers,
      messages,
    })

    const result = await generateText({
      provider: settings.provider,
      apiKey: settings.api_key,
      model: settings.model,
      system,
      messages: [{ role: 'user', content: 'Evaluate the quiz answers and return JSON.' }],
    })

    let parsed
    try {
      const text = result.text || '{}'
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Failed to parse evaluation from LLM. Please try again.' })
    }

    const overallScore = typeof parsed.overallScore === 'number' ? parsed.overallScore : 0
    const criticalGap = !!parsed.criticalGap
    const passed = overallScore >= QUIZ_PASS_THRESHOLD && !criticalGap

    const evaluation = {
      overallScore,
      passed,
      criticalGap,
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    }

    const newState = passed ? 'passed' : 'remediating'
    const completedAt = passed ? new Date().toISOString() : null

    run(
      'UPDATE progress SET state = ?, quiz_score = ?, quiz_attempts = ?, completed_at = ? WHERE id = ?',
      newState, overallScore, (progress.quiz_attempts || 0) + 1, completedAt, progress.id
    )

    // Persist answers and evaluation
    run(
      'UPDATE quiz_attempts SET answers = ?, evaluation = ? WHERE id = ?',
      JSON.stringify(answers), JSON.stringify(evaluation), attempt.id
    )

    // Schedule SRS on pass
    if (passed) {
      const existingSrs = get('SELECT id FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      if (!existingSrs) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + SRS_INTERVALS[0])
        run(
          'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date) VALUES (?, ?, ?, ?)',
          topicId, lessonId, 0, dueDate.toISOString().split('T')[0]
        )
      }
    }

    return res.json(evaluation)
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/quiz/submit error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to evaluate quiz.' })
  }
})

export default router
