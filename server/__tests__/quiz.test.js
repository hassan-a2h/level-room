import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('../llm/client.js', () => ({
  streamText: vi.fn((_params) => {
    return Promise.resolve({
      textStream: (async function* () {
        yield 'A'
      })(),
    })
  }),
  generateText: vi.fn((_params) => {
    const system = _params?.system || ''
    if (system.includes('multiple_choice') && system.includes('exactly two')) {
      return Promise.resolve({
        text: JSON.stringify({
          questions: [
            { id: 'mc1', format: 'multiple_choice', category: 'Recall', prompt: 'Which command lists files?', options: [{ id: 'a', text: 'ls' }, { id: 'b', text: 'pwd' }], correct_option: 'a', weight: 1 },
            { id: 'mc2', format: 'multiple_choice', category: 'Apply', prompt: 'Which command prints the directory?', options: [{ id: 'a', text: 'pwd' }, { id: 'b', text: 'cd' }], correct_option: 'a', weight: 1 },
            { id: 'wr1', format: 'written', category: 'Explain', prompt: 'Explain why the command is useful.', max_words: 80, weight: 2 },
            { id: 'wr2', format: 'written', category: 'Transfer', prompt: 'Describe how you would verify the result.', max_words: 80, weight: 2 },
          ],
        }),
      })
    }
    if (system.includes('Evaluate only the written answers')) {
      return Promise.resolve({
        text: JSON.stringify({ written: { wr1: { score: 100, explanation: 'Clear.' }, wr2: { score: 100, explanation: 'Clear.' } } }),
      })
    }
    if (system.toLowerCase().includes('generate 3-8 free-text quiz questions')) {
      return Promise.resolve({
        text: JSON.stringify({
          questions: [
            { id: 'q1', text: 'What is a closure in JavaScript?', type: 'Recall', weight: 1 },
            { id: 'q2', text: 'Explain how useEffect works in React.', type: 'Explain', weight: 2 },
            { id: 'q3', text: 'Given a component tree, diagnose why a re-render is happening.', type: 'Diagnose', weight: 2 },
            { id: 'q4', text: 'Apply useReducer to build a counter with undo.', type: 'Apply', weight: 2 },
            { id: 'q5', text: 'How would you transfer the concept of memoization to a database query cache?', type: 'Transfer', weight: 3 },
          ],
        }),
      })
    }
    if (system.toLowerCase().includes('evaluate the following quiz answers')) {
      return Promise.resolve({
        text: JSON.stringify({
          overallScore: 85,
          passed: true,
          criticalGap: false,
          feedback: [
            { questionId: 'q1', correctness: 'correct', score: 1, explanation: 'Correct definition.' },
            { questionId: 'q2', correctness: 'correct', score: 2, explanation: 'Clear explanation.' },
            { questionId: 'q3', correctness: 'partial', score: 1, explanation: 'Missed the key dependency check.' },
            { questionId: 'q4', correctness: 'correct', score: 2, explanation: 'Good implementation.' },
            { questionId: 'q5', correctness: 'partial', score: 1.5, explanation: 'Good idea but missing caching invalidation.' },
          ],
          gaps: [],
        }),
      })
    }
    return Promise.resolve({ text: '{}' })
  }),
  streamToSSE: vi.fn(async (streamResult, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    let fullText = ''
    for await (const chunk of streamResult.textStream) {
      const text = typeof chunk === 'string' ? chunk : ''
      fullText += text
      res.write(`data: ${JSON.stringify(text)}\n\n`)
    }
    res.write(`data: ${JSON.stringify('[DONE]')}\n\n`)
    res.end()
  }),
  LlmClientError: class LlmClientError extends Error {
    constructor(message, { code, retryable = false } = {}) {
      super(message)
      this.name = 'LlmClientError'
      this.code = code
      this.retryable = retryable
    }
  },
}))

