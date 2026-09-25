import { get, run } from '../db.js'

export const STATES = Object.freeze({
  NOT_STARTED: 'not_started',
  PRACTICING: 'practicing',
  PASSED: 'passed',
})

const STATE_VALUES = new Set(Object.values(STATES))

export class StateMachineError extends Error {
  constructor(message, code, status = 409) {
    super(message)
    this.name = 'StateMachineError'
    this.code = code
    this.status = status
  }
}

export function isValidState(state) {
  return STATE_VALUES.has(state)
}

export function canTransition(from, to) {
  return from === STATES.NOT_STARTED && to === STATES.PRACTICING
}

export function getValidTransitions(from) {
  return from === STATES.NOT_STARTED ? [STATES.PRACTICING] : []
}

function parsePrerequisites(value) {
  if (value === null || value === undefined || value === '') return []
  let parsed
  try { parsed = JSON.parse(value) } catch { return null }
  if (!Array.isArray(parsed)) return null
  return parsed.every((item) => item && Number.isInteger(item.lessonId) && item.lessonId > 0 && typeof item.title === 'string') ? parsed : null
}

export function checkPrerequisites(topicId, lessonId) {
  const lesson = get(
    `SELECT l.prerequisites, l.title
     FROM lessons l JOIN modules m ON l.module_id = m.id
     WHERE l.id = ? AND m.topic_id = ?`,
    Number(lessonId),
    Number(topicId),
  )
  if (!lesson) return { locked: true, unmet: [], lessonNotFound: true }

  const prerequisites = parsePrerequisites(lesson.prerequisites)
  if (!prerequisites) return { locked: true, unmet: [], invalidPrerequisites: true, lessonTitle: lesson.title }
  const unmet = prerequisites.filter((prerequisite) => {
    const progress = get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', Number(topicId), prerequisite.lessonId)
    return progress?.state !== STATES.PASSED
  })
  return { locked: unmet.length > 0, unmet, lessonTitle: lesson.title }
}

export function getArtifactRequirement(topicId, lessonId) {
  const lesson = get(
    `SELECT l.artifact_required, l.artifact_type
     FROM lessons l JOIN modules m ON l.module_id = m.id
     WHERE l.id = ? AND m.topic_id = ?`,
    Number(lessonId),
    Number(topicId),
  )
  if (!lesson) return { found: false, required: false, type: null }
  return { found: true, required: lesson.artifact_required === 1, type: lesson.artifact_type || null }
}

export function getProgress(topicId, lessonId) {
  return get(
    `SELECT id, state, activity_state, artifact_passed, started_at, completed_at
     FROM progress WHERE topic_id = ? AND lesson_id = ?`,
    Number(topicId),
    Number(lessonId),
  )
}

function validCalendarDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

export function scheduleSrs(topicId, lessonId, { localDate, now } = {}) {
  const existing = get(
    'SELECT id FROM srs_queue WHERE topic_id = ? AND lesson_id = ? AND status = ?',
    Number(topicId), Number(lessonId), 'pending',
  )
  if (existing) return false

  const anchor = localDate || (now instanceof Date ? now.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
  if (!validCalendarDate(anchor)) throw new StateMachineError('Invalid local date for SRS scheduling.', 'INVALID_LOCAL_DATE', 400)
  const dueDate = new Date(`${anchor}T00:00:00.000Z`)
  dueDate.setUTCDate(dueDate.getUTCDate() + 1)
  const result = run(
    'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
    Number(topicId), Number(lessonId), 0, dueDate.toISOString().slice(0, 10), 'pending',
  )
  return result.changes === 1
}
