import { Router } from 'express'
import { all, get, run, transaction } from '../db.js'
import { streamText, generateText, LlmClientError } from '../llm/client.js'
import { createRequestAbortSignal, llmRequestOptions } from '../llm/request-options.js'
import { requireLlmConfig } from '../utils/llm-config.js'
import { ActivityRuntimeError, completeActivitySessionIfEligible, getActivityProgress, getActivityState } from '../utils/activity-runtime.js'
import { checkPrerequisites } from '../utils/lesson-state-machine.js'
import { getBlock, parseActivityDocument, sanitizeActivityDocument, validateActivityDocument } from '../utils/activity-schema.js'
import { isValidDate } from '../utils/streak-tracker.js'
import { publicOutcome } from '../utils/outcome-manifest.js'
import { assertDataRevision, getDataRevision } from '../utils/data-revision.js'

const router = Router()
const MAX_MESSAGE_LENGTH = 2000
const MAX_EVIDENCE_FIELD_BYTES = 16 * 1024
const MAX_EVIDENCE_BYTES = 64 * 1024
const MAX_EVIDENCE_CHARS = 5 * 1024 * 1024
const RUBRIC_DIMENSIONS = ['Correctness', 'Completeness', 'Clarity', 'Edge Cases']

function routeError(message, status, code) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function sendError(res, error, fallback = 'Request failed.') {
  if (error instanceof ActivityRuntimeError) {
    return res.status(error.status).json({ error: error.message, code: error.code, ...(error.latestState ? { latestState: error.latestState } : {}) })
  }
  if (error instanceof LlmClientError) {
    return res.status(400).json({ error: error.message, code: error.code, retryable: error.retryable })
  }
  if (Number.isInteger(error?.status)) {
    return res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) })
  }
  console.error(fallback, error?.message || error)
  return res.status(500).json({ error: fallback })
}

function positiveId(value, field) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw routeError(`${field} must be a positive integer.`, 400, 'INVALID_REQUEST')
  }
  return Number(value)
}

function parseJson(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function parseTaskSpec(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null
  const parsed = parseJson(value, null)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw routeError('Stored Build specification is invalid.', 500, 'TASK_SPEC_INVALID')
  }
  return parsed
}

function getScopedLesson(topicId, lessonId) {
  const lesson = get(
    `SELECT l.id, l.title, l.depth, l.estimated_time, l.outcomes, l.prerequisites,
            l.activity_blocks, l.artifact_required, l.artifact_type, l.artifact_rubric, l.task_spec,
            m.id AS module_id, m.title AS module_title
     FROM lessons l JOIN modules m ON m.id = l.module_id
     WHERE l.id = ? AND m.topic_id = ?`,
    lessonId,
    topicId,
  )
  if (!lesson) throw routeError('Session not found in this Trail.', 404, 'LESSON_NOT_FOUND')
  return lesson
}

function getActivityDocument(lesson) {
  if (typeof lesson.activity_blocks !== 'string' || !lesson.activity_blocks.trim()) return null
  const parsed = parseActivityDocument(lesson.activity_blocks)
  if (!parsed.valid) throw routeError(parsed.error, 500, 'ACTIVITY_DOCUMENT_INVALID')
  const validated = validateActivityDocument(parsed.value, lesson)
  if (!validated.valid) throw routeError(validated.error, 500, 'ACTIVITY_DOCUMENT_INVALID')
  return validated.value
}

function checkAccess(topicId, lesson) {
  const check = checkPrerequisites(topicId, lesson.id)
  if (check.lessonNotFound) throw routeError('Session not found in this Trail.', 404, 'LESSON_NOT_FOUND')
  if (check.invalidPrerequisites) throw routeError('Stored Session prerequisites are invalid.', 500, 'PREREQUISITES_INVALID')
  if (check.locked) {
    return {
      locked: true,
      prerequisites: parseJson(lesson.prerequisites, []),
      unmetPrerequisites: check.unmet,
    }
  }
  return { locked: false }
}

