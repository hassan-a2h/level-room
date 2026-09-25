import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import http from 'node:http'
import fs from 'fs'
import os from 'os'
import path from 'path'

const llmMocks = vi.hoisted(() => ({ streamText: vi.fn() }))
vi.mock('../llm/client.js', () => ({
  streamText: llmMocks.streamText,
  generateText: vi.fn(),
  LlmClientError: class LlmClientError extends Error {
    constructor(message, { code, retryable = false } = {}) { super(message); this.code = code; this.retryable = retryable }
  },
}))

const OUTCOME_A = { id: 'sql-choose-join', title: 'Choose the correct join', kind: 'skill', role: 'core', evidence: ['activity'] }
const OUTCOME_B = { id: 'sql-order-query', title: 'Order a SQL query', kind: 'skill', role: 'core', evidence: ['activity'] }

function tempDbPath() {
  return path.join(os.tmpdir(), `test-activities-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

function makeProviderDocument(lessonId) {
  const block = (id, type, outcomeIds, fields) => ({ id, type, title: `Practice ${id}`, required: true, estimatedMinutes: 2, outcomeIds, ...fields })
  return {
    schemaVersion: 1,
    promptVersion: 'session-activities-v1',
    lesson: { lessonId, outcomeIds: [OUTCOME_A.id, OUTCOME_B.id], estimatedMinutes: 10 },
    blocks: [
      block('read-joins', 'read', [OUTCOME_A.id], { content: 'A join combines related rows.' }),
      block('worked-join', 'worked_example', [OUTCOME_A.id], {
        problem: 'Which side should remain?',
        steps: [{ id: 'inspect', title: 'Inspect the rows', content: 'Find the records that must remain.' }, { id: 'choose', title: 'Choose a join', content: 'Choose the join that preserves those records.' }],
        takeaway: 'Decide which unmatched rows matter.',
      }),
      block('choose-join', 'choice', [OUTCOME_A.id], { prompt: 'Which join keeps every left row?', options: [{ id: 'inner', label: 'INNER JOIN' }, { id: 'left', label: 'LEFT JOIN' }] }),
      block('explain-join', 'short_answer', [OUTCOME_B.id], { prompt: 'Explain the query order.', responseHint: 'Mention the source and selected columns.', minChars: 5, maxChars: 250 }),
      block('order-query', 'ordering', [OUTCOME_B.id], { prompt: 'Order the query stages.', items: [{ id: 'from', label: 'Choose source' }, { id: 'join', label: 'Join tables' }, { id: 'select', label: 'Choose columns' }] }),
    ],
    answerKey: {
      'choose-join': { kind: 'choice', correctOptionId: 'left', explanation: 'LEFT JOIN retains unmatched left rows.', critical: true },
      'explain-join': { kind: 'short_answer', criteria: [
        { id: 'source-first', label: 'Source first', description: 'Names the source relation.', critical: true },
        { id: 'join-next', label: 'Join next', description: 'Explains the join stage.', critical: true },
      ], exemplar: 'Start with the source, join related rows, then choose columns.' },
      'order-query': { kind: 'ordering', correctOrder: ['from', 'join', 'select'], explanation: 'Choose the source, join, then select columns.', critical: false },
    },
  }
}

function providerStream(text, { wait = null } = {}) {
  return {
    textStream: (async function* () {
      if (wait) await wait
      for (const chunk of text.match(/.{1,70}/gs) || []) yield chunk
    })(),
  }
}

describe('activity generation API', () => {
  let dbPath
  let db
  let app
  let router
  let activityRequestCount
  let activityRequestWaiters
  let activityResponseCloseCount
  let activityResponseCloseWaiters
  let httpServer

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    process.env.OPENAI_API_KEY = 'sk-test'
    vi.resetModules()
    llmMocks.streamText.mockReset()
    db = await import('../db.js')
    db.initSchema()
    db.run('INSERT INTO llm_settings (provider, model) VALUES (?, ?)', 'openai', 'gpt-4o')
    router = (await import('../routes/activities.js')).default
    app = express()
    app.use(express.json())
    activityRequestCount = 0
    activityRequestWaiters = new Map()
    activityResponseCloseCount = 0
    activityResponseCloseWaiters = new Map()
    app.use((req, res, next) => {
      if (req.method === 'POST' && req.path.endsWith('/activities')) {
        activityRequestCount += 1
        activityRequestWaiters.get(activityRequestCount)?.()
        res.once('close', () => {
          if (res.writableEnded) return
          activityResponseCloseCount += 1
          activityResponseCloseWaiters.get(activityResponseCloseCount)?.()
        })
      }
      next()
    })
    app.use('/api', router)
  })

  afterEach(async () => {
    if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve))
    try { db.default.close() } catch {}
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
    delete process.env.OPENAI_API_KEY
  })

  function seedLesson({ otherTopic = false, prerequisite = false, activityBlocks = null } = {}) {
    const topicId = Number(db.run("INSERT INTO topics (title, status, difficulty, interaction_mode, level, time_per_week) VALUES ('SQL', 'active', 'normal', 'socratic', 'Beginner', '4 hours')").lastInsertRowid)
    const moduleId = Number(db.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, 0, 'Joins')", topicId).lastInsertRowid)
    let prerequisiteId = null
    if (prerequisite) prerequisiteId = Number(db.run("INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, 0, 'Tables')", moduleId).lastInsertRowid)
    const lessonId = Number(db.run(
      'INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites, task_spec, activity_blocks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      moduleId,
      prerequisite ? 1 : 0,
      'Join tables',
      'Beginner',
      10,
      JSON.stringify([OUTCOME_A, OUTCOME_B]),
      prerequisite ? JSON.stringify([{ lessonId: prerequisiteId, title: 'Tables' }]) : '[]',
      JSON.stringify({ title: 'Build a join diagram', requirements: ['Show unmatched rows'] }),
      activityBlocks,
    ).lastInsertRowid)
    const wrongTopicId = otherTopic ? Number(db.run("INSERT INTO topics (title, status) VALUES ('Other', 'active')").lastInsertRowid) : topicId
    return { topicId, lessonId, wrongTopicId, prerequisiteId }
  }

  function respondWith(doc, options) {
    llmMocks.streamText.mockImplementationOnce(() => Promise.resolve(providerStream(JSON.stringify(doc), options)))
  }

  function whenActivityRequests(count) {
    if (activityRequestCount >= count) return Promise.resolve()
    return new Promise((resolve) => activityRequestWaiters.set(count, resolve))
  }

  function whenActivityResponsesClose(count) {
    if (activityResponseCloseCount >= count) return Promise.resolve()
    return new Promise((resolve) => activityResponseCloseWaiters.set(count, resolve))
  }

  function startHttpServer() {
    return new Promise((resolve) => { httpServer = app.listen(0, '127.0.0.1', () => resolve(httpServer)) })
  }

  function postDirect(server, pathname) {
    let clientRequest
    const response = new Promise((resolve, reject) => {
      clientRequest = http.request({ host: '127.0.0.1', port: server.address().port, path: pathname, method: 'POST' }, (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }))
      })
      clientRequest.on('error', reject)
      clientRequest.end()
    })
    return { request: clientRequest, response }
  }

  it('returns scoped not-found and prerequisite conflicts without calling the provider', async () => {
    const cross = seedLesson({ otherTopic: true })
    expect((await request(app).post(`/api/topics/${cross.wrongTopicId}/lessons/${cross.lessonId}/activities`)).status).toBe(404)
    const locked = seedLesson({ prerequisite: true })
    const denied = await request(app).post(`/api/topics/${locked.topicId}/lessons/${locked.lessonId}/activities`)
    expect(denied.status).toBe(409)
    expect(denied.body.code).toBe('PREREQUISITES_NOT_MET')
    expect(llmMocks.streamText).not.toHaveBeenCalled()
  })

  it('returns a valid cached document without provider work and starts only its Session', async () => {
    const seeded = seedLesson()
    const document = { ...makeProviderDocument(seeded.lessonId), generator: { provider: 'openai', model: 'gpt-4o', generatedAt: '2026-09-26T00:00:00.000Z' } }
    db.run('UPDATE lessons SET activity_blocks = ? WHERE id = ?', JSON.stringify(document), seeded.lessonId)
    const result = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`)
    expect(result.status).toBe(200)
    expect(result.body.activityDocument.blocks).toHaveLength(5)
    expect(JSON.stringify(result.body)).not.toMatch(/answerKey|correctOptionId|correctOrder|exemplar|generator/)
    expect(result.body.activityState.currentBlockId).toBe('read-joins')
    expect(db.get('SELECT state FROM progress WHERE lesson_id = ?', seeded.lessonId).state).toBe('practicing')
    expect(llmMocks.streamText).not.toHaveBeenCalled()
  })

  it('generates, validates, server-stamps and atomically caches public content plus initial progress', async () => {
    const seeded = seedLesson()
    const generated = makeProviderDocument(seeded.lessonId)
    generated.generator = { provider: 'attacker-provider', model: 'untrusted', generatedAt: 'not-a-date' }
    respondWith(generated)
    const result = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`)
    expect(result.status).toBe(201)
    expect(result.body.activityState.currentBlockId).toBe('read-joins')
    expect(JSON.stringify(result.body)).not.toMatch(/answerKey|correctOptionId|correctOrder|exemplar|generator/)
    const cached = JSON.parse(db.get('SELECT activity_blocks FROM lessons WHERE id = ?', seeded.lessonId).activity_blocks)
    expect(cached.generator).toMatchObject({ provider: 'openai', model: 'gpt-4o' })
    expect(cached.generator.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(db.get('SELECT state FROM progress WHERE lesson_id = ?', seeded.lessonId).state).toBe('practicing')
    expect(llmMocks.streamText).toHaveBeenCalledTimes(1)
    expect(llmMocks.streamText.mock.calls[0][0].system).toContain('Build a join diagram')
    expect(llmMocks.streamText.mock.calls[0][0].system).toContain('Beginner')
  })

  it.each([
    ['invalid schema', (doc, lessonId) => ({ ...doc, lesson: { ...doc.lesson, lessonId: lessonId + 1 } }), 422],
    ['malformed JSON', (_doc) => 'not json', 502],
  ])('leaves storage untouched when provider returns %s', async (_name, transform, expectedStatus) => {
    const seeded = seedLesson()
    const value = transform(makeProviderDocument(seeded.lessonId), seeded.lessonId)
    respondWith(typeof value === 'string' ? value : value)
    const result = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`)
    expect(result.status).toBe(expectedStatus)
    expect(db.get('SELECT activity_blocks FROM lessons WHERE id = ?', seeded.lessonId).activity_blocks).toBeNull()
    expect(db.get('SELECT COUNT(*) AS count FROM progress WHERE lesson_id = ?', seeded.lessonId).count).toBe(0)
  })

  it('rejects oversized output and provider failures without creating progress', async () => {
    const oversized = seedLesson()
    respondWith('x'.repeat(128 * 1024 + 1))
    const large = await request(app).post(`/api/topics/${oversized.topicId}/lessons/${oversized.lessonId}/activities`)
    expect(large.status).toBe(502)
    expect(db.get('SELECT COUNT(*) AS count FROM progress WHERE lesson_id = ?', oversized.lessonId).count).toBe(0)

    const failing = seedLesson()
    llmMocks.streamText.mockRejectedValueOnce(new Error('provider unavailable'))
    const failed = await request(app).post(`/api/topics/${failing.topicId}/lessons/${failing.lessonId}/activities`)
    expect(failed.status).toBe(502)
    expect(db.get('SELECT activity_blocks FROM lessons WHERE id = ?', failing.lessonId).activity_blocks).toBeNull()
  })

  it('returns a typed configuration error before provider work or database writes', async () => {
    const seeded = seedLesson()
    delete process.env.OPENAI_API_KEY
    const result = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`)
    expect(result.status).toBe(400)
    expect(result.body.code).toBe('MISSING_API_KEY')
    expect(llmMocks.streamText).not.toHaveBeenCalled()
    expect(db.get('SELECT activity_blocks FROM lessons WHERE id = ?', seeded.lessonId).activity_blocks).toBeNull()
    expect(db.get('SELECT COUNT(*) AS count FROM progress WHERE lesson_id = ?', seeded.lessonId).count).toBe(0)
  })

  it('deduplicates concurrent waiters and keeps a single persisted document and progress row', async () => {
    const seeded = seedLesson()
    let release
    const wait = new Promise((resolve) => { release = resolve })
    respondWith(makeProviderDocument(seeded.lessonId), { wait })
    const first = request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`).then((response) => response)
    const second = request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`).then((response) => response)
    await whenActivityRequests(2)
    release()
    const [one, two] = await Promise.all([first, second])
    expect(one.status).toBe(201)
    expect(two.status).toBe(201)
    expect(llmMocks.streamText).toHaveBeenCalledTimes(1)
    expect(db.get('SELECT COUNT(*) AS count FROM progress WHERE lesson_id = ?', seeded.lessonId).count).toBe(1)
    expect(db.get('SELECT activity_blocks FROM lessons WHERE id = ?', seeded.lessonId).activity_blocks).not.toBeNull()
  })

  it('uses the conditional cache write when another process wins the document race', async () => {
    const seeded = seedLesson()
    const generated = makeProviderDocument(seeded.lessonId)
    const winner = makeProviderDocument(seeded.lessonId)
    winner.blocks[0].content = 'Winning writer content.'
    winner.generator = { provider: 'openai', model: 'gpt-4o', generatedAt: '2026-09-26T00:00:00.000Z' }
    llmMocks.streamText.mockImplementationOnce(() => {
      db.run('UPDATE lessons SET activity_blocks = ? WHERE id = ?', JSON.stringify(winner), seeded.lessonId)
      return Promise.resolve(providerStream(JSON.stringify(generated)))
    })
    const result = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`)
    expect(result.status).toBe(200)
    expect(result.body.activityDocument.blocks[0].content).toBe('Winning writer content.')
    expect(db.get('SELECT COUNT(*) AS count FROM progress WHERE lesson_id = ?', seeded.lessonId).count).toBe(1)
  })

  it('keeps shared generation alive when one of multiple waiters disconnects', async () => {
    const seeded = seedLesson()
    let release
    let providerSignal
    const wait = new Promise((resolve) => { release = resolve })
    llmMocks.streamText.mockImplementationOnce((options) => {
      providerSignal = options.signal
      return Promise.resolve(providerStream(JSON.stringify(makeProviderDocument(seeded.lessonId)), { wait }))
    })
    const server = await startHttpServer()
    const first = postDirect(server, `/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`)
    first.response.catch(() => {})
    const second = postDirect(server, `/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`)
    await whenActivityRequests(2)
    first.request.destroy()
    await whenActivityResponsesClose(1)
    expect(providerSignal.aborted).toBe(false)
    release()
    const result = await second.response
    expect(result.status).toBe(201)
    expect(db.get('SELECT activity_blocks FROM lessons WHERE id = ?', seeded.lessonId).activity_blocks).not.toBeNull()
  })

  it('aborts before persistence when all generation waiters disconnect', async () => {
    const seeded = seedLesson()
    let providerSignal
    llmMocks.streamText.mockImplementationOnce((options) => {
      providerSignal = options.signal
      return Promise.resolve({
        textStream: (async function* () {
          if (!options.signal.aborted) await new Promise((resolve) => options.signal.addEventListener('abort', resolve, { once: true }))
          yield JSON.stringify(makeProviderDocument(seeded.lessonId))
        })(),
      })
    })
    const server = await startHttpServer()
    const first = postDirect(server, `/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`)
    first.response.catch(() => {})
    const second = postDirect(server, `/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/activities`)
    second.response.catch(() => {})
    await whenActivityRequests(2)
    first.request.destroy()
    second.request.destroy()
    await whenActivityResponsesClose(2)
    expect(providerSignal.aborted).toBe(true)
    expect(db.get('SELECT activity_blocks FROM lessons WHERE id = ?', seeded.lessonId).activity_blocks).toBeNull()
    expect(db.get('SELECT COUNT(*) AS count FROM progress WHERE lesson_id = ?', seeded.lessonId).count).toBe(0)
  })
})
