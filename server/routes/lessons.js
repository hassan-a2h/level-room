import { Router } from 'express'
import { get, run, all } from '../db.js'
import { resolveLlmConfig, requireLlmConfig } from '../utils/llm-config.js'
import { streamText, generateText, LlmClientError } from '../llm/client.js'
import { buildDifficultyInstruction, DIFFICULTY_LEVELS } from '../utils/adaptive-difficulty.js'
import { getActiveMistakes } from '../utils/mistakes-log.js'
import {
  startPracticing,
  startQuiz,
  startRetest,
  recordQuizResult,
  skipLesson,
  startTestOut,
  finishTestOut,
  checkPrerequisites,
  StateMachineError,
  recordArtifactResult,
} from '../utils/lesson-state-machine.js'
import { recordMasteryEvent } from '../utils/streak-tracker.js'

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
function buildSystemPrompt({ mode, lessonTitle, lessonOutcomes, chunkNum, totalChunks, isFinal, difficultyInstruction = '' }) {
  const base = `You are an expert tutor teaching the lesson "${lessonTitle}".
Learning outcomes: ${lessonOutcomes.join('; ')}.
This is chunk ${chunkNum} of ${totalChunks}.`

  let prompt = base
  if (difficultyInstruction) {
    prompt += '\n\n' + difficultyInstruction
  }

  if (isFinal) {
    return `${prompt}
This is the FINAL chunk. Summarize the key concepts and then ask the learner if they're ready to check their understanding with a short quiz. Be encouraging. Keep your response to 1-2 short paragraphs.`
  }

  switch (mode) {
    case 'code':
      return `${prompt}
You are teaching a technical topic. Provide concise, practical explanations with code examples where helpful. Use markdown code blocks for code. Focus on ONE concept per message. Keep each message under ~500 characters or 3 short paragraphs.`
    case 'scenario':
      return `${prompt}
You are coaching a soft skill. Present a realistic scenario and ask the learner how they would respond. Or if continuing a scenario, give constructive feedback on their previous response and present the next part. Focus on ONE scenario element per message. Keep each message under ~500 characters or 3 short paragraphs.`
    case 'socratic':
    default:
      return `${prompt}
You are a Socratic tutor. Ask clarifying questions BEFORE giving direct answers. Help the learner discover concepts through guided inquiry. Focus on ONE concept per message. Keep each message under ~500 characters or 3 short paragraphs.`
  }
}

/**
 * Prerequisite helper that uses the canonical state-machine function.
 */
