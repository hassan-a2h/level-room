import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('../llm/client.js', () => ({
  streamText: vi.fn((_params) => {
    // Determine what kind of response to generate based on the system prompt
    const system = _params?.system || ''
    const isContinue = system.includes('next chunk') || system.includes('Continue the lesson')
    const isSocratic = system.includes('Socratic') || system.includes('ask a clarifying question')
    const isFinal = system.includes('final chunk') || system.includes('Check Your Understanding')

    let responseText = ''
    if (isSocratic) {
      responseText = "That's a great question. Before I explain, can you tell me what you already know about this concept?"
    } else if (isFinal) {
      responseText = "Great! We've covered the key concepts. Let's check your understanding with a few questions. Ready?"
    } else if (isContinue) {
      responseText = "Now let's move to the next concept. In React, components are the building blocks of your UI."
    } else {
      responseText = "Welcome to this lesson! Let's start with the basics. A component in React is a reusable piece of UI."
    }

    return Promise.resolve({
      textStream: (async function* () {
        const words = responseText.split(' ')
        for (const word of words) {
          yield word + ' '
        }
      })(),
    })
  }),
  generateText: vi.fn((_params) => {
    return Promise.resolve({
      text: JSON.stringify({ mode: 'socratic', total_chunks: 3 }),
    })
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
  return path.join(os.tmpdir(), `test-lessons-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Lessons API', () => {
  let dbPath
  let dbModule
  let app

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()

    // Seed LLM settings
    dbModule.run(
      'INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)',
      'openai', 'sk-test', 'gpt-4o'
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

  describe('GET /api/topics/:id/lessons/:lid', () => {
    it('returns lesson details with messages and progress', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'not_started')
      dbModule.run("INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)", topicId, lessonId, 'assistant', 'Welcome!')

      const res = await request(app).get(`/api/topics/${topicId}/lessons/${lessonId}`)
      expect(res.status).toBe(200)
      expect(res.body.lesson.title).toBe('JSX')
      expect(res.body.lesson.depth).toBe('Beginner')
      expect(res.body.messages).toHaveLength(1)
      expect(res.body.messages[0].role).toBe('assistant')
      expect(res.body.progress.state).toBe('not_started')
    })

    it('returns 404 for nonexistent lesson', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", 'React', 'active')
      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/lessons/999`)
      expect(res.status).toBe(404)
    })

    it('returns 403 when prerequisites are unmet', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", 'React', 'active')
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
      const prereqLesson = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)", mod.lastInsertRowid, 0, 'Components', 'Beginner', 10, JSON.stringify(['Know components']), '[]')
      const lesson = dbModule.run(
        "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
        mod.lastInsertRowid, 1, 'Hooks', 'Intermediate', 15, JSON.stringify(['Use hooks']), JSON.stringify([{ lessonId: prereqLesson.lastInsertRowid, title: 'Components' }])
      )
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, prereqLesson.lastInsertRowid, 'not_started')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, lesson.lastInsertRowid, 'not_started')

      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/lessons/${lesson.lastInsertRowid}`)
      expect(res.status).toBe(403)
      expect(res.body.locked).toBe(true)
      expect(res.body.prerequisites).toBeDefined()
    })

    it('returns lesson when prerequisites are met', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", 'React', 'active')
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
      const prereqLesson = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)", mod.lastInsertRowid, 0, 'Components', 'Beginner', 10, JSON.stringify(['Know components']), '[]')
      const lesson = dbModule.run(
        "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
        mod.lastInsertRowid, 1, 'Hooks', 'Intermediate', 15, JSON.stringify(['Use hooks']), JSON.stringify([{ lessonId: prereqLesson.lastInsertRowid, title: 'Components' }])
      )
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, prereqLesson.lastInsertRowid, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, lesson.lastInsertRowid, 'not_started')

      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/lessons/${lesson.lastInsertRowid}`)
      expect(res.status).toBe(200)
      expect(res.body.locked).toBe(false)
    })
  })

  describe('POST /api/topics/:id/lessons/:lid/chat', () => {
    it('persists user message and streams tutor response via SSE', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'not_started')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/chat`)
        .set('Accept', 'text/event-stream')
        .send({ content: 'What is JSX?' })

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/event-stream/)

      // Verify user message was persisted
      const messages = dbModule.all("SELECT * FROM messages WHERE topic_id = ? AND lesson_id = ? ORDER BY id", topicId, lessonId)
      expect(messages.length).toBeGreaterThanOrEqual(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('What is JSX?')
    })

    it('transitions state from not_started to practicing on first message', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'not_started')

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/chat`)
        .set('Accept', 'text/event-stream')
        .send({ content: 'Hello' })

      const prog = dbModule.get("SELECT state, current_chunk FROM progress WHERE topic_id = ? AND lesson_id = ?", topicId, lessonId)
      expect(prog.state).toBe('practicing')
      expect(prog.current_chunk).toBe(1)
    })

    it('rejects empty content over 2000 chars', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/chat`)
        .send({ content: '' })

      expect(res.status).toBe(400)
    })

    it('rejects content longer than 2000 characters', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/chat`)
        .send({ content: 'x'.repeat(2001) })

      expect(res.status).toBe(400)
    })

    it('returns 403 for locked lesson', async () => {
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
        .post(`/api/topics/${topic.lastInsertRowid}/lessons/${lesson.lastInsertRowid}/chat`)
        .send({ content: 'Hello' })

      expect(res.status).toBe(403)
    })
  })

  describe('POST /api/topics/:id/lessons/:lid/continue', () => {
    it('advances chunk and streams next tutor response', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'practicing', 1, 3)

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/continue`)
        .set('Accept', 'text/event-stream')

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/event-stream/)

      const prog = dbModule.get("SELECT current_chunk FROM progress WHERE topic_id = ? AND lesson_id = ?", topicId, lessonId)
      expect(prog.current_chunk).toBe(2)
    })

    it('returns 400 when lesson is not in practicing state', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'not_started')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/continue`)
        .set('Accept', 'text/event-stream')

      expect(res.status).toBe(400)
    })
  })

  describe('Interaction mode inference', () => {
    it('returns socratic mode for conceptual topics', async () => {
      const { topicId, lessonId } = seedTopicAndLesson('Philosophy', 'Logic')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'not_started')

      const res = await request(app).get(`/api/topics/${topicId}/lessons/${lessonId}`)
      expect(res.status).toBe(200)
      expect(res.body.interactionMode).toBe('socratic')
    })

    it('returns code mode for technical topics', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, interaction_mode) VALUES (?, ?, ?)", 'Python', 'active', 'code')
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
      const lesson = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)", mod.lastInsertRowid, 0, 'Functions', 'Beginner', 10, JSON.stringify(['Know functions']), '[]')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, lesson.lastInsertRowid, 'not_started')

      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/lessons/${lesson.lastInsertRowid}`)
      expect(res.status).toBe(200)
      expect(res.body.interactionMode).toBe('code')
    })

    it('returns scenario mode for soft-skill topics', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, interaction_mode) VALUES (?, ?, ?)", 'Negotiation', 'active', 'scenario')
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
      const lesson = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)", mod.lastInsertRowid, 0, 'Active Listening', 'Beginner', 10, JSON.stringify(['Listen']), '[]')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, lesson.lastInsertRowid, 'not_started')

      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/lessons/${lesson.lastInsertRowid}`)
      expect(res.status).toBe(200)
      expect(res.body.interactionMode).toBe('scenario')
    })
  })
})
