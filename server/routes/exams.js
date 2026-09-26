import { Router } from 'express'
import { all, get, run, transaction } from '../db.js'
import { generateText, LlmClientError } from '../llm/client.js'
import { llmRequestOptions } from '../llm/request-options.js'
import { requireLlmConfig } from '../utils/llm-config.js'
import { checkpointPublicQuestions, parseCheckpointEnvelope, scoreCheckpoint, validateGeneratedCheckpointEnvelope, validateWrittenEvaluation } from '../utils/checkpoint-format.js'
import { completeCourseIfEligibleInTransaction } from '../utils/course-lineage.js'
import { scheduleSrs } from '../utils/lesson-state-machine.js'
import { scheduleCumulativeReviews } from '../utils/srs-scheduler.js'
import { recordMasteryEvent } from '../utils/streak-tracker.js'
import { publicOutcome, validateOutcome } from '../utils/outcome-manifest.js'

const router = Router()
const MAX_ANSWER_LENGTH = 5000

class CheckpointError extends Error {
  constructor(message, code = 'CHECKPOINT_ERROR', status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

function positiveId(value, name) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new CheckpointError(`${name} must be a positive integer.`, 'INVALID_REQUEST', 400)
  }
  return Number(value)
}

function readChapter(topicId, moduleId) {
  const topic = get('SELECT id, title FROM topics WHERE id = ?', topicId)
  if (!topic) throw new CheckpointError('Trail not found.', 'TOPIC_NOT_FOUND', 404)
  const module = get('SELECT id, title, skill_outcomes FROM modules WHERE id = ? AND topic_id = ?', moduleId, topicId)
  if (!module) throw new CheckpointError('Chapter not found.', 'MODULE_NOT_FOUND', 404)
  let outcomes
  try { outcomes = JSON.parse(module.skill_outcomes || '[]') } catch {
    throw new CheckpointError('Chapter outcomes are invalid.', 'CHAPTER_OUTCOMES_INVALID', 500)
  }
  if (!Array.isArray(outcomes) || outcomes.length === 0) throw new CheckpointError('Chapter outcomes are unavailable.', 'CHAPTER_OUTCOMES_INVALID', 500)
  const outcomeIds = new Set()
  outcomes = outcomes.map((outcome, index) => {
    const checked = validateOutcome(outcome, `chapter.skill_outcomes[${index}]`)
    if (!checked.valid || outcomeIds.has(checked.value?.id)) throw new CheckpointError('Chapter outcomes are invalid.', 'CHAPTER_OUTCOMES_INVALID', 500)
    outcomeIds.add(checked.value.id)
    return checked.value
  })
  if (!outcomes.some((outcome) => outcome.role === 'core')) throw new CheckpointError('Chapter outcomes are missing a core outcome.', 'CHAPTER_OUTCOMES_INVALID', 500)
  return { topic, module, outcomes }
}

function readiness(topicId, moduleId) {
  const lessons = all(`SELECT l.id, p.state FROM lessons l
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.topic_id = ?
    WHERE l.module_id = ? ORDER BY l.lesson_index`, topicId, moduleId)
  const passed = lessons.filter((lesson) => lesson.state === 'passed').length
  return { ready: lessons.length > 0 && passed === lessons.length, total: lessons.length, passed, remaining: lessons.length - passed }
}

function lessonsContext(moduleId) {
  return all('SELECT id, title, outcomes FROM lessons WHERE module_id = ? ORDER BY lesson_index', moduleId).map((lesson) => {
    let outcomes = []
    try { outcomes = JSON.parse(lesson.outcomes || '[]') } catch { /* context omits malformed optional detail */ }
    return { id: lesson.id, title: lesson.title, outcomes: Array.isArray(outcomes) ? outcomes : [] }
  })
}