function buildPrereqCheck(topicId, lesson) {
  return checkPrerequisites(topicId, lesson.id)
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
      'SELECT state, current_chunk, total_chunks, quiz_score, quiz_attempts, artifact_passed, started_at, completed_at, remediation_attempts, last_gaps FROM progress WHERE topic_id = ? AND lesson_id = ?',
      topicId, lessonId
    ) || { state: 'not_started', current_chunk: 0, total_chunks: 0, quiz_score: null, quiz_attempts: 0, artifact_passed: 0, remediation_attempts: 0, last_gaps: null }

    const prereqCheck = buildPrereqCheck(topicId, lesson)
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

    const prereqCheck = buildPrereqCheck(topicId, lesson)
    if (prereqCheck.locked) {
      return res.status(403).json({ error: 'This lesson is locked. Complete the prerequisites first.' })
    }

    // Transition state via state machine (not_started -> practicing)
    const currentProgress = get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    if (!currentProgress || currentProgress.state === 'not_started') {
      try {
        startPracticing({ topicId, lessonId, currentChunk: 1, totalChunks: DEFAULT_TOTAL_CHUNKS })
      } catch (smErr) {
        if (smErr instanceof StateMachineError) {
          return res.status(400).json({ error: smErr.message, code: smErr.code })
        }
        throw smErr
      }
    }

    // Re-fetch progress for chunk info
    const progress = get('SELECT id, state, current_chunk, total_chunks FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)

    // Persist user message
    run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'user', content.trim())

    // Build conversation history for LLM
    const history = all(
      'SELECT role, content FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id ASC',
      topicId, lessonId
    )

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
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

    const difficultyInstruction = buildDifficultyInstruction(topicId)

    const system = buildSystemPrompt({
      mode: interactionMode,
      lessonTitle: lesson.title,
      lessonOutcomes: outcomes,
      chunkNum: progress.current_chunk,
      totalChunks: progress.total_chunks,
      isFinal: isFinalChunk,
      difficultyInstruction,
    })

    const streamResult = await streamText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
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

    const prereqCheck = buildPrereqCheck(topicId, lesson)
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

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
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

    const difficultyInstruction = buildDifficultyInstruction(topicId)

    const system = buildSystemPrompt({
      mode: interactionMode,
      lessonTitle: lesson.title,
      lessonOutcomes: outcomes,
      chunkNum: nextChunk,
      totalChunks: progress.total_chunks || DEFAULT_TOTAL_CHUNKS,
      isFinal: isFinalChunk,
      difficultyInstruction,
    })

    const streamResult = await streamText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
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
function buildQuizPrompt({ lessonTitle, lessonOutcomes, messages, difficultyInstruction = '' }) {
  const context = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
  const adaptive = difficultyInstruction ? `\n\n${difficultyInstruction}` : ''
  return `You are an expert tutor. Based on the following lesson context, generate 3-8 free-text quiz questions that test the learner's understanding of what was taught.

Lesson: ${lessonTitle}
Outcomes: ${lessonOutcomes.join('; ')}${adaptive}

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
 * Build retest quiz prompt focused only on missed gaps.
 */
function buildRetestPrompt({ lessonTitle, lessonOutcomes, gaps, messages, difficultyInstruction = '' }) {
  const context = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
  const adaptive = difficultyInstruction ? `\n\n${difficultyInstruction}` : ''
  return `You are an expert tutor. The learner previously failed a quiz on "${lessonTitle}" and specifically struggled with these gaps:
${gaps.map((g) => `- ${g}`).join('\n')}

Lesson outcomes: ${lessonOutcomes.join('; ')}${adaptive}

Conversation context:
${context}

Generate a SHORT retest of 1-3 free-text questions that target ONLY the gaps listed above. Do NOT ask about concepts the learner already demonstrated mastery of. Each question must have:
- id (string)
- text (string, the question prompt)
- type (one of: Recall, Explain, Apply, Diagnose, Transfer)
- weight (integer: Recall=1, Explain=2, Apply=2, Diagnose=2, Transfer=3)

Return ONLY valid JSON with a "questions" array.`
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

    const prereqCheck = buildPrereqCheck(topicId, lesson)
    if (prereqCheck.locked) {
      return res.status(403).json({ error: 'This lesson is locked. Complete the prerequisites first.' })
    }

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    // Transition via state machine (practicing -> quiz_pending)
    try {
      startQuiz({ topicId, lessonId })
    } catch (smErr) {
      if (smErr instanceof StateMachineError) {
        return res.status(400).json({ error: smErr.message, code: smErr.code })
      }
      throw smErr
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

    const difficultyInstruction = buildDifficultyInstruction(topicId)

    const system = buildQuizPrompt({
      lessonTitle: lesson.title,
      lessonOutcomes: outcomes,
      messages,
      difficultyInstruction,
    })

    const result = await generateText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
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

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
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
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
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
    const passed = overallScore >= 80 && !criticalGap

    const evaluation = {
      overallScore,
      passed,
      criticalGap,
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    }

    // Atomic state transition via state machine
    try {
      recordQuizResult({
        topicId,
        lessonId,
        passed,
        quizScore: overallScore,
        answers,
        evaluation,
        attemptId: attempt.id,
      })
    } catch (smErr) {
      if (smErr instanceof StateMachineError) {
        return res.status(400).json({ error: smErr.message, code: smErr.code })
      }
      throw smErr
    }

    // Record streak on quiz pass
    if (passed) {
      try {
        const localDate = req.body.localDate || new Date().toISOString().split('T')[0]
        recordMasteryEvent(localDate)
      } catch (streakErr) {
        console.error('Streak record error on quiz pass:', streakErr.message)
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

/**
 * POST /api/topics/:id/lessons/:lid/retest
 * Start a retest (remediating -> quiz_pending).
 */
router.post('/topics/:id/lessons/:lid/retest', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)

    try {
      const result = startRetest({ topicId, lessonId })
      return res.json(result)
    } catch (smErr) {
      if (smErr instanceof StateMachineError) {
        return res.status(400).json({ error: smErr.message, code: smErr.code })
      }
      throw smErr
    }
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/retest error:', err.message)
    return res.status(500).json({ error: 'Failed to start retest.' })
  }
})

/**
 * POST /api/topics/:id/lessons/:lid/skip
 * Skip a lesson.
 */
router.post('/topics/:id/lessons/:lid/skip', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)

    try {
      const result = skipLesson({ topicId, lessonId })
      return res.json(result)
    } catch (smErr) {
      if (smErr instanceof StateMachineError) {
        return res.status(400).json({ error: smErr.message, code: smErr.code })
      }
      throw smErr
    }
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/skip error:', err.message)
    return res.status(500).json({ error: 'Failed to skip lesson.' })
  }
})

/**
 * POST /api/topics/:id/lessons/:lid/test-out/start
 * Start a test-out diagnostic (no state change yet).
 */
router.post('/topics/:id/lessons/:lid/test-out/start', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)

    try {
      const result = startTestOut({ topicId, lessonId })
      return res.json(result)
    } catch (smErr) {
      if (smErr instanceof StateMachineError) {
        return res.status(400).json({ error: smErr.message, code: smErr.code })
      }
      throw smErr
    }
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/test-out/start error:', err.message)
    return res.status(500).json({ error: 'Failed to start test-out.' })
  }
})

/**
 * POST /api/topics/:id/lessons/:lid/test-out/finish
 * Finish a test-out diagnostic.
 */
router.post('/topics/:id/lessons/:lid/test-out/finish', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)
    const { answers, passed, quizScore, evaluation, attemptId } = req.body

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

    try {
      const result = finishTestOut({
        topicId,
        lessonId,
        passed,
        quizScore,
        answers,
        evaluation,
        attemptId,
      })

      if (passed) {
        try {
          const localDate = req.body.localDate || new Date().toISOString().split('T')[0]
          recordMasteryEvent(localDate)
        } catch (streakErr) {
          console.error('Streak record error on test-out pass:', streakErr.message)
        }
      }

      return res.json(result)
    } catch (smErr) {
      if (smErr instanceof StateMachineError) {
        return res.status(400).json({ error: smErr.message, code: smErr.code })
      }
      throw smErr
    }
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/test-out/finish error:', err.message)
    return res.status(500).json({ error: 'Failed to finish test-out.' })
  }
})

/**
 * GET /api/topics/:id/lessons/:lid/remediate
 * Get current remediation state (gaps, attempts).
 */
router.get('/topics/:id/lessons/:lid/remediate', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)

    const progress = get(
      'SELECT state, remediation_attempts, last_gaps FROM progress WHERE topic_id = ? AND lesson_id = ?',
      topicId, lessonId
    )

    if (!progress) {
      return res.status(404).json({ error: 'No progress found for this lesson.' })
    }

    let gaps = []
    try {
      gaps = progress.last_gaps ? JSON.parse(progress.last_gaps) : []
    } catch {
      gaps = []
    }

    return res.json({
      state: progress.state,
      remediationAttempts: progress.remediation_attempts || 0,
      gaps,
    })
  } catch (err) {
    console.error('GET /api/topics/:id/lessons/:lid/remediate error:', err.message)
    return res.status(500).json({ error: 'Failed to load remediation state.' })
  }
})

/**
 * POST /api/topics/:id/lessons/:lid/remediate/chat
 * Send a user message during remediation and stream targeted re-teach response.
 */
router.post('/topics/:id/lessons/:lid/remediate/chat', async (req, res) => {
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

    const progress = get('SELECT id, state, remediation_attempts, last_gaps FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    if (!progress || progress.state !== 'remediating') {
      return res.status(400).json({ error: 'Lesson must be in remediating state to use remediation chat.' })
    }

    let gaps = []
    try {
      gaps = progress.last_gaps ? JSON.parse(progress.last_gaps) : []
    } catch {
      gaps = []
    }

    // Persist user message
    run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'user', content.trim())

    // Build conversation history
    const history = all(
      'SELECT role, content FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id ASC',
      topicId, lessonId
    )

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    let outcomes = []
    try {
      outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
    } catch {
      outcomes = []
    }

    const interactionMode = topic.interaction_mode || inferInteractionMode(topic.title)
    const difficultyInstruction = buildDifficultyInstruction(topicId)

    const system = `You are an expert tutor. The learner is struggling with the lesson "${lesson.title}" and specifically these gaps:
${gaps.map((g) => `- ${g}`).join('\n')}

Learning outcomes: ${outcomes.join('; ')}.
This is a REMEDIATION message. Focus ONLY on the gaps above. Use a DIFFERENT explanation strategy from the original lesson (new analogy, new example, different framing). Keep the message under ~500 characters or 3 short paragraphs. Be encouraging, not punitive.

${difficultyInstruction}`

    const streamResult = await streamText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      system,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    })

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

    if (assistantText.trim()) {
      run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'assistant', assistantText.trim())
    }
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/remediate/chat error:', err.message)
    if (!res.headersSent) {
      if (err instanceof LlmClientError) {
        return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
      }
      return res.status(500).json({ error: 'Failed to process remediation chat message.' })
    }
    try {
      res.write(`event: error\n`)
      res.write(`data: ${JSON.stringify({ message: err.message || 'Server error.', code: 'SERVER_ERROR' })}\n\n`)
      res.end()
    } catch {}
  }
})

/**
 * POST /api/topics/:id/lessons/:lid/remediate/retest
 * Generate retest questions targeting gaps, transition remediating -> quiz_pending.
 */
router.post('/topics/:id/lessons/:lid/remediate/retest', async (req, res) => {
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

    const progress = get('SELECT id, state, remediation_attempts, last_gaps FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    if (!progress || progress.state !== 'remediating') {
      return res.status(400).json({ error: 'Lesson must be in remediating state to start a retest.' })
    }

    let gaps = []
    try {
      gaps = progress.last_gaps ? JSON.parse(progress.last_gaps) : []
    } catch {
      gaps = []
    }

    if (gaps.length === 0) {
      return res.status(400).json({ error: 'No gaps identified for retest. Cannot generate retest without diagnostic gaps.' })
    }

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    // Transition via state machine
    try {
      startRetest({ topicId, lessonId })
    } catch (smErr) {
      if (smErr instanceof StateMachineError) {
        return res.status(400).json({ error: smErr.message, code: smErr.code })
      }
      throw smErr
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

    const difficultyInstruction = buildDifficultyInstruction(topicId)

    const system = buildRetestPrompt({
      lessonTitle: lesson.title,
      lessonOutcomes: outcomes,
      gaps,
      messages,
      difficultyInstruction,
    })

    const result = await generateText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      system,
      messages: [{ role: 'user', content: 'Generate the retest questions as JSON.' }],
    })

    let parsed
    try {
      const text = result.text || '{}'
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Failed to parse retest questions from LLM. Please try again.' })
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : []
    if (questions.length === 0) {
      return res.status(500).json({ error: 'LLM returned no retest questions. Please try again.' })
    }

    const validQuestions = questions.filter((q) => q.id && q.text && q.type && typeof q.weight === 'number')
    if (validQuestions.length === 0) {
      return res.status(500).json({ error: 'LLM returned malformed retest questions. Please try again.' })
    }

    const questionsJson = JSON.stringify(validQuestions)
    run(
      'INSERT INTO quiz_attempts (topic_id, lesson_id, questions) VALUES (?, ?, ?)',
      topicId, lessonId, questionsJson
    )

    return res.json({ questions: validQuestions })
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/remediate/retest error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to generate retest.' })
  }
})

/**
 * POST /api/topics/:id/lessons/:lid/remediate/defer
 * Save progress and defer the lesson (remediating -> skipped).
 */
router.post('/topics/:id/lessons/:lid/remediate/defer', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)

    try {
      const result = skipLesson({ topicId, lessonId })
      return res.json({ success: true, ...result })
    } catch (smErr) {
      if (smErr instanceof StateMachineError) {
        return res.status(400).json({ error: smErr.message, code: smErr.code })
      }
      throw smErr
    }
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/remediate/defer error:', err.message)
    return res.status(500).json({ error: 'Failed to defer lesson.' })
  }
})

/**
 * Build artifact evaluation prompt.
 */
function buildArtifactEvaluationPrompt({ lessonTitle, lessonOutcomes, artifactContent, artifactType }) {
  return `You are an expert reviewer evaluating a learner's artifact for the lesson "${lessonTitle}".

Lesson outcomes: ${lessonOutcomes.join('; ')}

Artifact type: ${artifactType || 'code/text'}
Artifact content:
${artifactContent}

Evaluate the artifact against a 4-point rubric. Score each dimension 0–2:
- Correctness: Does it work / is it factually correct?
- Completeness: Are all required parts included?
- Clarity: Is it easy to understand / well structured?
- Edge Cases: Does it handle boundary conditions or unusual inputs?

Passing criteria: no zeros in any dimension AND total score >= 70% of maximum (i.e., >= 6 out of 8 total points).

Return ONLY valid JSON with this exact structure:
{
  "overallScore": number (0-100),
  "passed": boolean,
  "scores": {
    "Correctness": 0|1|2,
    "Completeness": 0|1|2,
    "Clarity": 0|1|2,
    "Edge Cases": 0|1|2
  },
  "feedback": {
    "Correctness": "string",
    "Completeness": "string",
    "Clarity": "string",
    "Edge Cases": "string"
  }
}`
}

const MAX_FILE_SIZE_MB = 5

/**
 * POST /api/topics/:id/lessons/:lid/artifact
 * Submit an artifact for LLM evaluation.
 */
router.post('/topics/:id/lessons/:lid/artifact', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)
    const { content, fileData } = req.body

    // Validate content presence
    const artifactText = content || fileData || ''
    if (!artifactText || typeof artifactText !== 'string' || artifactText.trim().length === 0) {
      return res.status(400).json({ error: 'Artifact content is empty. Please enter or upload your solution before submitting.' })
    }

    // File size validation
    if (fileData && Buffer.byteLength(fileData, 'utf8') > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return res.status(400).json({ error: `File too large (max ${MAX_FILE_SIZE_MB}MB). Please upload a smaller file.` })
    }

    const topic = get('SELECT id, title, interaction_mode FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const lesson = get(
      `SELECT l.id, l.title, l.depth, l.estimated_time, l.outcomes, l.prerequisites, l.artifact_required, l.artifact_type
       FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE l.id = ? AND m.topic_id = ?`,
      lessonId, topicId
    )
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' })
    }

    const prereqCheck = buildPrereqCheck(topicId, lesson)
    if (prereqCheck.locked) {
      return res.status(403).json({ error: 'This lesson is locked. Complete the prerequisites first.' })
    }

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    let outcomes = []
    try {
      outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
    } catch {
      outcomes = []
    }

    const system = buildArtifactEvaluationPrompt({
      lessonTitle: lesson.title,
      lessonOutcomes: outcomes,
      artifactContent: artifactText.trim(),
      artifactType: lesson.artifact_type,
    })

    const result = await generateText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      system,
      messages: [{ role: 'user', content: 'Evaluate the artifact and return JSON.' }],
    })

    let parsed
    try {
      const text = result.text || '{}'
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Failed to parse artifact evaluation from LLM. Please try again.', retryable: true })
    }

    const scores = parsed.scores || {}
    const feedback = parsed.feedback || {}

    // Validate rubric dimensions
    const RUBRIC_DIMENSIONS = ['Correctness', 'Completeness', 'Clarity', 'Edge Cases']
    for (const dim of RUBRIC_DIMENSIONS) {
      if (typeof scores[dim] !== 'number' || scores[dim] < 0 || scores[dim] > 2) {
        return res.status(500).json({
          error: `Invalid rubric evaluation: ${dim} score is missing or out of range (0-2). Please retry.`,
          retryable: true,
        })
      }
    }

    const totalScore = RUBRIC_DIMENSIONS.reduce((sum, dim) => sum + (scores[dim] || 0), 0)
    const maxPoints = RUBRIC_DIMENSIONS.length * 2
    const percentage = Math.round((totalScore / maxPoints) * 100)
    const hasZero = RUBRIC_DIMENSIONS.some((dim) => (scores[dim] || 0) === 0)
    const passed = !hasZero && totalScore >= Math.ceil(maxPoints * 0.7)

    const evaluation = {
      overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : percentage,
      passed,
      scores,
      feedback,
    }

    // Get current progress to know quiz score
    const progress = get('SELECT id, quiz_score FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    const quizScore = progress ? progress.quiz_score : null

    // Record artifact result via state machine
    let stateMachineResult
    try {
      stateMachineResult = recordArtifactResult({ topicId, lessonId, artifactPassed: passed, quizScore })
    } catch (smErr) {
      if (smErr instanceof StateMachineError) {
        return res.status(400).json({ error: smErr.message, code: smErr.code })
      }
      throw smErr
    }

    // Persist artifact submission
    let attemptNumber = 1
    if (progress) {
      const countRow = get('SELECT COUNT(*) as count FROM artifacts WHERE progress_id = ?', progress.id)
      attemptNumber = (countRow?.count || 0) + 1
    }
    const progressId = progress ? progress.id : (stateMachineResult.progressId || 0)
    const artifactResult = run(
      'INSERT INTO artifacts (progress_id, content, rubric_scores, passed, feedback, attempt_number) VALUES (?, ?, ?, ?, ?, ?)',
      progressId,
      artifactText.trim(),
      JSON.stringify(scores),
      passed ? 1 : 0,
      JSON.stringify(feedback),
      attemptNumber,
    )

    // Record streak when artifact completes the lesson
    if (stateMachineResult.toState === 'passed' || stateMachineResult.toState === 'tested_out') {
      try {
        const localDate = req.body.localDate || new Date().toISOString().split('T')[0]
        recordMasteryEvent(localDate)
      } catch (streakErr) {
        console.error('Streak record error on artifact pass:', streakErr.message)
      }
    }

    return res.json({
      evaluation,
      state: stateMachineResult.toState || get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)?.state || 'practicing',
      artifactId: artifactResult.lastInsertRowid,
    })
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/artifact error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to evaluate artifact.' })
  }
})

/**
 * GET /api/topics/:id/lessons/:lid/artifact
 * Return the latest artifact submission for this lesson.
 */
router.get('/topics/:id/lessons/:lid/artifact', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)

    const progress = get('SELECT id FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    if (!progress) {
      return res.status(404).json({ error: 'No artifact found for this lesson.' })
    }

    const artifact = get(
      'SELECT id, content, rubric_scores, passed, feedback, attempt_number, created_at FROM artifacts WHERE progress_id = ? ORDER BY id DESC',
      progress.id,
    )

    if (!artifact) {
      return res.status(404).json({ error: 'No artifact found for this lesson.' })
    }

    let scores = {}
    let fb = {}
    try {
      scores = artifact.rubric_scores ? JSON.parse(artifact.rubric_scores) : {}
    } catch {}
    try {
      fb = artifact.feedback ? JSON.parse(artifact.feedback) : {}
    } catch {}

    return res.json({
      id: artifact.id,
      content: artifact.content,
      passed: !!artifact.passed,
      attemptNumber: artifact.attempt_number,
      createdAt: artifact.created_at,
      evaluation: {
        scores,
        feedback: fb,
      },
    })
  } catch (err) {
    console.error('GET /api/topics/:id/lessons/:lid/artifact error:', err.message)
    return res.status(500).json({ error: 'Failed to load artifact.' })
  }
})

export default router
