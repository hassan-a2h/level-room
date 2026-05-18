import { Router } from 'express'
import { get, run, all } from '../db.js'
import { resolveLlmConfig, requireLlmConfig } from '../utils/llm-config.js'
import { generateText, LlmClientError } from '../llm/client.js'
import {
  getDueItems,
  getDueCounts,
  updateSrsAfterReview,
  isLessonSkipped,
  scheduleCumulativeReviews,
} from '../utils/srs-scheduler.js'
import { recordMasteryEvent } from '../utils/streak-tracker.js'

const router = Router()

// In-memory session store for review sessions
const reviewSessions = new Map()

const MAX_QUESTIONS_PER_SESSION = 20
const MIN_QUESTIONS_PER_LESSON = 3
const MAX_QUESTIONS_PER_LESSON = 6

function generateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Build LLM prompt for generating retrieval review questions.
 */
function buildReviewQuestionsPrompt({ lessonTitle, lessonOutcomes, messages, numQuestions }) {
  const context = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
  return `You are an expert tutor designing spaced-repetition retrieval questions for the lesson "${lessonTitle}".

Learning outcomes: ${lessonOutcomes.join('; ')}

Conversation context (key concepts taught):
${context}

Generate ${numQuestions} retrieval questions that require the learner to recall or apply what they learned. Each question must have:
- id (string, unique within this batch)
- text (string, the question prompt)
- type (one of: Recall, Explain, Apply)

Return ONLY valid JSON with a "questions" array.`
}

/**
 * Build LLM prompt for generating cumulative module review questions.
 */
function buildCumulativeReviewPrompt({ moduleTitle, lessons, numQuestions }) {
  const lessonsContext = lessons.map((l) => {
    return `Lesson: ${l.title}\nOutcomes: ${l.outcomes.join('; ')}`
  }).join('\n\n')

  return `You are an expert tutor designing a cumulative review for the module "${moduleTitle}".

Lessons in this module:
${lessonsContext}

Generate ${numQuestions} retrieval questions that cover the most important concepts across all lessons. Each question must have:
- id (string, unique within this batch)
- text (string, the question prompt)
- type (one of: Recall, Explain, Apply)
- lessonId (number, which lesson this question belongs to)

Return ONLY valid JSON with a "questions" array.`
}

/**
 * Build LLM prompt for evaluating review answers.
 */
function buildReviewEvaluationPrompt({ questions, answers }) {
  const qaPairs = questions.map((q) => {
    const ans = answers[q.id] || ''
    return `Q: ${q.text}\nA: ${ans}`
  }).join('\n\n')

  return `You are an expert tutor. Evaluate the following spaced-repetition review answers.

${qaPairs}

Return ONLY valid JSON with this exact structure:
{
  "overallScore": number (0-100),
  "passed": boolean (true if overallScore >= 80),
  "feedback": [
    {
      "questionId": string,
      "correct": boolean,
      "explanation": string
    }
  ]
}`
}

/**
 * Generate review questions for a single lesson.
 */
async function generateLessonReviewQuestions({ settings: config, lessonId, topicId, numQuestions }) {
  const lesson = get(
    'SELECT l.id, l.title, l.outcomes FROM lessons l JOIN modules m ON l.module_id = m.id WHERE l.id = ? AND m.topic_id = ?',
    lessonId, topicId,
  )
  if (!lesson) return []

  let outcomes = []
  try {
    outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
  } catch {
    outcomes = []
  }

  // Get last 10 messages for context
  const messages = all(
    'SELECT role, content FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id DESC LIMIT 10',
    topicId, lessonId,
  ).reverse()

  const system = buildReviewQuestionsPrompt({
    lessonTitle: lesson.title,
    lessonOutcomes: outcomes,
    messages,
    numQuestions,
  })

  const result = await generateText({
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    system,
    messages: [{ role: 'user', content: 'Generate review questions as JSON.' }],
  })

  let parsed
  try {
    const text = result.text || '{}'
    parsed = JSON.parse(text)
  } catch {
    return []
  }

  const questions = Array.isArray(parsed.questions) ? parsed.questions : []
  return questions.filter((q) => q.id && q.text && q.type).slice(0, numQuestions)
}

