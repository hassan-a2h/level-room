import { normalizeTaskSpec } from './task-spec.js'

export const CURRICULUM_MAX_BYTES = 512 * 1024
const CURRICULUM_LIMITS = Object.freeze({
  title: 200,
  goal: 500,
  moduleTitle: 200,
  moduleSummary: 500,
  lessonTitle: 200,
  depth: 80,
  outcome: 300,
  prerequisite: 200,
  skillOutcome: 300,
})

export class CurriculumDraftError extends Error {
  constructor(message, code = 'INVALID_CURRICULUM', retryable = false) {
    super(message)
    this.name = 'CurriculumDraftError'
    this.code = code
    this.retryable = retryable
  }
}

function cleanRawJson(raw) {
  return String(raw || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

function validateString(value, field) {
  if (typeof value !== 'string' || !value.trim()) return `${field} is required.`
  return null
}

function validateOptionalString(value, field, max) {
  if (value === undefined || value === null || value === '') return { valid: true, value: '' }
  if (typeof value !== 'string' || value.trim().length > max) return { valid: false, error: `${field} must be a string of at most ${max} characters.` }
  return { valid: true, value: value.trim() }
}

export function validateCurriculum(curriculum, { enforceBounds = false, requireTasks = false } = {}) {
  if (!curriculum || typeof curriculum !== 'object' || Array.isArray(curriculum)) {
    return { valid: false, error: 'Curriculum must be an object.' }
  }
  if (!Array.isArray(curriculum.modules)) return { valid: false, error: 'Curriculum must have a modules array.' }
  const curriculumTitle = validateOptionalString(curriculum.title, 'Curriculum title', CURRICULUM_LIMITS.title)
  if (!curriculumTitle.valid) return curriculumTitle
  const curriculumGoal = validateOptionalString(curriculum.goal, 'Curriculum goal', CURRICULUM_LIMITS.goal)
  if (!curriculumGoal.valid) return curriculumGoal
  const hasCourseMetadata = curriculum.course !== undefined
  const bounded = enforceBounds || hasCourseMetadata
  const tasksRequired = requireTasks || hasCourseMetadata

  if (bounded && (curriculum.modules.length < 3 || curriculum.modules.length > 5)) {
    return { valid: false, error: 'A new course must contain 3-5 modules.' }
  }
  if (!bounded && curriculum.modules.length === 0) return { valid: false, error: 'Curriculum must have at least one module.' }

  if (hasCourseMetadata) {
    const kind = curriculum.course?.kind
    const stage = curriculum.course?.stage
    if (!['core', 'advanced'].includes(kind)) return { valid: false, error: 'course.kind must be core or advanced.' }
    if (!Number.isInteger(stage) || stage < 0) return { valid: false, error: 'course.stage must be a non-negative integer.' }
    const focus = validateOptionalString(curriculum.course?.focus, 'course.focus', CURRICULUM_LIMITS.title)
    if (!focus.valid) return focus
  }

  const lessonTitles = new Set()
  const lessonMap = new Map()
  const normalizedModules = []
  for (let mi = 0; mi < curriculum.modules.length; mi += 1) {
    const mod = curriculum.modules[mi]
    const moduleError = validateString(mod?.title, `Module ${mi} title`)
    if (moduleError) return { valid: false, error: moduleError }
    if (mod.title.trim().length > CURRICULUM_LIMITS.moduleTitle) return { valid: false, error: `Module ${mi} title must be at most ${CURRICULUM_LIMITS.moduleTitle} characters.` }
    const moduleSummary = validateOptionalString(mod.summary, `Module ${mi} summary`, CURRICULUM_LIMITS.moduleSummary)
    if (!moduleSummary.valid) return moduleSummary
    if (mod.skill_outcomes !== undefined && mod.skill_outcomes !== null && !Array.isArray(mod.skill_outcomes)) return { valid: false, error: `Module ${mi} skill_outcomes must be an array.` }
    if (Array.isArray(mod.skill_outcomes) && (mod.skill_outcomes.length > 10 || !mod.skill_outcomes.every((item) => typeof item === 'string' && item.trim() && item.trim().length <= CURRICULUM_LIMITS.skillOutcome))) return { valid: false, error: `Module ${mi} skill_outcomes are invalid.` }
    if (!Array.isArray(mod.lessons) || mod.lessons.length === 0) return { valid: false, error: `Module "${mod.title}" has no lessons.` }
    if (bounded && (mod.lessons.length < 3 || mod.lessons.length > 5)) return { valid: false, error: `Module "${mod.title}" must contain 3-5 lessons.` }

    const normalizedLessons = []
    for (let li = 0; li < mod.lessons.length; li += 1) {
      const lesson = mod.lessons[li]
      const titleError = validateString(lesson?.title, `Lesson ${li} in module "${mod.title}" title`)
      if (titleError) return { valid: false, error: titleError }
      const title = lesson.title.trim()
      if (title.length > CURRICULUM_LIMITS.lessonTitle) return { valid: false, error: `Lesson "${lesson.title}" title is too long.` }
      if (lessonTitles.has(title)) return { valid: false, error: `Duplicate lesson title: "${lesson.title}".` }
      if (!lesson.depth || typeof lesson.depth !== 'string' || lesson.depth.trim().length > CURRICULUM_LIMITS.depth) return { valid: false, error: `Lesson "${lesson.title}" has invalid depth.` }
      if (!Number.isInteger(lesson.estimated_time) || lesson.estimated_time <= 0 || lesson.estimated_time > 180) return { valid: false, error: `Lesson "${lesson.title}" has invalid estimated_time.` }
      if (!Array.isArray(lesson.outcomes) || lesson.outcomes.length === 0 || lesson.outcomes.length > 10) return { valid: false, error: `Lesson "${lesson.title}" has invalid outcomes.` }
      if (!lesson.outcomes.every((outcome) => typeof outcome === 'string' && outcome.trim() && outcome.trim().length <= CURRICULUM_LIMITS.outcome)) return { valid: false, error: `Lesson "${lesson.title}" has invalid outcomes.` }
      if (!Array.isArray(lesson.prerequisites) || lesson.prerequisites.length > 10) return { valid: false, error: `Lesson "${lesson.title}" prerequisites must contain at most 10 items.` }
      if (!lesson.prerequisites.every((prerequisite) => typeof prerequisite === 'string' && prerequisite.trim() && prerequisite.trim().length <= CURRICULUM_LIMITS.prerequisite)) return { valid: false, error: `Lesson "${lesson.title}" has invalid prerequisites.` }

      let task = lesson.task ?? lesson.task_spec
      if (tasksRequired && !task) return { valid: false, error: `Lesson "${lesson.title}" is missing a practical task.` }
      if (task) {
        try {
          task = normalizeTaskSpec(task)
        } catch (error) {
          return { valid: false, error: `Lesson "${lesson.title}" task is invalid: ${error.message}` }
        }
      }

      const outcomes = lesson.outcomes.map((outcome) => outcome.trim())
      const prerequisites = lesson.prerequisites.map((prerequisite) => prerequisite.trim())
      const canonicalLesson = {
        title,
        depth: lesson.depth.trim(),
        estimated_time: lesson.estimated_time,
        outcomes,
        prerequisites,
        ...(task ? { task } : {}),
        ...(typeof lesson.artifact_required === 'boolean' ? { artifact_required: lesson.artifact_required } : {}),
        ...(typeof lesson.artifact_type === 'string' ? { artifact_type: lesson.artifact_type.trim().slice(0, 100) } : {}),
        ...(typeof lesson.artifact_rubric === 'string' ? { artifact_rubric: lesson.artifact_rubric.trim().slice(0, 1000) } : {}),
      }
      lessonTitles.add(title)
      lessonMap.set(title, canonicalLesson)
      normalizedLessons.push(canonicalLesson)
    }
    normalizedModules.push({
      title: mod.title.trim(),
      ...(moduleSummary.value ? { summary: moduleSummary.value } : {}),
      ...(Array.isArray(mod.skill_outcomes) ? { skill_outcomes: mod.skill_outcomes.map((item) => item.trim()) } : {}),
      lessons: normalizedLessons,
    })
  }

  const adjacency = new Map()
  for (const [title, lesson] of lessonMap) {
    const prerequisites = lesson.prerequisites || []
    adjacency.set(title, new Set(prerequisites))
    for (const prerequisite of prerequisites) {
      if (typeof prerequisite !== 'string' || !lessonTitles.has(prerequisite)) return { valid: false, error: `Lesson "${title}" has unknown prerequisite: "${prerequisite}".` }
      if (prerequisite === title) return { valid: false, error: `Lesson "${title}" lists itself as a prerequisite.` }
    }
  }

  const visiting = new Set()
  const visited = new Set()
  function dfs(title) {
    if (visiting.has(title)) return false
    if (visited.has(title)) return true
    visiting.add(title)
    for (const prerequisite of adjacency.get(title) || []) if (!dfs(prerequisite)) return false
    visiting.delete(title)
    visited.add(title)
    return true
  }
  for (const title of lessonTitles) if (!dfs(title)) return { valid: false, error: `Circular prerequisite detected involving "${title}".` }

  return {
    valid: true,
    value: {
      ...(curriculumTitle.value ? { title: curriculumTitle.value } : {}),
      ...(curriculumGoal.value ? { goal: curriculumGoal.value } : {}),
      ...(hasCourseMetadata ? {
        course: {
          kind: curriculum.course.kind,
          stage: curriculum.course.stage,
          ...(curriculum.course.focus ? { focus: curriculum.course.focus.trim().slice(0, CURRICULUM_LIMITS.title) } : {}),
        },
      } : {}),
      modules: normalizedModules,
    },
  }
}

export async function collectCurriculumDraft(textStream, options = {}) {
  const maxBytes = options.maxBytes || CURRICULUM_MAX_BYTES
  let buffer = ''
  for await (const chunk of textStream) {
    const value = typeof chunk === 'string' ? chunk : ''
    buffer += value
    if (typeof options.onChunk === 'function') options.onChunk(value)
    if (Buffer.byteLength(buffer, 'utf8') > maxBytes) throw new CurriculumDraftError('The curriculum draft is too large.', 'CURRICULUM_TOO_LARGE')
  }
  if (!buffer.trim()) throw new CurriculumDraftError('The provider returned an empty curriculum.', 'EMPTY_CURRICULUM', true)
  let parsed
  try {
    parsed = JSON.parse(cleanRawJson(buffer))
  } catch {
    throw new CurriculumDraftError('The provider returned malformed curriculum JSON.', 'MALFORMED_CURRICULUM', true)
  }
  const validation = validateCurriculum(parsed, options)
  if (!validation.valid) throw new CurriculumDraftError(validation.error, 'INVALID_CURRICULUM', /task/i.test(validation.error))
  return validation.value
}

export function writeCurriculumSSE(res, curriculum) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write('event: curriculum\n')
  res.write(`data: ${JSON.stringify(curriculum)}\n\n`)
  res.write(`data: ${JSON.stringify('[DONE]')}\n\n`)
  res.end()
}

export function writeCurriculumSSEError(res, error) {
  if (!res.headersSent) {
    res.status(400).json({ error: error.message, code: error.code, retryable: error.retryable })
    return
  }
  res.write('event: error\n')
  res.write(`data: ${JSON.stringify({ message: error.message, code: error.code, retryable: error.retryable })}\n\n`)
  res.end()
}
