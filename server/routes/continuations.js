import { Router } from 'express'
import { all, get } from '../db.js'
import { generateText, streamText, LlmClientError } from '../llm/client.js'
import { requireLlmConfig } from '../utils/llm-config.js'
import { createRequestAbortSignal, llmRequestOptions } from '../llm/request-options.js'
import {
  buildCourseSummary,
  createLinkedCourse,
  CourseLineageError,
  getCourseReadiness,
  getLineage,
  normalizeLane,
} from '../utils/course-lineage.js'
import { TASK_SETUP_KINDS, validateTaskTextPolicy } from '../utils/task-spec.js'
import { CURRICULUM_MAX_BYTES, collectCurriculumDraft, validateCurriculum, writeCurriculumSSE, writeCurriculumSSEError } from '../utils/curriculum-draft.js'

const router = Router()
const VALID_LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const VALID_TIME_COMMITMENTS = ['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day']
const MAX_LANE_LENGTH = 100
const MAX_REQUEST_LENGTH = 1000
const MAX_PROMPT_LINEAGE = 12
const MAX_SUMMARY_BYTES = 128 * 1024

function routeError(message, code, status = 400) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function parseLane(value) {
  if (typeof value !== 'string') throw routeError('A specialization lane is required.', 'INVALID_LANE')
  const lane = value.trim().replace(/\s+/g, ' ')
  if (!lane || lane.length > MAX_LANE_LENGTH) throw routeError(`Lane must be between 1 and ${MAX_LANE_LENGTH} characters.`, 'INVALID_LANE')
  if (/[^\p{L}\p{N}\s&+./()'_-]/u.test(lane)) throw routeError('Lane contains unsupported characters.', 'INVALID_LANE')
  return lane
}

function parseProfile(level, timeCommitment, parent) {
  const nextLevel = level || parent?.level || 'Beginner'
  const nextTime = timeCommitment || parent?.time_per_week || '30 min/day'
  if (!VALID_LEVELS.includes(nextLevel)) throw routeError('Invalid learner level.', 'INVALID_PROFILE')
  if (!VALID_TIME_COMMITMENTS.includes(nextTime)) throw routeError('Invalid time commitment.', 'INVALID_PROFILE')
  return { level: nextLevel, timeCommitment: nextTime }
}

function publicCourse(course) {
  if (!course) return null
  return {
    id: course.id,
    title: course.title,
    status: course.status,
    course_kind: course.course_kind || 'core',
    course_stage: course.course_stage || 0,
    course_focus: course.course_focus || '',
    level: course.level || 'Beginner',
    time_per_week: course.time_per_week || '30 min/day',
    course_completed_at: course.course_completed_at || null,
  }
}

function publicLineage(lineage) {
  return lineage.map((course) => publicCourse(course))
}

function boundedSummary(summary) {
  const source = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {}
  const list = (value) => Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').map((item) => item.trim().slice(0, 500)).filter(Boolean).slice(0, 20)
    : []
  return {
    topicId: Number.isInteger(source.topicId) ? source.topicId : undefined,
    title: typeof source.title === 'string' ? source.title.trim().slice(0, 200) : '',
    courseKind: typeof source.courseKind === 'string' ? source.courseKind.slice(0, 40) : 'core',
    courseStage: Number.isInteger(source.courseStage) ? source.courseStage : 0,
    focus: typeof source.focus === 'string' ? source.focus.trim().slice(0, 100) : '',
    outcomes: list(source.outcomes),
    strengths: list(source.strengths),
    gaps: list(source.gaps),
    artifactFeedback: list(source.artifactFeedback),
  }
}

function summaryFor(course) {
  if (typeof course.course_summary === 'string' && course.course_summary.trim() && Buffer.byteLength(course.course_summary, 'utf8') <= MAX_SUMMARY_BYTES) {
    try {
      const parsed = JSON.parse(course.course_summary)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return boundedSummary(parsed)
    } catch {
      // Legacy or malformed snapshots are rebuilt in memory below.
    }
  }
  return boundedSummary(buildCourseSummary(course.id))
}

function contextFor(topicId) {
  const readiness = getCourseReadiness(topicId)
  if (!readiness.course) throw routeError('Topic not found.', 'TOPIC_NOT_FOUND', 404)
  const lineage = getLineage(topicId)
  const summary = summaryFor(readiness.course)
  return { readiness, lineage, summary }
}

function requireEligible(topicId) {
  const context = contextFor(topicId)
  if (!context.readiness.eligible || context.readiness.course.status !== 'completed') {
    throw routeError(context.readiness.reason || 'Complete every module checkpoint before continuing.', 'COURSE_NOT_COMPLETE', 409)
  }
  return context
}

function validateFreeStack(stack, field) {
  if (!stack || typeof stack !== 'object' || Array.isArray(stack)) throw routeError(`${field} is required.`, 'INVALID_OPTIONS')
  for (const path of ['primary', 'fallback']) {
    const setup = stack[path]
    if (!setup || typeof setup !== 'object' || !TASK_SETUP_KINDS.includes(setup.kind)) throw routeError(`${field}.${path}.kind is invalid.`, 'INVALID_OPTIONS')
    if (typeof setup.description !== 'string' || !setup.description.trim() || setup.description.length > 400) throw routeError(`${field}.${path}.description is invalid.`, 'INVALID_OPTIONS')
    for (const flag of ['requires_account', 'requires_payment', 'requires_secret', 'requires_external_target']) {
      if (setup[flag] !== undefined && typeof setup[flag] !== 'boolean') throw routeError(`${field}.${path}.${flag} is invalid.`, 'INVALID_OPTIONS')
    }
    const policy = validateTaskTextPolicy(setup.description)
    if (!policy.valid) throw routeError(`${field}.${path}.description is unsafe.`, 'INVALID_OPTIONS')
    if (setup.requires_payment === true || setup.requires_secret === true || setup.requires_external_target === true) throw routeError(`${field}.${path} requires unsafe access.`, 'INVALID_OPTIONS')
    if (path === 'fallback' && setup.requires_account === true) throw routeError(`${field}.fallback must work without an account.`, 'INVALID_OPTIONS')
    if (path === 'primary' && setup.requires_account === true && setup.kind !== 'free_public') throw routeError(`${field}.primary account access is only allowed for free-public resources.`, 'INVALID_OPTIONS')
  }
  if (stack.primary.requires_account && stack.fallback.requires_account) throw routeError(`${field} needs an account-free fallback.`, 'INVALID_OPTIONS')
  return {
    primary: { kind: stack.primary.kind, description: stack.primary.description.trim(), requires_account: !!stack.primary.requires_account },
    fallback: { kind: stack.fallback.kind, description: stack.fallback.description.trim(), requires_account: !!stack.fallback.requires_account },
  }
}

function validateOptions(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.options) || value.options.length !== 3) throw routeError('The provider must return exactly three continuation options.', 'INVALID_OPTIONS')
  const ids = new Set()
  return value.options.map((option, index) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) throw routeError(`Option ${index + 1} is invalid.`, 'INVALID_OPTIONS')
    const id = typeof option.id === 'string' ? option.id.trim().slice(0, 80) : ''
    if (!id || ids.has(id)) throw routeError(`Option ${index + 1} has an invalid id.`, 'INVALID_OPTIONS')
    ids.add(id)
    const title = typeof option.title === 'string' ? option.title.trim().slice(0, 120) : ''
    const rationale = typeof option.rationale === 'string' ? option.rationale.trim().slice(0, 500) : ''
    if (!title || !rationale) throw routeError(`Option ${id} is missing title or rationale.`, 'INVALID_OPTIONS')
    const buildsOn = Array.isArray(option.builds_on) ? option.builds_on.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 5) : []
    const outcomes = Array.isArray(option.target_outcomes) ? option.target_outcomes.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 5) : []
    if (buildsOn.length === 0 || outcomes.length === 0) throw routeError(`Option ${id} needs inherited strengths and target outcomes.`, 'INVALID_OPTIONS')
    return { id, title, rationale, builds_on: buildsOn, target_outcomes: outcomes, free_stack: validateFreeStack(option.free_stack, `Option ${id}.free_stack`) }
  })
}