/**
 * Generate cumulative review questions for a module.
 */
async function generateCumulativeReviewQuestions({ settings: config, moduleId, topicId, numQuestions }) {
  const moduleRow = get('SELECT id, title FROM modules WHERE id = ? AND topic_id = ?', moduleId, topicId)
  if (!moduleRow) return []

  const lessons = all(
    'SELECT id, title, outcomes FROM lessons WHERE module_id = ? ORDER BY lesson_index',
    moduleId,
  )

  const lessonsWithOutcomes = lessons.map((l) => {
    let outcomes = []
    try {
      outcomes = l.outcomes ? JSON.parse(l.outcomes) : []
    } catch {
      outcomes = []
    }
    return { id: l.id, title: l.title, outcomes }
  })

  const system = buildCumulativeReviewPrompt({
    moduleTitle: moduleRow.title,
    lessons: lessonsWithOutcomes,
    numQuestions,
  })

  const result = await generateText({
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    system,
    messages: [{ role: 'user', content: 'Generate cumulative review questions as JSON.' }],
  })

  let parsed
  try {
    const text = result.text || '{}'
    parsed = JSON.parse(text)
  } catch {
    return []
  }

  const questions = Array.isArray(parsed.questions) ? parsed.questions : []
  return questions.filter((q) => q.id && q.text && q.type && typeof q.lessonId === 'number').slice(0, numQuestions)
}

/**
 * GET /api/reviews
 * List all due review items.
 */
router.get('/reviews', (_req, res) => {
  try {
    const items = getDueItems()
    // Filter out skipped lessons
    const filtered = items.filter((item) => {
      if (item.review_type === 'lesson' && item.lesson_id) {
        return !isLessonSkipped(item.topic_id, item.lesson_id)
      }
      return true
    })

    const today = new Date().toISOString().split('T')[0]

    // Deduplicate by lesson_id (keep earliest due date)
    const seenLessons = new Set()
    const deduped = []
    for (const item of filtered) {
      const key = item.lesson_id ? `${item.topic_id}-${item.lesson_id}` : `${item.topic_id}-m${item.module_id}`
      if (seenLessons.has(key)) continue
      seenLessons.add(key)
      deduped.push(item)
    }

    const due = deduped.map((item) => ({
      id: item.id,
      topicId: item.topic_id,
      lessonId: item.lesson_id,
      moduleId: item.module_id,
      intervalIndex: item.interval_index,
      dueDate: item.due_date,
      reviewType: item.review_type,
      topicTitle: item.topic_title || 'Unknown Topic',
      lessonTitle: item.lesson_title || (item.review_type === 'cumulative' ? 'Module Review' : 'Unknown Lesson'),
      moduleTitle: item.module_title || '',
      isOverdue: item.due_date < today,
    }))

    const dueToday = due.filter((d) => d.dueDate === today).length
    const overdue = due.filter((d) => d.isOverdue).length

    return res.json({ due, dueToday, overdue })
  } catch (err) {
    console.error('GET /api/reviews error:', err.message)
    return res.status(500).json({ error: 'Failed to load review queue.' })
  }
})

/**
 * GET /api/reviews/count
 * Return badge counts.
 */
router.get('/reviews/count', (_req, res) => {
  try {
    const counts = getDueCounts()
    return res.json(counts)
  } catch (err) {
    console.error('GET /api/reviews/count error:', err.message)
    return res.status(500).json({ error: 'Failed to load review counts.' })
  }
})

/**
 * POST /api/reviews/start
 * Start a review session. Returns mixed questions from due items.
 */
