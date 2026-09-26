import { all, get, run, transaction } from '../db.js'
import { parseActivityDocument, validateActivityDocument } from './activity-schema.js'
import { STATES, checkPrerequisites, getArtifactRequirement, scheduleSrs } from './lesson-state-machine.js'
import { isValidDate, recordMasteryEvent } from './streak-tracker.js'
import { updateMistakesAfterResult } from './mistakes-log.js'

const STATE_KEYS = new Set(['schemaVersion', 'currentBlockId', 'blocks', 'updatedAt'])
const BLOCK_STATE_KEYS = new Set(['status', 'attempts', 'response', 'feedback', 'criteria', 'nextStep', 'updatedAt', 'completedAt'])
const STATE_STATUSES = new Set(['not_started', 'active', 'completed', 'passed', 'needs_retry'])
const FINAL_STATUS = { read: 'completed', worked_example: 'completed', reflection: 'completed', choice: 'passed', ordering: 'passed', short_answer: 'passed' }
const OBJECTIVE_TYPES = new Set(['choice', 'ordering', 'short_answer'])

export class ActivityRuntimeError extends Error {
  constructor(message, code, status = 409, latestState = null) {
    super(message)
    this.name = 'ActivityRuntimeError'
    this.code = code
    this.status = status
    if (latestState) this.latestState = latestState
  }
}

function fail(message, code = 'ACTIVITY_STATE_INVALID', status = 409, latestState = null) {
  return new ActivityRuntimeError(message, code, status, latestState)
}

function positiveId(value, field) {
  if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw fail(`${field} must be a positive integer.`, 'INVALID_REQUEST', 400)
  return Number(value)
}

function normalizeNow(value) {
  const date = value instanceof Date ? value : value === undefined ? new Date() : new Date(value)
  if (Number.isNaN(date.getTime())) throw fail('A valid timestamp is required.', 'INVALID_TIMESTAMP', 400)
  return date.toISOString()
}

function completionContext(value) {
  const localDate = value?.localDate
  if (!isValidDate(localDate)) throw fail('localDate must be a real YYYY-MM-DD calendar date.', 'INVALID_LOCAL_DATE', 400)
  return { localDate, now: normalizeNow(value?.now) }
}

function lessonRow(topicId, lessonId) {
  const lesson = get(
    `SELECT l.id, l.title, l.estimated_time, l.outcomes, l.prerequisites, l.activity_blocks,
            l.artifact_required, l.artifact_type, m.title AS module_title, t.title AS topic_title
     FROM lessons l
     JOIN modules m ON m.id = l.module_id
     JOIN topics t ON t.id = m.topic_id
     WHERE t.id = ? AND l.id = ?`,
    topicId,
    lessonId,
  )
  if (!lesson) throw fail('Session not found in this Trail.', 'LESSON_NOT_FOUND', 404)
  return lesson
}

function activityDocument(lesson) {
  if (typeof lesson.activity_blocks !== 'string' || !lesson.activity_blocks.trim()) {
    throw fail('This Session does not have a generated activity document.', 'ACTIVITY_DOCUMENT_MISSING', 409)
  }
  const parsed = parseActivityDocument(lesson.activity_blocks)
  if (!parsed.valid) throw fail(parsed.error, 'ACTIVITY_DOCUMENT_INVALID', 500)
  const validation = validateActivityDocument(parsed.value, lesson)
  if (!validation.valid) throw fail(validation.error, 'ACTIVITY_DOCUMENT_INVALID', 500)
  return validation.value
}

function checkPrerequisiteAccess(topicId, lessonId) {
  const prerequisite = checkPrerequisites(topicId, lessonId)
  if (prerequisite.lessonNotFound) throw fail('Session not found in this Trail.', 'LESSON_NOT_FOUND', 404)
  if (prerequisite.invalidPrerequisites) throw fail('Stored Session prerequisites are invalid.', 'ACTIVITY_PREREQUISITES_INVALID', 500)
  if (prerequisite.locked) throw fail('Complete earlier Sessions before starting this one.', 'PREREQUISITES_NOT_MET', 409)
}

