import { Router } from 'express'
import { get, run, all, transaction } from '../db.js'
import { resolveLlmConfig, requireLlmConfig } from '../utils/llm-config.js'
import { generateText, LlmClientError } from '../llm/client.js'
import { scheduleSrs } from '../utils/lesson-state-machine.js'
import { scheduleCumulativeReviews } from '../utils/srs-scheduler.js'
import { recordMasteryEvent } from '../utils/streak-tracker.js'

const router = Router()

const EXAM_MIN_QUESTIONS = 12
const EXAM_MAX_QUESTIONS = 25
const EXAM_MIN_PER_LESSON = 2
const EXAM_PASS_THRESHOLD = 75
const EXAM_CATEGORY_MIN_THRESHOLD = 50

/**
 * Check if all MVP (non-skipped) lessons in a module are passed/tested_out.
 * Returns { ready: boolean, totalLessons, passedLessons, lessonsRemaining }.
 */
function checkExamReadiness(topicId, moduleId) {
  const lessons = all(
    `SELECT l.id, p.state
     FROM lessons l
     LEFT JOIN progress p ON p.lesson_id = l.id AND p.topic_id = ?
     WHERE l.module_id = ?`,
    topicId, moduleId
  )

  const total = lessons.length
  const passed = lessons.filter((l) => ['passed', 'tested_out'].includes(l.state)).length
  const remaining = total - passed

  return {
    ready: remaining === 0 && total > 0,
    totalLessons: total,
    passedLessons: passed,
    lessonsRemaining: remaining,
  }
}

/**
 * Get lesson context for LLM exam generation.
 */
function getModuleLessonContext(topicId, moduleId) {
  const lessons = all(
    `SELECT l.id, l.title, l.depth, l.outcomes, l.prerequisites
     FROM lessons l
     WHERE l.module_id = ?
     ORDER BY l.lesson_index`,
    moduleId
  )

  return lessons.map((lesson) => {
    let outcomes = []
    try {
      outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
    } catch {
      outcomes = []
    }
    return {
      id: lesson.id,
      title: lesson.title,
      depth: lesson.depth,
      outcomes,
    }
  })
}

/**
 * Build the LLM prompt for generating module exam questions.
 */
function buildExamGenerationPrompt({ moduleTitle, lessons, topicTitle }) {
  const totalQuestions = Math.max(EXAM_MIN_QUESTIONS, lessons.length * EXAM_MIN_PER_LESSON)
  const cappedTotal = Math.min(totalQuestions, EXAM_MAX_QUESTIONS)

  const lessonsContext = lessons.map((l) => {
    return `Lesson: ${l.title}
Outcomes: ${l.outcomes.join('; ')}
lessonId: ${l.id}`
  }).join('\n\n')

  return `You are an expert assessment designer. Generate a comprehensive module exam for the topic "${topicTitle}" — module "${moduleTitle}".

Lessons in this module:
${lessonsContext}

Requirements:
- Generate exactly ${cappedTotal} questions total.
- At least ${EXAM_MIN_PER_LESSON} questions per lesson.
- Mix question types: conceptual, application, debugging, open-ended.
- Each question must have:
  - id (string, unique within the exam)
  - text (string, the question prompt)
  - type (one of: conceptual, application, debugging, open-ended)
  - weight (integer: conceptual=1, application=2, debugging=2, open-ended=2)
  - lessonId (number, which lesson this question belongs to)

Return ONLY valid JSON with this exact structure:
{
  "questions": [
    { "id": "q1", "text": "...", "type": "conceptual", "weight": 1, "lessonId": 1 }
  ]
}`
}

/**
 * Build the LLM prompt for evaluating exam answers.
 */
