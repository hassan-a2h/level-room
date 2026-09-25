import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'

const streamText = vi.fn()
const generateText = vi.fn()

const curriculumFixtures = vi.hoisted(() => ({
  normalize(draft) {
    return {
      ...draft,
      modules: draft.modules.map((module, moduleIndex) => {
        const knowledge = { id: `recovery-knowledge-${moduleIndex + 1}`, title: `Explain concept ${moduleIndex + 1}`, kind: 'knowledge', role: 'core', evidence: ['activity', 'checkpoint'] }
        const skill = { id: `recovery-skill-${moduleIndex + 1}`, title: `Apply concept ${moduleIndex + 1}`, kind: 'skill', role: 'core', evidence: ['activity', 'checkpoint', 'artifact'] }
        return {
          ...module,
          skill_outcomes: [knowledge, skill],
          lessons: module.lessons.map((lesson, lessonIndex) => {
            const requiresBuild = lessonIndex === module.lessons.length - 1
            const normalized = { ...lesson, outcomes: [lessonIndex === 0 ? knowledge : skill], artifact_required: requiresBuild }
            delete normalized.task_spec
            if (requiresBuild) normalized.task = lesson.task || lesson.task_spec
            else delete normalized.task
            return normalized
          }),
        }
      }),
    }
  },
}))

vi.mock('../llm/client.js', () => ({
  streamText,
  generateText,
  LlmClientError: class LlmClientError extends Error {},
}))