function ensureProgressRowInner(topicId, lessonId) {
  lessonRow(topicId, lessonId)
  let progress = get('SELECT * FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
  if (!progress) {
    const inserted = run(
      "INSERT INTO progress (topic_id, lesson_id, state, activity_state) VALUES (?, ?, ?, '{}')",
      topicId,
      lessonId,
      STATES.NOT_STARTED,
    )
    progress = get('SELECT * FROM progress WHERE id = ?', inserted.lastInsertRowid)
  }
  return progress
}

export function ensureProgressRow(topicId, lessonId) {
  const scopedTopicId = positiveId(topicId, 'topicId')
  const scopedLessonId = positiveId(lessonId, 'lessonId')
  return transaction(() => ensureProgressRowInner(scopedTopicId, scopedLessonId))()
}

function isFinal(block, entry) {
  return entry?.status === FINAL_STATUS[block.type]
}

function firstUnresolvedRequired(document, blocks) {
  return document.blocks.find((block) => block.required && !isFinal(block, blocks[block.id]))?.id ?? null
}

function emptyActivityState(document, now) {
  const currentBlockId = firstUnresolvedRequired(document, {})
  return { schemaVersion: 1, currentBlockId, blocks: {}, updatedAt: now }
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
}

function safeFeedback(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    && !/<\s*\/?\s*[a-z][^>]*>/i.test(value)
    && !/javascript\s*:|data\s*:/i.test(value)
    && !/!\[[^\]]*\]\(\s*<?(?:https?:)?\/\//i.test(value)
}

function stateResponseValid(block, response) {
  if (block.type === 'choice') return typeof response === 'string' && block.options.some((option) => option.id === response)
  if (block.type === 'ordering') {
    return Array.isArray(response)
      && response.length === block.items.length
      && new Set(response).size === block.items.length
      && response.every((id) => block.items.some((item) => item.id === id))
  }
  if (block.type === 'short_answer') return typeof response === 'string' && response.length >= block.minChars && response.length <= block.maxChars
  if (block.type === 'reflection') return typeof response === 'string' && response.trim().length > 0 && response.length <= block.maxChars
  return response === undefined
}

function validateStoredState(raw, document, now) {
  let parsed
  try { parsed = JSON.parse(raw || '{}') } catch { throw fail('Stored activity state contains invalid JSON.', 'ACTIVITY_STATE_INVALID', 409) }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0) return emptyActivityState(document, now)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw fail('Stored activity state must be an object.', 'ACTIVITY_STATE_INVALID', 409)
  for (const key of Object.keys(parsed)) if (!STATE_KEYS.has(key)) throw fail(`Stored activity state field "${key}" is not supported.`, 'ACTIVITY_STATE_INVALID', 409)
  if (Object.keys(parsed).length !== STATE_KEYS.size || parsed.schemaVersion !== 1 || !isIsoTimestamp(parsed.updatedAt)) {
    throw fail('Stored activity state has an unsupported shape.', 'ACTIVITY_STATE_INVALID', 409)
  }
  if (!parsed.blocks || typeof parsed.blocks !== 'object' || Array.isArray(parsed.blocks)) throw fail('Stored activity blocks must be an object.', 'ACTIVITY_STATE_INVALID', 409)
  const blocksById = new Map(document.blocks.map((block) => [block.id, block]))
  const normalizedBlocks = {}
  for (const [blockId, entry] of Object.entries(parsed.blocks)) {
    const block = blocksById.get(blockId)
    if (!block) throw fail(`Stored activity state references unknown block "${blockId}".`, 'ACTIVITY_STATE_INVALID', 409)
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw fail(`Stored state for "${blockId}" must be an object.`, 'ACTIVITY_STATE_INVALID', 409)
    for (const key of Object.keys(entry)) if (!BLOCK_STATE_KEYS.has(key)) throw fail(`Stored block state field "${key}" is not supported.`, 'ACTIVITY_STATE_INVALID', 409)
    if (!Object.hasOwn(entry, 'status') || !Object.hasOwn(entry, 'attempts') || !Object.hasOwn(entry, 'updatedAt') || !STATE_STATUSES.has(entry.status)) {
      throw fail(`Stored state for "${blockId}" is incomplete.`, 'ACTIVITY_STATE_INVALID', 409)
    }
    if (!Number.isInteger(entry.attempts) || entry.attempts < 0 || !isIsoTimestamp(entry.updatedAt)) throw fail(`Stored state for "${blockId}" has invalid counters or timestamps.`, 'ACTIVITY_STATE_INVALID', 409)
    const expectedFinal = FINAL_STATUS[block.type]
    if (entry.status === 'passed' && !OBJECTIVE_TYPES.has(block.type)) throw fail(`Informational block "${blockId}" cannot be passed.`, 'ACTIVITY_STATE_INVALID', 409)
    if (entry.status === 'completed' && OBJECTIVE_TYPES.has(block.type)) throw fail(`Scored block "${blockId}" cannot be completed without passing.`, 'ACTIVITY_STATE_INVALID', 409)
    if (entry.status === 'needs_retry' && !OBJECTIVE_TYPES.has(block.type)) throw fail(`Informational block "${blockId}" cannot need a retry.`, 'ACTIVITY_STATE_INVALID', 409)
    if (entry.status === expectedFinal && (!Object.hasOwn(entry, 'completedAt') || !isIsoTimestamp(entry.completedAt))) throw fail(`Final block "${blockId}" is missing its completion timestamp.`, 'ACTIVITY_STATE_INVALID', 409)
    if (entry.status !== expectedFinal && Object.hasOwn(entry, 'completedAt')) throw fail(`Unfinished block "${blockId}" cannot have a completion timestamp.`, 'ACTIVITY_STATE_INVALID', 409)
    if (['active', 'not_started'].includes(entry.status) && (entry.attempts !== 0 || Object.hasOwn(entry, 'response') || Object.hasOwn(entry, 'feedback'))) throw fail(`Unattempted block "${blockId}" cannot retain a response or feedback.`, 'ACTIVITY_STATE_INVALID', 409)
    if (['needs_retry', 'passed', 'completed'].includes(entry.status) && entry.attempts < 1) throw fail(`Attempted block "${blockId}" must have a positive attempt count.`, 'ACTIVITY_STATE_INVALID', 409)
    if (Object.hasOwn(entry, 'response') && !stateResponseValid(block, entry.response)) throw fail(`Stored response for "${blockId}" is invalid.`, 'ACTIVITY_STATE_INVALID', 409)
    if (OBJECTIVE_TYPES.has(block.type) && ['passed', 'needs_retry'].includes(entry.status) && (!Object.hasOwn(entry, 'response') || !Object.hasOwn(entry, 'feedback'))) throw fail(`Scored result for "${blockId}" must retain its response and feedback.`, 'ACTIVITY_STATE_INVALID', 409)
    if (Object.hasOwn(entry, 'criteria')) {
      const expectedCriteria = block.type === 'short_answer' ? document.answerKey[blockId].criteria : []
      if (!Array.isArray(entry.criteria) || entry.criteria.length !== expectedCriteria.length) throw fail(`Stored rubric result for "${blockId}" is invalid.`, 'ACTIVITY_STATE_INVALID', 409)
      const expectedIds = new Set(expectedCriteria.map((criterion) => criterion.id))
      const seenIds = new Set()
      for (const criterion of entry.criteria) {
        if (!criterion || typeof criterion !== 'object' || Array.isArray(criterion)
          || Object.keys(criterion).some((key) => !['id', 'passed', 'feedback'].includes(key))
          || !expectedIds.has(criterion.id) || seenIds.has(criterion.id) || typeof criterion.passed !== 'boolean'
          || !safeFeedback(criterion.feedback, 500)) {
          throw fail(`Stored rubric result for "${blockId}" is invalid.`, 'ACTIVITY_STATE_INVALID', 409)
        }
        seenIds.add(criterion.id)
      }
      if (seenIds.size !== expectedCriteria.length) throw fail(`Stored rubric result for "${blockId}" is incomplete.`, 'ACTIVITY_STATE_INVALID', 409)
    }
    if (OBJECTIVE_TYPES.has(block.type) && ['passed', 'needs_retry'].includes(entry.status) && block.type === 'short_answer'
      && (!Object.hasOwn(entry, 'criteria') || !safeFeedback(entry.nextStep, 500))) {
      throw fail(`Written result for "${blockId}" is incomplete.`, 'ACTIVITY_STATE_INVALID', 409)
    }
    if (Object.hasOwn(entry, 'criteria') && block.type !== 'short_answer') throw fail(`Block "${blockId}" cannot retain a rubric result.`, 'ACTIVITY_STATE_INVALID', 409)
    if (Object.hasOwn(entry, 'nextStep') && !safeFeedback(entry.nextStep, 500)) throw fail(`Stored next step for "${blockId}" is invalid.`, 'ACTIVITY_STATE_INVALID', 409)
    if (block.type === 'reflection' && entry.status === 'completed' && !Object.hasOwn(entry, 'response')) throw fail(`Reflection "${blockId}" must retain its response.`, 'ACTIVITY_STATE_INVALID', 409)
    if (Object.hasOwn(entry, 'feedback') && !safeFeedback(entry.feedback, 1500)) throw fail(`Stored feedback for "${blockId}" is invalid.`, 'ACTIVITY_STATE_INVALID', 409)
    normalizedBlocks[blockId] = entry
  }

  const currentBlockId = firstUnresolvedRequired(document, normalizedBlocks)
  if (parsed.currentBlockId !== currentBlockId) throw fail('Stored currentBlockId does not match the first unresolved required block.', 'ACTIVITY_STATE_INVALID', 409)
  const currentEntry = currentBlockId ? normalizedBlocks[currentBlockId] : null
  for (const block of document.blocks) {
    const entry = normalizedBlocks[block.id]
    if (!block.required && entry?.status === 'active') throw fail('An optional block cannot be active.', 'ACTIVITY_STATE_INVALID', 409)
    if (block.required && block.id !== currentBlockId && entry?.status === 'active') throw fail('Only the current required block may be active.', 'ACTIVITY_STATE_INVALID', 409)
    if (block.required && currentBlockId && document.blocks.indexOf(block) > document.blocks.findIndex((item) => item.id === currentBlockId)
      && (isFinal(block, entry) || entry?.status === 'needs_retry')) {
      throw fail('A later required block cannot have an attempt before earlier required blocks.', 'ACTIVITY_STATE_INVALID', 409)
    }
  }
  if (currentEntry?.status === 'passed' || currentEntry?.status === 'completed') throw fail('The current required block is already final.', 'ACTIVITY_STATE_INVALID', 409)
  return { schemaVersion: 1, currentBlockId, blocks: normalizedBlocks, updatedAt: parsed.updatedAt }
}

