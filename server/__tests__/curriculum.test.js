import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('../llm/client.js', () => ({
  streamText: vi.fn(() =>
    Promise.resolve({
      textStream: (async function* () {
        yield '{"modules":['
        yield '{"title":"Foundations","lessons":['
        yield '{"title":"Intro","depth":"Beginner","estimated_time":10,"outcomes":["Understand basics"],"prerequisites":[]}'
        yield ']}]}'
      })(),
    })
  ),
  generateText: vi.fn((_params) => {
    const content = _params?.messages?.[0]?.content || ''
    // Tweak / regenerate prompts contain existing curriculum context and ask for changes
    if (content.includes('User request:') || content.includes('updated full curriculum') || content.includes('Existing curriculum:')) {
      return Promise.resolve({
        text: JSON.stringify({
          modules: [
            {
              title: 'Foundations',
              lessons: [
                { title: 'Intro', depth: 'Beginner', estimated_time: 10, outcomes: ['Understand basics'], prerequisites: [] },
                { title: 'Testing', depth: 'Intermediate', estimated_time: 20, outcomes: ['Write tests'], prerequisites: ['Intro'] },
              ],
            },
          ],
        }),
      })
    }
    // Test-out evaluation prompt
    if (content.includes('User answers:')) {
      return Promise.resolve({
        text: JSON.stringify({ passed: true, score: 90, feedback: 'Great job!', gaps: [] }),
      })
    }
    // Default: setup questions
    return Promise.resolve({
      text: JSON.stringify({
        questions: [
          { text: 'What is your current experience level?', options: ['Beginner', 'Intermediate', 'Advanced'] },
          { text: 'How much time per day?', options: ['15 min', '30 min', '1 hour'] },
        ],
      }),
    })
  }),
  streamToSSE: vi.fn(async (streamResult, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    for await (const chunk of streamResult.textStream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
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
  return path.join(os.tmpdir(), `test-curriculum-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Curriculum API', () => {
  let dbPath
  let dbModule
  let app

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()

    // Seed LLM settings so curriculum routes don't return 400 for missing settings
    dbModule.run(
      'INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)',
      'openai', 'sk-test', 'gpt-4o'
    )

    const { default: curriculumRouter } = await import('../routes/curriculum.js')
    const { default: dashboardRouter } = await import('../routes/dashboard.js')
    app = express()
    app.use(express.json())
    app.use('/api', curriculumRouter)
    app.use('/api', dashboardRouter)
  })

  afterEach(() => {
    if (dbModule && dbModule.default) {
      try { dbModule.default.close() } catch {}
    }
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  describe('POST /api/topics/:id/profile', () => {
    it('saves learner profile for a topic', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/profile`)
        .send({ level: 'Beginner', timeCommitment: '30 min/day' })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)

      const row = dbModule.get('SELECT level, time_per_week FROM topics WHERE id = ?', topic.lastInsertRowid)
      expect(row.level).toBe('Beginner')
      expect(row.time_per_week).toBe('30 min/day')
    })

    it('rejects invalid level values', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/profile`)
        .send({ level: 'Expert', timeCommitment: '30 min/day' })
      expect(res.status).toBe(400)
    })

    it('rejects missing time commitment', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/profile`)
        .send({ level: 'Beginner' })
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/topics/:id/setup-questions', () => {
    it('returns setup questions via LLM', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/setup-questions`)
      expect(res.status).toBe(200)
      expect(res.body.questions).toHaveLength(2)
      expect(res.body.questions[0].text).toBeDefined()
      expect(res.body.questions[0].options).toBeDefined()
    })

    it('returns 404 for nonexistent topic', async () => {
      const res = await request(app).get('/api/topics/999/setup-questions')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/topics/:id/curriculum/generate', () => {
    it('streams a generated curriculum as SSE', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, level, time_per_week) VALUES (?, ?, ?, ?)", "React", "active", "Beginner", "30 min/day")
      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/curriculum/generate`)
        .set('Accept', 'text/event-stream')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/event-stream/)
    })

    it('returns 404 for nonexistent topic', async () => {
      const res = await request(app).post('/api/topics/999/curriculum/generate')
      expect(res.status).toBe(404)
    })

    it('returns 400 if profile is missing', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const res = await request(app).post(`/api/topics/${topic.lastInsertRowid}/curriculum/generate`)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/profile/i)
    })
  })

  describe('POST /api/topics/:id/curriculum/confirm', () => {
    it('persists curriculum draft to DB and unlocks first lesson', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, level, time_per_week) VALUES (?, ?, ?, ?)", "React", "active", "Beginner", "30 min/day")

      const curriculum = {
        modules: [
          {
            title: 'Foundations',
            lessons: [
              { title: 'Intro', depth: 'Beginner', estimated_time: 10, outcomes: ['Understand basics'], prerequisites: [] },
            ],
          },
        ],
      }

      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/curriculum/confirm`)
        .send({ curriculum })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)

      // First lesson should have progress row in not_started (available)
      const allLessons = dbModule.all('SELECT l.id FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.topic_id = ?', topic.lastInsertRowid)
      expect(allLessons.length).toBe(1)
      const prog = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topic.lastInsertRowid, allLessons[0].id)
      expect(prog.state).toBe('not_started')
    })
  })

  describe('POST /api/topics/:id/curriculum/tweak', () => {
    it('accepts a tweak request and returns updated curriculum', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, level, time_per_week) VALUES (?, ?, ?, ?)", "React", "active", "Beginner", "30 min/day")
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, "Foundations")
      dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
        mod.lastInsertRowid, 0, "Intro", "Beginner", 10, JSON.stringify(["Understand basics"]), "[]")

      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/curriculum/tweak`)
        .send({ request: 'Add a module on testing' })
      expect(res.status).toBe(200)
      expect(res.body.modules).toBeDefined()
    })

    it('rejects empty tweak request', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, level, time_per_week) VALUES (?, ?, ?, ?)", "React", "active", "Beginner", "30 min/day")
      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/curriculum/tweak`)
        .send({ request: '' })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/topics/:id/curriculum/regenerate', () => {
    it('replaces old draft with new curriculum', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, level, time_per_week) VALUES (?, ?, ?, ?)", "React", "active", "Beginner", "30 min/day")
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, "Old Module")
      dbModule.run("INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, ?, ?)", mod.lastInsertRowid, 0, "Old Lesson")

      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/curriculum/regenerate`)
        .set('Accept', 'text/event-stream')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/event-stream/)
    })
  })

  describe('GET /api/topics/:id/lessons/:lid/test-out', () => {
    it('returns test-out quiz questions', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, "Basics")
      const l1 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, outcomes) VALUES (?, ?, ?, ?)", mod.lastInsertRowid, 0, "JSX", JSON.stringify(["Write JSX"]))

      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/lessons/${l1.lastInsertRowid}/test-out`)
      expect(res.status).toBe(200)
      expect(res.body.questions).toBeDefined()
    })

    it('returns 404 for nonexistent lesson', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/lessons/999/test-out`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/topics/:id/lessons/:lid/test-out', () => {
    it('evaluates test-out answers and marks passed on success', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, "Basics")
      const l1 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, outcomes) VALUES (?, ?, ?, ?)", mod.lastInsertRowid, 0, "JSX", JSON.stringify(["Write JSX"]))

      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/lessons/${l1.lastInsertRowid}/test-out`)
        .send({ answers: ['JSX is a syntax extension'] })
      expect(res.status).toBe(200)
      expect(res.body.passed).toBeDefined()
    })

    it('rejects empty answers', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, "Basics")
      const l1 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, ?, ?)", mod.lastInsertRowid, 0, "JSX")

      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/lessons/${l1.lastInsertRowid}/test-out`)
        .send({ answers: [] })
      expect(res.status).toBe(400)
    })
  })
})
