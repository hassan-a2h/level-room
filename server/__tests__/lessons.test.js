import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'

const llmMocks = vi.hoisted(() => ({ streamText: vi.fn(), generateText: vi.fn() }))
vi.mock('../llm/client.js', () => ({
  streamText: llmMocks.streamText,
  generateText: llmMocks.generateText,
  LlmClientError: class LlmClientError extends Error {
    constructor(message, { code, retryable = false } = {}) { super(message); this.code = code; this.retryable = retryable }
  },
}))

const OUTCOME_A = { id: 'sql-choose-join', title: 'Choose the correct join', kind: 'skill', role: 'core', evidence: ['activity'] }
const OUTCOME_B = { id: 'sql-order-query', title: 'Order a SQL query', kind: 'skill', role: 'core', evidence: ['activity'] }

function tempDbPath() {
  return path.join(os.tmpdir(), `test-structured-lessons-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

function makeActivityDocument(lessonId) {
  const block = (id, type, outcomeIds, fields) => ({ id, type, title: `Practice ${id}`, required: true, estimatedMinutes: 2, outcomeIds, ...fields })
  return {
    schemaVersion: 1,
    promptVersion: 'session-activities-v1',
    generator: { provider: 'openai', model: 'test-model', generatedAt: '2026-09-26T00:00:00.000Z' },
    lesson: { lessonId, outcomeIds: [OUTCOME_A.id, OUTCOME_B.id], estimatedMinutes: 10 },
    blocks: [
      block('read-joins', 'read', [OUTCOME_A.id], { content: 'A join combines related rows.' }),
      block('worked-join', 'worked_example', [OUTCOME_A.id], {
        problem: 'Which side should remain?', steps: [{ id: 'inspect', title: 'Inspect the rows', content: 'Find the records that must remain.' }, { id: 'choose', title: 'Choose a join', content: 'Choose a join that preserves those records.' }], takeaway: 'Decide which unmatched rows matter.',
      }),
      block('choose-join', 'choice', [OUTCOME_A.id], { prompt: 'Which join keeps every left row?', options: [{ id: 'inner', label: 'INNER JOIN' }, { id: 'left', label: 'LEFT JOIN' }] }),
      block('reflect-query', 'reflection', [OUTCOME_B.id], { prompt: 'What will you inspect first?', maxChars: 100 }),
      block('order-query', 'ordering', [OUTCOME_B.id], { prompt: 'Order the query stages.', items: [{ id: 'from', label: 'Choose source' }, { id: 'join', label: 'Join tables' }, { id: 'select', label: 'Choose columns' }] }),
    ],
    answerKey: {
      'choose-join': { kind: 'choice', correctOptionId: 'left', explanation: 'LEFT JOIN retains unmatched left rows.', critical: true },
      'order-query': { kind: 'ordering', correctOrder: ['from', 'join', 'select'], explanation: 'Choose the source, join, then select columns.', critical: false },
    },
  }
}

describe('structured Session lesson API', () => {
  let dbPath
  let db
  let app

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    process.env.OPENAI_API_KEY = 'sk-test'
    vi.resetModules()
    llmMocks.streamText.mockReset()
    llmMocks.generateText.mockReset()
    db = await import('../db.js')
    db.initSchema()
    db.run('INSERT INTO llm_settings (provider, model) VALUES (?, ?)', 'openai', 'gpt-4o')
    const router = (await import('../routes/lessons.js')).default
    app = express()
    app.use(express.json())
    app.use('/api', router)
  })

  afterEach(() => {
    try { db.default.close() } catch {}
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.FIREWORKS_API_KEY
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_MODEL
  })

  function seedLesson({ otherTopic = false, document = true } = {}) {
    const topicId = Number(db.run("INSERT INTO topics (title, status, interaction_mode) VALUES ('SQL', 'active', 'socratic')").lastInsertRowid)
    const moduleId = Number(db.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, 0, 'Joins')", topicId).lastInsertRowid)
    const lessonId = Number(db.run(
      'INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites, artifact_required, artifact_type, task_spec, activity_blocks) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      moduleId,
      'Join tables',
      'Beginner',
      10,
      JSON.stringify([OUTCOME_A, OUTCOME_B]),
      '[]',
      1,
      'code',
      '',
      null,
    ).lastInsertRowid)
    if (document) db.run('UPDATE lessons SET activity_blocks = ? WHERE id = ?', JSON.stringify(makeActivityDocument(lessonId)), lessonId)
    const wrongTopicId = otherTopic ? Number(db.run("INSERT INTO topics (title, status) VALUES ('Other', 'active')").lastInsertRowid) : topicId
    return { topicId, lessonId, wrongTopicId }
  }

  async function practicingWithWrongChoice(seeded) {
    const runtime = await import('../utils/activity-runtime.js')
    runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    runtime.completeInformationalBlock({ topicId: seeded.topicId, lessonId: seeded.lessonId, blockId: 'read-joins', action: 'continue', localDate: '2024-02-29' })
    runtime.completeInformationalBlock({ topicId: seeded.topicId, lessonId: seeded.lessonId, blockId: 'worked-join', action: 'continue', localDate: '2024-02-29' })
    runtime.submitObjectiveBlock({ topicId: seeded.topicId, lessonId: seeded.lessonId, blockId: 'choose-join', response: 'inner', localDate: '2024-02-29' })
    return runtime
  }

  it('returns structured public Session data without starting an untouched Session', async () => {
    const untouched = seedLesson({ document: false })
    const first = await request(app).get(`/api/topics/${untouched.topicId}/lessons/${untouched.lessonId}`)
    expect(first.status).toBe(200)
    expect(first.body.activityDocument).toBeNull()
    expect(first.body.activityState).toBeNull()
    expect(db.get('SELECT COUNT(*) AS count FROM progress WHERE lesson_id = ?', untouched.lessonId).count).toBe(0)

    const seeded = seedLesson()
    const result = await request(app).get(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}`)
    expect(result.status).toBe(200)
    expect(result.body.activityDocument.blocks).toHaveLength(5)
    expect(result.body.activityState.currentBlockId).toBe('read-joins')
    expect(result.body.activityProgress).toMatchObject({ completed: 0, total: 5, percent: 0 })
    expect(JSON.stringify(result.body)).not.toMatch(/answerKey|correctOptionId|correctOrder|exemplar|generator/)
    expect(db.get('SELECT COUNT(*) AS count FROM progress WHERE lesson_id = ?', seeded.lessonId).count).toBe(0)
  })

  it('returns typed document corruption and scopes every lookup by topic and lesson', async () => {
    const seeded = seedLesson({ otherTopic: true })
    expect((await request(app).get(`/api/topics/${seeded.wrongTopicId}/lessons/${seeded.lessonId}`)).status).toBe(404)
    db.run("UPDATE lessons SET activity_blocks = '{bad' WHERE id = ?", seeded.lessonId)
    const malformed = await request(app).get(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}`)
    expect(malformed.status).toBe(500)
    expect(malformed.body.code).toBe('ACTIVITY_DOCUMENT_INVALID')
  })

  it('adds public current-block and attempt context to the tutor and persists messages without changing learning state', async () => {
    const seeded = seedLesson()
    const runtime = await practicingWithWrongChoice(seeded)
    const before = db.get('SELECT state, activity_state, started_at, completed_at, artifact_passed FROM progress WHERE lesson_id = ?', seeded.lessonId)
    llmMocks.streamText.mockResolvedValueOnce({ textStream: (async function* () { yield 'Think about which rows must remain.' })() })
    const response = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/chat`)
      .send({ content: 'Why did this answer miss?', activityBlockId: 'choose-join' })
    expect(response.status).toBe(200)
    expect(response.text).toContain('Think about which rows must remain.')
    const requestContext = llmMocks.streamText.mock.calls[0][0]
    const tutorPrompt = requestContext.system
    expect(tutorPrompt).toContain('ask guiding questions')
    expect(tutorPrompt).toContain('not claim completion')
    expect(tutorPrompt).toContain('choose-join')
    expect(tutorPrompt).toContain('LEFT JOIN retains unmatched left rows.')
    expect(tutorPrompt).toContain(OUTCOME_A.title)
    expect(tutorPrompt).not.toMatch(/answerKey|correctOptionId|correctOrder|exemplar/)
    const messages = db.all('SELECT role, content FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id', seeded.topicId, seeded.lessonId)
    expect(messages).toEqual([{ role: 'user', content: 'Why did this answer miss?' }, { role: 'assistant', content: 'Think about which rows must remain.' }])
    expect(db.get('SELECT state, activity_state, started_at, completed_at, artifact_passed FROM progress WHERE lesson_id = ?', seeded.lessonId)).toEqual(before)
    expect(runtime.getActivityProgress(seeded.topicId, seeded.lessonId).currentBlockId).toBe('choose-join')
  })

  it('enforces tutor message bounds, rejects foreign activity blocks, and writes no messages on errors', async () => {
    const seeded = seedLesson()
    await practicingWithWrongChoice(seeded)
    const tooLong = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/chat`)
      .send({ content: 'x'.repeat(2001), activityBlockId: 'choose-join' })
    expect(tooLong.status).toBe(400)
    const foreign = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/chat`)
      .send({ content: 'Help me think.', activityBlockId: 'foreign-block' })
    expect(foreign.status).toBe(404)
    expect(foreign.body.code).toBe('ACTIVITY_BLOCK_NOT_FOUND')
    llmMocks.streamText.mockRejectedValueOnce(new Error('provider unavailable'))
    const failed = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/chat`)
      .send({ content: 'Help me think.', activityBlockId: 'choose-join' })
    expect(failed.status).toBe(502)
    expect(db.get('SELECT COUNT(*) AS count FROM messages WHERE lesson_id = ?', seeded.lessonId).count).toBe(0)
  })

  it('does not expose legacy per-Session quiz, chunk, skip, test-out, or remediation endpoints', async () => {
    const seeded = seedLesson()
    for (const pathPart of ['continue', 'quiz', 'quiz/submit', 'skip', 'test-out/start', 'remediate', 'remediate/chat']) {
      const result = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/${pathPart}`).send({})
      expect(result.status).toBe(404)
    }
  })
})