function generationPrompt({ topicTitle, moduleTitle, outcomes, lessons, targetedOutcomeIds }) {
  const selected = targetedOutcomeIds ? outcomes.filter((outcome) => targetedOutcomeIds.includes(outcome.id)) : outcomes
  return `Design a rigorous, kind, outcome-based Chapter checkpoint for Trail "${topicTitle}" and Chapter "${moduleTitle}".

Chapter outcomes:
${JSON.stringify(selected)}
Targeted outcome IDs: ${targetedOutcomeIds ? targetedOutcomeIds.join(', ') : 'all Chapter outcomes'}
Sessions:
${JSON.stringify(lessons)}

Return 4-8 questions for a full checkpoint, or 2-4 for a targeted checkpoint. Cover every selected core outcome. Mix objective choice and short written reasoning. Keep questions clear, answerable from the Sessions, and assess application rather than trivia. Each question must include id (lowercase kebab-case), text, type (choice or written), weight (1-3), required (true), and outcomeIds. Choice questions also include 2-5 options with id and plain-text label. The private answerKey has one entry per question: choice entries have kind, correctOptionId, explanation; written entries have kind and criteria, each criterion has id, outcomeId, description, critical. Do not add fields.

Return only this JSON envelope: {"schemaVersion":1,"publicQuestions":[],"answerKey":{}}. Never include the correct answer in public question text/options.`
}

function evaluationPrompt(questions, envelope, answers) {
  const written = questions.filter((question) => question.type === 'written')
  const items = written.map((question) => ({
    questionId: question.id,
    prompt: question.text,
    learnerAnswer: answers[question.id],
    criteria: envelope.answerKey[question.id].criteria.map(({ id, description }) => ({ id, description })),
  }))
  return `Evaluate these short written responses using only the supplied rubric. Give each criterion an integer score from 0 to 100 and concise plain-text learner-facing feedback. Do not invent criteria or IDs. Return only JSON with shape {"evaluations":[{"questionId":"...","criteria":[{"id":"...","score":0,"feedback":"..."}]}]}.

Responses and rubric:
${JSON.stringify(items)}`
}

function parseProviderJson(text, message) {
  try { return JSON.parse(text) } catch {
    throw new CheckpointError(message, 'PROVIDER_OUTPUT_INVALID', 502)
  }
}

async function generateEnvelope(chapter, targetedOutcomeIds = null) {
  let config
  try { config = requireLlmConfig() } catch (error) {
    throw new CheckpointError(error.message, error.code || 'LLM_CONFIG_INVALID', 400)
  }
  const response = await generateText({
    ...llmRequestOptions(config),
    system: generationPrompt({
      topicTitle: chapter.topic.title,
      moduleTitle: chapter.module.title,
      outcomes: chapter.outcomes,
      lessons: lessonsContext(chapter.module.id),
      targetedOutcomeIds,
    }),
    messages: [{ role: 'user', content: 'Create the requested checkpoint envelope.' }],
  })
  const parsed = parseProviderJson(response.text || '', 'The checkpoint generator returned invalid JSON. Please try again.')
  const selectedOutcomes = targetedOutcomeIds ? chapter.outcomes.filter((outcome) => targetedOutcomeIds.includes(outcome.id)) : chapter.outcomes
  const checked = validateGeneratedCheckpointEnvelope(parsed, selectedOutcomes, { targeted: Boolean(targetedOutcomeIds) })
  if (!checked.valid) throw new CheckpointError(`The generated checkpoint is invalid: ${checked.error}`, 'CHECKPOINT_OUTPUT_INVALID', 502)
  return checked.value
}

function serializeAnswers(rawAnswers, questions) {
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) throw new CheckpointError('Answers must be provided as an object.', 'ANSWERS_INVALID', 400)
  const questionMap = new Map(questions.map((question) => [question.id, question]))
  const answers = {}
  for (const [questionId, rawValue] of Object.entries(rawAnswers)) {
    const question = questionMap.get(questionId)
    if (!question) throw new CheckpointError('Answers contain an unknown question.', 'ANSWERS_INVALID', 400)
    if (typeof rawValue !== 'string' || rawValue.length > MAX_ANSWER_LENGTH) throw new CheckpointError('Answers must be text under 5000 characters.', 'ANSWERS_INVALID', 400)
    if (question.type === 'choice' && rawValue && !question.options.some((option) => option.id === rawValue)) throw new CheckpointError('A selected option is not valid for this question.', 'ANSWERS_INVALID', 400)
    answers[questionId] = rawValue
  }
  return answers
}

function requiredAnswers(questions, answers) {
  const unanswered = questions.filter((question) => !answers[question.id] || !answers[question.id].trim())
  if (unanswered.length) {
    throw Object.assign(new CheckpointError(`Answer all ${questions.length} questions before submitting. ${unanswered.length} unanswered.`, 'ANSWERS_INCOMPLETE', 400), {
      unansweredQuestionIds: unanswered.map((question) => question.id),
      unansweredCount: unanswered.length,
      totalQuestions: questions.length,
    })
  }
}