function publicState(state) {
  return JSON.parse(JSON.stringify(state))
}

function progressSummary(document, state) {
  const required = document.blocks.filter((block) => block.required)
  const completed = required.filter((block) => isFinal(block, state.blocks[block.id])).length
  return {
    completed,
    total: required.length,
    percent: required.length ? Math.floor(completed / required.length * 100) : 100,
    currentBlockId: state.currentBlockId,
  }
}

function sessionStatus(lesson, progress, completeResult = null) {
  return {
    completed: completeResult?.completed ?? progress?.state === STATES.PASSED,
    requiresArtifact: lesson.artifact_required === 1,
  }
}

function assertStateMatchesProgress(progress, document, state) {
  const required = document.blocks.filter((block) => block.required)
  if (progress.state === STATES.NOT_STARTED && Object.keys(state.blocks).length > 0) {
    throw fail('Unstarted Session cannot retain activity attempts.', 'ACTIVITY_STATE_INVALID', 409)
  }
  if (progress.state === STATES.PRACTICING) {
    if (state.currentBlockId) {
      const current = state.blocks[state.currentBlockId]
      if (!current || !['active', 'needs_retry'].includes(current.status)) throw fail('Stored current required block is not active.', 'ACTIVITY_STATE_INVALID', 409)
    } else if (!required.every((block) => isFinal(block, state.blocks[block.id]))) {
      throw fail('Stored Session passed its required blocks inconsistently.', 'ACTIVITY_STATE_INVALID', 409)
    }
  }
  if (progress.state === STATES.PASSED && (state.currentBlockId || !required.every((block) => isFinal(block, state.blocks[block.id])))) {
    throw fail('Completed Session has unfinished required blocks.', 'ACTIVITY_STATE_INVALID', 409)
  }
}

