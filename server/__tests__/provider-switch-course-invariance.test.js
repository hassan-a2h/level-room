import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const llm = vi.hoisted(() => ({ streamText: vi.fn(), generateText: vi.fn() }))

vi.mock('../llm/client.js', () => ({
  streamText: llm.streamText,
  generateText: llm.generateText,
  LlmClientError: class LlmClientError extends Error {
    constructor(message, { code, retryable = false } = {}) {
      super(message)
      this.code = code
      this.retryable = retryable
    }
  },
}))

function temporaryDatabasePath() {
  return path.join(os.tmpdir(), `provider-switch-invariance-${process.pid}-${Math.random().toString(36).slice(2)}.sqlite`)
}

const COURSE_TABLES = [
  'topics', 'modules', 'lessons', 'progress', 'messages', 'srs_queue', 'artifacts',
  'mistakes_log', 'streaks', 'quiz_attempts', 'exam_attempts',
]

describe('provider switching during a course operation', () => {
  let dbPath
  let db
  let app
  let topicId
  let lessonId

  beforeEach(async () => {
    dbPath = temporaryDatabasePath()
    process.env.DB_PATH = dbPath
    process.env.OPENAI_API_KEY = 'fixture-openai-key'
    process.env.FIREWORKS_API_KEY = 'fixture-fireworks-key'
    vi.resetModules()
    llm.streamText.mockReset()
    llm.generateText.mockReset()

    db = await import('../db.js')
    db.initSchema()
    db.run('INSERT INTO llm_settings (provider, model, reasoning_effort) VALUES (?, ?, ?)', 'openai', 'gpt-4o', 'none')
    const topic = db.run('INSERT INTO topics (title, status, interaction_mode) VALUES (?, ?, ?)', 'React', 'active', 'socratic')
    topicId = topic.lastInsertRowid
    const module = db.run('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)', topicId, 0, 'Foundations')
    const lesson = db.run(
      'INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)',
      module.lastInsertRowid, 0, 'JSX', 'Beginner', 10, JSON.stringify(['Understand JSX']), '[]',
    )
    lessonId = lesson.lastInsertRowid
    const progress = db.run(
      'INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)',
      topicId, lessonId, 'not_started',
    )
    db.run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'user', 'Earlier question')
    db.run('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)', topicId, lessonId, 'assistant', 'Earlier answer')
    db.run('INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)', topicId, lessonId, 2, '2026-09-14', 'pending')
    db.run('INSERT INTO artifacts (progress_id, content, rubric_scores, passed, feedback, attempt_number) VALUES (?, ?, ?, ?, ?, ?)', progress.lastInsertRowid, 'existing learner work', '{}', 0, 'Keep practicing', 2)
    db.run('INSERT INTO mistakes_log (topic_id, lesson_id, description, recurring) VALUES (?, ?, ?, ?)', topicId, lessonId, 'Earlier misconception', 1)
    db.run('INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)', 4, 7, '2026-09-14')
    db.run('INSERT INTO quiz_attempts (topic_id, lesson_id, questions, answers, evaluation) VALUES (?, ?, ?, ?, ?)', topicId, lessonId, '[]', '[]', '{"score":70}')
    db.run('INSERT INTO exam_attempts (topic_id, module_id, questions, answers, evaluation, status) VALUES (?, ?, ?, ?, ?, ?)', topicId, module.lastInsertRowid, '[]', '[]', '{"score":80}', 'completed')

    const { default: lessonsRouter } = await import('../routes/lessons.js')
    const { default: settingsRouter } = await import('../routes/settings.js')
    app = express()
    app.use(express.json())
    app.use('/api', lessonsRouter)
    app.use('/api/settings', settingsRouter)
  })

  afterEach(() => {
    try { db?.default?.close() } catch {}
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
    delete process.env.OPENAI_API_KEY
    delete process.env.FIREWORKS_API_KEY
  })

  function courseSnapshot() {
    return Object.fromEntries(COURSE_TABLES.map((table) => [table, db.all(`SELECT * FROM ${table} ORDER BY id`)]))
  }

  function snapshotAfterSuccessfulOperation(baseline, { messages, progress: progressPatch, startedAtChanged = false }) {
    const currentMessages = db.all('SELECT * FROM messages ORDER BY id')
    const appendedMessages = currentMessages.slice(baseline.messages.length)
    expect(appendedMessages.map(({ topic_id, lesson_id, role, content }) => ({ topic_id, lesson_id, role, content })))
      .toEqual(messages.map((message) => ({ topic_id: topicId, lesson_id: lessonId, ...message })))

    const actualProgress = db.get('SELECT * FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
    expect(actualProgress).toMatchObject(progressPatch)
    const expectedProgress = { ...baseline.progress[0], ...progressPatch }
    if (startedAtChanged) {
      expect(actualProgress.started_at).toEqual(expect.any(String))
      expectedProgress.started_at = actualProgress.started_at
    }

    return {
      ...baseline,
      messages: [...baseline.messages, ...appendedMessages],
      progress: baseline.progress.map((row) => row.id === actualProgress.id ? expectedProgress : row),
    }
  }

  async function switchToFireworks() {
    const response = await request(app).post('/api/settings').send({
      provider: 'fireworks',
      model: 'accounts/fireworks/routers/kimi-k2p6-turbo',
    })
    expect(response.status).toBe(200)
  }

  it('pins an in-flight request to its captured provider and uses the new provider on the next request', async () => {
    let releaseFirstStream
    const firstStreamGate = new Promise((resolve) => { releaseFirstStream = resolve })
    const beforeFirstRequest = courseSnapshot()
    llm.streamText
      .mockImplementationOnce(async () => ({
        textStream: (async function* () {
          await firstStreamGate
          yield 'first provider response'
        })(),
      }))
      .mockImplementationOnce(async () => ({ textStream: (async function* () { yield 'next provider response' })() }))

    const firstRequest = request(app)
      .post(`/api/topics/${topicId}/lessons/${lessonId}/chat`)
      .set('Accept', 'text/event-stream')
      .send({ content: 'Explain JSX' })
      .then((response) => response)

    await vi.waitFor(() => expect(llm.streamText).toHaveBeenCalledTimes(1))
    await switchToFireworks()
    expect(courseSnapshot()).toEqual(beforeFirstRequest)

    releaseFirstStream()
    const firstResponse = await firstRequest
    expect(firstResponse.status).toBe(200)
    expect(llm.streamText.mock.calls[0][0]).toMatchObject({ provider: 'openai', model: 'gpt-4o', reasoningEffort: 'none' })
    const afterFirstRequest = snapshotAfterSuccessfulOperation(beforeFirstRequest, {
      messages: [
        { role: 'user', content: 'Explain JSX' },
        { role: 'assistant', content: 'first provider response' },
      ],
      progress: { state: 'not_started', current_chunk: 0, total_chunks: 0 },
    })
    expect(courseSnapshot()).toEqual(afterFirstRequest)

    const beforeNextChat = courseSnapshot()
    const nextResponse = await request(app)
      .post(`/api/topics/${topicId}/lessons/${lessonId}/chat`)
      .set('Accept', 'text/event-stream')
      .send({ content: 'Can you offer another hint?' })
    expect(nextResponse.status).toBe(200)
    expect(llm.streamText.mock.calls[1][0]).toMatchObject({
      provider: 'fireworks',
      model: 'accounts/fireworks/routers/kimi-k2p6-turbo',
      reasoningEffort: 'none',
    })
    const afterNextChat = snapshotAfterSuccessfulOperation(beforeNextChat, {
      messages: [
        { role: 'user', content: 'Can you offer another hint?' },
        { role: 'assistant', content: 'next provider response' },
      ],
      progress: { state: 'not_started', current_chunk: 0, total_chunks: 0 },
    })
    expect(courseSnapshot()).toEqual(afterNextChat)
  })

  it('leaves progress and chat history untouched when a switched in-flight request fails', async () => {
    let releaseFailedStream
    const failedStreamGate = new Promise((resolve) => { releaseFailedStream = resolve })
    const beforeFailedRequest = courseSnapshot()
    llm.streamText.mockImplementationOnce(async () => ({
      textStream: (async function* () {
        await failedStreamGate
        throw new Error('upstream failure')
      })(),
    }))

    const pendingResponse = request(app)
      .post(`/api/topics/${topicId}/lessons/${lessonId}/chat`)
      .set('Accept', 'text/event-stream')
      .send({ content: 'This should not persist' })
      .then((response) => response)

    await vi.waitFor(() => expect(llm.streamText).toHaveBeenCalledTimes(1))
    await switchToFireworks()
    expect(courseSnapshot()).toEqual(beforeFailedRequest)

    releaseFailedStream()
    const response = await pendingResponse
    expect(response.status).toBe(200)
    expect(response.text).toContain('STREAM_ERROR')
    expect(courseSnapshot()).toEqual(beforeFailedRequest)
    expect(llm.streamText.mock.calls[0][0]).toMatchObject({ provider: 'openai', model: 'gpt-4o' })
  })
})
