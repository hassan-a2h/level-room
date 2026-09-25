import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'

const llmMocks = vi.hoisted(() => ({ generateText: vi.fn(), streamText: vi.fn() }))
vi.mock('../llm/client.js', () => ({
  generateText: llmMocks.generateText,
  streamText: llmMocks.streamText,
  LlmClientError: class LlmClientError extends Error {
    constructor(message, { code, retryable = false } = {}) { super(message); this.code = code; this.retryable = retryable }
  },
}))

const OUTCOME_A = { id: 'sql-choose-join', title: 'Choose the correct join', kind: 'skill', role: 'core', evidence: ['activity'] }
const OUTCOME_B = { id: 'sql-order-query', title: 'Order a SQL query', kind: 'skill', role: 'core', evidence: ['activity'] }
const LOCAL_DATE = '2024-02-29'

function tempDbPath() {
  return path.join(os.tmpdir(), `test-structured-artifacts-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

function makeActivityDocument(lessonId, optionalReflection = false) {
  const block = (id, type, outcomeIds, fields) => ({ id, type, title: `Practice ${id}`, required: true, estimatedMinutes: 2, outcomeIds, ...fields })
  const blocks = [
    block('read-joins', 'read', [OUTCOME_A.id], { content: 'A join combines related rows.' }),
    block('worked-join', 'worked_example', [OUTCOME_A.id], {
      problem: 'Which side should remain?', steps: [{ id: 'inspect', title: 'Inspect the rows', content: 'Find the records that must remain.' }, { id: 'choose', title: 'Choose a join', content: 'Choose a join that preserves those records.' }], takeaway: 'Decide which unmatched rows matter.',
    }),
    block('choose-join', 'choice', [OUTCOME_A.id], { prompt: 'Which join keeps every left row?', options: [{ id: 'inner', label: 'INNER JOIN' }, { id: 'left', label: 'LEFT JOIN' }] }),
    block('reflect-query', 'reflection', [OUTCOME_B.id], { prompt: 'What will you inspect first?', maxChars: 100 }),
    block('order-query', 'ordering', [OUTCOME_B.id], { prompt: 'Order the query stages.', items: [{ id: 'from', label: 'Choose source' }, { id: 'join', label: 'Join tables' }, { id: 'select', label: 'Choose columns' }] }),
  ]
  if (optionalReflection) blocks[3].required = false
  return {
    schemaVersion: 1,
    promptVersion: 'session-activities-v1',
    generator: { provider: 'openai', model: 'test-model', generatedAt: '2026-09-26T00:00:00.000Z' },
    lesson: { lessonId, outcomeIds: [OUTCOME_A.id, OUTCOME_B.id], estimatedMinutes: 10 },
    blocks,
    answerKey: {
      'choose-join': { kind: 'choice', correctOptionId: 'left', explanation: 'LEFT JOIN retains unmatched left rows.', critical: true },
      'order-query': { kind: 'ordering', correctOrder: ['from', 'join', 'select'], explanation: 'Choose the source, join, then select columns.', critical: false },
    },
  }
}

function taskSpec() {
  return JSON.stringify({ title: 'Build a join diagram', goal: 'Show the rows a join preserves.', success_criteria: ['Show unmatched left rows'], deliverables: ['diagram'] })
}

function evaluation(scores = { Correctness: 2, Completeness: 2, Clarity: 1, 'Edge Cases': 1 }) {
  return { text: JSON.stringify({ scores, feedback: { Correctness: 'Correct.', Completeness: 'Complete.', Clarity: 'Clear enough.', 'Edge Cases': 'Covers the case.' } }) }
}

describe('structured Build artifact API', () => {
  let dbPath
  let db
  let app
  let runtime

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    process.env.OPENAI_API_KEY = 'sk-test'
    vi.resetModules()
    llmMocks.generateText.mockReset()
    llmMocks.streamText.mockReset()
    db = await import('../db.js')
    db.initSchema()
    db.run('INSERT INTO llm_settings (provider, model) VALUES (?, ?)', 'openai', 'gpt-4o')
    const lessonsRouter = (await import('../routes/lessons.js')).default
    app = express()
    app.use(express.json({ limit: '32mb' }))
    app.use('/api', lessonsRouter)
    runtime = await import('../utils/activity-runtime.js')
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

  function seedBuild({ optionalReflection = false } = {}) {
    const topicId = Number(db.run("INSERT INTO topics (title, status) VALUES ('SQL', 'active')").lastInsertRowid)
    const moduleId = Number(db.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, 0, 'Joins')", topicId).lastInsertRowid)
    const lessonId = Number(db.run(
      'INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites, artifact_required, artifact_type, task_spec, activity_blocks) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      moduleId,
      'Build a join diagram',
      'Beginner',
      10,
      JSON.stringify([OUTCOME_A, OUTCOME_B]),
      '[]',
      1,
      'project',
      taskSpec(),
      JSON.stringify(makeActivityDocument(Number(db.get('SELECT COALESCE(MAX(id), 0) AS id FROM lessons').id) + 1, optionalReflection)),
    ).lastInsertRowid)
    db.run('UPDATE lessons SET activity_blocks = ? WHERE id = ?', JSON.stringify(makeActivityDocument(lessonId, optionalReflection)), lessonId)
    return { topicId, lessonId }
  }

  function completeBlocks({ topicId, lessonId, includeOptionalReflection = true }) {
    runtime.startActivitySession(topicId, lessonId)
    runtime.completeInformationalBlock({ topicId, lessonId, blockId: 'read-joins', action: 'continue', localDate: LOCAL_DATE })
    runtime.completeInformationalBlock({ topicId, lessonId, blockId: 'worked-join', action: 'continue', localDate: LOCAL_DATE })
    runtime.submitObjectiveBlock({ topicId, lessonId, blockId: 'choose-join', response: 'left', localDate: LOCAL_DATE })
    if (includeOptionalReflection) runtime.completeInformationalBlock({ topicId, lessonId, blockId: 'reflect-query', action: 'continue', response: 'Check preserved rows.', localDate: LOCAL_DATE })
    runtime.submitObjectiveBlock({ topicId, lessonId, blockId: 'order-query', response: ['from', 'join', 'select'], localDate: LOCAL_DATE })
  }

  it('gates Build submission on required structured blocks but ignores optional activity blocks', async () => {
    const seeded = seedBuild()
    runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    llmMocks.generateText.mockResolvedValueOnce(evaluation())
    const early = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/artifact`)
      .send({ evidence: { setup: 'local', actions: 'made diagram', result: 'showed rows', reflection: 'repeatable' }, localDate: LOCAL_DATE })
    expect(early.status).toBe(409)
    expect(early.body.code).toBe('ACTIVITIES_NOT_READY')
    expect(llmMocks.generateText).not.toHaveBeenCalled()
    expect(db.get('SELECT COUNT(*) AS count FROM artifacts').count).toBe(0)

    const optional = seedBuild({ optionalReflection: true })
    completeBlocks({ ...optional, includeOptionalReflection: false })
    llmMocks.generateText.mockResolvedValueOnce(evaluation())
    const ready = await request(app).post(`/api/topics/${optional.topicId}/lessons/${optional.lessonId}/artifact`)
      .send({ evidence: { setup: 'local', actions: 'made diagram', result: 'showed rows', reflection: 'repeatable' }, localDate: LOCAL_DATE })
    expect(ready.status).toBe(200)
    expect(ready.body.session.completed).toBe(true)
    expect(db.get('SELECT state FROM progress WHERE lesson_id = ?', optional.lessonId).state).toBe('passed')
  })

  it('keeps a failed rubric attempt practicing and passes the Session atomically with all completion effects', async () => {
    const seeded = seedBuild()
    completeBlocks(seeded)
    llmMocks.generateText.mockResolvedValueOnce(evaluation({ Correctness: 0, Completeness: 2, Clarity: 2, 'Edge Cases': 2 }))
    const failed = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/artifact`)
      .send({ evidence: { setup: 'local', actions: 'made diagram', result: 'missed unmatched rows', reflection: 'fix the relation' }, localDate: LOCAL_DATE })
    expect(failed.status).toBe(200)
    expect(failed.body.evaluation.passed).toBe(false)
    expect(failed.body.state).toBe('practicing')
    expect(db.get('SELECT state, artifact_passed, completed_at FROM progress WHERE lesson_id = ?', seeded.lessonId)).toMatchObject({ state: 'practicing', artifact_passed: 0, completed_at: null })

    llmMocks.generateText.mockResolvedValueOnce(evaluation())
    const passed = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/artifact`)
      .send({ evidence: { setup: 'local', actions: 'made fixed diagram', result: 'shows unmatched rows', reflection: 'repeatable' }, localDate: LOCAL_DATE })
    expect(passed.status).toBe(200)
    expect(passed.body.session).toMatchObject({ completed: true, requiresArtifact: true })
    const progress = db.get('SELECT state, artifact_passed, completed_at FROM progress WHERE lesson_id = ?', seeded.lessonId)
    expect(progress.state).toBe('passed')
    expect(progress.artifact_passed).toBe(1)
    expect(progress.completed_at).toBeTruthy()
    expect(db.get('SELECT due_date FROM srs_queue WHERE lesson_id = ?', seeded.lessonId).due_date).toBe('2024-03-01')
    expect(db.get('SELECT last_active_date FROM streaks').last_active_date).toBe(LOCAL_DATE)
    expect(db.get('SELECT last_active_at FROM topics WHERE id = ?', seeded.topicId).last_active_at).toBeTruthy()
    expect(db.get('SELECT COUNT(*) AS count FROM artifacts WHERE progress_id = (SELECT id FROM progress WHERE lesson_id = ?)', seeded.lessonId).count).toBe(2)

    const attempts = llmMocks.generateText.mock.calls.length
    const duplicate = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/artifact`)
      .send({ evidence: { setup: 'ignored', actions: 'ignored', result: 'ignored', reflection: 'ignored' }, localDate: LOCAL_DATE })
    expect(duplicate.body.alreadyCompleted).toBe(true)
    expect(llmMocks.generateText).toHaveBeenCalledTimes(attempts)
    expect(db.get('SELECT COUNT(*) AS count FROM artifacts WHERE progress_id = (SELECT id FROM progress WHERE lesson_id = ?)', seeded.lessonId).count).toBe(2)
  })

  it('does not write failed provider output, invalid evidence, or invalid local dates', async () => {
    const seeded = seedBuild()
    completeBlocks(seeded)
    const invalidEvidence = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/artifact`)
      .send({ evidence: { setup: 'local' }, localDate: LOCAL_DATE })
    expect(invalidEvidence.status).toBe(400)
    expect(db.get('SELECT COUNT(*) AS count FROM artifacts WHERE progress_id = (SELECT id FROM progress WHERE lesson_id = ?)', seeded.lessonId).count).toBe(0)

    llmMocks.generateText.mockResolvedValueOnce({ text: '{bad' })
    const malformed = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/artifact`)
      .send({ evidence: { setup: 'local', actions: 'made diagram', result: 'shows rows', reflection: 'repeatable' }, localDate: LOCAL_DATE })
    expect(malformed.status).toBe(502)
    expect(db.get('SELECT COUNT(*) AS count FROM artifacts WHERE progress_id = (SELECT id FROM progress WHERE lesson_id = ?)', seeded.lessonId).count).toBe(0)

    const invalidDate = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/artifact`)
      .send({ evidence: { setup: 'local', actions: 'made diagram', result: 'shows rows', reflection: 'repeatable' }, localDate: '2026-02-31' })
    expect(invalidDate.status).toBe(400)
    expect(invalidDate.body.code).toBe('INVALID_LOCAL_DATE')
    expect(db.get('SELECT artifact_passed FROM progress WHERE lesson_id = ?', seeded.lessonId).artifact_passed).toBe(0)
  })

  it('rolls artifact, artifact_passed, and completion side effects back as one transaction', async () => {
    const seeded = seedBuild()
    completeBlocks(seeded)
    db.run("CREATE TRIGGER fail_artifact_streak BEFORE INSERT ON streaks BEGIN SELECT RAISE(ABORT, 'injected'); END")
    llmMocks.generateText.mockResolvedValueOnce(evaluation())
    const result = await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/artifact`)
      .send({ evidence: { setup: 'local', actions: 'made diagram', result: 'shows rows', reflection: 'repeatable' }, localDate: LOCAL_DATE })
    expect(result.status).toBe(500)
    expect(db.get('SELECT state, artifact_passed, completed_at FROM progress WHERE lesson_id = ?', seeded.lessonId)).toMatchObject({ state: 'practicing', artifact_passed: 0, completed_at: null })
    expect(db.get('SELECT COUNT(*) AS count FROM artifacts WHERE progress_id = (SELECT id FROM progress WHERE lesson_id = ?)', seeded.lessonId).count).toBe(0)
    expect(db.get('SELECT COUNT(*) AS count FROM srs_queue WHERE lesson_id = ?', seeded.lessonId).count).toBe(0)
  })

  it('returns the latest scoped artifact attempt', async () => {
    const seeded = seedBuild()
    completeBlocks(seeded)
    llmMocks.generateText.mockResolvedValueOnce(evaluation({ Correctness: 0, Completeness: 2, Clarity: 2, 'Edge Cases': 2 }))
    await request(app).post(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/artifact`)
      .send({ evidence: { setup: 'local', actions: 'made diagram', result: 'missed rows', reflection: 'revise' }, localDate: LOCAL_DATE })
    const result = await request(app).get(`/api/topics/${seeded.topicId}/lessons/${seeded.lessonId}/artifact`)
    expect(result.status).toBe(200)
    expect(result.body.passed).toBe(false)
    expect(result.body.attemptNumber).toBe(1)
    expect(result.body.content).toContain('Result:')
  })
})
