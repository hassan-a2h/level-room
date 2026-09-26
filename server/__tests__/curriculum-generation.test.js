import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GENERATION_DEADLINE_MS,
} from '../utils/curriculum-generation-policy.js'

const recoveryMocks = vi.hoisted(() => ({
  completeCurriculumGeneration: vi.fn(),
  failCurriculumGeneration: vi.fn(),
}))

vi.mock('../db.js', () => ({
  get: vi.fn(),
  run: vi.fn(),
  all: vi.fn(() => []),
  transaction: vi.fn((callback) => callback),
}))

vi.mock('../utils/curriculum-recovery.js', () => ({
  CurriculumGenerationError: class CurriculumGenerationError extends Error {
    constructor(message, code, status = 409) {
      super(message)
      this.code = code
      this.status = status
    }
  },
  completeCurriculumGeneration: recoveryMocks.completeCurriculumGeneration,
  failCurriculumGeneration: recoveryMocks.failCurriculumGeneration,
  isGenerationStale: (startedAt, now = Date.now()) => {
    const timestamp = Date.parse(startedAt || '')
    return !Number.isFinite(timestamp) || now - timestamp >= 15 * 60 * 1000
  },
}))

const { createCurriculumGenerationService } = await import('../utils/curriculum-generation.js')

const curriculum = { modules: [{ title: 'Basics', lessons: [] }] }

function makeStorage({ now = Date.parse('2026-09-22T00:00:00.000Z') } = {}) {
  const jobs = new Map()
  const topics = new Map([[1, { id: 1, title: 'React', level: 'Beginner', time_per_week: '30 min/day' }]])
  const storage = {
    jobs,
    topics,
    completedTransitions: 0,
    getTopic: vi.fn((topicId) => topics.get(Number(topicId)) || null),
    getJob: vi.fn((jobId) => jobs.get(jobId) || null),
    getActiveJob: vi.fn((topicId) => [...jobs.values()].find((job) => Number(job.topic_id) === Number(topicId) && ['queued', 'running', 'retrying'].includes(job.state)) || null),
    getLatestJob: vi.fn((topicId) => [...jobs.values()].filter((job) => Number(job.topic_id) === Number(topicId)).at(-1) || null),
    enqueue: vi.fn((topic, config, createdAt, id) => {
      const job = {
        id,
        topic_id: topic.id,
        state: 'queued',
        attempt: 0,
        max_attempts: 3,
        provider: config.provider,
        model: config.model,
        reasoning_effort: config.reasoningEffort,
        next_attempt_at: new Date(createdAt).toISOString(),
        deadline_at: new Date(createdAt + GENERATION_DEADLINE_MS).toISOString(),
        created_at: new Date(createdAt).toISOString(),
        updated_at: new Date(createdAt).toISOString(),
      }
      jobs.set(id, job)
      return job
    }),
    claimJob: vi.fn((jobId, _current, leaseOwner) => {
      const job = jobs.get(jobId)
      if (!job || !['queued', 'retrying'].includes(job.state)) return null
      if (Date.parse(job.deadline_at) <= now) return { ...job, deadlineReached: true }
      job.state = 'running'
      job.attempt += 1
      job.lease_owner = leaseOwner
      return job
    }),
    renewJob: vi.fn((jobId, leaseOwner) => {
      const job = jobs.get(jobId)
      if (job?.state === 'running' && job.lease_owner === leaseOwner) job.renewed = true
    }),
    markRetry: vi.fn((jobId, error, nextAttemptAt, _leaseOwner, updatedAt) => {
      const job = jobs.get(jobId)
      if (job?.lease_owner !== _leaseOwner || job.state !== 'running') return
      job.state = 'retrying'
      job.lease_owner = null
      job.next_attempt_at = new Date(nextAttemptAt).toISOString()
      job.updated_at = new Date(updatedAt).toISOString()
      job.error_code = error.code
      job.error_message = error.message
    }),
    markCompleted: vi.fn((jobId, _topicId, _curriculum, leaseOwner) => {
      const job = jobs.get(jobId)
      if (job?.state !== 'running' || job.lease_owner !== leaseOwner) return
      job.state = 'completed'
      job.lease_owner = null
      storage.completedTransitions += 1
    }),
    markFailed: vi.fn((jobId, _topicId, error, leaseOwner) => {
      const job = jobs.get(jobId)
      if (job?.state !== 'running' || job.lease_owner !== leaseOwner) return
      job.state = 'failed'
      job.lease_owner = null
      job.error_code = error.code
      job.error_message = error.message
    }),
    recoverPending: vi.fn(() => []),
  }
  return storage
}

function makeService({ storage, generate, now = () => Date.parse('2026-09-22T00:00:00.000Z') } = {}) {
  const scheduled = []
  const logger = { info: vi.fn(), error: vi.fn() }
  const service = createCurriculumGenerationService({
    storage,
    generate,
    requireConfig: () => ({ provider: 'openai', model: 'gpt-4o', reasoningEffort: 'none' }),
    now,
    random: () => 0,
    schedule: (callback, delay) => {
      scheduled.push({ callback, delay })
      return scheduled.length
    },
    cancelSchedule: vi.fn(),
    logger,
  })
  return { service, scheduled, logger }
}

function seedJob(storage) {
  return storage.enqueue(
    storage.topics.get(1),
    { provider: 'openai', model: 'gpt-4o', reasoningEffort: 'none' },
    Date.parse('2026-09-22T00:00:00.000Z'),
    'job-1',
  )
}