function tempDbPath() {
  return path.join(os.tmpdir(), `test-curriculum-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

function curriculum() {
  const task = {
    title: 'Local task',
    scenario: 'Use a local fixture.',
    goal: 'Verify the behavior.',
    constraints: ['Use test data only'],
    deliverables: ['Commands', 'Output'],
    success_criteria: ['It works', 'It repeats'],
    estimated_time: 15,
    primary_setup: { kind: 'local', description: 'Run locally.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
    free_fallback: { kind: 'no_software', description: 'Explain the expected result.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
    hints: [],
    safety_notes: [],
  }
  return curriculumFixtures.normalize({
    course: { kind: 'core', stage: 0 },
    modules: Array.from({ length: 3 }, (_, moduleIndex) => ({
      title: `Module ${moduleIndex + 1}`,
      lessons: Array.from({ length: 3 }, (_, lessonIndex) => ({
        title: `Lesson ${moduleIndex + 1}.${lessonIndex + 1}`,
        depth: 'Beginner',
        estimated_time: 15,
        outcomes: ['Apply the concept.'],
        prerequisites: [],
        task: { ...task, title: `Task ${moduleIndex + 1}.${lessonIndex + 1}` },
      })),
    })),
  })
}

function streamFor(value) {
  return Promise.resolve({
    textStream: (async function* () {
      yield JSON.stringify(value)
    })(),
  })
}

describe('curriculum recovery API', () => {
  let dbPath
  let dbModule
  let app
  let topicId

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    process.env.OPENAI_API_KEY = 'sk-test'
    vi.resetModules()
    streamText.mockReset()
    generateText.mockReset()
    streamText.mockImplementation(() => streamFor(curriculum()))
    dbModule = await import('../db.js')
    dbModule.initSchema()
    dbModule.run('INSERT INTO llm_settings (provider, model) VALUES (?, ?)', 'openai', 'gpt-4o')
    const topic = dbModule.run(
      "INSERT INTO topics (title, status, level, time_per_week, curriculum_state) VALUES (?, 'active', ?, ?, 'ready_to_generate')",
      'React', 'Beginner', '30 min/day',
    )
    topicId = Number(topic.lastInsertRowid)
    const { default: curriculumRouter } = await import('../routes/curriculum.js')
    app = express()
    app.use(express.json({ limit: '6mb' }))
    app.use('/api', curriculumRouter)
  })

  afterEach(() => {
    try { dbModule?.default?.close() } catch {}
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
    delete process.env.OPENAI_API_KEY
  })

  it('persists a validated draft before returning the generated stream', async () => {
    const response = await request(app)
      .post(`/api/topics/${topicId}/curriculum/generate`)
      .set('Accept', 'text/event-stream')

    expect(response.status).toBe(200)
    const state = dbModule.get('SELECT curriculum_state, curriculum_draft, curriculum_error FROM topics WHERE id = ?', topicId)
    expect(state.curriculum_state).toBe('draft_ready')
    expect(JSON.parse(state.curriculum_draft)).toEqual(curriculum())
    expect(state.curriculum_error).toBeNull()
  })

  it('exposes the saved draft through the recovery endpoint', async () => {
    await request(app).post(`/api/topics/${topicId}/curriculum/generate`)

    const response = await request(app).get(`/api/topics/${topicId}/curriculum/recovery`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      curriculumState: 'draft_ready',
      topic: { id: topicId, title: 'React', level: 'Beginner', timeCommitment: '30 min/day' },
      curriculum: curriculum(),
      resumeAvailable: true,
    })
  })

  it('marks a failed generation as recoverable', async () => {
    streamText.mockImplementation(() => streamFor({ modules: [] }))

    const response = await request(app).post(`/api/topics/${topicId}/curriculum/generate`)

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('INVALID_CURRICULUM')
    const state = dbModule.get('SELECT curriculum_state, curriculum_error FROM topics WHERE id = ?', topicId)
    expect(state.curriculum_state).toBe('failed')
    expect(state.curriculum_error).toMatch(/module|curriculum/i)
  })

  it('allows a stale generation claim to be resumed', async () => {
    dbModule.run(
      "UPDATE topics SET curriculum_state = 'generating', curriculum_generation_started_at = ?, curriculum_generation_token = ? WHERE id = ?",
      '2000-01-01T00:00:00.000Z', 'stale-token', topicId,
    )

    const response = await request(app).post(`/api/topics/${topicId}/curriculum/generate`)

    expect(response.status).toBe(200)
    expect(dbModule.get('SELECT curriculum_state, curriculum_generation_token FROM topics WHERE id = ?', topicId).curriculum_state).toBe('draft_ready')
    expect(dbModule.get('SELECT curriculum_generation_token FROM topics WHERE id = ?', topicId).curriculum_generation_token).not.toBe('stale-token')
  })

  it('rejects a fresh concurrent generation attempt', async () => {
    dbModule.run(
      "UPDATE topics SET curriculum_state = 'generating', curriculum_generation_started_at = ?, curriculum_generation_token = ? WHERE id = ?",
      new Date().toISOString(), 'active-token', topicId,
    )

    const response = await request(app).post(`/api/topics/${topicId}/curriculum/generate`)

    expect(response.status).toBe(409)
    expect(response.body.code).toBe('CURRICULUM_GENERATION_IN_PROGRESS')
  })

  it('confirms the saved draft and transitions the topic to confirmed', async () => {
    await request(app).post(`/api/topics/${topicId}/curriculum/generate`)
    const draft = JSON.parse(dbModule.get('SELECT curriculum_draft FROM topics WHERE id = ?', topicId).curriculum_draft)

    const response = await request(app)
      .post(`/api/topics/${topicId}/curriculum/confirm`)
      .send({ curriculum: draft })

    expect(response.status).toBe(200)
    expect(dbModule.get('SELECT curriculum_state, curriculum_draft FROM topics WHERE id = ?', topicId)).toMatchObject({
      curriculum_state: 'confirmed',
      curriculum_draft: null,
    })
    expect(dbModule.get('SELECT COUNT(*) AS count FROM modules WHERE topic_id = ?', topicId).count).toBe(3)
  })

  it('invalidates an unconfirmed draft when the profile changes', async () => {
    await request(app).post(`/api/topics/${topicId}/curriculum/generate`)

    const response = await request(app)
      .post(`/api/topics/${topicId}/profile`)
      .send({ level: 'Beginner', timeCommitment: '1 hour/day' })

    expect(response.status).toBe(200)
    expect(dbModule.get('SELECT curriculum_state, curriculum_draft FROM topics WHERE id = ?', topicId)).toMatchObject({
      curriculum_state: 'ready_to_generate',
      curriculum_draft: null,
    })
  })

  it('updates the durable draft when a user tweaks it before confirmation', async () => {
    await request(app).post(`/api/topics/${topicId}/curriculum/generate`)
    const updated = curriculum()
    updated.modules[0].title = 'Tweaked module'
    generateText.mockResolvedValue({ text: JSON.stringify(updated) })

    const response = await request(app)
      .post(`/api/topics/${topicId}/curriculum/tweak`)
      .send({ request: 'Rename the first module.' })

    expect(response.status).toBe(200)
    expect(response.body.modules[0].title).toBe('Tweaked module')
    expect(dbModule.get('SELECT curriculum_state, curriculum_draft FROM topics WHERE id = ?', topicId)).toMatchObject({
      curriculum_state: 'draft_ready',
    })
    expect(JSON.parse(dbModule.get('SELECT curriculum_draft FROM topics WHERE id = ?', topicId).curriculum_draft).modules[0].title).toBe('Tweaked module')
  })
})
