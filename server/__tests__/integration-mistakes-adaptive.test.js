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
    if (system.toLowerCase().includes('generate 3-8 free-text quiz questions')) {
      return Promise.resolve({
        text: JSON.stringify({
          questions: [
            { id: 'q1', text: 'What is a closure?', type: 'Recall', weight: 1 },
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
            { questionId: 'q1', correctness: 'correct', score: 1, explanation: 'Correct.' },
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
      this.code = code
      this.retryable = retryable
    }
  },
}))

function tempDbPath() {
  return path.join(os.tmpdir(), `test-int-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Integration: Mistakes Log + Adaptive Difficulty', () => {
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

  describe('Quiz evaluation with mistakes tracking', () => {
    it('records a mistake in mistakes_log on first quiz failure', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3)
      const questions = JSON.stringify([{ id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 }])
      dbModule.run('INSERT INTO quiz_attempts (topic_id, lesson_id, questions) VALUES (?, ?, ?)', topicId, lessonId, questions)

      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 60,
          passed: false,
          criticalGap: true,
          feedback: [{ questionId: 'q1', correctness: 'incorrect', score: 0, explanation: 'Wrong.' }],
          gaps: ['Confused JSX with HTML'],
        }),
      })

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'Wrong answer.' } })

      expect(res.status).toBe(200)
      const mistake = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND description = ?', topicId, 'Confused JSX with HTML')
      expect(mistake).toBeDefined()
      expect(mistake.recurring).toBe(0)
    })

    it('marks mistake as recurring on second failure of the same gap', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3)
      dbModule.run('INSERT INTO mistakes_log (topic_id, lesson_id, description, recurring, cleared_after) VALUES (?, ?, ?, ?, ?)', topicId, lessonId, 'Confused JSX with HTML', 0, 0)
      const questions = JSON.stringify([{ id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 }])
      dbModule.run('INSERT INTO quiz_attempts (topic_id, lesson_id, questions) VALUES (?, ?, ?)', topicId, lessonId, questions)

      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 55,
          passed: false,
          criticalGap: true,
          feedback: [{ questionId: 'q1', correctness: 'incorrect', score: 0, explanation: 'Still wrong.' }],
          gaps: ['Confused JSX with HTML'],
        }),
      })

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'Still wrong.' } })

      expect(res.status).toBe(200)
      const mistake = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND description = ?', topicId, 'Confused JSX with HTML')
      expect(mistake.recurring).toBe(1)
    })

    it('clears mistake after 2 consecutive passes without the error', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 3, 3)
      dbModule.run('INSERT INTO mistakes_log (topic_id, lesson_id, description, recurring, cleared_after) VALUES (?, ?, ?, ?, ?)', topicId, lessonId, 'Confused JSX with HTML', 1, 0)
      const questions = JSON.stringify([{ id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 }])
      dbModule.run('INSERT INTO quiz_attempts (topic_id, lesson_id, questions) VALUES (?, ?, ?)', topicId, lessonId, questions)

      const { generateText } = await import('../llm/client.js')
      // First pass — no gaps
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 85,
          passed: true,
          criticalGap: false,
          feedback: [{ questionId: 'q1', correctness: 'correct', score: 1, explanation: 'Good.' }],
          gaps: [],
        }),
      })

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'JSX is JavaScript XML.' } })

      let mistake = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND description = ?', topicId, 'Confused JSX with HTML')
      expect(mistake.cleared_after).toBe(1)

      // Set up another quiz attempt
      dbModule.run('UPDATE progress SET state = ? WHERE topic_id = ? AND lesson_id = ?', 'quiz_pending', topicId, lessonId)
      dbModule.run('INSERT INTO quiz_attempts (topic_id, lesson_id, questions) VALUES (?, ?, ?)', topicId, lessonId, questions)

      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 90,
          passed: true,
          criticalGap: false,
          feedback: [{ questionId: 'q1', correctness: 'correct', score: 1, explanation: 'Great.' }],
          gaps: [],
        }),
      })

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'JSX is JavaScript XML.' } })

      mistake = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND description = ?', topicId, 'Confused JSX with HTML')
      expect(mistake.cleared_after).toBe(2)
      expect(mistake.recurring).toBe(0)
    })
  })

  describe('Adaptive difficulty via dashboard', () => {
    it('increases difficulty after 3 consecutive lesson passes', async () => {
      const { topicId } = seedTopicAndLesson()
      const { recordResultAndComputeDifficulty } = await import('../utils/adaptive-difficulty.js')

      // Record 3 consecutive passes directly (full HTTP flow for same lesson cannot repeat)
      recordResultAndComputeDifficulty(topicId, true)
      recordResultAndComputeDifficulty(topicId, true)
      recordResultAndComputeDifficulty(topicId, true)

      const dash = await request(app).get(`/api/topics/${topicId}/dashboard`)
      expect(dash.status).toBe(200)
      expect(dash.body.topic.difficulty).toBe('hard')
      expect(dash.body.topic.consecutivePasses).toBe(3)
    })

    it('scaffolds after 2 consecutive lesson failures', async () => {
      const { topicId } = seedTopicAndLesson()
      const { recordResultAndComputeDifficulty } = await import('../utils/adaptive-difficulty.js')

      recordResultAndComputeDifficulty(topicId, false)
      recordResultAndComputeDifficulty(topicId, false)

      const dash = await request(app).get(`/api/topics/${topicId}/dashboard`)
      expect(dash.status).toBe(200)
      expect(dash.body.topic.difficulty).toBe('scaffolded')
      expect(dash.body.topic.consecutiveFails).toBe(2)
    })
  })

  describe('Dashboard returns mistakes and difficulty', () => {
    it('returns active mistakes in dashboard response', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run('INSERT INTO mistakes_log (topic_id, lesson_id, description, recurring, cleared_after) VALUES (?, ?, ?, ?, ?)', topicId, lessonId, 'Gap A', 1, 0)

      const res = await request(app).get(`/api/topics/${topicId}/dashboard`)
      expect(res.status).toBe(200)
      expect(res.body.mistakes).toBeDefined()
      expect(res.body.mistakes).toHaveLength(1)
      expect(res.body.mistakes[0].description).toBe('Gap A')
      expect(res.body.mistakes[0].recurring).toBe(1)
    })

    it('returns difficulty metadata in topic list', async () => {
      const { topicId } = seedTopicAndLesson()
      dbModule.run('UPDATE topics SET difficulty = ?, consecutive_passes = ? WHERE id = ?', 'hard', 3, topicId)

      const res = await request(app).get('/api/topics')
      expect(res.status).toBe(200)
      const topic = res.body.topics.find((t) => t.id === topicId)
      expect(topic.difficulty).toBe('hard')
      expect(topic.consecutivePasses).toBe(3)
    })
  })
})