function tempDbPath() {
  return path.join(os.tmpdir(), `test-quiz-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Quiz API', () => {
  let dbPath
  let dbModule
  let app

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    process.env.OPENAI_API_KEY = 'sk-test'
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()

    // Seed LLM settings
    dbModule.run(
      'INSERT INTO llm_settings (provider, model) VALUES (?, ?)',
      'openai', 'gpt-4o'
    )

    const { default: lessonsRouter } = await import('../routes/lessons.js')
    const { default: dashboardRouter } = await import('../routes/dashboard.js')
    app = express()
    app.use(express.json())
    app.use('/api', lessonsRouter)
    app.use('/api', dashboardRouter)
  })

  afterEach(() => {
    if (dbModule && dbModule.default) {
      try { dbModule.default.close() } catch {}
    }
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.FIREWORKS_API_KEY
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_MODEL
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

  function seedTaskLesson() {
    const ids = seedTopicAndLesson('DevOps', 'Local practice')
    const task = {
      title: 'Local task', scenario: 'Use a safe local fixture.', goal: 'Verify the behavior.',
      constraints: ['Use test data only'], deliverables: ['Commands', 'Observed output'],
      success_criteria: ['The behavior is observable', 'The result is repeatable'], estimated_time: 10,
      primary_setup: { kind: 'local', description: 'Run locally.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
      free_fallback: { kind: 'no_software', description: 'Explain the local result.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
      hints: [], safety_notes: [],
    }
    dbModule.run('UPDATE lessons SET task_spec = ?, artifact_required = 1 WHERE id = ?', JSON.stringify(task), ids.lessonId)
    dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks, artifact_passed) VALUES (?, ?, ?, ?, ?, ?)", ids.topicId, ids.lessonId, 'practicing', 3, 3, 1)
    return ids
  }

  describe('POST /api/topics/:id/lessons/:lid/quiz', () => {
    it('generates a mixed quiz with a private answer key for task-backed lessons', async () => {
      const { topicId, lessonId } = seedTaskLesson()
      const res = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/quiz`).send({})

      expect(res.status).toBe(200)
      expect(res.body.formatVersion).toBe(2)
      expect(res.body.attemptId).toBeTypeOf('number')
      expect(res.body.questions).toHaveLength(4)
      expect(res.body).not.toHaveProperty('answerKey')
      expect(res.body.questions[0]).not.toHaveProperty('correct_option')
      const stored = dbModule.get('SELECT answer_key, format_version, questions FROM quiz_attempts WHERE id = ?', res.body.attemptId)
      expect(stored.format_version).toBe(2)
      expect(JSON.parse(stored.answer_key)).toEqual({ mc1: 'a', mc2: 'a' })
      expect(JSON.parse(stored.questions)[0]).not.toHaveProperty('correct_option')
    })

    it('generates 3-8 free-text quiz questions', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'practicing', 3, 3)
      dbModule.run("INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)", topicId, lessonId, 'assistant', 'JSX is cool.')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz`)
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.questions).toBeDefined()
      expect(res.body.questions.length).toBeGreaterThanOrEqual(3)
      expect(res.body.questions.length).toBeLessThanOrEqual(8)
      for (const q of res.body.questions) {
        expect(q.text).toBeDefined()
        expect(typeof q.text).toBe('string')
        expect(q.text.length).toBeGreaterThan(0)
      }
    })

    it('persists quiz questions to the database', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'practicing', 3, 3)
      dbModule.run("INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)", topicId, lessonId, 'assistant', 'JSX is cool.')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz`)
        .send({})

      expect(res.status).toBe(200)
      const stored = dbModule.get(
        'SELECT id, questions FROM quiz_attempts WHERE topic_id = ? AND lesson_id = ? ORDER BY id DESC',
        topicId, lessonId
      )
      expect(stored).toBeDefined()
      expect(stored.questions).toContain('q1')
    })

    it('returns 403 when lesson is locked', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", 'React', 'active')
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
      const prereq = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)", mod.lastInsertRowid, 0, 'A', 'Beginner', 10, JSON.stringify(['a']), '[]')
      const lesson = dbModule.run(
        "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
        mod.lastInsertRowid, 1, 'B', 'Beginner', 10, JSON.stringify(['b']), JSON.stringify([{ lessonId: prereq.lastInsertRowid, title: 'A' }])
      )
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, prereq.lastInsertRowid, 'not_started')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, lesson.lastInsertRowid, 'not_started')

      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/lessons/${lesson.lastInsertRowid}/quiz`)
        .send({})

      expect(res.status).toBe(403)
    })

    it('returns 400 when lesson is not in practicing state', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'not_started')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz`)
        .send({})

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/topics/:id/lessons/:lid/quiz', () => {
    it('returns the mixed attempt id without exposing its answer key', async () => {
      const { topicId, lessonId } = seedTaskLesson()
      const started = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/quiz`).send({})
      const res = await request(app).get(`/api/topics/${topicId}/lessons/${lessonId}/quiz`)

      expect(res.status).toBe(200)
      expect(res.body.attemptId).toBe(started.body.attemptId)
      expect(res.body).not.toHaveProperty('answerKey')
      expect(res.body).not.toHaveProperty('answer_key')
    })

    it('returns existing quiz questions', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'practicing', 3, 3)
      const questions = JSON.stringify([
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ])
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions, answers, evaluation) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonId, questions, null, null
      )

      const res = await request(app).get(`/api/topics/${topicId}/lessons/${lessonId}/quiz`)
      expect(res.status).toBe(200)
      expect(res.body.questions).toHaveLength(1)
      expect(res.body.questions[0].text).toBe('What is JSX?')
    })

    it('returns 404 when no quiz exists', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      const res = await request(app).get(`/api/topics/${topicId}/lessons/${lessonId}/quiz`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/topics/:id/lessons/:lid/quiz/submit', () => {
    it('scores choices locally, evaluates written answers, and completes a mixed lesson', async () => {
      const { topicId, lessonId } = seedTaskLesson()
      const started = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/quiz`).send({})
      const answers = { mc1: 'a', mc2: 'a', wr1: 'Explain the command clearly.', wr2: 'Verify the output locally.' }
      const res = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`).send({ attemptId: started.body.attemptId, answers })

      expect(res.status).toBe(200)
      expect(res.body.formatVersion).toBe(2)
      expect(res.body.overallScore).toBe(100)
      expect(res.body.passed).toBe(true)
      expect(dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId).state).toBe('passed')
    })

    it('rejects stale mixed attempt ids without changing the pending attempt', async () => {
      const { topicId, lessonId } = seedTaskLesson()
      const started = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/quiz`).send({})
      const res = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`).send({
        attemptId: started.body.attemptId + 999,
        answers: { mc1: 'a', mc2: 'a', wr1: 'ok', wr2: 'ok' },
      })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('STALE_ATTEMPT')
      const attempt = dbModule.get('SELECT answers, evaluation FROM quiz_attempts WHERE id = ?', started.body.attemptId)
      expect(attempt.answers).toBeNull()
      expect(attempt.evaluation).toBeNull()
    })

    it('rejects invalid mixed answers before invoking evaluation', async () => {
      const { topicId, lessonId } = seedTaskLesson()
      const started = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/quiz`).send({})
      const { generateText } = await import('../llm/client.js')
      const callsBefore = generateText.mock.calls.length
      const res = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`).send({
        attemptId: started.body.attemptId,
        answers: { mc1: 'invalid', mc2: 'a', wr1: 'ok', wr2: 'ok' },
      })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_QUIZ_ANSWERS')
      expect(generateText.mock.calls.length).toBe(callsBefore)
    })

    it('evaluates answers and returns pass/fail result', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3)
      const questions = JSON.stringify([
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
        { id: 'q2', text: 'Explain hooks.', type: 'Explain', weight: 2 },
      ])
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions, answers, evaluation) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonId, questions, null, null
      )

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({
          answers: { q1: 'JSX is JavaScript XML.', q2: 'Hooks let you use state in functions.' },
        })

      expect(res.status).toBe(200)
      expect(res.body.overallScore).toBeDefined()
      expect(typeof res.body.passed).toBe('boolean')
      expect(res.body.feedback).toBeDefined()
      expect(Array.isArray(res.body.feedback)).toBe(true)
    })

    it('updates lesson state to passed when score >= 80 and no critical gaps', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3)
      const questions = JSON.stringify([
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ])
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions, answers, evaluation) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonId, questions, null, null
      )

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'JSX is JavaScript XML.' } })

      expect(res.status).toBe(200)
      const prog = dbModule.get('SELECT state, quiz_score FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('passed')
      expect(prog.quiz_score).toBe(85)
    })

    it('updates lesson state to remediating when score < 80', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3)
      const questions = JSON.stringify([
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ])
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions, answers, evaluation) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonId, questions, null, null
      )

      // Override generateText mock for this test to return failure
      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 60,
          passed: false,
          criticalGap: true,
          feedback: [
            { questionId: 'q1', correctness: 'incorrect', score: 0, explanation: 'Incorrect answer.' },
          ],
          gaps: ['Did not understand JSX syntax'],
        }),
      })

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'Wrong answer.' } })

      expect(res.status).toBe(200)
      const prog = dbModule.get('SELECT state, quiz_score FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('remediating')
      expect(prog.quiz_score).toBe(60)
    })

    it('rejects empty submission', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3)
      const questions = JSON.stringify([
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ])
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions, answers, evaluation) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonId, questions, null, null
      )

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: {} })

      expect(res.status).toBe(400)
    })

    it('rejects submission when no quiz exists', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'quiz_pending')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'Answer.' } })

      expect(res.status).toBe(404)
    })

    it('increments quiz_attempts', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks, quiz_attempts) VALUES (?, ?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3, 1)
      const questions = JSON.stringify([
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ])
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions, answers, evaluation) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonId, questions, null, null
      )

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'JSX is JavaScript XML.' } })

      const prog = dbModule.get('SELECT quiz_attempts FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.quiz_attempts).toBe(2)
    })

    it('schedules SRS item on pass', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3)
      const questions = JSON.stringify([
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ])
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions, answers, evaluation) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonId, questions, null, null
      )

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'JSX is JavaScript XML.' } })

      const srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(srs).toBeDefined()
      expect(srs.interval_index).toBe(0)
    })

    it('does not schedule duplicate SRS items', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3)
      // Pre-existing SRS item
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date) VALUES (?, ?, ?, ?)',
        topicId, lessonId, 0, tomorrow.toISOString().split('T')[0]
      )
      const questions = JSON.stringify([
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ])
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions, answers, evaluation) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonId, questions, null, null
      )

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'JSX is JavaScript XML.' } })

      const srsRows = dbModule.all('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(srsRows).toHaveLength(1)
    })

    it('preserves answers and evaluation in quiz_attempts row', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3)
      const questions = JSON.stringify([
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ])
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions, answers, evaluation) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonId, questions, null, null
      )

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'JSX is JavaScript XML.' } })

      const attempt = dbModule.get('SELECT answers, evaluation FROM quiz_attempts WHERE topic_id = ? AND lesson_id = ? ORDER BY id DESC', topicId, lessonId)
      expect(attempt).toBeDefined()
      expect(attempt.answers).toContain('JSX is JavaScript XML.')
      expect(attempt.evaluation).toContain('overallScore')
    })
  })
})