function parseOutcomes(value) {
  const parsed = parseJson(value, [])
  return Array.isArray(parsed) ? parsed.map(publicOutcome).filter(Boolean) : []
}

function buildTaskEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw routeError('Structured Build evidence is required.', 400, 'INVALID_TASK_EVIDENCE')
  }
  const fields = {
    setup: evidence.setup,
    actions: evidence.actions ?? evidence.steps,
    result: evidence.result ?? evidence.observations,
    reflection: evidence.reflection,
  }
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== 'string' || !value.trim()) throw routeError(`Build evidence field "${field}" is required.`, 400, 'INVALID_TASK_EVIDENCE')
    if (Buffer.byteLength(value, 'utf8') > MAX_EVIDENCE_FIELD_BYTES) throw routeError(`Build evidence field "${field}" is too long.`, 400, 'INVALID_TASK_EVIDENCE')
  }
  const content = [
    `Setup:\n${fields.setup.trim()}`,
    `Actions:\n${fields.actions.trim()}`,
    `Result:\n${fields.result.trim()}`,
    `Reflection:\n${fields.reflection.trim()}`,
  ].join('\n\n')
  if (Buffer.byteLength(content, 'utf8') > MAX_EVIDENCE_BYTES) throw routeError('Build evidence is too large.', 400, 'INVALID_TASK_EVIDENCE')
  return { content, envelope: { kind: 'build-evidence', version: 1, evidence: fields } }
}

function readArtifact(progressId) {
  const artifact = get(
    'SELECT id, content, rubric_scores, passed, feedback, attempt_number, created_at FROM artifacts WHERE progress_id = ? ORDER BY id DESC LIMIT 1',
    progressId,
  )
  if (!artifact) return null
  const scores = parseJson(artifact.rubric_scores, {})
  const feedback = parseJson(artifact.feedback, {})
  const stored = parseJson(artifact.content, null)
  const recognizedEnvelope = stored?.kind === 'build-evidence' || stored?.version === 1 && stored?.evidence
  const candidateEvidence = recognizedEnvelope && stored.kind === 'build-evidence' && stored.version === 1 && stored.evidence && typeof stored.evidence === 'object' && !Array.isArray(stored.evidence)
    ? stored.evidence
    : null
  if (recognizedEnvelope && !candidateEvidence) throw routeError('Stored Build evidence is invalid.', 500, 'ARTIFACT_STORAGE_INVALID')
  const evidence = candidateEvidence && ['setup', 'actions', 'result', 'reflection'].every((field) => typeof candidateEvidence[field] === 'string' && candidateEvidence[field].trim() && Buffer.byteLength(candidateEvidence[field], 'utf8') <= MAX_EVIDENCE_FIELD_BYTES)
    ? candidateEvidence
    : null
  if (recognizedEnvelope && !evidence) throw routeError('Stored Build evidence is too large or incomplete.', 500, 'ARTIFACT_STORAGE_INVALID')
  const content = evidence
    ? [`Setup:\n${evidence.setup}`, `Actions:\n${evidence.actions}`, `Result:\n${evidence.result}`, `Reflection:\n${evidence.reflection}`].join('\n\n')
    : artifact.content
  const total = RUBRIC_DIMENSIONS.reduce((sum, dimension) => sum + (Number.isInteger(scores?.[dimension]) ? scores[dimension] : 0), 0)
  if (evidence && Buffer.byteLength(content, 'utf8') > MAX_EVIDENCE_BYTES) throw routeError('Stored Build evidence is too large.', 500, 'ARTIFACT_STORAGE_INVALID')
  return {
    id: artifact.id,
    content,
    evidence,
    passed: artifact.passed === 1,
    attemptNumber: artifact.attempt_number,
    createdAt: artifact.created_at,
    evaluation: {
      overallScore: Math.round(total / (RUBRIC_DIMENSIONS.length * 2) * 100),
      scores,
      feedback,
      passed: artifact.passed === 1,
    },
  }
}