function buildExamEvaluationPrompt({ topicTitle, moduleTitle, questions, answers, lessons }) {
  const qaPairs = questions.map((q) => {
    const ans = answers[q.id] || ''
    return `Q: ${q.text}\nType: ${q.type} (weight ${q.weight})\nLesson: ${q.lessonId}\nA: ${ans}`
  }).join('\n\n')

  const lessonsContext = lessons.map((l) => {
    return `Lesson ${l.id}: ${l.title}`
  }).join('\n')

  return `You are an expert tutor evaluating a module exam for "${topicTitle}" — module "${moduleTitle}".

Lessons:
${lessonsContext}

Questions and answers:
${qaPairs}

Return ONLY valid JSON with this exact structure:
{
  "overallScore": number (0-100),
  "passed": boolean,
  "criticalGap": boolean,
  "perLessonScores": {
    "lessonId": { "score": number (0-100), "questionCount": number }
  },
  "weakLessons": [lessonId],
  "feedback": [
    { "questionId": string, "correctness": "correct" | "partial" | "incorrect", "score": number, "explanation": string }
  ],
  "gaps": [string]
}

Scoring rules:
- Pass threshold: overallScore >= ${EXAM_PASS_THRESHOLD} AND no critical gaps AND every lesson category >= ${EXAM_CATEGORY_MIN_THRESHOLD}
- criticalGap = true if any lesson category scores below ${EXAM_CATEGORY_MIN_THRESHOLD} or if a learner shows a fundamental misunderstanding
`}

/**
 * Build the LLM prompt for generating partial retest questions.
 */
function buildPartialRetestPrompt({ weakLessons, moduleTitle, topicTitle }) {
  const lessonsContext = weakLessons.map((l) => {
    return `Lesson: ${l.title}\nOutcomes: ${l.outcomes.join('; ')}\nlessonId: ${l.id}`
  }).join('\n\n')

  return `You are an expert assessment designer. The learner failed the module exam for "${topicTitle}" — module "${moduleTitle}".
Generate a focused retest covering ONLY their weak areas.

Weak lessons:
${lessonsContext}

Requirements:
- Generate 2-4 questions per weak lesson.
- Mix question types: conceptual, application, debugging, open-ended.
- Each question must have: id, text, type, weight, lessonId.
- Return ONLY valid JSON with a "questions" array.`
}

/**
 * GET /api/topics/:id/modules/:mid/exam
 * Check exam status / load existing pending exam.
 */
router.get('/topics/:id/modules/:mid/exam', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const moduleId = Number(req.params.mid)

    const topic = get('SELECT id, title FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const moduleRow = get('SELECT id, title FROM modules WHERE id = ? AND topic_id = ?', moduleId, topicId)
    if (!moduleRow) {
      return res.status(404).json({ error: 'Module not found.' })
    }

    const readiness = checkExamReadiness(topicId, moduleId)
    if (!readiness.ready) {
      return res.status(403).json({
        examNotReady: true,
        lessonsRemaining: readiness.lessonsRemaining,
        passedLessons: readiness.passedLessons,
        totalLessons: readiness.totalLessons,
        error: `Complete all ${readiness.totalLessons} lessons to unlock the exam. ${readiness.lessonsRemaining} remaining.`,
      })
    }

    // Look for an existing pending exam
    const existing = get(
      'SELECT id, questions, answers, evaluation, status, type, parent_exam_id FROM exam_attempts WHERE topic_id = ? AND module_id = ? AND status = ? ORDER BY id DESC',
      topicId, moduleId, 'pending'
    )

    if (!existing) {
      return res.status(404).json({ error: 'No exam started for this module. Start one first.' })
    }

    let questions = []
    let answers = {}
    let evaluation = null
    try {
      questions = existing.questions ? JSON.parse(existing.questions) : []
    } catch {}
    try {
      answers = existing.answers ? JSON.parse(existing.answers) : {}
    } catch {}
    try {
      evaluation = existing.evaluation ? JSON.parse(existing.evaluation) : null
    } catch {}

    return res.json({
      id: existing.id,
      questions,
      answers,
      evaluation,
      status: existing.status,
      type: existing.type || 'full',
      parentExamId: existing.parent_exam_id,
    })
  } catch (err) {
    console.error('GET /api/topics/:id/modules/:mid/exam error:', err.message)
    return res.status(500).json({ error: 'Failed to load exam.' })
  }
})

/**
 * POST /api/topics/:id/modules/:mid/exam
 * Generate a new module exam (or return existing pending one).
 */
