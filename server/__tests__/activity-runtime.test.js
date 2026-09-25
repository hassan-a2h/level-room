import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

const LOCAL_DATE = '2024-02-29'
const NOW = '2024-02-29T18:30:00.000Z'
const OUTCOME_A = { id: 'sql-choose-join', title: 'Choose the correct join', kind: 'skill', role: 'core', evidence: ['activity'] }
const OUTCOME_B = { id: 'sql-order-query', title: 'Order a SQL query', kind: 'skill', role: 'core', evidence: ['activity'] }

function tempDbPath() {
  return path.join(os.tmpdir(), `test-activity-runtime-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

function makeActivityDocument(lessonId, { optionalReflection = false, writtenAnswer = false } = {}) {
  const block = (id, type, outcomeIds, fields) => ({ id, type, title: `Practice ${id}`, required: true, estimatedMinutes: 2, outcomeIds, ...fields })
  return {
    schemaVersion: 1,
    promptVersion: 'session-activities-v1',
    generator: { provider: 'openai', model: 'test-model', generatedAt: NOW },
    lesson: { lessonId, outcomeIds: [OUTCOME_A.id, OUTCOME_B.id], estimatedMinutes: 10 },
    blocks: [
      block('read-joins', 'read', [OUTCOME_A.id], { content: 'A join combines related rows.' }),
      block('worked-join', 'worked_example', [OUTCOME_A.id], {
        problem: 'Which side should remain?',
        steps: [{ id: 'inspect', title: 'Inspect the rows', content: 'Find which records must remain.' }, { id: 'choose', title: 'Choose a join', content: 'Select the join that preserves that side.' }],
        takeaway: 'Decide which unmatched rows matter.',
      }),
      block('choose-join', 'choice', [OUTCOME_A.id], {
        prompt: 'Which join keeps every left-side row?',
        options: [{ id: 'inner', label: 'INNER JOIN' }, { id: 'left', label: 'LEFT JOIN' }],
      }),
      block('reflect-query', 'reflection', [OUTCOME_B.id], { prompt: 'What will you inspect first?', maxChars: 100 }),
      block('order-query', 'ordering', [OUTCOME_B.id], {
        prompt: 'Put the query stages in order.',
        items: [{ id: 'from', label: 'Choose source' }, { id: 'join', label: 'Join tables' }, { id: 'select', label: 'Choose columns' }],
      }),
      ...(writtenAnswer ? [block('explain-join', 'short_answer', [OUTCOME_B.id], {
        prompt: 'Explain why the query order matters.',
        responseHint: 'Mention sequence and preserved rows.',
        minChars: 5,
        maxChars: 250,
      })] : []),
    ].map((item) => item.id === 'reflect-query' && optionalReflection ? { ...item, required: false } : item),
    answerKey: {
      'choose-join': { kind: 'choice', correctOptionId: 'left', explanation: 'LEFT JOIN keeps unmatched left rows.', critical: true },
      'order-query': { kind: 'ordering', correctOrder: ['from', 'join', 'select'], explanation: 'Start with the source, then join, then select columns.', critical: false },
      ...(writtenAnswer ? { 'explain-join': {
        kind: 'short_answer',
        criteria: [
          { id: 'source-first', label: 'Source first', description: 'Names the source relation first.', critical: true },
          { id: 'join-next', label: 'Join next', description: 'Explains when the join is applied.', critical: true },
          { id: 'select-last', label: 'Select last', description: 'Explains selecting output columns.', critical: false },
          { id: 'left-rows', label: 'Preserve rows', description: 'Mentions preserved left-side rows.', critical: false },
        ],
        exemplar: 'Start with the source relation, join related rows, then select columns.',
      } } : {}),
    },
  }
}

function seedLesson(db, { requiresArtifact = false, prerequisite = false } = {}) {
  const topic = db.run("INSERT INTO topics (title, status) VALUES ('SQL', 'active')")
  const module = db.run('INSERT INTO modules (topic_id, module_index, title) VALUES (?, 0, ?)', topic.lastInsertRowid, 'Joins')
  let prerequisiteId = null
  if (prerequisite) prerequisiteId = Number(db.run('INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, 0, ?)', module.lastInsertRowid, 'Tables').lastInsertRowid)
  const lessonId = Number(db.run(
    'INSERT INTO lessons (module_id, lesson_index, title, estimated_time, outcomes, prerequisites, artifact_required) VALUES (?, ?, ?, ?, ?, ?, ?)',
    module.lastInsertRowid,
    prerequisite ? 1 : 0,
    'Joins',
    10,
    JSON.stringify([OUTCOME_A, OUTCOME_B]),
    prerequisite ? JSON.stringify([{ lessonId: prerequisiteId, title: 'Tables' }]) : '[]',
    requiresArtifact ? 1 : 0,
  ).lastInsertRowid)
  db.run('UPDATE lessons SET activity_blocks = ? WHERE id = ?', JSON.stringify(makeActivityDocument(lessonId)), lessonId)
  return { topicId: Number(topic.lastInsertRowid), lessonId, prerequisiteId }
}

function captureError(fn) {
  try { fn() } catch (error) { return error }
  throw new Error('Expected operation to throw')
}

function input(topicId, lessonId, blockId, extra = {}) {
  return { topicId, lessonId, blockId, localDate: LOCAL_DATE, now: NOW, ...extra }
}

describe('transactional activity runtime', () => {
  let dbPath
  let db
  let runtime

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    db = await import('../db.js')
    db.initSchema()
    runtime = await import('../utils/activity-runtime.js')
  })

  afterEach(() => {
    try { db.default.close() } catch {}
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  it('starts once with the first required block and enforces prerequisites', () => {
    const seeded = seedLesson(db)
    const started = runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    expect(started.activityState.currentBlockId).toBe('read-joins')
    expect(started.activityState.blocks['read-joins']).toMatchObject({ status: 'active', attempts: 0 })
    expect(runtime.startActivitySession(seeded.topicId, seeded.lessonId).activityState).toEqual(started.activityState)
    expect(db.get('SELECT COUNT(*) AS count FROM progress WHERE topic_id = ? AND lesson_id = ?', seeded.topicId, seeded.lessonId).count).toBe(1)

    const locked = seedLesson(db, { prerequisite: true })
    const error = captureError(() => runtime.startActivitySession(locked.topicId, locked.lessonId))
    expect(error.code).toBe('PREREQUISITES_NOT_MET')
  })

  it('completes informational blocks in order and keeps an optional block from gating progress', () => {
    const seeded = seedLesson(db)
    db.run('UPDATE lessons SET activity_blocks = ? WHERE id = ?', JSON.stringify(makeActivityDocument(seeded.lessonId, { optionalReflection: true })), seeded.lessonId)
    runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'read-joins', { action: 'continue' }))
    expect(JSON.parse(db.get('SELECT activity_state FROM progress WHERE lesson_id = ?', seeded.lessonId).activity_state).currentBlockId).toBe('worked-join')
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'worked-join', { action: 'continue' }))
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'reflect-query', { action: 'continue', response: 'Check preserved rows.' }))
    expect(JSON.parse(db.get('SELECT activity_state FROM progress WHERE lesson_id = ?', seeded.lessonId).activity_state)).toMatchObject({
      currentBlockId: 'choose-join',
      blocks: { 'reflect-query': { status: 'completed' } },
    })
    const locked = captureError(() => runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'order-query', { response: ['from', 'join', 'select'] })))
    expect(locked.code).toBe('ACTIVITY_BLOCK_LOCKED')
  })

  it('rejects future or unknown blocks and malformed persisted activity state without mutation', () => {
    const seeded = seedLesson(db)
    runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    const unknown = captureError(() => runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'missing-block', { action: 'continue' })))
    expect(unknown.code).toBe('ACTIVITY_BLOCK_NOT_FOUND')
    const future = captureError(() => runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'order-query', { response: ['from', 'join', 'select'] })))
    expect(future.code).toBe('ACTIVITY_BLOCK_LOCKED')
    const before = db.get('SELECT activity_state FROM progress WHERE lesson_id = ?', seeded.lessonId).activity_state
    db.run('UPDATE progress SET activity_state = ? WHERE lesson_id = ?', '{bad', seeded.lessonId)
    const corrupted = captureError(() => runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'read-joins', { action: 'continue' })))
    expect(corrupted.code).toBe('ACTIVITY_STATE_INVALID')
    expect(db.get('SELECT state FROM progress WHERE lesson_id = ?', seeded.lessonId).state).toBe('practicing')
    expect(db.get('SELECT activity_state FROM progress WHERE lesson_id = ?', seeded.lessonId).activity_state).not.toBe(before)
  })

  it('scores choice and ordering on the server, retries wrong answers, and caps responses', () => {
    const seeded = seedLesson(db)
    runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'read-joins', { action: 'continue' }))
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'worked-join', { action: 'continue' }))
    const wrong = runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'choose-join', { response: 'inner' }))
    expect(wrong).toMatchObject({ correct: false, status: 'needs_retry' })
    let state = JSON.parse(db.get('SELECT activity_state FROM progress WHERE lesson_id = ?', seeded.lessonId).activity_state)
    expect(state.blocks['choose-join'].attempts).toBe(1)
    const correct = runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'choose-join', { response: 'left' }))
    expect(correct).toMatchObject({ correct: true, status: 'passed' })
    const duplicate = runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'choose-join', { response: 'left' }))
    expect(duplicate).toMatchObject({ correct: true, status: 'passed' })
    state = JSON.parse(db.get('SELECT activity_state FROM progress WHERE lesson_id = ?', seeded.lessonId).activity_state)
    expect(state.blocks['choose-join'].attempts).toBe(2)
    const conflict = captureError(() => runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'choose-join', { response: 'inner' })))
    expect(conflict.code).toBe('BLOCK_ALREADY_FINAL')
    expect(conflict.latestState).toBeTruthy()

    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'reflect-query', { action: 'continue', response: 'Use a LEFT JOIN.' }))
    const tooLong = captureError(() => runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'reflect-query', { action: 'continue', response: 'x'.repeat(101) })))
    expect(tooLong.code).toBe('ACTIVITY_RESPONSE_INVALID')
  })

  it('validates written rubric IDs and applies the critical-plus-70-percent pass rule', () => {
    const seeded = seedLesson(db)
    const doc = makeActivityDocument(seeded.lessonId, { writtenAnswer: true })
    db.run('UPDATE lessons SET activity_blocks = ? WHERE id = ?', JSON.stringify(doc), seeded.lessonId)
    runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'read-joins', { action: 'continue' }))
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'worked-join', { action: 'continue' }))
    runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'choose-join', { response: 'left' }))
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'reflect-query', { action: 'continue', response: 'Inspect preserved rows.' }))
    runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'order-query', { response: ['from', 'join', 'select'] }))
    const response = 'Start with the source relation, join related rows, then select the required output columns.'
    const criterionResult = (id, passed) => ({ id, passed, feedback: passed ? 'Clear explanation.' : 'Add this detail.' })
    const invalid = captureError(() => runtime.recordWrittenEvaluation(input(seeded.topicId, seeded.lessonId, 'explain-join', {
      response,
      evaluation: { criteria: [criterionResult('source-first', true), criterionResult('wrong-id', true)], feedback: 'Good start.', nextStep: 'Explain the ordering.' },
    })))
    expect(invalid.code).toBe('WRITTEN_EVALUATION_INVALID')
    expect(JSON.parse(db.get('SELECT activity_state FROM progress WHERE lesson_id = ?', seeded.lessonId).activity_state).blocks['explain-join']).toMatchObject({ status: 'active', attempts: 0 })

    const failed = runtime.recordWrittenEvaluation(input(seeded.topicId, seeded.lessonId, 'explain-join', {
      response,
      evaluation: {
        criteria: [criterionResult('source-first', true), criterionResult('join-next', false), criterionResult('select-last', true), criterionResult('left-rows', true)],
        feedback: 'The main sequence is clear.', nextStep: 'Explain how the join preserves matching rows.',
      },
    }))
    expect(failed).toMatchObject({ correct: false, status: 'needs_retry' })
    const retry = runtime.recordWrittenEvaluation(input(seeded.topicId, seeded.lessonId, 'explain-join', {
      response: `${response} It preserves the left rows that have no match.`,
      evaluation: {
        criteria: [criterionResult('source-first', true), criterionResult('join-next', true), criterionResult('select-last', false), criterionResult('left-rows', true)],
        feedback: 'The important criteria are present.', nextStep: 'Keep the query stages in order.',
      },
    }))
    expect(retry).toMatchObject({ correct: true, status: 'passed' })
    expect(retry.criteria).toHaveLength(4)
    expect(retry.nextStep).toBe('Keep the query stages in order.')
  })

  it('rejects stale requests and invalid local dates while returning the latest public state', () => {
    const seeded = seedLesson(db)
    runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'read-joins', { action: 'continue' }))
    const sameRequest = runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'read-joins', { action: 'continue' }))
    expect(sameRequest.status).toBe('completed')
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'worked-join', { action: 'continue' }))
    runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'choose-join', { response: 'left' }))
    const reflection = runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'reflect-query', { action: 'continue', response: 'Inspect the kept side.' }))
    expect(reflection.activityProgress.currentBlockId).toBe('order-query')
    const stale = captureError(() => runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'reflect-query', { action: 'continue', response: 'Inspect something else.' })))
    expect(stale.code).toBe('BLOCK_ALREADY_FINAL')
    expect(stale.latestState.currentBlockId).toBe('order-query')
    const invalidDate = captureError(() => runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'worked-join', { action: 'continue', localDate: '2026-02-31' })))
    expect(invalidDate.code).toBe('INVALID_LOCAL_DATE')
  })

  it('gates completion on a required Build and completes when the artifact passes', () => {
    const seeded = seedLesson(db, { requiresArtifact: true })
    runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'read-joins', { action: 'continue' }))
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'worked-join', { action: 'continue' }))
    runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'choose-join', { response: 'left' }))
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'reflect-query', { action: 'continue', response: 'Inspect preserved rows.' }))
    const result = runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'order-query', { response: ['from', 'join', 'select'] }))
    expect(result.session).toMatchObject({ completed: false, requiresArtifact: true })
    expect(db.get('SELECT state, completed_at FROM progress WHERE lesson_id = ?', seeded.lessonId)).toMatchObject({ state: 'practicing', completed_at: null })

    db.run('UPDATE progress SET artifact_passed = 1 WHERE lesson_id = ?', seeded.lessonId)
    const completed = runtime.completeActivitySessionIfEligible(seeded.topicId, seeded.lessonId, { localDate: LOCAL_DATE, now: NOW })
    expect(completed).toMatchObject({ completed: true, requiresArtifact: true })
    expect(db.get('SELECT state, completed_at FROM progress WHERE lesson_id = ?', seeded.lessonId).state).toBe('passed')
  })

  it('atomically commits completion, SRS, streak, mistake clearing, and topic activity once', () => {
    const seeded = seedLesson(db)
    db.run('INSERT INTO mistakes_log (topic_id, lesson_id, description, cleared_after) VALUES (?, ?, ?, 0)', seeded.topicId, seeded.lessonId, 'prior gap')
    runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'read-joins', { action: 'continue' }))
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'worked-join', { action: 'continue' }))
    runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'choose-join', { response: 'left' }))
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'reflect-query', { action: 'continue', response: 'Inspect preserved rows.' }))
    const result = runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'order-query', { response: ['from', 'join', 'select'] }))

    expect(result.session.completed).toBe(true)
    expect(db.get('SELECT state, completed_at FROM progress WHERE lesson_id = ?', seeded.lessonId).state).toBe('passed')
    expect(db.get('SELECT due_date FROM srs_queue WHERE lesson_id = ?', seeded.lessonId).due_date).toBe('2024-03-01')
    expect(db.get('SELECT current_streak, last_active_date FROM streaks').last_active_date).toBe(LOCAL_DATE)
    expect(db.get('SELECT cleared_after FROM mistakes_log WHERE topic_id = ?', seeded.topicId).cleared_after).toBe(1)
    expect(db.get('SELECT last_active_at FROM topics WHERE id = ?', seeded.topicId).last_active_at).toBe(NOW)
    runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'order-query', { response: ['from', 'join', 'select'] }))
    expect(db.get('SELECT COUNT(*) AS count FROM srs_queue WHERE lesson_id = ?', seeded.lessonId).count).toBe(1)
    expect(db.get('SELECT COUNT(*) AS count FROM streaks').count).toBe(1)
  })

  it.each([
    ['activity_state update', "CREATE TRIGGER fail_activity BEFORE UPDATE OF activity_state ON progress BEGIN SELECT RAISE(ABORT, 'injected'); END"],
    ['passed state update', "CREATE TRIGGER fail_pass BEFORE UPDATE OF state ON progress WHEN NEW.state = 'passed' BEGIN SELECT RAISE(ABORT, 'injected'); END"],
    ['SRS insert', "CREATE TRIGGER fail_srs BEFORE INSERT ON srs_queue BEGIN SELECT RAISE(ABORT, 'injected'); END"],
    ['streak insert', "CREATE TRIGGER fail_streak BEFORE INSERT ON streaks BEGIN SELECT RAISE(ABORT, 'injected'); END"],
    ['mistake update', "CREATE TRIGGER fail_mistake BEFORE UPDATE OF cleared_after ON mistakes_log BEGIN SELECT RAISE(ABORT, 'injected'); END"],
    ['topic timestamp update', "CREATE TRIGGER fail_topic BEFORE UPDATE OF last_active_at ON topics BEGIN SELECT RAISE(ABORT, 'injected'); END"],
  ])('rolls back every completion write when %s fails', (_name, triggerSql) => {
    const seeded = seedLesson(db)
    db.run('INSERT INTO mistakes_log (topic_id, lesson_id, description, cleared_after) VALUES (?, ?, ?, 0)', seeded.topicId, seeded.lessonId, 'prior gap')
    runtime.startActivitySession(seeded.topicId, seeded.lessonId)
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'read-joins', { action: 'continue' }))
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'worked-join', { action: 'continue' }))
    runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'choose-join', { response: 'left' }))
    runtime.completeInformationalBlock(input(seeded.topicId, seeded.lessonId, 'reflect-query', { action: 'continue', response: 'Inspect preserved rows.' }))
    db.run(triggerSql)

    expect(() => runtime.submitObjectiveBlock(input(seeded.topicId, seeded.lessonId, 'order-query', { response: ['from', 'join', 'select'] }))).toThrow()
    expect(db.get('SELECT state, completed_at FROM progress WHERE lesson_id = ?', seeded.lessonId)).toMatchObject({ state: 'practicing', completed_at: null })
    expect(JSON.parse(db.get('SELECT activity_state FROM progress WHERE lesson_id = ?', seeded.lessonId).activity_state).currentBlockId).toBe('order-query')
    expect(db.get('SELECT COUNT(*) AS count FROM srs_queue WHERE lesson_id = ?', seeded.lessonId).count).toBe(0)
    expect(db.get('SELECT COUNT(*) AS count FROM streaks').count).toBe(0)
    expect(db.get('SELECT cleared_after FROM mistakes_log WHERE topic_id = ?', seeded.topicId).cleared_after).toBe(0)
    expect(db.get('SELECT last_active_at FROM topics WHERE id = ?', seeded.topicId).last_active_at).toBeNull()
  })
})