function writeStreamError(res, error) {
  const known = error instanceof LlmClientError
  const body = known
    ? { message: error.message, code: error.code, retryable: error.retryable }
    : { message: 'The response could not be completed. Please retry.', code: 'STREAM_ERROR', retryable: true }
  try {
    if (!res.destroyed && !res.writableEnded) {
      res.write('event: error\n')
      res.write(`data: ${JSON.stringify(body)}\n\n`)
    }
  } catch {}
}

router.get('/topics/:id/lessons/:lid', (req, res) => {
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const lessonId = positiveId(req.params.lid, 'lessonId')
    const topic = get('SELECT id, title, interaction_mode FROM topics WHERE id = ?', topicId)
    if (!topic) return res.status(404).json({ error: 'Topic not found.' })
    const lesson = getScopedLesson(topicId, lessonId)
    const access = checkAccess(topicId, lesson)
    if (access.locked) {
      return res.status(403).json({
        locked: true,
        prerequisites: access.prerequisites,
        unmetPrerequisites: access.unmetPrerequisites,
        lesson: { id: lesson.id, title: lesson.title, depth: lesson.depth, estimated_time: lesson.estimated_time, module_title: lesson.module_title },
      })
    }

    const document = getActivityDocument(lesson)
    const progress = get(
      'SELECT id, state, artifact_passed, started_at, completed_at FROM progress WHERE topic_id = ? AND lesson_id = ?',
      topicId,
      lessonId,
    ) || { state: 'not_started', artifact_passed: 0, started_at: null, completed_at: null }
    const activityState = document ? getActivityState(topicId, lessonId) : null
    const activityProgress = document ? getActivityProgress(topicId, lessonId) : null
    const messages = all(
      'SELECT id, role, content, created_at FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id ASC',
      topicId,
      lessonId,
    )
    return res.json({
      lesson: {
        id: lesson.id,
        title: lesson.title,
        depth: lesson.depth,
        estimated_time: lesson.estimated_time,
        outcomes: parseOutcomes(lesson.outcomes),
        module_title: lesson.module_title,
        artifact_required: lesson.artifact_required === 1,
        artifact_type: lesson.artifact_type,
        task_spec: parseTaskSpec(lesson.task_spec),
      },
      progress,
      messages,
      interactionMode: topic.interaction_mode || 'socratic',
      activityDocument: document ? sanitizeActivityDocument(document) : null,
      activityState,
      activityProgress,
      historicalArtifact: progress?.state === 'passed' && !document && progress.id ? readArtifact(progress.id) : null,
      locked: false,
    })
  } catch (error) {
    return sendError(res, error, 'Failed to load Session.')
  }
})