router.post('/topics/:id/modules/:mid/exam', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const moduleId = Number(req.params.mid)

    const topic = get('SELECT id, title FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const moduleRow = get('SELECT id, title FROM modules WHERE id = ? AND topic_id = ?', moduleId, topicId)
    if (!moduleRow) {
      return res.status(404).json({ error: 'Module not found.' })
    }

    const readiness = checkExamReadiness(topicId, moduleId)
    if (!readiness.ready) {
      return res.status(403).json({
        error: `Complete all ${readiness.totalLessons} lessons to unlock the exam. ${readiness.lessonsRemaining} remaining.`,
      })
    }

    // Return existing pending exam if one exists
    const existing = get(
      'SELECT id, questions, answers, evaluation, status, type, parent_exam_id FROM exam_attempts WHERE topic_id = ? AND module_id = ? AND status = ? ORDER BY id DESC',
      topicId, moduleId, 'pending'
    )

    if (existing) {
      let questions = []
      let answers = {}
      try {
        questions = existing.questions ? JSON.parse(existing.questions) : []
      } catch {}
      try {
        answers = existing.answers ? JSON.parse(existing.answers) : {}
      } catch {}
      return res.json({
        id: existing.id,
        questions,
        answers,
        status: existing.status,
        type: existing.type || 'full',
        parentExamId: existing.parent_exam_id,
      })
    }

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    const lessons = getModuleLessonContext(topicId, moduleId)

    const system = buildExamGenerationPrompt({
      moduleTitle: moduleRow.title,
      lessons,
      topicTitle: topic.title,
    })

    const result = await generateText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      system,
      messages: [{ role: 'user', content: 'Generate the module exam questions as JSON.' }],
    })

    let parsed
    try {
      const text = result.text || '{}'
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Failed to parse exam questions from LLM. Please try again.', retryable: true })
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : []
    if (questions.length === 0) {
      return res.status(500).json({ error: 'LLM returned no exam questions. Please try again.', retryable: true })
    }

    // Validate question structure
    const validQuestions = questions.filter((q) => q.id && q.text && q.type && typeof q.weight === 'number' && typeof q.lessonId === 'number')
    if (validQuestions.length === 0) {
      return res.status(500).json({ error: 'LLM returned malformed exam questions. Please try again.', retryable: true })
    }

    const questionsJson = JSON.stringify(validQuestions)
    const examResult = run(
      'INSERT INTO exam_attempts (topic_id, module_id, questions, status, type) VALUES (?, ?, ?, ?, ?)',
      topicId, moduleId, questionsJson, 'pending', 'full'
    )

    return res.json({
      id: examResult.lastInsertRowid,
      questions: validQuestions,
      answers: {},
      status: 'pending',
      type: 'full',
    })
  } catch (err) {
    console.error('POST /api/topics/:id/modules/:mid/exam error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to generate exam.' })
  }
})

/**
 * POST /api/topics/:id/modules/:mid/exam/save-progress
 * Save in-progress answers for resume after refresh.
 */
router.post('/topics/:id/modules/:mid/exam/save-progress', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const moduleId = Number(req.params.mid)
    const { answers } = req.body

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'Answers object is required.' })
    }

    const existing = get(
      'SELECT id FROM exam_attempts WHERE topic_id = ? AND module_id = ? AND status = ? ORDER BY id DESC',
      topicId, moduleId, 'pending'
    )

    if (!existing) {
      return res.status(404).json({ error: 'No pending exam found to save progress.' })
    }

    run(
      'UPDATE exam_attempts SET answers = ? WHERE id = ?',
      JSON.stringify(answers),
      existing.id
    )

    return res.json({ ok: true, saved: true })
  } catch (err) {
    console.error('POST /api/topics/:id/modules/:mid/exam/save-progress error:', err.message)
    return res.status(500).json({ error: 'Failed to save exam progress.' })
  }
})

/**
 * POST /api/topics/:id/modules/:mid/exam/submit
 * Submit exam answers for evaluation.
 */
