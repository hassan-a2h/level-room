import { Router } from 'express'
import { all, get } from '../db.js'
import { generateText, streamText, LlmClientError } from '../llm/client.js'
import { requireLlmConfig } from '../utils/llm-config.js'
import { createRequestAbortSignal, llmRequestOptions } from '../llm/request-options.js'
import {
  buildCourseSummary,
  collectLineageOutcomes,
  createLinkedCourse,
  CourseLineageError,
  getCourseReadiness,
  getLineage,
} from '../utils/course-lineage.js'
import { CURRICULUM_MAX_BYTES, collectCurriculumDraft, validateCurriculum, writeCurriculumSSE, writeCurriculumSSEError } from '../utils/curriculum-draft.js'

const router = Router()
const BALANCED_LANE = 'balanced-next'
const VALID_LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const VALID_TIME_COMMITMENTS = ['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day']
const MAX_REQUEST_LENGTH = 1000
const MAX_PROMPT_TRACKS = 12
const MAX_SUMMARY_BYTES = 128 * 1024
const MAX_CONTEXT_BYTES = 256 * 1024
const MAX_SUMMARY_ITEMS = 20
const MAX_SUMMARY_OUTCOMES = 50
const MAX_SUMMARY_TEXT = 400

function routeError(message, code, status = 400) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
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
  return lineage.slice(-MAX_PROMPT_TRACKS).map((course) => publicCourse(course))
}

function boundedText(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_SUMMARY_TEXT) : ''
}

function boundedOutcome(value) {
  if (typeof value === 'string') return boundedText(value) || null
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.id !== 'string' || typeof value.title !== 'string') return null
  return {
    id: value.id.slice(0, 80),
    title: boundedText(value.title).slice(0, 160),
    ...(value.kind === 'knowledge' || value.kind === 'skill' ? { kind: value.kind } : {}),
    ...(value.role === 'core' || value.role === 'breadth' ? { role: value.role } : {}),
  }
}

function boundedSummary(summary) {
  const source = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {}
  const strings = (value) => Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').map(boundedText).filter(Boolean).slice(0, MAX_SUMMARY_ITEMS)
    : []
  const outcomes = Array.isArray(source.outcomes)
    ? source.outcomes.map(boundedOutcome).filter(Boolean).slice(0, MAX_SUMMARY_OUTCOMES)
    : []
  const strengths = Array.isArray(source.strengths)
    ? source.strengths.map(boundedOutcome).filter(Boolean).slice(0, MAX_SUMMARY_OUTCOMES)
    : []
  return {
    topicId: Number.isInteger(source.topicId) ? source.topicId : undefined,
    title: typeof source.title === 'string' ? source.title.trim().slice(0, 200) : '',
    courseKind: typeof source.courseKind === 'string' ? source.courseKind.slice(0, 40) : 'core',
    courseStage: Number.isInteger(source.courseStage) ? source.courseStage : 0,
    focus: typeof source.focus === 'string' ? source.focus.trim().slice(0, 100) : '',
    outcomes,
    strengths,
    gaps: strings(source.gaps),
    artifactFeedback: strings(source.artifactFeedback),
  }
}

function summaryFor(course) {
  if (typeof course.course_summary === 'string' && course.course_summary.trim()
    && Buffer.byteLength(course.course_summary, 'utf8') <= MAX_SUMMARY_BYTES) {
    try {
      const parsed = JSON.parse(course.course_summary)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const summary = boundedSummary(parsed)
        return {
          ...summary,
          title: summary.title || course.title,
          courseKind: typeof parsed.courseKind === 'string' ? summary.courseKind : (course.course_kind || 'core'),
          courseStage: Number.isInteger(parsed.courseStage) ? summary.courseStage : (course.course_stage || 0),
          focus: summary.focus || course.course_focus || '',
        }
      }
    } catch {
      // Rebuild a bounded in-memory summary when the stored snapshot is malformed.
    }
  }
  const summary = boundedSummary(buildCourseSummary(course.id))
  return {
    ...summary,
    title: summary.title || course.title,
    courseKind: course.course_kind || 'core',
    courseStage: course.course_stage || 0,
    focus: summary.focus || course.course_focus || '',
  }
}