function writeState(progressId, nextState, lessonId, topicId, stateName = STATES.PRACTICING, completedAt = null) {
  run(
    'UPDATE progress SET activity_state = ?, state = ?, completed_at = ? WHERE id = ? AND topic_id = ? AND lesson_id = ?',
    JSON.stringify(nextState), stateName, completedAt, progressId, topicId, lessonId,
  )
}

function parseLessonOutcomes(raw) {
  try {
    const outcomes = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw
    return Array.isArray(outcomes) ? outcomes : []
  } catch {
    return []
  }
}

function mistakeDescription(lesson, block, criterionLabel = null) {
  const outcomes = parseLessonOutcomes(lesson.outcomes)
  const outcome = outcomes.find((item) => block.outcomeIds.includes(item?.id))
  const outcomeTitle = typeof outcome?.title === 'string' ? outcome.title : block.outcomeIds[0]
  return `${outcomeTitle} — ${criterionLabel || block.title}`
}

function storedResult(block, entry, state, document, lesson, progress) {
  const result = {
    status: entry.status,
    feedback: entry.feedback || '',
    activityState: publicState(state),
    activityProgress: progressSummary(document, state),
    session: sessionStatus(lesson, progress),
  }
  if (OBJECTIVE_TYPES.has(block.type)) result.correct = entry.status === 'passed'
  if (block.type === 'short_answer') {
    if (entry.criteria) result.criteria = entry.criteria
    if (entry.nextStep) result.nextStep = entry.nextStep
  }
  return result
}