async function evaluateWritten(envelope, answers) {
  const questions = envelope.publicQuestions.filter((question) => question.type === 'written')
  if (!questions.length) return {}
  let config
  try { config = requireLlmConfig() } catch (error) {
    throw new CheckpointError(error.message, error.code || 'LLM_CONFIG_INVALID', 400)
  }
  const response = await generateText({
    ...llmRequestOptions(config),
    system: evaluationPrompt(questions, envelope, answers),
    messages: [{ role: 'user', content: 'Evaluate each response against every listed criterion.' }],
  })
  const parsed = parseProviderJson(response.text || '', 'The written-answer evaluator returned invalid JSON. Please retry.')
  if (!parsed || !Array.isArray(parsed.evaluations) || parsed.evaluations.length !== questions.length) {
    throw new CheckpointError('The written-answer evaluator did not score every response. Please retry.', 'CHECKPOINT_EVALUATION_INVALID', 502)
  }
  const expected = new Map(questions.map((question) => [question.id, question]))
  const output = {}
  for (const item of parsed.evaluations) {
    const question = expected.get(item?.questionId)
    if (!question || Object.hasOwn(output, question.id)) throw new CheckpointError('The written-answer evaluator returned an unknown or duplicate response.', 'CHECKPOINT_EVALUATION_INVALID', 502)
    const checked = validateWrittenEvaluation({ ...question, criteria: envelope.answerKey[question.id].criteria }, { criteria: item.criteria })
    if (!checked.valid) throw new CheckpointError(checked.error, checked.code, 502)
    output[question.id] = checked.value
  }
  if (Object.keys(output).length !== questions.length) throw new CheckpointError('The written-answer evaluator omitted a response.', 'CHECKPOINT_EVALUATION_INVALID', 502)
  return output
}

function responseFor(attempt, envelope, chapter, answers = {}) {
  return {
    id: attempt.id,
    questions: checkpointPublicQuestions(envelope),
    answers,
    status: attempt.status || 'pending',
    type: attempt.type || 'full',
    parentExamId: attempt.parent_exam_id || null,
    outcomes: chapter.outcomes.map(publicOutcome).filter(Boolean),
    moduleTitle: chapter.module.title,
    schemaVersion: 1,
  }
}

function insertAttempt(topicId, moduleId, envelope, type = 'full', parentExamId = null) {
  const attempt = run(
    'INSERT INTO exam_attempts (topic_id, module_id, questions, status, type, parent_exam_id) VALUES (?, ?, ?, ?, ?, ?)',
    topicId, moduleId, JSON.stringify(envelope), 'pending', type, parentExamId,
  )
  return { id: attempt.lastInsertRowid, status: 'pending', type, parent_exam_id: parentExamId }
}

function getPending(topicId, moduleId, type = null) {
  const typeClause = type ? ' AND type = ?' : ''
  return get(
    `SELECT id, questions, answers, evaluation, status, type, parent_exam_id FROM exam_attempts WHERE topic_id = ? AND module_id = ? AND status = ?${typeClause} ORDER BY id DESC`,
    ...(type ? [topicId, moduleId, 'pending', type] : [topicId, moduleId, 'pending']),
  )
}

function readEnvelope(row, outcomes) {
  const checked = parseCheckpointEnvelope(row.questions, outcomes)
  if (!checked.valid) throw new CheckpointError('Stored checkpoint is invalid. Start a new attempt.', 'CHECKPOINT_STORAGE_INVALID', 500)
  return checked.value
}

function ensureReady(topicId, moduleId) {
  const state = readiness(topicId, moduleId)
  if (!state.ready) throw Object.assign(new CheckpointError(`Finish every Session to unlock the Chapter checkpoint. ${state.remaining} remaining.`, 'CHECKPOINT_NOT_READY', 403), {
    examNotReady: true,
    lessonsRemaining: state.remaining,
    passedLessons: state.passed,
    totalLessons: state.total,
  })
}

