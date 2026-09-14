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
        yield 'Let me explain this differently using a new analogy.'
      })(),
    })
  }),
  generateText: vi.fn((_params) => {
    const system = _params?.system || ''
    if (system.includes('multiple_choice') && system.includes('retest')) {
      return Promise.resolve({
        text: JSON.stringify({
          questions: [
            { id: 'mc1', format: 'multiple_choice', category: 'Recall', prompt: 'Which command lists files?', options: [{ id: 'a', text: 'ls' }, { id: 'b', text: 'pwd' }], correct_option: 'a', weight: 1 },
            { id: 'wr1', format: 'written', category: 'Explain', prompt: 'Explain the missed concept.', max_words: 80, weight: 2 },
          ],
        }),
      })
    }
    if (system.toLowerCase().includes('retest') || system.toLowerCase().includes('focused on the gaps')) {
      return Promise.resolve({
        text: JSON.stringify({
          questions: [
            { id: 'rt1', text: 'Explain the missed concept in your own words.', type: 'Explain', weight: 2 },
          ],
        }),
      })
    }
    if (system.toLowerCase().includes('evaluate')) {
      return Promise.resolve({
        text: JSON.stringify({
          overallScore: 55,
          passed: false,
          criticalGap: true,
          feedback: [
            { questionId: 'rt1', correctness: 'incorrect', score: 0, explanation: 'Still incorrect.' },
          ],
          gaps: ['Confused JSX with HTML'],
        }),
      })
    }
    return Promise.resolve({ text: '{}' })
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
  return path.join(os.tmpdir(), `test-remediation-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Remediation API', () => {
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
    return ids
  }

  describe('POST /api/topics/:id/lessons/:lid/remediate/chat', () => {
    it('streams re-teach content when lesson is remediating', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks, remediation_attempts, last_gaps) VALUES (?, ?, ?, ?, ?, ?, ?)", topicId, lessonId, 'remediating', 3, 3, 1, JSON.stringify(['Confused JSX with HTML']))

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/remediate/chat`)
        .set('Accept', 'text/event-stream')
        .send({ content: 'Can you explain again?' })

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/event-stream/)

      const messages = dbModule.all("SELECT * FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id", topicId, lessonId)
      // The user's message should be persisted
      expect(messages.length).toBeGreaterThanOrEqual(1)
    })

    it('returns 400 when lesson is not in remediating state', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/remediate/chat`)
        .send({ content: 'Help' })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/topics/:id/lessons/:lid/remediate/retest', () => {
    it('generates a mixed one-choice one-written retest for task-backed lessons', async () => {
      const { topicId, lessonId } = seedTaskLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, remediation_attempts, last_gaps) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'remediating', 1, JSON.stringify(['Missed the local command']))

      const res = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/remediate/retest`).send({})

      expect(res.status).toBe(200)
      expect(res.body.formatVersion).toBe(2)
      expect(res.body.attemptId).toBeTypeOf('number')
      expect(res.body.questions.filter((question) => question.format === 'multiple_choice')).toHaveLength(1)
      expect(res.body.questions.filter((question) => question.format === 'written')).toHaveLength(1)
      expect(res.body).not.toHaveProperty('answerKey')
    })

    it('transitions to quiz_pending and generates 1-3 retest questions', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, remediation_attempts, last_gaps) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'remediating', 1, JSON.stringify(['Confused JSX with HTML']))

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/remediate/retest`)
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.questions).toBeDefined()
      expect(res.body.questions.length).toBeGreaterThanOrEqual(1)
      expect(res.body.questions.length).toBeLessThanOrEqual(3)

      const prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('quiz_pending')
    })

    it('returns 400 when lesson is not remediating', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/remediate/retest`)
        .send({})

      expect(res.status).toBe(400)
    })

    it('retest questions target the previously missed concept', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, remediation_attempts, last_gaps) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'remediating', 1, JSON.stringify(['Confused JSX with HTML']))

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/remediate/retest`)
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.questions[0].text).toBeDefined()
    })
  })

  describe('Mistakes logging', () => {
    it('records mistake on first quiz failure', async () => {
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
        .send({ answers: { q1: 'Wrong' } })

      expect(res.status).toBe(200)

      const prog = dbModule.get('SELECT state, remediation_attempts, last_gaps FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('remediating')
      expect(prog.remediation_attempts).toBe(1)

      const mistake = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(mistake).toBeDefined()
      expect(mistake.description).toBe('Confused JSX with HTML')
      expect(mistake.recurring).toBe(0)
    })

    it('marks mistake as recurring on retest failure', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, remediation_attempts, last_gaps) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'remediating', 1, JSON.stringify(['Confused JSX with HTML']))
      dbModule.run('INSERT INTO mistakes_log (topic_id, lesson_id, description, recurring) VALUES (?, ?, ?, ?)', topicId, lessonId, 'Confused JSX with HTML', 0)

      // Start retest (transitions to quiz_pending and generates questions)
      const retestRes = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/remediate/retest`).send({})
      expect(retestRes.status).toBe(200)

      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 55,
          passed: false,
          criticalGap: true,
          feedback: [{ questionId: 'rt1', correctness: 'incorrect', score: 0, explanation: 'Still wrong.' }],
          gaps: ['Confused JSX with HTML'],
        }),
      })

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { rt1: 'Wrong again' } })

      expect(res.status).toBe(200)

      const prog = dbModule.get('SELECT state, remediation_attempts FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('remediating')
      expect(prog.remediation_attempts).toBe(2)

      const mistake = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(mistake.recurring).toBe(1)
    })

    it('offers exit paths after second failure (not infinite loop)', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, remediation_attempts, last_gaps) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'remediating', 2, JSON.stringify(['Confused JSX with HTML']))

      const retestRes = await request(app).post(`/api/topics/${topicId}/lessons/${lessonId}/remediate/retest`).send({})
      expect(retestRes.status).toBe(200)

      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 50,
          passed: false,
          criticalGap: true,
          feedback: [{ questionId: 'rt1', correctness: 'incorrect', score: 0, explanation: 'Nope.' }],
          gaps: ['Confused JSX with HTML'],
        }),
      })

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { rt1: 'Still wrong' } })

      expect(res.status).toBe(200)
      expect(res.body.passed).toBe(false)

      const prog = dbModule.get('SELECT state, remediation_attempts FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('remediating')
      expect(prog.remediation_attempts).toBe(3)
    })
  })
})
