import { randomUUID } from 'crypto'
import { get, run, all, transaction } from '../db.js'
import {
  CurriculumGenerationError,
  isGenerationStale,
} from './curriculum-recovery.js'
import {
  GENERATION_ATTEMPT_TIMEOUT_MS,
  GENERATION_DEADLINE_MS,
  GENERATION_LEASE_MS,
  GENERATION_MAX_ATTEMPTS,
  isRetryableGenerationError,
  retryDelayMs,
} from './curriculum-generation-policy.js'

const ACTIVE_STATES = new Set(['queued', 'running', 'retrying'])
const TERMINAL_STATES = new Set(['completed', 'failed'])

function iso(date) {
  return new Date(date).toISOString()
}

function parseTime(value) {
  const time = Date.parse(value || '')
  return Number.isFinite(time) ? time : null
}

function sanitizedError(error) {
  return {
    code: typeof error?.code === 'string' && error.code ? error.code : 'CURRICULUM_GENERATION_FAILED',
    message: typeof error?.message === 'string' && error.message.trim()
      ? error.message.trim().slice(0, 500)
      : 'Roadmap generation did not complete. Please retry.',
  }
}

function serializeJob(row) {
  if (!row) return null
  return {
    id: row.id,
    topicId: Number(row.topic_id),
    state: row.state,
    attempt: Number(row.attempt || 0),
    maxAttempts: Number(row.max_attempts || GENERATION_MAX_ATTEMPTS),
    provider: row.provider || null,
    model: row.model || null,
    reasoningEffort: row.reasoning_effort || null,
    nextAttemptAt: row.next_attempt_at || null,
    deadlineAt: row.deadline_at || null,
    errorCode: row.error_code || null,
    error: row.error_message || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function createDbStorage() {
  return {
    getTopic(topicId) {
      return get(
        `SELECT id, title, level, time_per_week, curriculum_state,
                curriculum_generation_started_at, curriculum_generation_token
         FROM topics WHERE id = ?`,
        Number(topicId),
      )
    },

    getJob(jobId) {
      return get('SELECT * FROM curriculum_generation_jobs WHERE id = ?', jobId)
    },

    getActiveJob(topicId) {
      return get(
        `SELECT * FROM curriculum_generation_jobs
         WHERE topic_id = ? AND state IN ('queued', 'running', 'retrying')
         ORDER BY created_at DESC LIMIT 1`,
        Number(topicId),
      )
    },

    getLatestJob(topicId) {
      return get(
        'SELECT * FROM curriculum_generation_jobs WHERE topic_id = ? ORDER BY created_at DESC LIMIT 1',
        Number(topicId),
      )
    },

    enqueue(topic, config, now, jobId) {
      const createdAt = iso(now)
      const deadlineAt = iso(now + GENERATION_DEADLINE_MS)
      return transaction(() => {
        const active = this.getActiveJob(topic.id)
        if (active) return active

        run(
          `INSERT INTO curriculum_generation_jobs
           (id, topic_id, state, attempt, max_attempts, provider, model, reasoning_effort,
            next_attempt_at, deadline_at, created_at, updated_at)
           VALUES (?, ?, 'queued', 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
          jobId,
          Number(topic.id),
          GENERATION_MAX_ATTEMPTS,
          config.provider,
          config.model,
          config.reasoningEffort,
          createdAt,
          deadlineAt,
          createdAt,
          createdAt,
        )
        run(
          `UPDATE topics
           SET curriculum_state = 'generating', curriculum_error = NULL,
               curriculum_generation_started_at = ?, curriculum_generation_token = ?
           WHERE id = ?`,
          createdAt,
          jobId,
          Number(topic.id),
        )
        return this.getJob(jobId)
      })()
    },

    claimJob(jobId, now, leaseOwner) {
      const nowIso = iso(now)
      const lease = iso(now + GENERATION_LEASE_MS)
      return transaction(() => {
        const job = this.getJob(jobId)
        if (!job || !['queued', 'retrying'].includes(job.state)) return null
        const nextAttempt = parseTime(job.next_attempt_at)
        if (nextAttempt !== null && nextAttempt > now) return null
        const deadlineReached = parseTime(job.deadline_at) !== null && parseTime(job.deadline_at) <= now
        const updated = run(
          `UPDATE curriculum_generation_jobs
           SET state = 'running', attempt = attempt + 1,
               lease_owner = ?, lease_expires_at = ?, updated_at = ?, error_code = NULL, error_message = NULL
           WHERE id = ? AND state IN ('queued', 'retrying')`,
          leaseOwner,
          lease,
          nowIso,
          jobId,
        )
        if (updated.changes !== 1) return null
        const claimed = this.getJob(jobId)
        return deadlineReached ? { ...claimed, deadlineReached: true } : claimed
      })()
    },

    renewJob(jobId, leaseOwner, now) {
      run(
        `UPDATE curriculum_generation_jobs SET lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND state = 'running' AND lease_owner = ?`,
        iso(now + GENERATION_LEASE_MS),
        iso(now),
        jobId,
        leaseOwner,
      )
    },

    markRetry(jobId, error, nextAttemptAt, leaseOwner, now) {
      const detail = sanitizedError(error)
      run(
        `UPDATE curriculum_generation_jobs
         SET state = 'retrying', lease_owner = NULL, lease_expires_at = NULL, next_attempt_at = ?,
             error_code = ?, error_message = ?, updated_at = ?
         WHERE id = ? AND state = 'running' AND lease_owner = ?`,
        iso(nextAttemptAt), detail.code, detail.message, iso(now), jobId,
        leaseOwner,
      )
    },

    markCompleted(jobId, topicId, curriculum, leaseOwner, now) {
      transaction(() => {
        const topicUpdate = run(
          `UPDATE topics
           SET curriculum_state = 'draft_ready', curriculum_draft = ?, curriculum_error = NULL,
               curriculum_generation_started_at = NULL, curriculum_generation_token = NULL
           WHERE id = ? AND curriculum_generation_token = ?
             AND EXISTS (
               SELECT 1 FROM curriculum_generation_jobs
               WHERE id = ? AND state = 'running' AND lease_owner = ?
             )`,
          JSON.stringify(curriculum), Number(topicId), jobId, jobId, leaseOwner,
        )
        if (topicUpdate.changes !== 1) {
          throw new CurriculumGenerationError('This roadmap generation was superseded. Please reload and retry.', 'CURRICULUM_GENERATION_SUPERSEDED')
        }
        const updated = run(
          `UPDATE curriculum_generation_jobs
           SET state = 'completed', lease_owner = NULL, lease_expires_at = NULL, next_attempt_at = NULL,
               error_code = NULL, error_message = NULL, updated_at = ?
           WHERE id = ? AND state = 'running' AND lease_owner = ?`,
          iso(now), jobId, leaseOwner,
        )
        if (updated.changes !== 1) {
          throw new CurriculumGenerationError('This roadmap generation was superseded. Please reload and retry.', 'CURRICULUM_GENERATION_SUPERSEDED')
        }
      })()
    },

    markFailed(jobId, topicId, error, leaseOwner, now) {
      const detail = sanitizedError(error)
      transaction(() => {
        const updated = run(
          `UPDATE curriculum_generation_jobs
           SET state = 'failed', lease_owner = NULL, lease_expires_at = NULL, next_attempt_at = NULL,
               error_code = ?, error_message = ?, updated_at = ?
           WHERE id = ? AND state = 'running' AND lease_owner = ?`,
          detail.code, detail.message, iso(now), jobId, leaseOwner,
        )
        if (updated.changes !== 1) return
        run(
          `UPDATE topics
           SET curriculum_state = 'failed', curriculum_error = ?,
               curriculum_generation_started_at = NULL, curriculum_generation_token = NULL
           WHERE id = ? AND curriculum_generation_token = ?`,
          detail.message, Number(topicId), jobId,
        )
      })()
    },

    recoverPending(now) {
      run(
        `UPDATE curriculum_generation_jobs
         SET state = 'queued', lease_owner = NULL, lease_expires_at = NULL, next_attempt_at = ?, updated_at = ?
         WHERE state = 'running'`,
        iso(now), iso(now),
      )
      return all(
        `SELECT id, next_attempt_at FROM curriculum_generation_jobs
         WHERE state IN ('queued', 'retrying')`,
      )
    },
  }
}

export function createCurriculumGenerationService({
  storage = createDbStorage(),
  generate,
  requireConfig,
  now = () => Date.now(),
  random = Math.random,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  logger = console,
} = {}) {
  if (typeof generate !== 'function') throw new TypeError('Curriculum generation service requires a generate function.')
  if (typeof requireConfig !== 'function') throw new TypeError('Curriculum generation service requires a config function.')

  const running = new Set()
  const timers = new Map()
  const subscribers = new Map()
  const workerId = randomUUID()

  function currentTime() {
    return Number(now())
  }

  function status(jobId) {
    return serializeJob(storage.getJob(jobId))
  }

  function publish(jobId) {
    const payload = status(jobId)
    if (!payload) return
    for (const callback of subscribers.get(jobId) || []) callback(payload)
  }

  function logTransition(job, state, error, durationMs) {
    logger.info?.({
      event: 'curriculum_generation_transition',
      jobId: job?.id,
      topicId: Number(job?.topic_id),
      provider: job?.provider || undefined,
      model: job?.model || undefined,
      attempt: Number(job?.attempt || 0),
      state,
      errorCode: error?.code,
      durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : undefined,
    })
  }

  function scheduleJob(jobId, delay = 0) {
    if (timers.has(jobId)) return
    const handle = schedule(() => {
      timers.delete(jobId)
      void runJob(jobId)
    }, Math.max(0, delay))
    timers.set(jobId, handle)
  }

  async function runJob(jobId) {
    if (running.has(jobId)) return
    running.add(jobId)
    let attemptTimer
    try {
      const beforeClaim = storage.getJob(jobId)
      if (!beforeClaim || TERMINAL_STATES.has(beforeClaim.state)) return
      const current = currentTime()
      const claimed = storage.claimJob(jobId, current, workerId)
      if (!claimed) {
        const latest = storage.getJob(jobId)
        if (latest && ['queued', 'retrying'].includes(latest.state)) {
          const next = parseTime(latest.next_attempt_at)
          scheduleJob(jobId, next === null ? 0 : Math.max(0, next - currentTime()))
        }
        return
      }

      const attemptStartedAt = currentTime()
      if (claimed.deadlineReached) {
        storage.markFailed(jobId, claimed.topic_id, { code: 'GENERATION_DEADLINE', message: 'Roadmap generation exceeded its time budget.', retryable: false }, workerId, currentTime())
        logTransition(claimed, 'failed', { code: 'GENERATION_DEADLINE' }, currentTime() - attemptStartedAt)
        publish(jobId)
        return
      }
      logTransition(claimed, 'running', undefined, 0)
      publish(jobId)

      const topic = storage.getTopic(claimed.topic_id)
      if (!topic?.level || !topic?.time_per_week) {
        storage.markFailed(jobId, claimed.topic_id, { code: 'PROFILE_INCOMPLETE', message: 'Learner profile is incomplete. Please answer setup questions first.', retryable: false }, workerId, currentTime())
        logTransition(claimed, 'failed', { code: 'PROFILE_INCOMPLETE' }, currentTime() - attemptStartedAt)
        publish(jobId)
        return
      }

      const config = requireConfig()
      const controller = new AbortController()
      let timedOut = false
      attemptTimer = schedule(() => {
        timedOut = true
        controller.abort(new Error('Curriculum generation attempt timed out.'))
      }, GENERATION_ATTEMPT_TIMEOUT_MS)

      try {
        const curriculum = await generate({ topic, config, signal: controller.signal, onProgress: () => storage.renewJob(jobId, workerId, currentTime()) })
        if (timedOut || controller.signal.aborted) {
          throw { code: 'LLM_TIMEOUT', message: 'Roadmap generation timed out. Please retry.', retryable: true }
        }
        const completedAt = currentTime()
        const deadline = parseTime(claimed.deadline_at)
        if (deadline !== null && completedAt >= deadline) {
          throw {
            code: 'GENERATION_DEADLINE',
            message: 'Roadmap generation exceeded its time budget.',
            retryable: false,
          }
        }
        storage.markCompleted(jobId, claimed.topic_id, curriculum, workerId, completedAt)
        logTransition(claimed, 'completed', undefined, completedAt - attemptStartedAt)
        publish(jobId)
      } catch (error) {
        const failure = timedOut
          ? { code: 'LLM_TIMEOUT', message: 'Roadmap generation timed out. Please retry.', retryable: true }
          : error
        const latest = storage.getJob(jobId) || claimed
        const deadline = parseTime(latest.deadline_at)
        if (isRetryableGenerationError(failure) && latest.attempt < latest.max_attempts && (deadline === null || deadline > currentTime())) {
          const delay = retryDelayMs(latest.attempt, random)
          storage.markRetry(jobId, failure, currentTime() + delay, workerId, currentTime())
          logTransition(claimed, 'retrying', failure, currentTime() - attemptStartedAt)
          publish(jobId)
          scheduleJob(jobId, delay)
        } else {
          storage.markFailed(jobId, claimed.topic_id, failure, workerId, currentTime())
          logTransition(claimed, 'failed', failure, currentTime() - attemptStartedAt)
          publish(jobId)
        }
      } finally {
        if (attemptTimer) cancelSchedule(attemptTimer)
      }
    } catch (error) {
      logger.error?.('Curriculum generation worker error:', error?.message || error)
      const job = storage.getJob(jobId)
      if (job && ACTIVE_STATES.has(job.state)) {
        storage.markFailed(jobId, job.topic_id, error, workerId, currentTime())
        publish(jobId)
      }
    } finally {
      running.delete(jobId)
    }
  }

  function enqueue(topicId) {
    const topic = storage.getTopic(topicId)
    if (!topic) throw new CurriculumGenerationError('Topic not found.', 'TOPIC_NOT_FOUND', 404)
    const active = storage.getActiveJob(topicId)
    if (active) {
      scheduleJob(active.id)
      return serializeJob(active)
    }
    if (topic.curriculum_state === 'generating' && !isGenerationStale(topic.curriculum_generation_started_at, currentTime())) {
      throw new CurriculumGenerationError('Roadmap generation is already in progress.', 'CURRICULUM_GENERATION_IN_PROGRESS')
    }
    const config = requireConfig()
    let job
    try {
      job = storage.enqueue(topic, config, currentTime(), randomUUID())
    } catch (error) {
      const concurrent = storage.getActiveJob(topicId)
      if (!concurrent) throw error
      job = concurrent
    }
    publish(job.id)
    scheduleJob(job.id)
    return serializeJob(job)
  }

  function getTopicStatus(topicId) {
    const job = storage.getActiveJob(topicId) || storage.getLatestJob(topicId)
    return serializeJob(job)
  }

  function subscribe(jobId, callback) {
    if (typeof callback !== 'function') return () => {}
    const listeners = subscribers.get(jobId) || new Set()
    listeners.add(callback)
    subscribers.set(jobId, listeners)
    const initial = status(jobId)
    if (initial) callback(initial)
    return () => {
      listeners.delete(callback)
      if (listeners.size === 0) subscribers.delete(jobId)
    }
  }

  function start() {
    for (const job of storage.recoverPending(currentTime())) {
      const next = parseTime(job.next_attempt_at)
      scheduleJob(job.id, next === null ? 0 : Math.max(0, next - currentTime()))
    }
  }

  return {
    enqueue,
    getStatus: status,
    getTopicStatus,
    runJob,
    start,
    subscribe,
  }
}