router.post('/topics/:id/modules/:mid/exam/submit', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const moduleId = Number(req.params.mid)
    const { answers } = req.body

    if (!answers || typeof answers !== 'object' || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: 'Please answer at least one question before submitting.' })
    }

    const topic = get('SELECT id, title FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const moduleRow = get('SELECT id, title FROM modules WHERE id = ? AND topic_id = ?', moduleId, topicId)
    if (!moduleRow) {
      return res.status(404).json({ error: 'Module not found.' })
    }

    const existing = get(
      'SELECT id, questions, answers, status FROM exam_attempts WHERE topic_id = ? AND module_id = ? AND status = ? ORDER BY id DESC',
      topicId, moduleId, 'pending'
    )

    if (!existing) {
      return res.status(404).json({ error: 'No pending exam found to submit.' })
    }

    let questions = []
    try {
      questions = existing.questions ? JSON.parse(existing.questions) : []
    } catch {
      questions = []
    }

    // Block if any question is completely unanswered
    const unanswered = questions.filter((q) => !answers[q.id] || answers[q.id].trim().length === 0)
    if (unanswered.length > 0) {
      return res.status(400).json({
        error: `Please answer all ${questions.length} questions before submitting. ${unanswered.length} unanswered.`,
        unansweredCount: unanswered.length,
        totalQuestions: questions.length,
      })
    }

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    const lessons = getModuleLessonContext(topicId, moduleId)

    const system = buildExamEvaluationPrompt({
      topicTitle: topic.title,
      moduleTitle: moduleRow.title,
      questions,
      answers,
      lessons,
    })

    const result = await generateText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      system,
      messages: [{ role: 'user', content: 'Evaluate the exam answers and return JSON.' }],
    })

    let parsed
    try {
      const text = result.text || '{}'
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Failed to parse evaluation from LLM. Please try again.', retryable: true })
    }

    const overallScore = typeof parsed.overallScore === 'number' ? parsed.overallScore : 0
    const criticalGap = !!parsed.criticalGap

    // Compute per-lesson scores from LLM response
    const perLessonScores = typeof parsed.perLessonScores === 'object' && parsed.perLessonScores !== null
      ? parsed.perLessonScores
      : {}

    // Identify weak lessons: any category below 50%
    const weakLessons = []
    for (const [lessonIdStr, cat] of Object.entries(perLessonScores)) {
      const score = typeof cat?.score === 'number' ? cat.score : 0
      if (score < EXAM_CATEGORY_MIN_THRESHOLD) {
        weakLessons.push(Number(lessonIdStr))
      }
    }
    if (Array.isArray(parsed.weakLessons)) {
      for (const wl of parsed.weakLessons) {
        const id = typeof wl === 'number' ? wl : Number(wl)
        if (!weakLessons.includes(id)) weakLessons.push(id)
      }
    }

    // Pass condition: >=75% overall AND no critical gaps AND >=50% per lesson
    let passed = overallScore >= EXAM_PASS_THRESHOLD && !criticalGap && weakLessons.length === 0
    // If LLM explicitly returned passed field, respect it but enforce our constraints
    if (typeof parsed.passed === 'boolean') {
      passed = parsed.passed && overallScore >= EXAM_PASS_THRESHOLD && !criticalGap && weakLessons.length === 0
    }

    const evaluation = {
      overallScore,
      passed,
      criticalGap,
      perLessonScores,
      weakLessons,
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    }

    const newStatus = passed ? 'passed' : 'failed'

    run(
      'UPDATE exam_attempts SET answers = ?, evaluation = ?, status = ? WHERE id = ?',
      JSON.stringify(answers),
      JSON.stringify(evaluation),
      newStatus,
      existing.id
    )

    // On pass: mark module complete, unlock next module, schedule SRS
    let nextModuleUnlocked = false
    if (passed) {
      const now = new Date().toISOString()
      run('UPDATE modules SET status = ?, completed_at = ? WHERE id = ?', 'completed', now, moduleId)

      // Schedule SRS for all lessons in this module
      const moduleLessons = all('SELECT id FROM lessons WHERE module_id = ?', moduleId)
      for (const lesson of moduleLessons) {
        scheduleSrs(topicId, lesson.id)
      }

      // Schedule cumulative module reviews at 7d and 30d
      scheduleCumulativeReviews(topicId, moduleId)

      // Unlock next module (if any) by unlocking its first foundation lesson
      const nextModule = get(
        'SELECT id FROM modules WHERE topic_id = ? AND module_index > (SELECT module_index FROM modules WHERE id = ?) ORDER BY module_index LIMIT 1',
        topicId, moduleId
      )
      if (nextModule) {
        nextModuleUnlocked = true
      }
    }

    // Record streak on exam pass
    if (passed) {
      try {
        const localDate = req.body.localDate || new Date().toISOString().split('T')[0]
        recordMasteryEvent(localDate)
      } catch (streakErr) {
        console.error('Streak record error on exam pass:', streakErr.message)
      }
    }

    return res.json({
      ...evaluation,
      nextModuleUnlocked,
    })
  } catch (err) {
    console.error('POST /api/topics/:id/modules/:mid/exam/submit error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to evaluate exam.' })
  }
})