function normalizeAdvancedCurriculum(curriculum, parent, lane = '') {
  let serialized
  try { serialized = JSON.stringify(curriculum) } catch { throw routeError('The curriculum draft is not serializable.', 'INVALID_CURRICULUM') }
  if (Buffer.byteLength(serialized || '', 'utf8') > CURRICULUM_MAX_BYTES) throw routeError('The curriculum draft is too large.', 'CURRICULUM_TOO_LARGE')
  const validation = validateCurriculum(curriculum, { enforceBounds: true, requireTasks: true })
  if (!validation.valid) throw routeError(validation.error, 'INVALID_CURRICULUM')
  return {
    ...validation.value,
    course: {
      ...(validation.value.course || {}),
      kind: 'advanced',
      stage: (parent.course_stage || 0) + 1,
      ...(lane ? { focus: lane } : {}),
    },
  }
}

function generationPrompt({ parent, summary, lineage, lane, profile, curriculum, request }) {
  const existing = curriculum ? `\nTransient draft to revise:\n${JSON.stringify(curriculum)}` : ''
  const instruction = request ? `\nLearner revision request:\n${request}` : ''
  return `You are designing a finite Advanced course for the specialization lane "${lane}".
Parent course: ${parent.title}
Parent stage: ${parent.course_stage || 0}
Learner level: ${profile.level}
Time commitment: ${profile.timeCommitment}
Direct ancestry: ${JSON.stringify(lineage.slice(-MAX_PROMPT_LINEAGE).map((item) => ({ title: item.title, focus: item.course_focus || '', stage: item.course_stage || 0 })))}
Completed outcomes: ${JSON.stringify(summary.outcomes)}
Strengths: ${JSON.stringify(summary.strengths)}
Known gaps: ${JSON.stringify(summary.gaps)}
${existing}${instruction}

Return plain JSON only with course metadata {"kind":"advanced","stage":${(parent.course_stage || 0) + 1},"focus":"${lane}"} and 3-5 modules with 3-5 lessons each. Keep the syllabus finite and lane-specific. Every lesson must include depth, estimated_time, outcomes, prerequisites, and a structured practical task with local/open-source/free-public/no-software primary setup and an account-free fallback. Prerequisites must form a DAG. Do not include markdown.`
}