router.post('/topics/:id/lessons/:lid/chat', async (req, res) => {
  const requestRevision = getDataRevision()
  let abortRequest
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const lessonId = positiveId(req.params.lid, 'lessonId')
    const body = req.body || {}
    if (typeof body.content !== 'string' || !body.content.trim()) return res.status(400).json({ error: 'Message content is required.' })
    if (body.content.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: `Message exceeds ${MAX_MESSAGE_LENGTH} character limit.` })
    if (body.activityBlockId !== undefined && (typeof body.activityBlockId !== 'string' || !body.activityBlockId.trim() || body.activityBlockId.length > 80)) {
      return res.status(400).json({ error: 'activityBlockId must be a valid public activity block ID.', code: 'ACTIVITY_BLOCK_INVALID' })
    }

    const topic = get('SELECT id FROM topics WHERE id = ?', topicId)
    if (!topic) return res.status(404).json({ error: 'Topic not found.' })
    const lesson = getScopedLesson(topicId, lessonId)
    const access = checkAccess(topicId, lesson)
    if (access.locked) return res.status(403).json({ error: 'This Session is locked. Complete the prerequisites first.', code: 'PREREQUISITES_NOT_MET' })

    let block = null
    let state = null
    if (body.activityBlockId !== undefined) {
      const document = getActivityDocument(lesson)
      if (!document) return res.status(409).json({ error: 'This Session does not have an activity document.', code: 'ACTIVITY_DOCUMENT_MISSING' })
      block = getBlock(document, body.activityBlockId)
      if (!block) return res.status(404).json({ error: 'Activity block was not found in this Session.', code: 'ACTIVITY_BLOCK_NOT_FOUND' })
      state = getActivityState(topicId, lessonId)
    } else if (lesson.activity_blocks) {
      const document = getActivityDocument(lesson)
      state = getActivityState(topicId, lessonId)
      block = document.blocks.find((item) => item.id === state.currentBlockId) || null
    }

    const outcomes = parseOutcomes(lesson.outcomes)
    const relevantOutcomeIds = new Set(block ? block.outcomeIds : outcomes.map((outcome) => outcome.id))
    const relevantOutcomes = outcomes.filter((outcome) => relevantOutcomeIds.has(outcome.id))
    const entry = block && state ? state.blocks[block.id] : null
    const tutorContext = block
      ? `Current public activity block: ${JSON.stringify({ id: block.id, type: block.type, title: block.title, prompt: block.prompt, content: block.content, problem: block.problem, steps: block.steps, takeaway: block.takeaway, outcomeIds: block.outcomeIds })}\nCurrent block status: ${entry?.status || 'not_started'}\nCurrent attempt feedback: ${entry?.feedback || 'No feedback has been recorded yet.'}\nNext step: ${entry?.nextStep || 'Ask the learner what they notice first.'}`
      : 'No activity block context was requested.'
    const system = `You are a supportive tutor for the Session "${lesson.title}". Relevant learning outcomes: ${relevantOutcomes.map((outcome) => outcome.title).join('; ') || 'none declared'}.\n${tutorContext}\nask guiding questions before giving a complete answer. Do not claim completion, assign or change scores, or alter Session progress. Use only public Session content and attempt feedback; never reveal hidden grading material or full solutions. Keep replies focused and concise.`
    const config = requireLlmConfig()
    const history = all(
      'SELECT role, content FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id DESC LIMIT 20',
      topicId,
      lessonId,
    ).reverse()
    history.push({ role: 'user', content: body.content.trim() })

    abortRequest = createRequestAbortSignal(req, res)
    const response = await streamText({
      ...llmRequestOptions(config, { signal: abortRequest.signal }),
      system,
      messages: history,
    })
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    let text = ''
    try {
      for await (const chunk of response.textStream) {
        if (res.destroyed || res.writableEnded || abortRequest.signal.aborted) return
        if (typeof chunk !== 'string') continue
        text += chunk
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
    } catch (error) {
      writeStreamError(res, error)
      if (!res.destroyed && !res.writableEnded) res.end()
      return
    }
    if (!text.trim()) {
      writeStreamError(res, new LlmClientError('The model returned no response. Please retry.', { code: 'EMPTY_RESPONSE' }))
      if (!res.destroyed && !res.writableEnded) res.end()
      return
    }
    assertDataRevision(requestRevision)
    transaction(() => {
      assertDataRevision(requestRevision)
      run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'user', body.content.trim())
      run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'assistant', text.trim())
    })()
    if (!res.destroyed && !res.writableEnded) {
      res.write(`data: ${JSON.stringify('[DONE]')}\n\n`)
      res.end()
    }
  } catch (error) {
    if (res.headersSent) {
      writeStreamError(res, error)
      if (!res.destroyed && !res.writableEnded) res.end()
    } else if (!(error instanceof LlmClientError) && !(error instanceof ActivityRuntimeError) && !Number.isInteger(error?.status)) {
      return res.status(502).json({ error: 'Tutor response failed. Please retry.', code: 'TUTOR_REQUEST_FAILED', retryable: true })
    } else {
      return sendError(res, error, 'Failed to process tutor message.')
    }
  } finally {
    abortRequest?.cleanup()
  }
})