/**
 * POST /api/topics/:id/modules/:mid/exam/retake
 * Start a full retake (new exam attempt).
 */
router.post('/topics/:id/modules/:mid/exam/retake', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const moduleId = Number(req.params.mid)

    const topic = get('SELECT id, title FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const moduleRow = get('SELECT id, title FROM modules WHERE id = ? AND topic_id = ?', moduleId, topicId)
    if (!moduleRow) {
      return res.status(404).json({ error: 'Module not found.' })
    }

    const readiness = checkExamReadiness(topicId, moduleId)
    if (!readiness.ready) {
      return res.status(403).json({
        error: `Complete all ${readiness.totalLessons} lessons to unlock the exam. ${readiness.lessonsRemaining} remaining.`,
      })
    }

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    const lessons = getModuleLessonContext(topicId, moduleId)

    const system = buildExamGenerationPrompt({
      moduleTitle: moduleRow.title,
      lessons,
      topicTitle: topic.title,
    })

    const result = await generateText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      system,
      messages: [{ role: 'user', content: 'Generate the module exam questions as JSON.' }],
    })

    let parsed
    try {
      const text = result.text || '{}'
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Failed to parse exam questions from LLM. Please try again.', retryable: true })
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : []
    if (questions.length === 0) {
      return res.status(500).json({ error: 'LLM returned no exam questions. Please try again.', retryable: true })
    }

    const validQuestions = questions.filter((q) => q.id && q.text && q.type && typeof q.weight === 'number' && typeof q.lessonId === 'number')
    if (validQuestions.length === 0) {
      return res.status(500).json({ error: 'LLM returned malformed exam questions. Please try again.', retryable: true })
    }

    const questionsJson = JSON.stringify(validQuestions)
    const examResult = run(
      'INSERT INTO exam_attempts (topic_id, module_id, questions, status, type) VALUES (?, ?, ?, ?, ?)',
      topicId, moduleId, questionsJson, 'pending', 'full'
    )

    return res.json({
      id: examResult.lastInsertRowid,
      questions: validQuestions,
      answers: {},
      status: 'pending',
      type: 'full',
    })
  } catch (err) {
    console.error('POST /api/topics/:id/modules/:mid/exam/retake error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to generate retake exam.' })
  }
})

/**
 * POST /api/topics/:id/modules/:mid/exam/partial-retest
 * Generate a partial retest focused on weak lessons.
 */