describe('curriculum generation service', () => {
  beforeEach(() => {
    recoveryMocks.completeCurriculumGeneration.mockReset()
    recoveryMocks.failCurriculumGeneration.mockReset()
  })

  it('retries transient failures and persists only the successful validated result', async () => {
    const storage = makeStorage()
    const generate = vi.fn()
      .mockRejectedValueOnce({ code: 'PROVIDER_UNAVAILABLE', message: 'Try again', retryable: true })
      .mockResolvedValueOnce(curriculum)
    const { service, scheduled } = makeService({ storage, generate })

    const started = seedJob(storage)
    expect(started.state).toBe('queued')
    await service.runJob(started.id)
    expect(storage.markRetry).toHaveBeenCalledOnce()
    expect(storage.jobs.get(started.id).state).toBe('retrying')
    expect(scheduled.map((entry) => entry.delay)).toContain(1000)

    await service.runJob(started.id)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(storage.markCompleted).toHaveBeenCalledWith(started.id, 1, curriculum, expect.any(String), expect.any(Number))
    expect(storage.jobs.get(started.id).state).toBe('completed')
    expect(storage.markFailed).not.toHaveBeenCalled()
  })

  it('does not retry non-retryable failures', async () => {
    const storage = makeStorage()
    const generate = vi.fn().mockRejectedValue({ code: 'MISSING_API_KEY', message: 'Configure a provider.', retryable: false })
    const { service, scheduled } = makeService({ storage, generate })

    const started = seedJob(storage)
    await service.runJob(started.id)

    expect(storage.markFailed).toHaveBeenCalledWith(started.id, 1, expect.objectContaining({ code: 'MISSING_API_KEY' }), expect.any(String), expect.any(Number))
    expect(storage.markRetry).not.toHaveBeenCalled()
    expect(scheduled.map((entry) => entry.delay)).toContain(480000)
  })

  it('keeps a fresh legacy generation claim idempotent and resumes stale claims', () => {
    const storage = makeStorage()
    storage.topics.get(1).curriculum_state = 'generating'
    storage.topics.get(1).curriculum_generation_started_at = new Date().toISOString()
    const { service } = makeService({ storage, generate: vi.fn() })

    expect(() => service.enqueue(1)).toThrow(/already in progress/i)

    storage.topics.get(1).curriculum_generation_started_at = '2000-01-01T00:00:00.000Z'
    expect(service.enqueue(1)).toMatchObject({ state: 'queued', topicId: 1 })
  })

  it('returns the existing active job for duplicate starts', () => {
    const storage = makeStorage()
    const { service } = makeService({ storage, generate: vi.fn() })

    const first = service.enqueue(1)
    const second = service.enqueue(1)

    expect(second.id).toBe(first.id)
    expect(storage.enqueue).toHaveBeenCalledTimes(1)
  })

  it('publishes an initial snapshot and terminal status to subscribers', async () => {
    const storage = makeStorage()
    const { service } = makeService({ storage, generate: vi.fn().mockResolvedValue(curriculum) })
    const started = service.enqueue(1)
    const states = []
    service.subscribe(started.id, (status) => states.push(status.state))

    await service.runJob(started.id)

    expect(states).toEqual(['queued', 'running', 'completed'])
  })

  it('renews the lease while the provider yields progress', async () => {
    const storage = makeStorage()
    const generate = vi.fn(async ({ onProgress }) => {
      onProgress()
      return curriculum
    })
    const { service } = makeService({ storage, generate })
    const started = seedJob(storage)

    await service.runJob(started.id)

    expect(storage.renewJob).toHaveBeenCalledWith(started.id, expect.any(String), expect.any(Number))
  })

  it('does not persist a late result after an attempt timeout', async () => {
    const storage = makeStorage()
    const generate = vi.fn(async () => {
      const timeout = scheduled.find((entry) => entry.delay === 480000)
      timeout.callback()
      return curriculum
    })
    const { service, scheduled } = makeService({ storage, generate })
    const started = seedJob(storage)

    await service.runJob(started.id)

    expect(storage.markCompleted).not.toHaveBeenCalled()
    expect(storage.markRetry).toHaveBeenCalledOnce()
  })

  it('rejects a result that arrives after the absolute deadline', async () => {
    const storage = makeStorage()
    let clock = Date.parse('2026-09-22T00:00:00.000Z')
    const generate = vi.fn(async () => {
      clock += GENERATION_DEADLINE_MS + 1
      return curriculum
    })
    const { service } = makeService({ storage, generate, now: () => clock })
    const started = seedJob(storage)

    await service.runJob(started.id)

    expect(storage.markCompleted).not.toHaveBeenCalled()
    expect(storage.markFailed).toHaveBeenCalledWith(started.id, 1, expect.objectContaining({ code: 'GENERATION_DEADLINE' }), expect.any(String), expect.any(Number))
  })

  it('prevents a stale worker from overwriting a job reclaimed after restart', async () => {
    const storage = makeStorage()
    const started = seedJob(storage)
    let releaseFirst
    let firstStarted
    const firstStartedPromise = new Promise((resolve) => { firstStarted = resolve })
    const firstGenerate = vi.fn(async () => {
      firstStarted()
      return new Promise((resolve) => { releaseFirst = resolve })
    })
    const first = makeService({ storage, generate: firstGenerate }).service
    const firstRun = first.runJob(started.id)
    await firstStartedPromise

    storage.jobs.get(started.id).state = 'queued'
    storage.jobs.get(started.id).lease_owner = null
    const second = makeService({ storage, generate: vi.fn().mockResolvedValue(curriculum) }).service
    await second.runJob(started.id)
    expect(storage.jobs.get(started.id).state).toBe('completed')

    releaseFirst(curriculum)
    await firstRun
    expect(storage.jobs.get(started.id).state).toBe('completed')
    expect(storage.completedTransitions).toBe(1)
  })
})
