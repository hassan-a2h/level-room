import { randomUUID } from 'crypto'
import { get, run, transaction } from '../db.js'

export const CURRICULUM_GENERATION_STALE_MS = 15 * 60 * 1000

export class CurriculumGenerationError extends Error {
  constructor(message, code, status = 409) {
    super(message)
    this.name = 'CurriculumGenerationError'
    this.code = code
    this.status = status
  }
}

export function isGenerationStale(startedAt, now = Date.now()) {
  if (!startedAt) return true
  const timestamp = Date.parse(startedAt)
  return !Number.isFinite(timestamp) || now - timestamp >= CURRICULUM_GENERATION_STALE_MS
}

export function claimCurriculumGeneration(topicId) {
  const token = randomUUID()
  const startedAt = new Date().toISOString()
  const update = transaction(() => {
    const topic = get(
      'SELECT curriculum_state, curriculum_generation_started_at FROM topics WHERE id = ?',
      Number(topicId),
    )
    if (!topic) throw new CurriculumGenerationError('Topic not found.', 'TOPIC_NOT_FOUND', 404)

    if (topic.curriculum_state === 'generating' && !isGenerationStale(topic.curriculum_generation_started_at)) {
      throw new CurriculumGenerationError('Roadmap generation is already in progress.', 'CURRICULUM_GENERATION_IN_PROGRESS')
    }

    return run(
      `UPDATE topics
       SET curriculum_state = 'generating', curriculum_error = NULL,
           curriculum_generation_started_at = ?, curriculum_generation_token = ?
       WHERE id = ?`,
      startedAt,
      token,
      Number(topicId),
    )
  })()
  if (!update || update.changes !== 1) {
    throw new CurriculumGenerationError('Roadmap generation could not be started. Please retry.', 'CURRICULUM_GENERATION_CLAIM_FAILED')
  }
  return { token, startedAt }
}

export function completeCurriculumGeneration(topicId, token, curriculum) {
  const update = transaction(() => run(
    `UPDATE topics
     SET curriculum_state = 'draft_ready', curriculum_draft = ?, curriculum_error = NULL,
         curriculum_generation_started_at = NULL, curriculum_generation_token = NULL
     WHERE id = ? AND curriculum_generation_token = ?`,
    JSON.stringify(curriculum),
    Number(topicId),
    token,
  ))()
  if (!update || update.changes !== 1) {
    throw new CurriculumGenerationError('This roadmap generation was superseded. Please reload and retry.', 'CURRICULUM_GENERATION_SUPERSEDED')
  }
}

export function failCurriculumGeneration(topicId, token, error) {
  const message = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim().slice(0, 500)
    : 'Roadmap generation did not complete. Please retry.'
  run(
    `UPDATE topics
     SET curriculum_state = 'failed', curriculum_error = ?,
         curriculum_generation_started_at = NULL, curriculum_generation_token = NULL
     WHERE id = ? AND curriculum_generation_token = ?`,
    message,
    Number(topicId),
    token,
  )
}

export function parseCurriculumDraft(value) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function getCurriculumRecovery(topicId) {
  const topic = get(
    `SELECT id, title, level, time_per_week, curriculum_state, curriculum_draft,
            curriculum_error, curriculum_generation_started_at
     FROM topics WHERE id = ?`,
    Number(topicId),
  )
  if (!topic) throw new CurriculumGenerationError('Topic not found.', 'TOPIC_NOT_FOUND', 404)

  const stale = topic.curriculum_state === 'generating' && isGenerationStale(topic.curriculum_generation_started_at)
  const resumeAvailable = ['setup', 'ready_to_generate', 'failed', 'draft_ready'].includes(topic.curriculum_state) || stale
  return {
    topic: {
      id: topic.id,
      title: topic.title,
      level: topic.level || null,
      timeCommitment: topic.time_per_week || null,
    },
    curriculumState: topic.curriculum_state || 'setup',
    curriculum: parseCurriculumDraft(topic.curriculum_draft),
    curriculumError: topic.curriculum_error || null,
    generationStartedAt: topic.curriculum_generation_started_at || null,
    stale,
    resumeAvailable,
  }
}