function assertActiveBlock(topicId, lessonId, blockId) {
  const lesson = lessonRow(topicId, lessonId)
  checkPrerequisiteAccess(topicId, lessonId)
  const document = activityDocument(lesson)
  const progress = get('SELECT * FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
  if (!progress || progress.state === STATES.NOT_STARTED) throw fail('Start this Session before changing activity state.', 'ACTIVITY_NOT_STARTED', 409)
  if (![STATES.PRACTICING, STATES.PASSED].includes(progress.state)) throw fail('Stored Session state is invalid.', 'ACTIVITY_STATE_INVALID', 409)
  const now = new Date().toISOString()
  const state = validateStoredState(progress.activity_state, document, now)
  assertStateMatchesProgress(progress, document, state)
  const block = document.blocks.find((item) => item.id === blockId)
  if (!block) throw fail(`Activity block "${blockId}" was not found.`, 'ACTIVITY_BLOCK_NOT_FOUND', 409, publicState(state))
  return { lesson, document, progress, state, block }
}

function blockUnlocked(block, state) {
  return !block.required || block.id === state.currentBlockId
}

function conflict(message, code, state) {
  throw fail(message, code, 409, publicState(state))
}

function activateNextRequired(document, state, now) {
  const nextId = firstUnresolvedRequired(document, state.blocks)
  state.currentBlockId = nextId
  if (!nextId) return
  const existing = state.blocks[nextId]
  if (!existing || existing.status === 'not_started') {
    state.blocks[nextId] = { status: 'active', attempts: existing?.attempts || 0, updatedAt: now }
  }
}

function completionInner(topicId, lessonId, context, prepared = null) {
  const lesson = prepared?.lesson || lessonRow(topicId, lessonId)
  const document = prepared?.document || activityDocument(lesson)
  const progress = get('SELECT * FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
  if (!progress) return { completed: false, requiresArtifact: lesson.artifact_required === 1 }
  const state = prepared?.state || validateStoredState(progress.activity_state, document, context.now)
  assertStateMatchesProgress(progress, document, state)
  if (progress.state === STATES.PASSED) return { completed: true, requiresArtifact: lesson.artifact_required === 1, alreadyCompleted: true }
  const allRequiredComplete = document.blocks.filter((block) => block.required).every((block) => isFinal(block, state.blocks[block.id]))
  if (!allRequiredComplete) return { completed: false, requiresArtifact: lesson.artifact_required === 1 }
  if (lesson.artifact_required === 1 && progress.artifact_passed !== 1) return { completed: false, requiresArtifact: true }

  const update = run(
    `UPDATE progress SET state = ?, completed_at = COALESCE(completed_at, ?)
     WHERE id = ? AND state = ?`,
    STATES.PASSED, context.now, progress.id, STATES.PRACTICING,
  )
  if (update.changes !== 1) throw fail('Session completion changed concurrently.', 'ACTIVITY_STATE_CONFLICT', 409, publicState(state))
  scheduleSrs(topicId, lessonId, context)
  const streak = recordMasteryEvent(context.localDate)
  updateMistakesAfterResult(topicId, lessonId, true, [])
  run('UPDATE topics SET last_active_at = ? WHERE id = ?', context.now, topicId)
  return { completed: true, requiresArtifact: lesson.artifact_required === 1, completedAt: context.now, streak }
}

export function completeActivitySessionIfEligible(topicId, lessonId, context) {
  const scopedTopicId = positiveId(topicId, 'topicId')
  const scopedLessonId = positiveId(lessonId, 'lessonId')
  return transaction(() => completionInner(scopedTopicId, scopedLessonId, completionContext(context)))()
}

export function startActivitySession(topicId, lessonId) {
  const scopedTopicId = positiveId(topicId, 'topicId')
  const scopedLessonId = positiveId(lessonId, 'lessonId')
  return transaction(() => {
    const lesson = lessonRow(scopedTopicId, scopedLessonId)
    checkPrerequisiteAccess(scopedTopicId, scopedLessonId)
    const document = activityDocument(lesson)
    const progress = ensureProgressRowInner(scopedTopicId, scopedLessonId)
    if (progress.state === STATES.PASSED) {
      const state = validateStoredState(progress.activity_state, document, new Date().toISOString())
      assertStateMatchesProgress(progress, document, state)
      return { activityState: publicState(state), activityProgress: progressSummary(document, state), session: sessionStatus(lesson, progress) }
    }
    if (![STATES.NOT_STARTED, STATES.PRACTICING].includes(progress.state)) throw fail('Stored Session state is invalid.', 'ACTIVITY_STATE_INVALID', 409)
    const now = new Date().toISOString()
    const state = validateStoredState(progress.activity_state, document, now)
    if (progress.state === STATES.PRACTICING) assertStateMatchesProgress(progress, document, state)
    if (progress.state === STATES.NOT_STARTED) {
      const current = state.currentBlockId ? document.blocks.find((block) => block.id === state.currentBlockId) : null
      if (current) state.blocks[current.id] = { status: 'active', attempts: 0, updatedAt: now }
      state.updatedAt = now
      run(
        'UPDATE progress SET state = ?, started_at = COALESCE(started_at, ?), activity_state = ? WHERE id = ?',
        STATES.PRACTICING, now, JSON.stringify(state), progress.id,
      )
    }
    return { activityState: publicState(state), activityProgress: progressSummary(document, state), session: sessionStatus(lesson, { ...progress, state: STATES.PRACTICING }) }
  })()
}

export function getActivityState(topicId, lessonId) {
  const scopedTopicId = positiveId(topicId, 'topicId')
  const scopedLessonId = positiveId(lessonId, 'lessonId')
  const lesson = lessonRow(scopedTopicId, scopedLessonId)
  const document = activityDocument(lesson)
  const progress = get('SELECT * FROM progress WHERE topic_id = ? AND lesson_id = ?', scopedTopicId, scopedLessonId)
  const state = validateStoredState(progress?.activity_state || '{}', document, new Date().toISOString())
  if (progress) assertStateMatchesProgress(progress, document, state)
  return publicState(state)
}

export function getActivityProgress(topicId, lessonId) {
  const scopedTopicId = positiveId(topicId, 'topicId')
  const scopedLessonId = positiveId(lessonId, 'lessonId')
  const lesson = lessonRow(scopedTopicId, scopedLessonId)
  const document = activityDocument(lesson)
  const progress = get('SELECT * FROM progress WHERE topic_id = ? AND lesson_id = ?', scopedTopicId, scopedLessonId)
  const state = validateStoredState(progress?.activity_state || '{}', document, new Date().toISOString())
  if (progress) assertStateMatchesProgress(progress, document, state)
  return progressSummary(document, state)
}

function canonicalizeResponse(block, response) {
  if (block.type === 'choice') {
    if (typeof response !== 'string' || !block.options.some((option) => option.id === response)) throw fail('Choose one of the available options.', 'ACTIVITY_RESPONSE_INVALID', 400)
    return response
  }
  if (block.type === 'ordering') {
    if (!Array.isArray(response) || response.length !== block.items.length || new Set(response).size !== block.items.length || response.some((id) => !block.items.some((item) => item.id === id))) {
      throw fail('Response must order every item exactly once.', 'ACTIVITY_RESPONSE_INVALID', 400)
    }
    return [...response]
  }
  if (block.type === 'short_answer' || block.type === 'reflection') {
    const min = block.type === 'short_answer' ? block.minChars : 1
    if (typeof response !== 'string' || response.trim().length < min || response.length > block.maxChars) throw fail('Response is empty or exceeds the allowed length.', 'ACTIVITY_RESPONSE_INVALID', 400)
    return response.trim()
  }
  if (response !== undefined && response !== null && response !== '') throw fail('This block does not accept a response.', 'ACTIVITY_RESPONSE_INVALID', 400)
  return undefined
}

function storedResponseMatches(entry, response) {
  return JSON.stringify(entry.response ?? null) === JSON.stringify(response ?? null)
}

function idempotentOrConflict(block, entry, response, state, document, lesson, progress) {
  if (isFinal(block, entry) || entry?.status === 'needs_retry') {
    if (storedResponseMatches(entry, response)) return storedResult(block, entry, state, document, lesson, progress)
    if (isFinal(block, entry)) conflict('This block is already final with a different response.', 'BLOCK_ALREADY_FINAL', state)
    return null
  }
  return null
}

function updateAfterMutation(progress, lesson, document, state, block, entry, context) {
  state.updatedAt = context.now
  entry.updatedAt = context.now
  state.blocks[block.id] = entry
  if (block.required && isFinal(block, entry)) activateNextRequired(document, state, context.now)
  let completion = { completed: false, requiresArtifact: lesson.artifact_required === 1 }
  if (state.currentBlockId && !state.blocks[state.currentBlockId]) state.blocks[state.currentBlockId] = { status: 'active', attempts: 0, updatedAt: context.now }
  writeState(progress.id, state, lesson.id, progress.topic_id, STATES.PRACTICING)
  if (document.blocks.filter((item) => item.required).every((item) => isFinal(item, state.blocks[item.id]))) {
    completion = completionInner(progress.topic_id, lesson.id, context, { lesson, document, state })
  }
  return completion
}

export function completeInformationalBlock(input) {
  const topicId = positiveId(input?.topicId, 'topicId')
  const lessonId = positiveId(input?.lessonId, 'lessonId')
  const blockId = input?.blockId
  const context = completionContext(input)
  return transaction(() => {
    const { lesson, document, progress, state, block } = assertActiveBlock(topicId, lessonId, blockId)
    if (!['read', 'worked_example', 'reflection'].includes(block.type)) throw fail('Only informational blocks can be continued.', 'ACTIVITY_BLOCK_TYPE_INVALID', 400, publicState(state))
    if (input.action !== 'continue') throw fail('Action must be continue.', 'ACTIVITY_ACTION_INVALID', 400, publicState(state))
    const response = canonicalizeResponse(block, input.response)
    const prior = state.blocks[block.id]
    const priorResult = idempotentOrConflict(block, prior, response, state, document, lesson, progress)
    if (priorResult) return priorResult
    if (progress.state === STATES.PASSED) conflict('This Session is already complete.', 'SESSION_ALREADY_COMPLETED', state)
    if (!blockUnlocked(block, state)) {
      const isFuture = block.required && document.blocks.findIndex((item) => item.id === block.id) > document.blocks.findIndex((item) => item.id === state.currentBlockId)
      conflict(isFuture ? 'This activity block is still locked.' : 'Activity state changed; reload the latest state.', isFuture ? 'ACTIVITY_BLOCK_LOCKED' : 'ACTIVITY_STATE_CONFLICT', state)
    }
    const entry = { status: 'completed', attempts: (prior?.attempts || 0) + 1, updatedAt: context.now, completedAt: context.now }
    if (response !== undefined) entry.response = response
    if (block.type === 'reflection' && typeof input.feedback === 'string') entry.feedback = input.feedback.slice(0, 1500)
    const completion = updateAfterMutation(progress, lesson, document, state, block, entry, context)
    return { status: 'completed', activityState: publicState(state), activityProgress: progressSummary(document, state), session: sessionStatus(lesson, { ...progress, state: completion.completed ? STATES.PASSED : STATES.PRACTICING }, completion), completion }
  })()
}

export function submitObjectiveBlock(input) {
  const topicId = positiveId(input?.topicId, 'topicId')
  const lessonId = positiveId(input?.lessonId, 'lessonId')
  const blockId = input?.blockId
  const context = completionContext(input)
  return transaction(() => {
    const { lesson, document, progress, state, block } = assertActiveBlock(topicId, lessonId, blockId)
    if (!OBJECTIVE_TYPES.has(block.type)) throw fail('This block does not accept a scored submission.', 'ACTIVITY_BLOCK_TYPE_INVALID', 400, publicState(state))
    const response = canonicalizeResponse(block, input.response)
    const prior = state.blocks[block.id]
    const priorResult = idempotentOrConflict(block, prior, response, state, document, lesson, progress)
    if (priorResult) return priorResult
    if (progress.state === STATES.PASSED) conflict('This Session is already complete.', 'SESSION_ALREADY_COMPLETED', state)
    if (!blockUnlocked(block, state)) {
      const isFuture = block.required && document.blocks.findIndex((item) => item.id === block.id) > document.blocks.findIndex((item) => item.id === state.currentBlockId)
      conflict(isFuture ? 'This activity block is still locked.' : 'Activity state changed; reload the latest state.', isFuture ? 'ACTIVITY_BLOCK_LOCKED' : 'ACTIVITY_STATE_CONFLICT', state)
    }
    const answer = document.answerKey[block.id]
    const correct = block.type === 'choice'
      ? response === answer.correctOptionId
      : JSON.stringify(response) === JSON.stringify(answer.correctOrder)
    const status = correct ? 'passed' : 'needs_retry'
    const feedback = answer.explanation
    const entry = { status, attempts: (prior?.attempts || 0) + 1, response, feedback, updatedAt: context.now }
    if (correct) entry.completedAt = context.now
    state.blocks[block.id] = entry
    if (!correct) updateMistakesAfterResult(topicId, lessonId, false, [mistakeDescription(lesson, block)])
    const completion = updateAfterMutation(progress, lesson, document, state, block, entry, context)
    return { correct, status, feedback, activityState: publicState(state), activityProgress: progressSummary(document, state), session: sessionStatus(lesson, { ...progress, state: completion.completed ? STATES.PASSED : STATES.PRACTICING }, completion), completion }
  })()
}

function normalizeWrittenEvaluation(rubricCriteria, evaluation) {
  if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation) || !Array.isArray(evaluation.criteria)) {
    throw fail('Written evaluation is invalid.', 'WRITTEN_EVALUATION_INVALID', 502)
  }
  if (Object.keys(evaluation).some((key) => !['criteria', 'feedback', 'nextStep'].includes(key))) {
    throw fail('Written evaluation contains unsupported fields.', 'WRITTEN_EVALUATION_INVALID', 502)
  }
  const expected = new Map(rubricCriteria.map((criterion) => [criterion.id, criterion]))
  if (evaluation.criteria.length !== expected.size) throw fail('Written evaluation criteria do not match the rubric.', 'WRITTEN_EVALUATION_INVALID', 502)
  const results = new Map()
  for (const result of evaluation.criteria) {
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).some((key) => !['id', 'passed', 'feedback'].includes(key))
      || typeof result.id !== 'string' || !expected.has(result.id) || results.has(result.id)
      || typeof result.passed !== 'boolean' || !safeFeedback(result.feedback, 500)) {
      throw fail('Written evaluation criterion is invalid.', 'WRITTEN_EVALUATION_INVALID', 502)
    }
    results.set(result.id, { id: result.id, passed: result.passed, feedback: result.feedback.trim() })
  }
  if (results.size !== expected.size || !safeFeedback(evaluation.feedback, 1000) || !safeFeedback(evaluation.nextStep, 500)) {
    throw fail('Written evaluation feedback is invalid.', 'WRITTEN_EVALUATION_INVALID', 502)
  }
  const criteria = [...expected.values()].map((criterion) => results.get(criterion.id))
  const passedCount = criteria.filter((criterion) => criterion.passed).length
  const criticalPassed = [...expected.values()].every((criterion) => !criterion.critical || results.get(criterion.id).passed)
  const failedCriterion = [...expected.values()].find((criterion) => !results.get(criterion.id).passed)?.label ?? null
  return {
    passed: criticalPassed && passedCount / expected.size >= 0.7,
    feedback: evaluation.feedback.trim(),
    nextStep: evaluation.nextStep.trim(),
    criteria,
    failedCriterion,
  }
}