function completeChapter(topicId, moduleId) {
  const now = new Date().toISOString()
  run('UPDATE modules SET status = ?, completed_at = ? WHERE id = ?', 'completed', now, moduleId)
  for (const lesson of all('SELECT id FROM lessons WHERE module_id = ?', moduleId)) scheduleSrs(topicId, lesson.id)
  scheduleCumulativeReviews(topicId, moduleId)
  const nextModule = get('SELECT id FROM modules WHERE topic_id = ? AND module_index > (SELECT module_index FROM modules WHERE id = ?) ORDER BY module_index LIMIT 1', topicId, moduleId)
  completeCourseIfEligibleInTransaction(topicId)
  return Boolean(nextModule)
}

function mergePartialEvaluation(original, partial, outcomes) {
  const perOutcomeEvidence = { ...(original?.perOutcomeEvidence || {}) }
  for (const [outcomeId, evidence] of Object.entries(partial.perOutcomeEvidence)) perOutcomeEvidence[outcomeId] = evidence
  const scores = outcomes.map((outcome) => perOutcomeEvidence[outcome.id]?.score).filter((score) => Number.isFinite(score))
  const overallScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / outcomes.length) : 0
  const failedOutcomeIds = outcomes.filter((outcome) => !Number.isFinite(perOutcomeEvidence[outcome.id]?.score) || perOutcomeEvidence[outcome.id].score < 60).map((outcome) => outcome.id)
  const criticalGap = outcomes.some((outcome) => outcome.role === 'core' && (!Number.isFinite(perOutcomeEvidence[outcome.id]?.score) || perOutcomeEvidence[outcome.id].score < 60))
  const passed = overallScore >= 80 && !criticalGap
  return {
    overallScore,
    passed,
    criticalGap,
    failedOutcomeIds,
    perOutcomeEvidence,
    feedback: [...(original?.feedback || []), ...partial.feedback],
  }
}

function publicEvaluation(evaluation) {
  return {
    overallScore: evaluation.overallScore,
    passed: evaluation.passed,
    criticalGap: evaluation.criticalGap,
    failedOutcomeIds: [...evaluation.failedOutcomeIds],
    perOutcomeEvidence: evaluation.perOutcomeEvidence,
    feedback: evaluation.feedback.map((item) => ({
      questionId: item.questionId,
      score: item.score,
      explanation: item.explanation,
      criteria: item.criteria.map(({ score, feedback }) => ({ score, feedback })),
    })),
  }
}

function recordCompletionStreak(req) {
  try {
    const localDate = req.body.localDate || new Date().toISOString().slice(0, 10)
    recordMasteryEvent(localDate)
  } catch (error) {
    console.error('Streak record error on checkpoint pass:', error.message)
  }
}

function sendError(res, error, fallback) {
  if (error instanceof LlmClientError) return res.status(error.retryable ? 502 : 400).json({ error: error.message, code: error.code, retryable: error.retryable })
  if (error instanceof CheckpointError) return res.status(error.status).json({
    error: error.message,
    code: error.code,
    retryable: error.status >= 500,
    ...(error.examNotReady ? { examNotReady: true, lessonsRemaining: error.lessonsRemaining, passedLessons: error.passedLessons, totalLessons: error.totalLessons } : {}),
    ...(error.unansweredQuestionIds ? { unansweredQuestionIds: error.unansweredQuestionIds, unansweredCount: error.unansweredCount, totalQuestions: error.totalQuestions } : {}),
  })
  console.error('Checkpoint route error:', error?.message || error)
  return res.status(500).json({ error: fallback, code: 'CHECKPOINT_ERROR', retryable: true })
}

router.get('/topics/:id/modules/:mid/exam', (req, res) => {
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const moduleId = positiveId(req.params.mid, 'moduleId')
    const chapter = readChapter(topicId, moduleId)
    ensureReady(topicId, moduleId)
    const existing = getPending(topicId, moduleId)
    if (!existing) return res.status(404).json({ error: 'No checkpoint is in progress. Start one to continue.' })
    const envelope = readEnvelope(existing, chapter.outcomes)
    let answers = {}
    try { answers = JSON.parse(existing.answers || '{}') } catch { throw new CheckpointError('Saved checkpoint answers are invalid.', 'CHECKPOINT_STORAGE_INVALID', 500) }
    answers = serializeAnswers(answers, envelope.publicQuestions)
    return res.json(responseFor(existing, envelope, chapter, answers))
  } catch (error) {
    return sendError(res, error, 'Failed to load checkpoint.')
  }
})