function lineageOutcomeLedger(summaries, currentOutcomes) {
  const values = [...summaries.flatMap((summary) => summary.outcomes), ...currentOutcomes]
  const seenIds = new Set()
  const seenTitles = new Set()
  const outcomes = []
  for (const value of values) {
    if (typeof value === 'string') {
      const title = boundedText(value)
      const normalized = title.normalize('NFKC').toLocaleLowerCase('en-US')
      if (!title || seenTitles.has(normalized)) continue
      seenTitles.add(normalized)
      outcomes.push({ id: '', title })
    } else if (value && typeof value.id === 'string' && typeof value.title === 'string') {
      const normalized = value.title.normalize('NFKC').toLocaleLowerCase('en-US')
      if (seenIds.has(value.id) || seenTitles.has(normalized)) continue
      seenIds.add(value.id)
      seenTitles.add(normalized)
      outcomes.push({ id: value.id, title: value.title })
    }
    if (outcomes.length >= MAX_PROMPT_TRACKS * MAX_SUMMARY_OUTCOMES) break
  }
  return outcomes
}

function contextFor(topicId) {
  const readiness = getCourseReadiness(topicId)
  if (!readiness.course) throw routeError('Topic not found.', 'TOPIC_NOT_FOUND', 404)
  const lineage = getLineage(topicId)
  const trackSummaries = lineage.slice(-MAX_PROMPT_TRACKS).map((course) => summaryFor(course))
  const summary = trackSummaries.at(-1) || summaryFor(readiness.course)
  const lineageOutcomes = lineageOutcomeLedger(trackSummaries, collectLineageOutcomes(topicId))
  return { readiness, lineage, summary, trackSummaries, lineageOutcomes }
}

function requireEligible(topicId) {
  const context = contextFor(topicId)
  if (!context.readiness.eligible || context.readiness.course.status !== 'completed') {
    throw routeError(context.readiness.reason || 'Complete every Chapter checkpoint before continuing.', 'COURSE_NOT_COMPLETE', 409)
  }
  return context
}

function rejectLaneSelection(body) {
  if (body && Object.hasOwn(body, 'lane')) throw routeError('Lane selection is no longer supported.', 'INVALID_REQUEST')
}

function normalizeBalancedCurriculum(curriculum, parent, lineageOutcomes) {
  let serialized
  try { serialized = JSON.stringify(curriculum) } catch { throw routeError('The curriculum draft is not serializable.', 'INVALID_CURRICULUM') }
  if (Buffer.byteLength(serialized || '', 'utf8') > CURRICULUM_MAX_BYTES) throw routeError('The curriculum draft is too large.', 'CURRICULUM_TOO_LARGE')
  const validation = validateCurriculum(curriculum, {
    enforceBounds: true,
    requireTasks: true,
    trackKind: 'continuation',
    lineageOutcomes,
  })
  if (!validation.valid) throw routeError(validation.error, 'INVALID_CURRICULUM')
  return {
    ...validation.value,
    course: {
      ...(validation.value.course || {}),
      kind: 'advanced',
      stage: (parent.course_stage || 0) + 1,
      focus: BALANCED_LANE,
    },
  }
}

function generationPrompt({ parent, trackSummaries, profile, curriculum, request }) {
  const summaries = trackSummaries.map(({ title, courseKind, courseStage, focus, strengths, gaps, artifactFeedback }) => ({
    title,
    courseKind,
    courseStage,
    focus,
    strengths,
    gaps,
    artifactFeedback,
  }))
  const existing = curriculum ? `\nTransient draft to revise:\n${JSON.stringify(curriculum)}` : ''
  const instruction = request ? `\nLearner revision request:\n${request}` : ''
  const prompt = `Design one finite balanced continuation Track after "${parent.title}".
Parent stage: ${parent.course_stage || 0}
Learner level: ${profile.level}
Time commitment: ${profile.timeCommitment}
Recent Track summaries (oldest first, up to 12): ${JSON.stringify(summaries)}
All prior outcome IDs and titles (do not repeat either IDs or normalized titles): ${JSON.stringify(trackSummaries.flatMap((summary) => summary.outcomes))}
Continuation contract:
- Target approximately 80 percent high-leverage core outcomes and 20 percent adjacent breadth. Include at least one breadth outcome; if there are 10 or more outcomes, 70-90 percent must be core.
- Every Chapter must include both knowledge and skill outcomes, and at least one core outcome. Every skill outcome requires activity evidence.
- Include a finite 3-5 Chapters, each with 3-5 Sessions, and one or two practical Builds per Chapter.
- Include both theory and practical skill practice, and connect new outcomes to demonstrated strengths, persistent/recent gaps, and artifact feedback.
- Give all outcome objects unique stable IDs and exact plain-language titles; Sessions must repeat their Chapter's complete outcome objects.
- Return curriculum JSON only, with course metadata kind advanced, stage ${Number(parent.course_stage || 0) + 1}, and focus "balanced-next". Never include prior outcomes as new learning outcomes.
${existing}${instruction}`
  if (Buffer.byteLength(prompt, 'utf8') > MAX_CONTEXT_BYTES) throw routeError('The bounded learning summary is too large to generate safely.', 'CONTINUATION_CONTEXT_TOO_LARGE', 422)
  return prompt
}

