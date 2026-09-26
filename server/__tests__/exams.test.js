import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'

const provider = vi.hoisted(() => ({ generation: null, evaluation: null, lastEvaluationPrompt: '', evaluationCalls: 0 }))

vi.mock('../llm/client.js', () => ({
  generateText: vi.fn(async ({ system }) => {
    const isEvaluation = system.includes('Evaluate these short written responses')
    if (isEvaluation) {
      provider.lastEvaluationPrompt = system
      provider.evaluationCalls += 1
    }
    const fallback = isEvaluation
      ? { evaluations: [{ questionId: 'core-written', criteria: [{ id: 'preserved-side', score: 100, feedback: 'You named the preserved side.' }, { id: 'no-match', score: 90, feedback: 'You explained unmatched rows.' }] }] }
      : system.includes('Targeted outcome IDs: all Chapter outcomes') ? {
          schemaVersion: 1,
          publicQuestions: [
            { id: 'core-choice', text: 'Which join keeps every row from the left input?', type: 'choice', weight: 1, required: true, outcomeIds: ['joins-core'], options: [{ id: 'left', label: 'LEFT JOIN' }, { id: 'inner', label: 'INNER JOIN' }] },
            { id: 'core-choice-two', text: 'Which side does a LEFT JOIN preserve?', type: 'choice', weight: 1, required: true, outcomeIds: ['joins-core'], options: [{ id: 'left-side', label: 'The left input' }, { id: 'right-side', label: 'The right input' }] },
            { id: 'core-written', text: 'Explain what happens to an unmatched left row.', type: 'written', weight: 2, required: true, outcomeIds: ['joins-core'] },
            { id: 'breadth-choice', text: 'What does NULL generally represent?', type: 'choice', weight: 1, required: true, outcomeIds: ['joins-breadth'], options: [{ id: 'unknown', label: 'Unknown or missing' }, { id: 'zero', label: 'Always zero' }] },
          ],
          answerKey: {
            'core-choice': { kind: 'choice', correctOptionId: 'left', explanation: 'A LEFT JOIN preserves every row from the left input.' },
            'core-choice-two': { kind: 'choice', correctOptionId: 'left-side', explanation: 'A LEFT JOIN preserves every row from the left input.' },
            'core-written': { kind: 'written', criteria: [{ id: 'preserved-side', outcomeId: 'joins-core', description: 'Names which side is preserved.', critical: true }, { id: 'no-match', outcomeId: 'joins-core', description: 'Explains unmatched rows.', critical: false }] },
            'breadth-choice': { kind: 'choice', correctOptionId: 'unknown', explanation: 'NULL represents an unknown or absent value.' },
          },
        } : {
          schemaVersion: 1,
          publicQuestions: [
            { id: 'core-choice', text: 'Which join keeps every row from the left input?', type: 'choice', weight: 1, required: true, outcomeIds: ['joins-core'], options: [{ id: 'left', label: 'LEFT JOIN' }, { id: 'inner', label: 'INNER JOIN' }] },
            { id: 'core-written', text: 'Explain what happens to an unmatched left row.', type: 'written', weight: 2, required: true, outcomeIds: ['joins-core'] },
          ],
          answerKey: {
            'core-choice': { kind: 'choice', correctOptionId: 'left', explanation: 'A LEFT JOIN preserves every row from the left input.' },
            'core-written': { kind: 'written', criteria: [{ id: 'preserved-side', outcomeId: 'joins-core', description: 'Names which side is preserved.', critical: true }, { id: 'no-match', outcomeId: 'joins-core', description: 'Explains unmatched rows.', critical: false }] },
          },
        }
    const value = isEvaluation ? provider.evaluation : provider.generation
    return { text: typeof value === 'string' ? value : JSON.stringify(value || fallback) }
  }),
  LlmClientError: class LlmClientError extends Error {
    constructor(message, { code, retryable = false } = {}) { super(message); this.code = code; this.retryable = retryable }
  },
}))