router.post('/topics/:id/modules/:mid/exam', async (req, res) => {
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const moduleId = positiveId(req.params.mid, 'moduleId')
    const chapter = readChapter(topicId, moduleId)
    ensureReady(topicId, moduleId)
    const existing = getPending(topicId, moduleId)
    if (existing) {
      const envelope = readEnvelope(existing, chapter.outcomes)
      let answers = {}
      try { answers = JSON.parse(existing.answers || '{}') } catch { throw new CheckpointError('Saved checkpoint answers are invalid.', 'CHECKPOINT_STORAGE_INVALID', 500) }
      return res.json(responseFor(existing, envelope, chapter, serializeAnswers(answers, envelope.publicQuestions)))
    }
    const envelope = await generateEnvelope(chapter)
    const attempt = insertAttempt(topicId, moduleId, envelope)
    return res.status(201).json(responseFor(attempt, envelope, chapter))
  } catch (error) {
    return sendError(res, error, 'Failed to create checkpoint.')
  }
})

router.post('/topics/:id/modules/:mid/exam/save-progress', (req, res) => {
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const moduleId = positiveId(req.params.mid, 'moduleId')
    const chapter = readChapter(topicId, moduleId)
    const existing = getPending(topicId, moduleId)
    if (!existing) throw new CheckpointError('No checkpoint in progress to save.', 'CHECKPOINT_NOT_FOUND', 404)
    const envelope = readEnvelope(existing, chapter.outcomes)
    const answers = serializeAnswers(req.body?.answers, envelope.publicQuestions)
    run('UPDATE exam_attempts SET answers = ? WHERE id = ? AND status = ?', JSON.stringify(answers), existing.id, 'pending')
    return res.json({ ok: true, saved: true })
  } catch (error) {
    return sendError(res, error, 'Failed to save checkpoint progress.')
  }
})

async function submitAttempt({ req, res, topicId, moduleId, chapter, attempt, partial = false }) {
  const envelope = readEnvelope(attempt, partial ? outcomesForAttempt(attempt.questions, chapter.outcomes) : chapter.outcomes)
  const answers = serializeAnswers(req.body?.answers, envelope.publicQuestions)
  requiredAnswers(envelope.publicQuestions, answers)
  const writtenEvaluations = await evaluateWritten(envelope, answers)
  const currentEvaluation = scoreCheckpoint({ envelope, outcomes: partial ? chapter.outcomes.filter((outcome) => envelope.publicQuestions.some((question) => question.outcomeIds.includes(outcome.id))) : chapter.outcomes, answers, writtenEvaluations })
  let evaluation = currentEvaluation
  if (partial) {
    const parent = get('SELECT evaluation FROM exam_attempts WHERE id = ? AND topic_id = ? AND module_id = ?', attempt.parent_exam_id, topicId, moduleId)
    if (!parent?.evaluation) throw new CheckpointError('The full checkpoint result is missing.', 'CHECKPOINT_STORAGE_INVALID', 500)
    let previous
    try { previous = JSON.parse(parent.evaluation) } catch { throw new CheckpointError('The full checkpoint result is invalid.', 'CHECKPOINT_STORAGE_INVALID', 500) }
    evaluation = mergePartialEvaluation(previous, currentEvaluation, chapter.outcomes)
  }

  const result = transaction(() => {
    const nextStatus = evaluation.passed ? 'passed' : 'failed'
    const update = run('UPDATE exam_attempts SET answers = ?, evaluation = ?, status = ? WHERE id = ? AND status = ?', JSON.stringify(answers), JSON.stringify(evaluation), nextStatus, attempt.id, 'pending')
    if (update.changes !== 1) throw new CheckpointError('This checkpoint was already submitted. Reload to see its result.', 'CHECKPOINT_ALREADY_SUBMITTED', 409)
    let nextModuleUnlocked = false
    if (evaluation.passed) nextModuleUnlocked = completeChapter(topicId, moduleId)
    return { nextModuleUnlocked }
  })()
  if (evaluation.passed) recordCompletionStreak(req)
  return res.json({ ...publicEvaluation(evaluation), nextModuleUnlocked: result.nextModuleUnlocked, partialPass: partial && evaluation.passed, modulePassed: evaluation.passed })
}

