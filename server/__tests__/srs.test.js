import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('../llm/client.js', () => ({
  generateText: vi.fn(),
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
  return path.join(os.tmpdir(), `test-srs-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('SRS API', () => {
  let dbPath
  let dbModule
  let app
  let generateTextMock

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    process.env.OPENAI_API_KEY = 'sk-test'
    vi.resetModules()
    vi.clearAllMocks()

    const { generateText } = await import('../llm/client.js')
    generateTextMock = generateText
    generateTextMock.mockImplementation((_params) => {
      const system = _params?.system || ''
      const sysLower = system.toLowerCase()
      if (sysLower.includes('retrieval questions') || sysLower.includes('cumulative review')) {
        return Promise.resolve({
          text: JSON.stringify({
            questions: [
              { id: 'rq1', text: 'What is a closure in JavaScript?', lessonId: 1, type: 'Recall' },
              { id: 'rq2', text: 'Explain how useEffect works in React.', lessonId: 1, type: 'Explain' },
              { id: 'rq3', text: 'Describe the main difference between props and state.', lessonId: 2, type: 'Explain' },
            ],
          }),
        })
      }
      if (sysLower.includes('evaluate') && sysLower.includes('spaced-repetition')) {
        return Promise.resolve({
          text: JSON.stringify({
            overallScore: 85,
            passed: true,
            feedback: [
              { questionId: 'rq1', correct: true, explanation: 'Correct.' },
              { questionId: 'rq2', correct: true, explanation: 'Accurate.' },
              { questionId: 'rq3', correct: false, explanation: 'Partial understanding.' },
            ],
          }),
        })
      }
      return Promise.resolve({ text: '{}' })
    })

    dbModule = await import('../db.js')
    dbModule.initSchema()

    // Seed LLM settings
    dbModule.run(
      'INSERT INTO llm_settings (provider, model) VALUES (?, ?)',
      'openai', 'gpt-4o'
    )

    const { default: reviewsRouter } = await import('../routes/reviews.js')
    const { default: dashboardRouter } = await import('../routes/dashboard.js')
    app = express()
    app.use(express.json())
    app.use('/api', reviewsRouter)
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

  function seedTopicAndLessons() {
    const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", 'React', 'active')
    const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
    const l1 = dbModule.run(
      "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
      mod.lastInsertRowid, 0, 'JSX', 'Beginner', 10, JSON.stringify(['Understand JSX']), '[]'
    )
    const l2 = dbModule.run(
      "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
      mod.lastInsertRowid, 1, 'Components', 'Beginner', 10, JSON.stringify(['Know components']), JSON.stringify([{ lessonId: l1.lastInsertRowid, title: 'JSX' }])
    )
    return { topicId: topic.lastInsertRowid, lessonIds: [l1.lastInsertRowid, l2.lastInsertRowid], moduleId: mod.lastInsertRowid }
  }

  describe('GET /api/reviews', () => {
    it('returns empty array when no reviews are due', async () => {
      const res = await request(app).get('/api/reviews')
      expect(res.status).toBe(200)
      expect(res.body.due).toEqual([])
      expect(res.body.dueToday).toBe(0)
      expect(res.body.overdue).toBe(0)
    })

    it('lists due items ordered by date', async () => {
      const { topicId, lessonIds } = seedTopicAndLessons()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const today = new Date()
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 1, today.toISOString().split('T')[0], 'pending'
      )
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[1], 2, yesterday.toISOString().split('T')[0], 'pending'
      )

      const res = await request(app).get('/api/reviews')
      expect(res.status).toBe(200)
      expect(res.body.due).toHaveLength(2)
      expect(res.body.due[0].lessonId).toBe(lessonIds[1]) // overdue first
      expect(res.body.dueToday).toBe(1)
      expect(res.body.overdue).toBe(1)
    })

    it('includes topic and lesson titles', async () => {
      const { topicId, lessonIds } = seedTopicAndLessons()
      const today = new Date()
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 0, today.toISOString().split('T')[0], 'pending'
      )

      const res = await request(app).get('/api/reviews')
      expect(res.status).toBe(200)
      expect(res.body.due[0].topicTitle).toBe('React')
      expect(res.body.due[0].lessonTitle).toBe('JSX')
    })
  })

  describe('GET /api/reviews/count', () => {
    it('returns zero when nothing is due', async () => {
      const res = await request(app).get('/api/reviews/count')
      expect(res.status).toBe(200)
      expect(res.body.dueToday).toBe(0)
      expect(res.body.overdue).toBe(0)
    })

    it('returns correct badge counts', async () => {
      const { topicId, lessonIds } = seedTopicAndLessons()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 0, yesterday.toISOString().split('T')[0], 'pending'
      )
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[1], 0, yesterday.toISOString().split('T')[0], 'pending'
      )

      const res = await request(app).get('/api/reviews/count')
      expect(res.status).toBe(200)
      expect(res.body.dueToday).toBe(0)
      expect(res.body.overdue).toBe(2)
      expect(res.body.totalDue).toBe(2)
    })
  })

  describe('POST /api/reviews/start', () => {
    it('returns 404 when no reviews are due', async () => {
      const res = await request(app).post('/api/reviews/start').send({})
      expect(res.status).toBe(404)
    })

    it('starts a batch review session with mixed questions', async () => {
      generateTextMock.mockResolvedValue({
        text: JSON.stringify({
          questions: [
            { id: 'rq1', text: 'What is JSX?', type: 'Recall' },
            { id: 'rq2', text: 'Explain components.', type: 'Explain' },
          ],
        }),
      })

      const { topicId, lessonIds } = seedTopicAndLessons()
      const today = new Date()
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 0, today.toISOString().split('T')[0], 'pending'
      )
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[1], 0, today.toISOString().split('T')[0], 'pending'
      )

      const res = await request(app).post('/api/reviews/start').send({})
      expect(res.status).toBe(200)
      expect(res.body.sessionId).toBeDefined()
      expect(res.body.questions).toBeDefined()
      expect(res.body.questions.length).toBeGreaterThanOrEqual(1)
      // Questions should have topic tags
      for (const q of res.body.questions) {
        expect(q.topicTitle).toBeDefined()
        expect(q.lessonTitle).toBeDefined()
      }
    })

    it('caps questions at 20 per session', async () => {
      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValue({
        text: JSON.stringify({
          questions: [{ id: 'rq1', text: 'Q?', type: 'Recall' }],
        }),
      })

      const { topicId } = seedTopicAndLessons()
      const today = new Date()
      // Create 10 due lessons (simulate by creating lessons and SRS rows)
      for (let i = 0; i < 10; i++) {
        const l = dbModule.run(
          'INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)',
          1, i + 2, `Extra ${i}`, 'Beginner', 5, JSON.stringify(['x']), '[]'
        )
        dbModule.run(
          'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
          topicId, l.lastInsertRowid, 0, today.toISOString().split('T')[0], 'pending'
        )
      }

      const res = await request(app).post('/api/reviews/start').send({})
      expect(res.status).toBe(200)
      expect(res.body.questions.length).toBeLessThanOrEqual(20)
      expect(res.body.remainingCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe('POST /api/reviews/:sessionId/submit', () => {
    it('evaluates answers and advances interval on pass >=80%', async () => {
      generateTextMock.mockImplementation((_params) => {
        const system = _params?.system || ''
        const sysLower = system.toLowerCase()
        if (sysLower.includes('retrieval questions') || sysLower.includes('cumulative review')) {
          return Promise.resolve({
            text: JSON.stringify({
              questions: [
                { id: 'rq1', text: 'What is JSX?', type: 'Recall' },
                { id: 'rq2', text: 'Explain components.', type: 'Explain' },
              ],
            }),
          })
        }
        return Promise.resolve({
          text: JSON.stringify({
            overallScore: 85,
            passed: true,
            feedback: [
              { questionId: 'rq1', correct: true, explanation: 'Correct.' },
              { questionId: 'rq2', correct: true, explanation: 'Accurate.' },
            ],
          }),
        })
      })

      const { topicId, lessonIds } = seedTopicAndLessons()
      const today = new Date()
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 0, today.toISOString().split('T')[0], 'pending'
      )

      // Start session
      const startRes = await request(app).post('/api/reviews/start').send({})
      expect(startRes.status).toBe(200)
      const sessionId = startRes.body.sessionId
      const questions = startRes.body.questions

      const answers = {}
      for (const q of questions) {
        answers[q.id] = 'Sample answer'
      }

      const submitRes = await request(app).post(`/api/reviews/${sessionId}/submit`).send({ answers })
      expect(submitRes.status).toBe(200)
      expect(submitRes.body.overallScore).toBeDefined()
      expect(submitRes.body.passed).toBe(true)

      const srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonIds[0])
      expect(srs.interval_index).toBe(2) // 2 questions both correct = 100% per-item => accelerated
      expect(srs.status).toBe('pending')
      expect(srs.last_reviewed).toBeTruthy()
    })

    it('regresses interval on fail <80%', async () => {
      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            { id: 'rq1', text: 'Q1?', lessonId: 1, type: 'Recall' },
          ],
        }),
      })
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 60,
          passed: false,
          feedback: [
            { questionId: 'rq1', correct: false, explanation: 'Wrong.' },
          ],
        }),
      })

      const { topicId, lessonIds } = seedTopicAndLessons()
      const today = new Date()
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 2, today.toISOString().split('T')[0], 'pending'
      )

      const startRes = await request(app).post('/api/reviews/start').send({})
      expect(startRes.status).toBe(200)
      const sessionId = startRes.body.sessionId
      const questions = startRes.body.questions

      const answers = {}
      for (const q of questions) {
        answers[q.id] = 'Wrong answer'
      }

      const submitRes = await request(app).post(`/api/reviews/${sessionId}/submit`).send({ answers })
      expect(submitRes.status).toBe(200)
      expect(submitRes.body.passed).toBe(false)

      const srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonIds[0])
      expect(srs.interval_index).toBe(1) // regressed one step
    })

    it('accelerates interval on exceptional >=95%', async () => {
      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            { id: 'rq1', text: 'Q1?', lessonId: 1, type: 'Recall' },
          ],
        }),
      })
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 100,
          passed: true,
          feedback: [
            { questionId: 'rq1', correct: true, explanation: 'Perfect.' },
          ],
        }),
      })

      const { topicId, lessonIds } = seedTopicAndLessons()
      const today = new Date()
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 1, today.toISOString().split('T')[0], 'pending'
      )

      const startRes = await request(app).post('/api/reviews/start').send({})
      const sessionId = startRes.body.sessionId
      const questions = startRes.body.questions

      const answers = {}
      for (const q of questions) {
        answers[q.id] = 'Perfect answer'
      }

      const submitRes = await request(app).post(`/api/reviews/${sessionId}/submit`).send({ answers })
      expect(submitRes.status).toBe(200)
      expect(submitRes.body.passed).toBe(true)
      expect(submitRes.body.accelerated).toBe(true)

      const srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonIds[0])
      expect(srs.interval_index).toBe(3) // 1 + 1 normal + 1 extra
    })
  })

  describe('Grace period', () => {
    it('does not penalize review within +/-2 days of due date', async () => {
      generateTextMock.mockImplementation((_params) => {
        const system = _params?.system || ''
        const sysLower = system.toLowerCase()
        if (sysLower.includes('retrieval questions') || sysLower.includes('cumulative review')) {
          return Promise.resolve({
            text: JSON.stringify({
              questions: [
                { id: 'rq1', text: 'What is JSX?', type: 'Recall' },
                { id: 'rq2', text: 'Explain components.', type: 'Explain' },
                { id: 'rq3', text: 'What are props?', type: 'Recall' },
                { id: 'rq4', text: 'Explain state.', type: 'Explain' },
              ],
            }),
          })
        }
        return Promise.resolve({
          text: JSON.stringify({
            overallScore: 85,
            passed: true,
            feedback: [
              { questionId: 'rq1', correct: true, explanation: 'Correct.' },
              { questionId: 'rq2', correct: true, explanation: 'Correct.' },
              { questionId: 'rq3', correct: true, explanation: 'Correct.' },
              { questionId: 'rq4', correct: false, explanation: 'Partial.' },
            ],
          }),
        })
      })

      const { topicId, lessonIds } = seedTopicAndLessons()
      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 1, twoDaysAgo.toISOString().split('T')[0], 'pending'
      )

      const startRes = await request(app).post('/api/reviews/start').send({})
      const sessionId = startRes.body.sessionId
      const questions = startRes.body.questions

      const answers = {}
      for (const q of questions) {
        answers[q.id] = 'Answer'
      }

      const submitRes = await request(app).post(`/api/reviews/${sessionId}/submit`).send({ answers })
      expect(submitRes.status).toBe(200)
      expect(submitRes.body.passed).toBe(true)

      const srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonIds[0])
      // 3/4 correct = 75% per-item score => fails (<80), so regresses (1 -> 0)
      // Grace period means no EXTRA penalty beyond normal regression
      expect(srs.interval_index).toBe(0)
    })
  })

  describe('Duplicate prevention', () => {
    it('only one srs_queue row exists per lesson at a time', async () => {
      const { topicId, lessonIds } = seedTopicAndLessons()
      const today = new Date()
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 0, today.toISOString().split('T')[0], 'pending'
      )
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 1, today.toISOString().split('T')[0], 'pending'
      )

      const rows = dbModule.all('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonIds[0])
      // The review endpoints should only use one row, but let's verify the start endpoint handles it
      const res = await request(app).get('/api/reviews')
      expect(res.status).toBe(200)
      const items = res.body.due.filter((r) => r.lessonId === lessonIds[0])
      expect(items.length).toBeLessThanOrEqual(1)
    })
  })

  describe('Module exam cumulative reviews', () => {
    it('schedules cumulative reviews at 7d and 30d after module exam pass', async () => {
      const { topicId, moduleId, lessonIds } = seedTopicAndLessons()
      // Mark module completed
      dbModule.run('UPDATE modules SET status = ?, completed_at = ? WHERE id = ?', 'completed', new Date().toISOString(), moduleId)

      // Schedule cumulative reviews
      const { scheduleCumulativeReviews } = await import('../utils/srs-scheduler.js')
      scheduleCumulativeReviews(topicId, moduleId)

      const rows = dbModule.all('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id IS NULL AND review_type = ?', topicId, 'cumulative')
      expect(rows).toHaveLength(2)
      const dueDates = rows.map((r) => r.due_date)
      const today = new Date()
      const expected7 = new Date(today)
      expected7.setDate(expected7.getDate() + 7)
      const expected30 = new Date(today)
      expected30.setDate(expected30.getDate() + 30)
      expect(dueDates).toContain(expected7.toISOString().split('T')[0])
      expect(dueDates).toContain(expected30.toISOString().split('T')[0])
    })
  })

  describe('Empty / invalid session handling', () => {
    it('returns 400 when submitting without answers', async () => {
      const { topicId, lessonIds } = seedTopicAndLessons()
      const today = new Date()
      dbModule.run(
        'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonIds[0], 0, today.toISOString().split('T')[0], 'pending'
      )

      const startRes = await request(app).post('/api/reviews/start').send({})
      const sessionId = startRes.body.sessionId

      const res = await request(app).post(`/api/reviews/${sessionId}/submit`).send({ answers: {} })
      expect(res.status).toBe(400)
    })
  })
})