export function recordWrittenEvaluation(input) {
  const topicId = positiveId(input?.topicId, 'topicId')
  const lessonId = positiveId(input?.lessonId, 'lessonId')
  const blockId = input?.blockId
  const context = completionContext(input)
  return transaction(() => {
    const { lesson, document, progress, state, block } = assertActiveBlock(topicId, lessonId, blockId)
    if (block.type !== 'short_answer') throw fail('Only short-answer blocks accept written evaluations.', 'ACTIVITY_BLOCK_TYPE_INVALID', 400, publicState(state))
    const response = canonicalizeResponse(block, input.response)
    const prior = state.blocks[block.id]
    const priorResult = idempotentOrConflict(block, prior, response, state, document, lesson, progress)
    if (priorResult) return priorResult
    if (progress.state === STATES.PASSED) conflict('This Session is already complete.', 'SESSION_ALREADY_COMPLETED', state)
    if (!blockUnlocked(block, state)) conflict('This activity block is still locked.', 'ACTIVITY_BLOCK_LOCKED', state)
    const normalized = normalizeWrittenEvaluation(document.answerKey[block.id].criteria, input.evaluation)
    const status = normalized.passed ? 'passed' : 'needs_retry'
    const entry = { status, attempts: (prior?.attempts || 0) + 1, response, feedback: normalized.feedback, criteria: normalized.criteria, nextStep: normalized.nextStep, updatedAt: context.now }
    if (normalized.passed) entry.completedAt = context.now
    state.blocks[block.id] = entry
    if (!normalized.passed) updateMistakesAfterResult(topicId, lessonId, false, [mistakeDescription(lesson, block, normalized.failedCriterion)])
    const completion = updateAfterMutation(progress, lesson, document, state, block, entry, context)
    return { correct: normalized.passed, status, feedback: normalized.feedback, nextStep: normalized.nextStep, criteria: normalized.criteria, activityState: publicState(state), activityProgress: progressSummary(document, state), session: sessionStatus(lesson, { ...progress, state: completion.completed ? STATES.PASSED : STATES.PRACTICING }, completion), completion }
  })()
}