router.post('/reviews/start', async (req, res) => {
  try {
    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    const items = getDueItems()
    // Filter out skipped lessons
    const filtered = items.filter((item) => {
      if (item.review_type === 'lesson' && item.lesson_id) {
        return !isLessonSkipped(item.topic_id, item.lesson_id)
      }
      return true
    })

    if (filtered.length === 0) {
      return res.status(404).json({ error: 'No reviews are due.' })
    }

    // Build session
    const sessionId = generateSessionId()
    const allQuestions = []
    const questionToItem = new Map()

    // Determine how many questions per item
    const itemsToReview = filtered.slice(0, 10) // max 10 items per session
    const remainingCount = Math.max(0, filtered.length - itemsToReview.length)
    const questionsPerItem = Math.min(
      MAX_QUESTIONS_PER_LESSON,
      Math.floor(MAX_QUESTIONS_PER_SESSION / itemsToReview.length),
    )
    const actualQuestionsPerItem = Math.max(MIN_QUESTIONS_PER_LESSON, questionsPerItem)

    for (const item of itemsToReview) {
      let questions = []
      if (item.review_type === 'cumulative' && item.module_id) {
        questions = await generateCumulativeReviewQuestions({
          settings: config,
          moduleId: item.module_id,
          topicId: item.topic_id,
          numQuestions: actualQuestionsPerItem,
        })
      } else if (item.lesson_id) {
        questions = await generateLessonReviewQuestions({
          settings: config,
          lessonId: item.lesson_id,
          topicId: item.topic_id,
          numQuestions: actualQuestionsPerItem,
        })
      }

      // Tag each question with metadata
      for (const q of questions) {
        const tagged = {
          ...q,
          _topicId: item.topic_id,
          _lessonId: item.lesson_id,
          _moduleId: item.module_id,
          _srsId: item.id,
          _reviewType: item.review_type,
          topicTitle: item.topic_title || 'Unknown Topic',
          lessonTitle: item.lesson_title || (item.review_type === 'cumulative' ? 'Module Review' : 'Unknown Lesson'),
        }
        allQuestions.push(tagged)
        questionToItem.set(q.id, {
          srsId: item.id,
          topicId: item.topic_id,
          lessonId: item.lesson_id,
          moduleId: item.module_id,
          reviewType: item.review_type,
        })
      }
    }

    if (allQuestions.length === 0) {
      return res.status(500).json({ error: 'Could not generate review questions. Please try again.', retryable: true })
    }

    // Shuffle questions for mixed-practice effect
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]]
    }

    // Cap at max
    const cappedQuestions = allQuestions.slice(0, MAX_QUESTIONS_PER_SESSION)

    reviewSessions.set(sessionId, {
      questions: cappedQuestions,
      questionToItem: Object.fromEntries(questionToItem),
      createdAt: new Date().toISOString(),
    })

    return res.json({
      sessionId,
      questions: cappedQuestions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        topicTitle: q.topicTitle,
        lessonTitle: q.lessonTitle,
      })),
      totalQuestions: cappedQuestions.length,
      remainingCount,
    })
  } catch (err) {
    console.error('POST /api/reviews/start error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to start review session.' })
  }
})

/**
 * POST /api/reviews/:sessionId/submit
 * Submit review answers, evaluate, and update SRS intervals.
 */