async function parseGeneratedCurriculum(streamResult, options) {
  return collectCurriculumDraft(streamResult.textStream, { enforceBounds: true, requireTasks: true, ...options })
}

router.get('/topics/:id/continuation-readiness', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const context = contextFor(topicId)
    const eligible = context.readiness.eligible && context.readiness.course.status === 'completed'
    return res.json({ eligible, reason: eligible ? undefined : (context.readiness.reason || 'Complete every module checkpoint before continuing.'), course: publicCourse(context.readiness.course), lineage: publicLineage(context.lineage) })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Failed to read continuation readiness.', code: error.code })
  }
})

router.post('/topics/:id/continuation-options', async (req, res) => {
  try {
    const context = requireEligible(Number(req.params.id))
    const config = requireLlmConfig()
    const result = await generateText({
      ...llmRequestOptions(config),
      system: `Suggest exactly three distinct, practical Advanced specialization lanes for the completed course "${context.readiness.course.title}". Each must include id, title, rationale, builds_on, target_outcomes, and a safe free_stack with primary and fallback kinds from local, open_source, free_public, no_software. No paid services, secrets, or external targets. Return JSON only.\nCourse context:\n${JSON.stringify(context.summary)}\nAncestry:\n${JSON.stringify(context.lineage.slice(-MAX_PROMPT_LINEAGE).map((item) => ({ title: item.title, course_focus: item.course_focus || '', course_stage: item.course_stage || 0 })))}\nThe response must contain exactly three options.`,
      messages: [{ role: 'user', content: 'Generate three continuation lanes.' }],
    })
    let parsed
    try { parsed = JSON.parse(result.text || '{}') } catch { throw routeError('The provider returned malformed continuation options.', 'INVALID_OPTIONS', 502) }
    return res.json({ options: validateOptions(parsed) })
  } catch (error) {
    if (error instanceof LlmClientError) return res.status(400).json({ error: error.message, code: error.code, retryable: error.retryable })
    return res.status(error.status || 500).json({ error: error.message || 'Failed to generate continuation options.', code: error.code })
  }
})