async function parseGeneratedCurriculum(streamResult, context) {
  return collectCurriculumDraft(streamResult.textStream, {
    enforceBounds: true,
    requireTasks: true,
    trackKind: 'continuation',
    lineageOutcomes: context.lineageOutcomes,
  })
}

router.get('/topics/:id/continuation-readiness', (req, res) => {
  try {
    const context = contextFor(Number(req.params.id))
    const eligible = context.readiness.eligible && context.readiness.course.status === 'completed'
    return res.json({
      eligible,
      reason: eligible ? undefined : (context.readiness.reason || 'Complete every Chapter checkpoint before continuing.'),
      course: publicCourse(context.readiness.course),
      lineage: publicLineage(context.lineage),
      summary: context.summary,
    })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Failed to read continuation readiness.', code: error.code })
  }
})

router.post('/topics/:id/continuations/generate', async (req, res) => {
  try {
    rejectLaneSelection(req.body)
    const context = requireEligible(Number(req.params.id))
    const profile = parseProfile(req.body?.level, req.body?.timeCommitment, context.readiness.course)
    const config = requireLlmConfig()
    const request = createRequestAbortSignal(req, res)
    const streamResult = await streamText({
      ...llmRequestOptions(config, { signal: request.signal }),
      system: generationPrompt({ parent: context.readiness.course, trackSummaries: context.trackSummaries, profile }),
      messages: [{ role: 'user', content: 'Generate the complete balanced continuation Track JSON.' }],
    })
    const draft = normalizeBalancedCurriculum(await parseGeneratedCurriculum(streamResult, context), context.readiness.course, context.lineageOutcomes)
    return writeCurriculumSSE(res, draft)
  } catch (error) {
    if (error instanceof LlmClientError) return res.status(400).json({ error: error.message, code: error.code, retryable: error.retryable })
    return writeCurriculumSSEError(res, error)
  }
})

router.post('/topics/:id/continuations/tweak', async (req, res) => {
  try {
    rejectLaneSelection(req.body)
    const context = requireEligible(Number(req.params.id))
    const profile = parseProfile(req.body?.level, req.body?.timeCommitment, context.readiness.course)
    if (!req.body?.curriculum || typeof req.body.curriculum !== 'object') throw routeError('A transient curriculum draft is required.', 'INVALID_CURRICULUM')
    if (typeof req.body?.request !== 'string' || !req.body.request.trim() || req.body.request.trim().length > MAX_REQUEST_LENGTH) throw routeError(`A revision request of 1-${MAX_REQUEST_LENGTH} characters is required.`, 'INVALID_REQUEST')
    const base = normalizeBalancedCurriculum(req.body.curriculum, context.readiness.course, context.lineageOutcomes)
    const config = requireLlmConfig()
    const result = await generateText({
      ...llmRequestOptions(config),
      system: generationPrompt({ parent: context.readiness.course, trackSummaries: context.trackSummaries, profile, curriculum: base, request: req.body.request.trim() }),
      messages: [{ role: 'user', content: 'Revise the transient balanced continuation Track.' }],
    })
    const draft = await collectCurriculumDraft((async function* () { yield result.text || '' })(), {
      enforceBounds: true,
      requireTasks: true,
      trackKind: 'continuation',
      lineageOutcomes: context.lineageOutcomes,
    })
    return res.json({ curriculum: normalizeBalancedCurriculum(draft, context.readiness.course, context.lineageOutcomes) })
  } catch (error) {
    if (error instanceof LlmClientError) return res.status(400).json({ error: error.message, code: error.code, retryable: error.retryable })
    return res.status(error.status || 500).json({ error: error.message || 'Failed to tweak continuation.', code: error.code })
  }
})

router.post('/topics/:id/continuations/confirm', (req, res) => {
  try {
    rejectLaneSelection(req.body)
    const parentId = Number(req.params.id)
    const context = requireEligible(parentId)
    const profile = parseProfile(req.body?.level, req.body?.timeCommitment, context.readiness.course)
    const curriculum = normalizeBalancedCurriculum(req.body?.curriculum, context.readiness.course, context.lineageOutcomes)
    const created = createLinkedCourse(parentId, {
      lane: BALANCED_LANE,
      level: profile.level,
      timeCommitment: profile.timeCommitment,
      curriculum,
    })
    return res.json({ ok: true, topic: created.topic, dashboardPath: `/?topicId=${created.topic.id}` })
  } catch (error) {
    if (error instanceof CourseLineageError) return res.status(error.status).json({ error: error.message, code: error.code })
    return res.status(error.status || 500).json({ error: error.message || 'Failed to confirm continuation.', code: error.code })
  }
})

export default router
