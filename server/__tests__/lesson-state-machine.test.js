import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

function tempDbPath() {
  return path.join(os.tmpdir(), `test-sm-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Lesson State Machine', () => {
  let dbPath
  let dbModule
  let sm

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    const { initSchema, get, run } = await import('../db.js')
    const { all } = await import('../db.js')
    dbModule = { initSchema, get, run, all }
    dbModule.initSchema()

    // Seed LLM settings for any downstream callers
    dbModule.run(
      'INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)',
      'openai',
      'sk-test',
      'gpt-4o',
    )

    sm = await import('../utils/lesson-state-machine.js')
  })

  afterEach(() => {
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  function seedTopicAndLesson(topicTitle = 'React', lessonTitle = 'JSX', prerequisites = '[]') {
    const topic = dbModule.run("INSERT INTO topics (title, status, interaction_mode) VALUES (?, ?, ?)", topicTitle, 'active', 'socratic')
    const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
    const lesson = dbModule.run(
      "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
      mod.lastInsertRowid, 0, lessonTitle, 'Beginner', 10, JSON.stringify(['Understand JSX']), prerequisites
    )
    return { topicId: topic.lastInsertRowid, lessonId: lesson.lastInsertRowid }
  }

  function seedWithPrereq() {
    const topic = dbModule.run("INSERT INTO topics (title, status, interaction_mode) VALUES (?, ?, ?)", 'React', 'active', 'socratic')
    const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
    const prereq = dbModule.run(
      "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
      mod.lastInsertRowid, 0, 'Components', 'Beginner', 10, JSON.stringify(['Know components']), '[]'
    )
    const lesson = dbModule.run(
      "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
      mod.lastInsertRowid, 1, 'Hooks', 'Intermediate', 15, JSON.stringify(['Use hooks']), JSON.stringify([{ lessonId: prereq.lastInsertRowid, title: 'Components' }])
    )
    return { topicId: topic.lastInsertRowid, lessonId: lesson.lastInsertRowid, prereqId: prereq.lastInsertRowid }
  }

  describe('State constants and helpers', () => {
    it('has exactly the required states', () => {
      expect(sm.STATES.NOT_STARTED).toBe('not_started')
      expect(sm.STATES.PRACTICING).toBe('practicing')
      expect(sm.STATES.QUIZ_PENDING).toBe('quiz_pending')
      expect(sm.STATES.REMEDIATING).toBe('remediating')
      expect(sm.STATES.PASSED).toBe('passed')
      expect(sm.STATES.TESTED_OUT).toBe('tested_out')
      expect(sm.STATES.SKIPPED).toBe('skipped')
    })

    it('rejects invalid states', () => {
      expect(sm.isValidState('not_started')).toBe(true)
      expect(sm.isValidState('practicing')).toBe(true)
      expect(sm.isValidState('passed')).toBe(true)
      expect(sm.isValidState('invalid')).toBe(false)
      expect(sm.isValidState('')).toBe(false)
      expect(sm.isValidState(null)).toBe(false)
    })

    it('validates allowed transitions', () => {
      expect(sm.canTransition('not_started', 'practicing')).toBe(true)
      expect(sm.canTransition('not_started', 'skipped')).toBe(true)
      expect(sm.canTransition('not_started', 'tested_out')).toBe(true)
      expect(sm.canTransition('practicing', 'quiz_pending')).toBe(true)
      expect(sm.canTransition('quiz_pending', 'passed')).toBe(true)
      expect(sm.canTransition('quiz_pending', 'remediating')).toBe(true)
      expect(sm.canTransition('remediating', 'quiz_pending')).toBe(true)

      expect(sm.canTransition('not_started', 'passed')).toBe(false)
      expect(sm.canTransition('practicing', 'passed')).toBe(false)
      expect(sm.canTransition('passed', 'practicing')).toBe(false)
      expect(sm.canTransition('skipped', 'practicing')).toBe(false)
      expect(sm.canTransition('tested_out', 'practicing')).toBe(false)
    })

    it('returns valid transitions for each state', () => {
      expect(sm.getValidTransitions('not_started')).toEqual(['practicing', 'skipped', 'tested_out'])
      expect(sm.getValidTransitions('practicing')).toEqual(['quiz_pending', 'skipped', 'tested_out'])
      expect(sm.getValidTransitions('quiz_pending')).toEqual(['passed', 'remediating', 'skipped'])
      expect(sm.getValidTransitions('remediating')).toEqual(['quiz_pending', 'skipped'])
      expect(sm.getValidTransitions('passed')).toEqual([])
      expect(sm.getValidTransitions('tested_out')).toEqual([])
      expect(sm.getValidTransitions('skipped')).toEqual([])
    })
  })

  describe('Prerequisites enforcement', () => {
    it('allows starting when prerequisites are met', () => {
      const { topicId, lessonId, prereqId } = seedWithPrereq()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, prereqId, 'passed')
      const prereq = sm.checkPrerequisites(topicId, lessonId)
      expect(prereq.locked).toBe(false)
      expect(prereq.unmet).toHaveLength(0)
    })

    it('blocks starting when prerequisites are not met', () => {
      const { topicId, lessonId } = seedWithPrereq()
      const prereq = sm.checkPrerequisites(topicId, lessonId)
      expect(prereq.locked).toBe(true)
      expect(prereq.unmet).toHaveLength(1)
      expect(prereq.unmet[0].title).toBe('Components')
    })

    it('blocks starting when prerequisite is not_started', () => {
      const { topicId, lessonId, prereqId } = seedWithPrereq()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, prereqId, 'not_started')
      const prereq = sm.checkPrerequisites(topicId, lessonId)
      expect(prereq.locked).toBe(true)
    })

    it('allows starting when prerequisite is tested_out', () => {
      const { topicId, lessonId, prereqId } = seedWithPrereq()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, prereqId, 'tested_out')
      const prereq = sm.checkPrerequisites(topicId, lessonId)
      expect(prereq.locked).toBe(false)
    })

    it('allows starting a lesson with no prerequisites', () => {
      const { topicId, lessonId } = seedTopicAndLesson('React', 'JSX', '[]')
      const prereq = sm.checkPrerequisites(topicId, lessonId)
      expect(prereq.locked).toBe(false)
    })

    it('allows starting a lesson with empty prerequisites string', () => {
      const { topicId, lessonId } = seedTopicAndLesson('React', 'JSX', '')
      const prereq = sm.checkPrerequisites(topicId, lessonId)
      expect(prereq.locked).toBe(false)
    })

    it('startPracticing throws when prerequisites not met', () => {
      const { topicId, lessonId } = seedWithPrereq()
      expect(() => sm.startPracticing({ topicId, lessonId })).toThrow(sm.StateMachineError)
    })
  })

  describe('State transitions', () => {
    describe('not_started -> practicing', () => {
      it('creates progress row on first practice', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        const result = sm.startPracticing({ topicId, lessonId, currentChunk: 1, totalChunks: 3 })
        expect(result.fromState).toBe('not_started')
        expect(result.toState).toBe('practicing')
        const prog = dbModule.get('SELECT state, current_chunk, total_chunks FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
        expect(prog.state).toBe('practicing')
        expect(prog.current_chunk).toBe(1)
        expect(prog.total_chunks).toBe(3)
      })

      it('updates existing not_started row to practicing', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        dbModule.run('INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)', topicId, lessonId, 'not_started')
        const result = sm.startPracticing({ topicId, lessonId })
        expect(result.fromState).toBe('not_started')
        expect(result.toState).toBe('practicing')
      })
    })

    describe('practicing -> quiz_pending', () => {
      it('transitions successfully', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        sm.startPracticing({ topicId, lessonId })
        const result = sm.startQuiz({ topicId, lessonId })
        expect(result.fromState).toBe('practicing')
        expect(result.toState).toBe('quiz_pending')
        const prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
        expect(prog.state).toBe('quiz_pending')
      })

      it('throws when not in practicing state', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        expect(() => sm.startQuiz({ topicId, lessonId })).toThrow(sm.StateMachineError)
      })
    })

    describe('quiz_pending -> passed', () => {
      it('transitions on passing score', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        sm.startPracticing({ topicId, lessonId })
        sm.startQuiz({ topicId, lessonId })
        const result = sm.recordQuizResult({
          topicId,
          lessonId,
          passed: true,
          quizScore: 85,
          answers: { q1: 'answer' },
          evaluation: { overallScore: 85 },
        })
        expect(result.fromState).toBe('quiz_pending')
        expect(result.toState).toBe('passed')
        const prog = dbModule.get('SELECT state, quiz_score, quiz_attempts, completed_at FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
        expect(prog.state).toBe('passed')
        expect(prog.quiz_score).toBe(85)
        expect(prog.quiz_attempts).toBe(1)
        expect(prog.completed_at).toBeTruthy()
      })
    })

    describe('quiz_pending -> remediating', () => {
      it('transitions on failing score', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        sm.startPracticing({ topicId, lessonId })
        sm.startQuiz({ topicId, lessonId })
        const result = sm.recordQuizResult({
          topicId,
          lessonId,
          passed: false,
          quizScore: 60,
          answers: { q1: 'wrong' },
          evaluation: { overallScore: 60, gaps: ['g'] },
        })
        expect(result.fromState).toBe('quiz_pending')
        expect(result.toState).toBe('remediating')
        const prog = dbModule.get('SELECT state, quiz_score, quiz_attempts, completed_at FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
        expect(prog.state).toBe('remediating')
        expect(prog.quiz_score).toBe(60)
        expect(prog.quiz_attempts).toBe(1)
        expect(prog.completed_at).toBeNull()
      })
    })

    describe('remediating -> quiz_pending', () => {
      it('transitions successfully', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        sm.startPracticing({ topicId, lessonId })
        sm.startQuiz({ topicId, lessonId })
        sm.recordQuizResult({ topicId, lessonId, passed: false, quizScore: 50 })
        const result = sm.startRetest({ topicId, lessonId })
        expect(result.fromState).toBe('remediating')
        expect(result.toState).toBe('quiz_pending')
        const prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
        expect(prog.state).toBe('quiz_pending')
      })

      it('throws when not in remediating state', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        sm.startPracticing({ topicId, lessonId })
        expect(() => sm.startRetest({ topicId, lessonId })).toThrow(sm.StateMachineError)
      })
    })

    describe('not_started -> skipped', () => {
      it('creates progress row when skipped from not_started', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        const result = sm.skipLesson({ topicId, lessonId })
        expect(result.fromState).toBe('not_started')
        expect(result.toState).toBe('skipped')
        const prog = dbModule.get('SELECT state, completed_at FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
        expect(prog.state).toBe('skipped')
        expect(prog.completed_at).toBeTruthy()
      })
    })

    describe('practicing -> skipped', () => {
      it('updates existing progress row', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        sm.startPracticing({ topicId, lessonId })
        const result = sm.skipLesson({ topicId, lessonId })
        expect(result.fromState).toBe('practicing')
        expect(result.toState).toBe('skipped')
      })
    })

    describe('quiz_pending -> skipped', () => {
      it('is allowed', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        sm.startPracticing({ topicId, lessonId })
        sm.startQuiz({ topicId, lessonId })
        const result = sm.skipLesson({ topicId, lessonId })
        expect(result.fromState).toBe('quiz_pending')
        expect(result.toState).toBe('skipped')
      })
    })

    describe('remediating -> skipped', () => {
      it('is allowed', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        sm.startPracticing({ topicId, lessonId })
        sm.startQuiz({ topicId, lessonId })
        sm.recordQuizResult({ topicId, lessonId, passed: false, quizScore: 40 })
        const result = sm.skipLesson({ topicId, lessonId })
        expect(result.fromState).toBe('remediating')
        expect(result.toState).toBe('skipped')
      })
    })

    describe('passed -> skipped (blocked)', () => {
      it('throws because passed is terminal', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        sm.startPracticing({ topicId, lessonId })
        sm.startQuiz({ topicId, lessonId })
        sm.recordQuizResult({ topicId, lessonId, passed: true, quizScore: 90 })
        expect(() => sm.skipLesson({ topicId, lessonId })).toThrow(sm.StateMachineError)
      })
    })

    describe('tested_out -> skipped (blocked)', () => {
      it('throws because tested_out is terminal', () => {
        const { topicId, lessonId } = seedTopicAndLesson()
        sm.startPracticing({ topicId, lessonId })
        sm.startQuiz({ topicId, lessonId })
        sm.recordQuizResult({ topicId, lessonId, passed: true, quizScore: 90 })
        // first make it tested_out manually
        dbModule.run('UPDATE progress SET state = ? WHERE topic_id = ? AND lesson_id = ?', 'tested_out', topicId, lessonId)
        expect(() => sm.skipLesson({ topicId, lessonId })).toThrow(sm.StateMachineError)
      })
    })
  })

  describe('Test-out flow', () => {
    it('blocks test-out when prerequisites not met', () => {
      const { topicId, lessonId } = seedWithPrereq()
      expect(() => sm.startTestOut({ topicId, lessonId })).toThrow(sm.StateMachineError)
    })

    it('allows test-out from not_started', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      const result = sm.startTestOut({ topicId, lessonId })
      expect(result.fromState).toBe('not_started')
    })

    it('allows test-out from practicing', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.startPracticing({ topicId, lessonId })
      const result = sm.startTestOut({ topicId, lessonId })
      expect(result.fromState).toBe('practicing')
    })

    it('allows test-out from quiz_pending', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.startPracticing({ topicId, lessonId })
      sm.startQuiz({ topicId, lessonId })
      const result = sm.startTestOut({ topicId, lessonId })
      expect(result.fromState).toBe('quiz_pending')
    })

    it('allows test-out from remediating', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.startPracticing({ topicId, lessonId })
      sm.startQuiz({ topicId, lessonId })
      sm.recordQuizResult({ topicId, lessonId, passed: false, quizScore: 50 })
      const result = sm.startTestOut({ topicId, lessonId })
      expect(result.fromState).toBe('remediating')
    })

    it('passing test-out transitions to tested_out and schedules SRS', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      const result = sm.finishTestOut({
        topicId,
        lessonId,
        passed: true,
        quizScore: 88,
        answers: { q1: 'ok' },
        evaluation: { overallScore: 88 },
      })
      expect(result.passed).toBe(true)
      expect(result.toState).toBe('tested_out')
      const prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('tested_out')
      const srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(srs).toBeDefined()
      expect(srs.interval_index).toBe(0)
    })

    it('failing test-out leaves state unchanged', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.startPracticing({ topicId, lessonId })
      const result = sm.finishTestOut({
        topicId,
        lessonId,
        passed: false,
        quizScore: 55,
        answers: { q1: 'bad' },
        evaluation: { overallScore: 55 },
      })
      expect(result.passed).toBe(false)
      expect(result.toState).toBe('practicing')
      const prog = dbModule.get('SELECT state, quiz_score FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('practicing')
      expect(prog.quiz_score).toBe(55)
    })

    it('failing test-out from not_started records attempt but keeps not_started', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      const result = sm.finishTestOut({
        topicId,
        lessonId,
        passed: false,
        quizScore: 30,
        answers: { q1: 'bad' },
        evaluation: { overallScore: 30 },
      })
      expect(result.toState).toBe('not_started')
      const prog = dbModule.get('SELECT state, quiz_score FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('not_started')
      expect(prog.quiz_score).toBe(30)
    })

    it('blocks test-out from terminal states', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run('INSERT INTO progress (topic_id, lesson_id, state, completed_at) VALUES (?, ?, ?, ?)', topicId, lessonId, 'passed', new Date().toISOString())
      expect(() => sm.startTestOut({ topicId, lessonId })).toThrow(sm.StateMachineError)
    })
  })

  describe('SRS scheduling', () => {
    it('schedules SRS on pass', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.startPracticing({ topicId, lessonId })
      sm.startQuiz({ topicId, lessonId })
      sm.recordQuizResult({ topicId, lessonId, passed: true, quizScore: 90 })
      const srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(srs).toBeDefined()
      expect(srs.interval_index).toBe(0)
      expect(srs.status).toBe('pending')
    })

    it('schedules SRS on tested_out', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.finishTestOut({ topicId, lessonId, passed: true, quizScore: 90 })
      const srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(srs).toBeDefined()
    })

    it('does not schedule SRS on skip', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.skipLesson({ topicId, lessonId })
      const srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(srs).toBeUndefined()
    })

    it('does not schedule duplicate SRS on second pass', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.startPracticing({ topicId, lessonId })
      sm.startQuiz({ topicId, lessonId })
      sm.recordQuizResult({ topicId, lessonId, passed: true, quizScore: 90 })
      // Directly call scheduleSrs again to verify idempotency
      sm.scheduleSrs(topicId, lessonId)
      const rows = dbModule.all('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(rows).toHaveLength(1)
    })

    it('removes existing SRS when skipping', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      // Insert an SRS row directly, then skip from not_started
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date) VALUES (?, ?, ?, ?)',
        topicId, lessonId, 0, tomorrow.toISOString().split('T')[0]
      )
      let srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(srs).toBeDefined()
      sm.skipLesson({ topicId, lessonId })
      srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(srs).toBeUndefined()
    })
  })

  describe('Atomicity', () => {
    it('partial transaction rolls back on error inside transaction', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      // We simulate an invalid transition inside a transaction.
      // The test verifies that the DB row is untouched by a failed TX.
      dbModule.run('INSERT INTO progress (topic_id, lesson_id, state, quiz_attempts) VALUES (?, ?, ?, ?)', topicId, lessonId, 'quiz_pending', 0)
      try {
        // Using the lower-level transitionState with invalid target to exercise transaction rollback
        sm.transitionState({ topicId, lessonId, toState: 'not_started' })
      } catch {
        // expected
      }
      const prog = dbModule.get('SELECT state, quiz_attempts FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('quiz_pending')
      expect(prog.quiz_attempts).toBe(0)
    })

    it('recordQuizResult rolls back when progress row missing', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      try {
        sm.recordQuizResult({ topicId, lessonId, passed: true, quizScore: 90 })
      } catch {
        // expected
      }
      const prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog).toBeUndefined()
    })
  })

  describe('State persistence', () => {
    it('all states persist in DB after transition', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      // not_started -> practicing
      sm.startPracticing({ topicId, lessonId })
      let prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('practicing')

      // practicing -> quiz_pending
      sm.startQuiz({ topicId, lessonId })
      prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('quiz_pending')

      // quiz_pending -> remediating
      sm.recordQuizResult({ topicId, lessonId, passed: false, quizScore: 50 })
      prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('remediating')

      // remediating -> quiz_pending
      sm.startRetest({ topicId, lessonId })
      prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('quiz_pending')

      // quiz_pending -> passed
      sm.recordQuizResult({ topicId, lessonId, passed: true, quizScore: 85 })
      prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('passed')
    })
  })

  describe('Quiz attempts tracking', () => {
    it('increments quiz_attempts on every result', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.startPracticing({ topicId, lessonId })
      sm.startQuiz({ topicId, lessonId })
      sm.recordQuizResult({ topicId, lessonId, passed: false, quizScore: 50 })
      let prog = dbModule.get('SELECT quiz_attempts FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.quiz_attempts).toBe(1)

      sm.startRetest({ topicId, lessonId })
      sm.recordQuizResult({ topicId, lessonId, passed: true, quizScore: 85 })
      prog = dbModule.get('SELECT quiz_attempts FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.quiz_attempts).toBe(2)
    })

    it('test-out counts as a quiz_attempt', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.finishTestOut({ topicId, lessonId, passed: true, quizScore: 90 })
      const prog = dbModule.get('SELECT quiz_attempts FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.quiz_attempts).toBe(1)
    })
  })

  describe('Transition state via generic API', () => {
    it('allows generic transition from not_started to practicing', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      const result = sm.transitionState({ topicId, lessonId, toState: 'practicing' })
      expect(result.toState).toBe('practicing')
    })

    it('rejects invalid transition via generic API', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      expect(() => sm.transitionState({ topicId, lessonId, toState: 'passed' })).toThrow(sm.StateMachineError)
    })

    it('rejects invalid state via generic API', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      expect(() => sm.transitionState({ topicId, lessonId, toState: 'random' })).toThrow(sm.StateMachineError)
    })

    it('sets quizScore on transition when provided', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      sm.transitionState({ topicId, lessonId, toState: 'practicing' })
      sm.startQuiz({ topicId, lessonId })
      sm.transitionState({ topicId, lessonId, toState: 'passed', updates: { quizScore: 92 } })
      const prog = dbModule.get('SELECT quiz_score FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.quiz_score).toBe(92)
    })
  })
})