router.post('/topics/:id/continuations/generate', async (req, res) => {
  try {
    const context = requireEligible(Number(req.params.id))
    const lane = parseLane(req.body?.lane)
    const profile = parseProfile(req.body?.level, req.body?.timeCommitment, context.readiness.course)
    const config = requireLlmConfig()
    const request = createRequestAbortSignal(req, res)
    const streamResult = await streamText({
      ...llmRequestOptions(config, { signal: request.signal }),
      system: generationPrompt({ parent: context.readiness.course, summary: context.summary, lineage: context.lineage, lane, profile }),
      messages: [{ role: 'user', content: 'Generate the Advanced curriculum.' }],
    })
    const draft = normalizeAdvancedCurriculum(await parseGeneratedCurriculum(streamResult), context.readiness.course, lane)
    return writeCurriculumSSE(res, draft)
  } catch (error) {
    if (error instanceof LlmClientError) return res.status(400).json({ error: error.message, code: error.code, retryable: error.retryable })
    return writeCurriculumSSEError(res, error)
  }
})

router.post('/topics/:id/continuations/tweak', async (req, res) => {
  try {
    const context = requireEligible(Number(req.params.id))
    const lane = parseLane(req.body?.lane)
    const profile = parseProfile(req.body?.level, req.body?.timeCommitment, context.readiness.course)
    if (!req.body?.curriculum || typeof req.body.curriculum !== 'object') throw routeError('A transient curriculum draft is required.', 'INVALID_CURRICULUM')
    if (typeof req.body?.request !== 'string' || !req.body.request.trim() || req.body.request.trim().length > MAX_REQUEST_LENGTH) throw routeError(`A revision request of 1-${MAX_REQUEST_LENGTH} characters is required.`, 'INVALID_REQUEST')
    const base = normalizeAdvancedCurriculum(req.body.curriculum, context.readiness.course, lane)
    const config = requireLlmConfig()
    const result = await generateText({ ...llmRequestOptions(config), system: generationPrompt({ parent: context.readiness.course, summary: context.summary, lineage: context.lineage, lane, profile, curriculum: base, request: req.body.request.trim() }), messages: [{ role: 'user', content: 'Revise the transient Advanced curriculum.' }] })
    const draft = normalizeAdvancedCurriculum(await collectCurriculumDraft((async function* () { yield result.text || '' })(), { enforceBounds: true, requireTasks: true }), context.readiness.course, lane)
    return res.json({ curriculum: draft })
  } catch (error) {
    if (error instanceof LlmClientError) return res.status(400).json({ error: error.message, code: error.code, retryable: error.retryable })
    return res.status(error.status || 500).json({ error: error.message || 'Failed to tweak continuation.', code: error.code })
  }
})

router.post('/topics/:id/continuations/confirm', (req, res) => {
  try {
    const parentId = Number(req.params.id)
    const context = requireEligible(parentId)
    const lane = parseLane(req.body?.lane)
    const profile = parseProfile(req.body?.level, req.body?.timeCommitment, context.readiness.course)
    const curriculum = normalizeAdvancedCurriculum(req.body?.curriculum, context.readiness.course, lane)
    const created = createLinkedCourse(parentId, { lane, level: profile.level, timeCommitment: profile.timeCommitment, curriculum })
    return res.json({ ok: true, topic: created.topic, firstLessonId: created.firstLessonId })
  } catch (error) {
    if (error instanceof CourseLineageError) return res.status(error.status).json({ error: error.message, code: error.code })
    return res.status(error.status || 500).json({ error: error.message || 'Failed to confirm continuation.', code: error.code })
  }
})

export default router