function outcomesForAttempt(rawEnvelope, outcomes) {
  try {
    const envelope = JSON.parse(rawEnvelope)
    const ids = new Set(envelope.publicQuestions.flatMap((question) => Array.isArray(question.outcomeIds) ? question.outcomeIds : []))
    return outcomes.filter((outcome) => ids.has(outcome.id))
  } catch { return [] }
}

router.post('/topics/:id/modules/:mid/exam/submit', async (req, res) => {
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const moduleId = positiveId(req.params.mid, 'moduleId')
    const chapter = readChapter(topicId, moduleId)
    const attempt = getPending(topicId, moduleId, 'full')
    if (!attempt) throw new CheckpointError('No Chapter checkpoint is in progress.', 'CHECKPOINT_NOT_FOUND', 404)
    return await submitAttempt({ req, res, topicId, moduleId, chapter, attempt })
  } catch (error) {
    return sendError(res, error, 'Failed to submit checkpoint.')
  }
})

router.post('/topics/:id/modules/:mid/exam/retake', async (req, res) => {
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const moduleId = positiveId(req.params.mid, 'moduleId')
    const chapter = readChapter(topicId, moduleId)
    ensureReady(topicId, moduleId)
    const envelope = await generateEnvelope(chapter)
    const attempt = insertAttempt(topicId, moduleId, envelope)
    return res.status(201).json(responseFor(attempt, envelope, chapter))
  } catch (error) {
    return sendError(res, error, 'Failed to create a new checkpoint attempt.')
  }
})

router.post('/topics/:id/modules/:mid/exam/partial-retest', async (req, res) => {
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const moduleId = positiveId(req.params.mid, 'moduleId')
    const chapter = readChapter(topicId, moduleId)
    const latestFailed = get('SELECT id, evaluation FROM exam_attempts WHERE topic_id = ? AND module_id = ? AND type = ? AND status = ? ORDER BY id DESC LIMIT 1', topicId, moduleId, 'full', 'failed')
    if (!latestFailed) throw new CheckpointError('Complete a full checkpoint attempt before starting targeted practice.', 'FAILED_CHECKPOINT_REQUIRED', 400)
    let evaluation
    try { evaluation = JSON.parse(latestFailed.evaluation || '{}') } catch { throw new CheckpointError('The previous checkpoint result is invalid.', 'CHECKPOINT_STORAGE_INVALID', 500) }
    const failedIds = evaluation.failedOutcomeIds
    const requested = req.body?.failedOutcomeIds
    if (!Array.isArray(failedIds) || !Array.isArray(requested) || requested.length === 0 || new Set(requested).size !== requested.length || requested.some((id) => !failedIds.includes(id))) {
      throw new CheckpointError('Choose one or more outcomes from the missed-outcome list.', 'RETEST_OUTCOMES_INVALID', 400)
    }
    const envelope = await generateEnvelope(chapter, requested)
    if (envelope.publicQuestions.some((question) => question.outcomeIds.some((id) => !requested.includes(id)))) throw new CheckpointError('The targeted checkpoint included an unrelated outcome.', 'CHECKPOINT_OUTPUT_INVALID', 502)
    const attempt = insertAttempt(topicId, moduleId, envelope, 'partial', latestFailed.id)
    return res.status(201).json(responseFor(attempt, envelope, chapter))
  } catch (error) {
    return sendError(res, error, 'Failed to create targeted checkpoint.')
  }
})

router.post('/topics/:id/modules/:mid/exam/partial-retest/:rid/submit', async (req, res) => {
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const moduleId = positiveId(req.params.mid, 'moduleId')
    const retestId = positiveId(req.params.rid, 'retestId')
    const chapter = readChapter(topicId, moduleId)
    const attempt = get('SELECT id, questions, answers, evaluation, status, type, parent_exam_id FROM exam_attempts WHERE id = ? AND topic_id = ? AND module_id = ? AND type = ? AND status = ?', retestId, topicId, moduleId, 'partial', 'pending')
    if (!attempt) throw new CheckpointError('Targeted checkpoint is unavailable or already submitted.', 'CHECKPOINT_NOT_FOUND', 404)
    return await submitAttempt({ req, res, topicId, moduleId, chapter, attempt, partial: true })
  } catch (error) {
    return sendError(res, error, 'Failed to submit targeted checkpoint.')
  }
})

export default router