router.post('/topics/:id/modules/:mid/exam/partial-retest', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const moduleId = Number(req.params.mid)
    const { weakLessons: weakLessonIds } = req.body

    const topic = get('SELECT id, title FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const moduleRow = get('SELECT id, title FROM modules WHERE id = ? AND topic_id = ?', moduleId, topicId)
    if (!moduleRow) {
      return res.status(404).json({ error: 'Module not found.' })
    }

    // Require a failed full exam to exist
    const failedExam = get(
      'SELECT id, evaluation FROM exam_attempts WHERE topic_id = ? AND module_id = ? AND type = ? AND status = ? ORDER BY id DESC',
      topicId, moduleId, 'full', 'failed'
    )
    if (!failedExam) {
      return res.status(400).json({ error: 'No failed exam found to retest. Take the full exam first.' })
    }

    if (!Array.isArray(weakLessonIds) || weakLessonIds.length === 0) {
      return res.status(400).json({ error: 'weakLessons array is required.' })
    }

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    // Fetch weak lesson details
    const weakLessons = []
    for (const lessonId of weakLessonIds) {
      const lesson = get('SELECT id, title, outcomes FROM lessons WHERE id = ? AND module_id = ?', lessonId, moduleId)
      if (lesson) {
        let outcomes = []
        try {
          outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
        } catch {
          outcomes = []
        }
        weakLessons.push({ id: lesson.id, title: lesson.title, outcomes })
      }
    }

    if (weakLessons.length === 0) {
      return res.status(400).json({ error: 'No valid weak lessons found for retest.' })
    }

    const system = buildPartialRetestPrompt({
      weakLessons,
      moduleTitle: moduleRow.title,
      topicTitle: topic.title,
    })

    const result = await generateText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      system,
      messages: [{ role: 'user', content: 'Generate the partial retest questions as JSON.' }],
    })

    let parsed
    try {
      const text = result.text || '{}'
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Failed to parse retest questions from LLM. Please try again.', retryable: true })
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : []
    if (questions.length === 0) {
      return res.status(500).json({ error: 'LLM returned no retest questions. Please try again.', retryable: true })
    }

    const validQuestions = questions.filter((q) => q.id && q.text && q.type && typeof q.weight === 'number' && typeof q.lessonId === 'number')
    if (validQuestions.length === 0) {
      return res.status(500).json({ error: 'LLM returned malformed retest questions. Please try again.', retryable: true })
    }

    const questionsJson = JSON.stringify(validQuestions)
    const examResult = run(
      'INSERT INTO exam_attempts (topic_id, module_id, questions, status, type, parent_exam_id) VALUES (?, ?, ?, ?, ?, ?)',
      topicId, moduleId, questionsJson, 'pending', 'partial', failedExam.id
    )

    return res.json({
      id: examResult.lastInsertRowid,
      questions: validQuestions,
      answers: {},
      status: 'pending',
      type: 'partial',
      parentExamId: failedExam.id,
    })
  } catch (err) {
    console.error('POST /api/topics/:id/modules/:mid/exam/partial-retest error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to generate partial retest.' })
  }
})

/**
 * POST /api/topics/:id/modules/:mid/exam/partial-retest/:rid/submit
 * Submit a partial retest.
 */