const outcomes = [
  { id: 'joins-core', title: 'Choose and explain the right join', kind: 'knowledge', role: 'core', evidence: ['checkpoint'] },
  { id: 'joins-breadth', title: 'Explain missing values', kind: 'knowledge', role: 'breadth', evidence: ['checkpoint'] },
]

function dbFile() {
  return path.join(os.tmpdir(), `test-checkpoints-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Chapter checkpoint API', () => {
  let dbPath
  let db
  let app
  let topicId
  let moduleId

  beforeEach(async () => {
    provider.generation = null
    provider.evaluation = null
    provider.lastEvaluationPrompt = ''
    provider.evaluationCalls = 0
    dbPath = dbFile()
    process.env.DB_PATH = dbPath
    process.env.OPENAI_API_KEY = 'sk-test'
    vi.resetModules()
    db = await import('../db.js')
    db.initSchema()
    db.run('INSERT INTO llm_settings (provider, model) VALUES (?, ?)', 'openai', 'gpt-4o')
    const topic = db.run('INSERT INTO topics (title, status) VALUES (?, ?)', 'SQL Trail', 'active')
    topicId = topic.lastInsertRowid
    const chapter = db.run('INSERT INTO modules (topic_id, module_index, title, skill_outcomes) VALUES (?, ?, ?, ?)', topicId, 0, 'Joins', JSON.stringify(outcomes))
    moduleId = chapter.lastInsertRowid
    for (const [index, title] of ['Join tables', 'Missing values'].entries()) {
      const lesson = db.run('INSERT INTO lessons (module_id, lesson_index, title, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?)', moduleId, index, title, JSON.stringify([outcomes[index]]), '[]')
      db.run('INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)', topicId, lesson.lastInsertRowid, 'passed')
    }
    const { default: exams } = await import('../routes/exams.js')
    app = express()
    app.use(express.json())
    app.use('/api', exams)
  })

  afterEach(() => {
    try { db?.default?.close() } catch { /* already closed */ }
    try { fs.unlinkSync(dbPath) } catch { /* database already removed */ }
    for (const key of ['DB_PATH', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'FIREWORKS_API_KEY', 'LLM_PROVIDER', 'LLM_MODEL']) delete process.env[key]
  })

  it('stores the private envelope but returns only public questions', async () => {
    const started = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(201)
    expect(started.body.questions).toHaveLength(4)
    expect(JSON.stringify(started.body)).not.toContain('answerKey')
    expect(JSON.stringify(started.body)).not.toContain('preserved-side')
    expect(started.body.outcomes).toEqual(outcomes)

    const stored = db.get('SELECT questions FROM exam_attempts WHERE id = ?', started.body.id)
    expect(JSON.parse(stored.questions).answerKey['core-choice'].correctOptionId).toBe('left')
    await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/save-progress`).send({ answers: { 'core-choice': 'left' } }).expect(200)
    const resumed = await request(app).get(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(200)
    expect(resumed.body.answers).toEqual({ 'core-choice': 'left' })
    expect(JSON.stringify(resumed.body)).not.toContain('answerKey')
    expect(resumed.body.schemaVersion).toBe(1)
  })

  it('rejects unsupported generated schemas without persisting an attempt', async () => {
    provider.generation = { schemaVersion: 2, publicQuestions: [], answerKey: {} }
    const response = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(502)
    expect(response.body.code).toBe('CHECKPOINT_OUTPUT_INVALID')
    expect(db.get('SELECT COUNT(*) AS count FROM exam_attempts').count).toBe(0)
  })

  it('rejects undersized full checkpoints before persisting them', async () => {
    provider.generation = {
      schemaVersion: 1,
      publicQuestions: [
        { id: 'core-choice', text: 'Which join keeps every row?', type: 'choice', weight: 1, required: true, outcomeIds: ['joins-core'], options: [{ id: 'left', label: 'LEFT JOIN' }, { id: 'inner', label: 'INNER JOIN' }] },
        { id: 'core-written', text: 'Explain what an unmatched row does.', type: 'written', weight: 2, required: true, outcomeIds: ['joins-core'] },
      ],
      answerKey: {
        'core-choice': { kind: 'choice', correctOptionId: 'left', explanation: 'LEFT JOIN keeps left rows.' },
        'core-written': { kind: 'written', criteria: [{ id: 'preserved-side', outcomeId: 'joins-core', description: 'Names the preserved side.', critical: true }, { id: 'no-match', outcomeId: 'joins-core', description: 'Explains unmatched rows.', critical: false }] },
      },
    }
    const response = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(502)
    expect(response.body.code).toBe('CHECKPOINT_OUTPUT_INVALID')
    expect(db.get('SELECT COUNT(*) AS count FROM exam_attempts').count).toBe(0)
  })

  it('fails closed when a stored checkpoint envelope is corrupted', async () => {
    const started = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(201)
    db.run('UPDATE exam_attempts SET questions = ? WHERE id = ?', JSON.stringify({ schemaVersion: 2, publicQuestions: [], answerKey: {} }), started.body.id)
    const response = await request(app).get(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(500)
    expect(response.body.code).toBe('CHECKPOINT_STORAGE_INVALID')
    expect(JSON.stringify(response.body)).not.toContain('answerKey')
  })

  it('blocks generation until every Session is complete', async () => {
    db.run('UPDATE progress SET state = ? WHERE topic_id = ? AND lesson_id = (SELECT id FROM lessons WHERE module_id = ? ORDER BY lesson_index LIMIT 1)', 'not_started', topicId, moduleId)
    const response = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(403)
    expect(response.body).toMatchObject({ examNotReady: true, lessonsRemaining: 1 })
  })

  it('keeps the Chapter locked when a Session has a retired test-out state', async () => {
    db.run('UPDATE progress SET state = ? WHERE topic_id = ? AND lesson_id = (SELECT id FROM lessons WHERE module_id = ? ORDER BY lesson_index DESC LIMIT 1)', 'tested_out', topicId, moduleId)
    const response = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(403)
    expect(response.body).toMatchObject({ examNotReady: true, lessonsRemaining: 1 })
  })

  it('requires complete answers and scores choice questions locally before completing the Chapter', async () => {
    await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(201)
    const incomplete = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`).send({ answers: { 'core-choice': 'left' } }).expect(400)
    expect(incomplete.body.unansweredCount).toBe(3)
    expect(db.get('SELECT status FROM exam_attempts ORDER BY id DESC').status).toBe('pending')

    const result = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`).send({ answers: { 'core-choice': 'left', 'core-choice-two': 'left-side', 'core-written': 'The left rows remain, with NULL values when no right row matches.', 'breadth-choice': 'unknown' }, localDate: '2026-09-26' }).expect(200)
    expect(result.body).toMatchObject({ passed: true, overallScore: 98, failedOutcomeIds: [], nextModuleUnlocked: false })
    expect(JSON.stringify(result.body)).not.toContain('preserved-side')
    expect(JSON.stringify(result.body)).not.toContain('answerKey')
    expect(result.body.perOutcomeEvidence['joins-core'].score).toBeGreaterThanOrEqual(60)
    expect(db.get('SELECT status FROM modules WHERE id = ?', moduleId).status).toBe('completed')
    expect(db.get('SELECT status FROM topics WHERE id = ?', topicId).status).toBe('completed')
    expect(db.get('SELECT status FROM exam_attempts ORDER BY id DESC').status).toBe('passed')
  })

  it('caps submitted written responses and evaluates only written answers', async () => {
    await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(201)
    const oversized = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`).send({ answers: {
      'core-choice': 'left',
      'core-choice-two': 'left-side',
      'core-written': 'x'.repeat(5001),
      'breadth-choice': 'unknown',
    } }).expect(400)
    expect(oversized.body.code).toBe('ANSWERS_INVALID')
    expect(provider.evaluationCalls).toBe(0)

    const writtenResponse = 'Written-only marker: unmatched left rows remain.'
    await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`).send({ answers: {
      'core-choice': 'left',
      'core-choice-two': 'left-side',
      'core-written': writtenResponse,
      'breadth-choice': 'unknown',
    } }).expect(200)
    expect(provider.lastEvaluationPrompt).toContain(writtenResponse)
    expect(provider.lastEvaluationPrompt).toContain('core-written')
    expect(provider.lastEvaluationPrompt).not.toContain('core-choice')
    expect(provider.lastEvaluationPrompt).not.toContain('unknown')
  })

  it('keeps a pending attempt when evaluator output is incomplete', async () => {
    provider.evaluation = { evaluations: [{ questionId: 'core-written', criteria: [{ id: 'preserved-side', score: 95, feedback: 'Good.' }] }] }
    await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(201)
    const result = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`).send({ answers: { 'core-choice': 'left', 'core-choice-two': 'left-side', 'core-written': 'The left rows remain.', 'breadth-choice': 'unknown' } }).expect(502)
    expect(result.body.code).toBe('CHECKPOINT_EVALUATION_INVALID')
    expect(db.get('SELECT status, evaluation FROM exam_attempts ORDER BY id DESC')).toMatchObject({ status: 'pending', evaluation: null })
  })

  it('rejects oversized evaluator feedback without committing any result', async () => {
    provider.evaluation = { evaluations: [{ questionId: 'core-written', criteria: [
      { id: 'preserved-side', score: 95, feedback: 'x'.repeat(501) },
      { id: 'no-match', score: 90, feedback: 'Valid feedback.' },
    ] }] }
    await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(201)
    const result = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`).send({ answers: {
      'core-choice': 'left',
      'core-choice-two': 'left-side',
      'core-written': 'The left rows remain.',
      'breadth-choice': 'unknown',
    } }).expect(502)
    expect(result.body.code).toBe('CHECKPOINT_EVALUATION_INVALID')
    expect(db.get('SELECT status, evaluation FROM exam_attempts ORDER BY id DESC')).toMatchObject({ status: 'pending', evaluation: null })
    expect(db.get('SELECT status FROM modules WHERE id = ?', moduleId).status).not.toBe('completed')
  })

  it('requires missed outcome IDs and allows targeted retest to repair core mastery', async () => {
    await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).expect(201)
    provider.evaluation = { evaluations: [{ questionId: 'core-written', criteria: [{ id: 'preserved-side', score: 30, feedback: 'Name the preserved side.' }, { id: 'no-match', score: 20, feedback: 'Explain unmatched rows.' }] }] }
    const failed = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`).send({ answers: { 'core-choice': 'inner', 'core-choice-two': 'left-side', 'core-written': 'I am not sure.', 'breadth-choice': 'unknown' } }).expect(200)
    expect(failed.body.passed).toBe(false)
    expect(failed.body.failedOutcomeIds).toContain('joins-core')
    await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/partial-retest`).send({ failedOutcomeIds: ['joins-breadth'] }).expect(400)

    provider.evaluation = null
    const retake = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/retake`).expect(201)
    expect(retake.body.questions).toBeInstanceOf(Array)
    expect(JSON.stringify(retake.body)).not.toContain('answerKey')
    expect(JSON.stringify(retake.body)).not.toContain('preserved-side')
    const retest = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/partial-retest`).send({ failedOutcomeIds: ['joins-core'] }).expect(201)
    expect(retest.body.type).toBe('partial')
    expect(retest.body.questions.every((question) => question.outcomeIds.every((id) => id === 'joins-core'))).toBe(true)
    expect(JSON.stringify(retest.body)).not.toContain('answerKey')
    expect(JSON.stringify(retest.body)).not.toContain('preserved-side')
    const passed = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/partial-retest/${retest.body.id}/submit`).send({ answers: { 'core-choice': 'left', 'core-written': 'The left side is kept, and missing matches become NULL.' }, localDate: '2026-09-26' })
    expect(passed.status, JSON.stringify(passed.body)).toBe(200)
    expect(passed.body).toMatchObject({ passed: true, partialPass: true, modulePassed: true })
    expect(JSON.stringify(passed.body)).not.toContain('preserved-side')
    expect(db.get('SELECT status FROM modules WHERE id = ?', moduleId).status).toBe('completed')
    expect(db.get('SELECT status FROM topics WHERE id = ?', topicId).status).toBe('completed')
  })
})