router.post('/topics/:id/lessons/:lid/artifact', async (req, res) => {
  const requestRevision = getDataRevision()
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const lessonId = positiveId(req.params.lid, 'lessonId')
    const body = req.body || {}
    const localDate = body.localDate ?? new Date().toISOString().slice(0, 10)
    if (!isValidDate(localDate)) return res.status(400).json({ error: 'localDate must be a real YYYY-MM-DD calendar date.', code: 'INVALID_LOCAL_DATE' })

    const lesson = getScopedLesson(topicId, lessonId)
    if (lesson.artifact_required !== 1) return res.status(409).json({ error: 'This Session does not require a Build.', code: 'ARTIFACT_NOT_REQUIRED' })
    const access = checkAccess(topicId, lesson)
    if (access.locked) return res.status(403).json({ error: 'This Session is locked. Complete the prerequisites first.', code: 'PREREQUISITES_NOT_MET' })
    const document = getActivityDocument(lesson)
    if (!document) return res.status(409).json({ error: 'This Session does not have an activity document.', code: 'ACTIVITY_DOCUMENT_MISSING' })
    const taskSpec = parseTaskSpec(lesson.task_spec)
    if (!taskSpec) return res.status(409).json({ error: 'This Build has no task specification.', code: 'TASK_REQUIRED' })

    const progress = get('SELECT id, state, artifact_passed FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    if (progress?.state === 'passed' && progress.artifact_passed === 1) {
      const prior = readArtifact(progress.id)
      if (prior) return res.json({ ...prior, state: 'passed', session: { completed: true, requiresArtifact: true }, alreadyCompleted: true })
    }
    if (!progress || progress.state !== 'practicing') {
      return res.status(409).json({ error: 'Start this Session and complete its required activities before submitting a Build.', code: 'ACTIVITIES_NOT_READY' })
    }
    const readiness = getActivityProgress(topicId, lessonId)
    if (readiness.completed !== readiness.total) {
      return res.status(409).json({ error: 'Complete all required activities before submitting a Build.', code: 'ACTIVITIES_NOT_READY', activityProgress: readiness })
    }

    const evidencePayload = buildTaskEvidence(body.evidence)
    if (Buffer.byteLength(evidencePayload.content, 'utf8') > MAX_EVIDENCE_CHARS) return res.status(400).json({ error: 'Build evidence is too large.', code: 'INVALID_TASK_EVIDENCE' })
    const outcomes = parseOutcomes(lesson.outcomes)
    const system = `Evaluate the learner's Build evidence for Session "${lesson.title}". Learning outcomes: ${outcomes.map((outcome) => outcome.title).join('; ')}.\nBuild specification: ${JSON.stringify(taskSpec)}\nLearner evidence:\n${evidencePayload.content}\n\nScore each rubric dimension from 0 to 2 and provide short actionable feedback for each. Return strict JSON only: {"scores":{"Correctness":0,"Completeness":0,"Clarity":0,"Edge Cases":0},"feedback":{"Correctness":"...","Completeness":"...","Clarity":"...","Edge Cases":"..."}}. Do not use markdown.`
    const config = requireLlmConfig()
    let generated
    try {
      generated = await generateText({
        ...llmRequestOptions(config),
        system,
        messages: [{ role: 'user', content: 'Evaluate the Build evidence and return the required JSON rubric.' }],
      })
    } catch (error) {
      if (error instanceof LlmClientError) return sendError(res, error, 'Failed to evaluate Build.')
      return res.status(502).json({ error: 'Build evaluation failed. Please retry.', code: 'ARTIFACT_EVALUATION_FAILED', retryable: true })
    }
    assertDataRevision(requestRevision)

    let parsed
    try { parsed = JSON.parse(generated?.text) } catch {
      return res.status(502).json({ error: 'Build evaluation returned invalid JSON. Please retry.', code: 'ARTIFACT_EVALUATION_INVALID', retryable: true })
    }
    const scores = parsed?.scores
    const feedback = parsed?.feedback
    if (!scores || typeof scores !== 'object' || Array.isArray(scores) || Object.keys(scores).length !== RUBRIC_DIMENSIONS.length
      || !feedback || typeof feedback !== 'object' || Array.isArray(feedback) || Object.keys(feedback).length !== RUBRIC_DIMENSIONS.length
      || RUBRIC_DIMENSIONS.some((dimension) => !Number.isInteger(scores[dimension]) || scores[dimension] < 0 || scores[dimension] > 2
        || typeof feedback[dimension] !== 'string' || !feedback[dimension].trim() || feedback[dimension].length > 500)) {
      return res.status(502).json({ error: 'Build evaluation did not match the required rubric. Please retry.', code: 'ARTIFACT_EVALUATION_INVALID', retryable: true })
    }
    const totalScore = RUBRIC_DIMENSIONS.reduce((sum, dimension) => sum + scores[dimension], 0)
    const overallScore = Math.round(totalScore / (RUBRIC_DIMENSIONS.length * 2) * 100)
    const passed = RUBRIC_DIMENSIONS.every((dimension) => scores[dimension] > 0) && totalScore >= 6
    const evaluation = { overallScore, passed, scores, feedback }

    const saved = transaction(() => {
      assertDataRevision(requestRevision)
      const current = get('SELECT id, state, artifact_passed FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      if (current?.state === 'passed' && current.artifact_passed === 1) {
        return { alreadyCompleted: true, artifact: readArtifact(current.id) }
      }
      if (!current || current.state !== 'practicing') throw routeError('Session state changed while the Build was being evaluated.', 409, 'ACTIVITY_STATE_CONFLICT')
      const currentReadiness = getActivityProgress(topicId, lessonId)
      if (currentReadiness.completed !== currentReadiness.total) throw routeError('Required activities changed while the Build was being evaluated.', 409, 'ACTIVITIES_NOT_READY')
      const update = run('UPDATE progress SET artifact_passed = ? WHERE id = ? AND state = ?', passed ? 1 : 0, current.id, 'practicing')
      if (update.changes !== 1) throw routeError('Session state changed while the Build was being evaluated.', 409, 'ACTIVITY_STATE_CONFLICT')
      const attemptNumber = Number(get('SELECT COUNT(*) AS count FROM artifacts WHERE progress_id = ?', current.id).count) + 1
      const inserted = run(
        'INSERT INTO artifacts (progress_id, content, rubric_scores, passed, feedback, attempt_number) VALUES (?, ?, ?, ?, ?, ?)',
        current.id,
        JSON.stringify(evidencePayload.envelope),
        JSON.stringify(scores),
        passed ? 1 : 0,
        JSON.stringify(feedback),
        attemptNumber,
      )
      let session = { completed: false, requiresArtifact: true }
      if (passed) {
        session = completeActivitySessionIfEligible(topicId, lessonId, { localDate })
        if (!session.completed) throw routeError('Build passed but Session completion was not eligible.', 409, 'ACTIVITIES_NOT_READY')
      }
      return { artifactId: inserted.lastInsertRowid, state: passed ? 'passed' : 'practicing', session, attemptNumber }
    })()

    if (saved.alreadyCompleted) {
      return res.json({ ...(saved.artifact || {}), state: 'passed', session: { completed: true, requiresArtifact: true }, alreadyCompleted: true })
    }
    return res.json({ evaluation, state: saved.state, artifactId: saved.artifactId, attemptNumber: saved.attemptNumber, session: saved.session })
  } catch (error) {
    return sendError(res, error, 'Failed to evaluate Build.')
  }
})

router.get('/topics/:id/lessons/:lid/artifact', (req, res) => {
  try {
    const topicId = positiveId(req.params.id, 'topicId')
    const lessonId = positiveId(req.params.lid, 'lessonId')
    getScopedLesson(topicId, lessonId)
    const progress = get('SELECT id FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    const artifact = progress ? readArtifact(progress.id) : null
    if (!artifact) return res.status(404).json({ error: 'No artifact found for this Session.' })
    return res.json(artifact)
  } catch (error) {
    return sendError(res, error, 'Failed to load Build.')
  }
})

export default router