router.post('/topics/:id/modules/:mid/exam/partial-retest/:rid/submit', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const moduleId = Number(req.params.mid)
    const retestId = Number(req.params.rid)
    const { answers } = req.body

    if (!answers || typeof answers !== 'object' || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: 'Please answer at least one question before submitting.' })
    }

    const topic = get('SELECT id, title FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const moduleRow = get('SELECT id, title FROM modules WHERE id = ? AND topic_id = ?', moduleId, topicId)
    if (!moduleRow) {
      return res.status(404).json({ error: 'Module not found.' })
    }

    const retest = get(
      'SELECT id, questions, parent_exam_id, status FROM exam_attempts WHERE id = ? AND topic_id = ? AND module_id = ? AND type = ?',
      retestId, topicId, moduleId, 'partial'
    )

    if (!retest) {
      return res.status(404).json({ error: 'Partial retest not found.' })
    }

    if (retest.status !== 'pending') {
      return res.status(400).json({ error: 'This retest has already been submitted.' })
    }

    let questions = []
    try {
      questions = retest.questions ? JSON.parse(retest.questions) : []
    } catch {
      questions = []
    }

    const unanswered = questions.filter((q) => !answers[q.id] || answers[q.id].trim().length === 0)
    if (unanswered.length > 0) {
      return res.status(400).json({
        error: `Please answer all ${questions.length} questions before submitting. ${unanswered.length} unanswered.`,
        unansweredCount: unanswered.length,
        totalQuestions: questions.length,
      })
    }

    const config = requireLlmConfig()
    if (!config.apiKeySet) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    const lessons = getModuleLessonContext(topicId, moduleId)

    const system = buildExamEvaluationPrompt({
      topicTitle: topic.title,
      moduleTitle: moduleRow.title,
      questions,
      answers,
      lessons,
    })

    const result = await generateText({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      system,
      messages: [{ role: 'user', content: 'Evaluate the partial retest answers and return JSON.' }],
    })

    let parsed
    try {
      const text = result.text || '{}'
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Failed to parse evaluation from LLM. Please try again.', retryable: true })
    }

    const overallScore = typeof parsed.overallScore === 'number' ? parsed.overallScore : 0
    const criticalGap = !!parsed.criticalGap
    const perLessonScores = typeof parsed.perLessonScores === 'object' && parsed.perLessonScores !== null
      ? parsed.perLessonScores
      : {}

    const weakLessons = []
    for (const [lessonIdStr, cat] of Object.entries(perLessonScores)) {
      const score = typeof cat?.score === 'number' ? cat.score : 0
      if (score < EXAM_CATEGORY_MIN_THRESHOLD) {
        weakLessons.push(Number(lessonIdStr))
      }
    }
    if (Array.isArray(parsed.weakLessons)) {
      for (const wl of parsed.weakLessons) {
        const id = typeof wl === 'number' ? wl : Number(wl)
        if (!weakLessons.includes(id)) weakLessons.push(id)
      }
    }

    const retestPassed = overallScore >= EXAM_PASS_THRESHOLD && !criticalGap && weakLessons.length === 0

    const evaluation = {
      overallScore,
      passed: retestPassed,
      criticalGap,
      perLessonScores,
      weakLessons,
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    }

    run(
      'UPDATE exam_attempts SET answers = ?, evaluation = ?, status = ? WHERE id = ?',
      JSON.stringify(answers),
      JSON.stringify(evaluation),
      retestPassed ? 'passed' : 'failed',
      retest.id
    )

    // Check if original exam overall was >=75 — if so, passing retest can complete module
    let modulePassed = false
    let partialPass = false
    if (retestPassed && retest.parent_exam_id) {
      const parentExam = get('SELECT evaluation FROM exam_attempts WHERE id = ?', retest.parent_exam_id)
      if (parentExam && parentExam.evaluation) {
        let parentEval = null
        try {
          parentEval = JSON.parse(parentExam.evaluation)
        } catch {}
        if (parentEval && typeof parentEval.overallScore === 'number' && parentEval.overallScore >= EXAM_PASS_THRESHOLD) {
          modulePassed = true
          partialPass = true
        }
      }
    }

    let nextModuleUnlocked = false
    if (modulePassed) {
      const now = new Date().toISOString()
      run('UPDATE modules SET status = ?, completed_at = ? WHERE id = ?', 'completed', now, moduleId)

      const moduleLessons = all('SELECT id FROM lessons WHERE module_id = ?', moduleId)
      for (const lesson of moduleLessons) {
        scheduleSrs(topicId, lesson.id)
      }

      // Schedule cumulative module reviews at 7d and 30d
      scheduleCumulativeReviews(topicId, moduleId)

      const nextModule = get(
        'SELECT id FROM modules WHERE topic_id = ? AND module_index > (SELECT module_index FROM modules WHERE id = ?) ORDER BY module_index LIMIT 1',
        topicId, moduleId
      )
      if (nextModule) {
        nextModuleUnlocked = true
      }
    }

    // Record streak on module completion via partial retest
    if (modulePassed) {
      try {
        const localDate = req.body.localDate || new Date().toISOString().split('T')[0]
        recordMasteryEvent(localDate)
      } catch (streakErr) {
        console.error('Streak record error on partial retest module pass:', streakErr.message)
      }
    }

    return res.json({
      ...evaluation,
      partialPass,
      modulePassed,
      nextModuleUnlocked,
    })
  } catch (err) {
    console.error('POST /api/topics/:id/modules/:mid/exam/partial-retest/:rid/submit error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to evaluate partial retest.' })
  }
})

export default router