router.post('/reviews/:sessionId/submit', async (req, res) => {
  try {
    const sessionId = req.params.sessionId
    const { answers } = req.body

    if (!answers || typeof answers !== 'object' || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: 'Please answer at least one question before submitting.' })
    }

    const session = reviewSessions.get(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Review session not found or expired.' })
    }

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    // Validate all questions have answers
    const questions = session.questions
    const unanswered = questions.filter((q) => !answers[q.id] || answers[q.id].trim().length === 0)
    if (unanswered.length > 0) {
      return res.status(400).json({
        error: `Please answer all ${questions.length} questions. ${unanswered.length} unanswered.`,
        unansweredCount: unanswered.length,
        totalQuestions: questions.length,
      })
    }

    const system = buildReviewEvaluationPrompt({ questions, answers })
    const result = await generateText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      system,
      messages: [{ role: 'user', content: 'Evaluate the review answers and return JSON.' }],
    })

    let parsed
    try {
      const text = result.text || '{}'
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Failed to parse evaluation from LLM. Please try again.', retryable: true })
    }

    const overallScore = typeof parsed.overallScore === 'number' ? parsed.overallScore : 0
    const passed = overallScore >= 80
    const feedback = Array.isArray(parsed.feedback) ? parsed.feedback : []

    // Group results by lesson/module for per-item SRS updates
    const itemResults = new Map()
    for (const q of questions) {
      const itemMeta = session.questionToItem[q.id]
      if (!itemMeta) continue
      const key = `${itemMeta.topicId}-${itemMeta.lessonId || 'm' + itemMeta.moduleId}`
      if (!itemResults.has(key)) {
        itemResults.set(key, { ...itemMeta, correctCount: 0, totalCount: 0, questionFeedback: [] })
      }
      const entry = itemResults.get(key)
      entry.totalCount += 1
      const fb = feedback.find((f) => f.questionId === q.id)
      if (fb && fb.correct) {
        entry.correctCount += 1
      }
      entry.questionFeedback.push({
        questionId: q.id,
        text: q.text,
        correct: fb ? fb.correct : false,
        explanation: fb ? fb.explanation : '',
      })
    }

    // Compute per-item scores and update SRS
    const perItemResults = []
    let globalAccelerated = false
    let globalRegressed = false

    for (const [, entry] of itemResults) {
      const itemScore = entry.totalCount > 0 ? Math.round((entry.correctCount / entry.totalCount) * 100) : 0
      let srsUpdate
      try {
        if (entry.reviewType === 'lesson' && entry.lessonId) {
          srsUpdate = updateSrsAfterReview(entry.topicId, entry.lessonId, itemScore)
        } else if (entry.reviewType === 'cumulative' && entry.moduleId) {
          // For cumulative reviews, update the cumulative SRS row directly
          const existing = get(
            'SELECT id, interval_index FROM srs_queue WHERE topic_id = ? AND module_id = ? AND review_type = ? AND status = ?',
            entry.topicId, entry.moduleId, 'cumulative', 'pending',
          )
          if (existing) {
            let nextIndex = existing.interval_index
            let accel = false
            let regr = false
            if (itemScore >= 95) {
              nextIndex = Math.min(nextIndex + 2, 4)
              accel = true
            } else if (itemScore >= 80) {
              nextIndex = Math.min(nextIndex + 1, 4)
            } else {
              nextIndex = Math.max(nextIndex - 1, 0)
              regr = true
            }
            const dueDate = new Date()
            dueDate.setDate(dueDate.getDate() + [1, 3, 7, 14, 30][nextIndex])
            run(
              'UPDATE srs_queue SET interval_index = ?, due_date = ?, last_reviewed = ?, score = ? WHERE id = ?',
              nextIndex, dueDate.toISOString().split('T')[0], new Date().toISOString(), itemScore, existing.id,
            )
            srsUpdate = { intervalIndex: nextIndex, dueDate: dueDate.toISOString().split('T')[0], accelerated: accel, regressed: regr }
          }
        }
      } catch (err) {
        console.error('SRS update error:', err.message)
      }

      if (srsUpdate) {
        if (srsUpdate.accelerated) globalAccelerated = true
        if (srsUpdate.regressed) globalRegressed = true
      }

      perItemResults.push({
        topicId: entry.topicId,
        lessonId: entry.lessonId,
        moduleId: entry.moduleId,
        reviewType: entry.reviewType,
        score: itemScore,
        correctCount: entry.correctCount,
        totalCount: entry.totalCount,
        feedback: entry.questionFeedback,
        ...srsUpdate,
      })
    }

    // Record streak on review pass (≥80%)
    if (passed) {
      try {
        const localDate = req.body.localDate || new Date().toISOString().split('T')[0]
        recordMasteryEvent(localDate)
      } catch (streakErr) {
        console.error('Streak record error on review pass:', streakErr.message)
      }
    }

    // Clean up session
    reviewSessions.delete(sessionId)

    return res.json({
      overallScore,
      passed,
      totalQuestions: questions.length,
      feedback,
      perItemResults,
      accelerated: globalAccelerated,
      regressed: globalRegressed,
    })
  } catch (err) {
    console.error('POST /api/reviews/:sessionId/submit error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to submit review.' })
  }
})

/**
 * POST /api/reviews/:sessionId/cancel
 * Cancel a review session without updating SRS.
 */
router.post('/reviews/:sessionId/cancel', (req, res) => {
  try {
    const sessionId = req.params.sessionId
    reviewSessions.delete(sessionId)
    return res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/reviews/:sessionId/cancel error:', err.message)
    return res.status(500).json({ error: 'Failed to cancel review session.' })
  }
})

export default router
