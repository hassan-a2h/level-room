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
        const words = 'Exam generation response.'.split(' ')
        for (const word of words) {
          yield word + ' '
        }
      })(),
    })
  }),
  generateText: vi.fn((_params) => {
    const system = (_params?.system || '').toLowerCase()
    const messages = Array.isArray(_params?.messages) ? _params.messages.map((m) => (m.content || '').toLowerCase()).join(' ') : ''
    const combined = system + ' ' + messages
    if (combined.includes('evaluate') || combined.includes('evaluating')) {
      return Promise.resolve({
        text: JSON.stringify({
          overallScore: 85,
          passed: true,
          criticalGap: false,
          perLessonScores: {
            '1': { score: 90, questionCount: 2 },
            '2': { score: 80, questionCount: 2 },
          },
          weakLessons: [],
          feedback: [
            { questionId: 'q1', correctness: 'correct', score: 1, explanation: 'Correct.' },
            { questionId: 'q2', correctness: 'correct', score: 2, explanation: 'Good.' },
            { questionId: 'q3', correctness: 'partial', score: 1, explanation: 'Partial.' },
            { questionId: 'q4', correctness: 'correct', score: 2, explanation: 'Correct.' },
          ],
          gaps: [],
        }),
      })
    }
    if (combined.includes('module exam') || combined.includes('generate') || combined.includes('retest')) {
      return Promise.resolve({
        text: JSON.stringify({
          questions: [
            { id: 'q1', text: 'What is React?', type: 'conceptual', weight: 1, lessonId: 1 },
            { id: 'q2', text: 'Explain JSX.', type: 'open-ended', weight: 2, lessonId: 1 },
            { id: 'q3', text: 'Write a counter component.', type: 'application', weight: 2, lessonId: 2 },
            { id: 'q4', text: 'Debug this code.', type: 'debugging', weight: 2, lessonId: 2 },
          ],
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
  return path.join(os.tmpdir(), `test-exams-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

function seedTopicWithModule(dbModule, topicTitle = 'React') {
  const topic = dbModule.run("INSERT INTO topics (title, status, interaction_mode) VALUES (?, ?, ?)", topicTitle, 'active', 'code')
  const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
  const lesson1 = dbModule.run(
    "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
    mod.lastInsertRowid, 0, 'JSX', 'Beginner', 10, JSON.stringify(['Understand JSX']), '[]'
  )
  const lesson2 = dbModule.run(
    "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
    mod.lastInsertRowid, 1, 'Components', 'Beginner', 15, JSON.stringify(['Build components']), JSON.stringify([{ lessonId: lesson1.lastInsertRowid, title: 'JSX' }])
  )
  return {
    topicId: topic.lastInsertRowid,
    moduleId: mod.lastInsertRowid,
    lesson1Id: lesson1.lastInsertRowid,
    lesson2Id: lesson2.lastInsertRowid,
  }
}

function seedTopicWithTwoModules(dbModule, topicTitle = 'React') {
  const topic = dbModule.run("INSERT INTO topics (title, status, interaction_mode) VALUES (?, ?, ?)", topicTitle, 'active', 'code')

  const mod1 = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
  const l1 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)", mod1.lastInsertRowid, 0, 'JSX', 'Beginner', 10, JSON.stringify(['Understand JSX']), '[]')
  const l2 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)", mod1.lastInsertRowid, 1, 'Components', 'Beginner', 15, JSON.stringify(['Build components']), JSON.stringify([{ lessonId: l1.lastInsertRowid, title: 'JSX' }]))

  const mod2 = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 1, 'Advanced')
  const l3 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)", mod2.lastInsertRowid, 0, 'Hooks', 'Intermediate', 20, JSON.stringify(['Use hooks']), JSON.stringify([{ lessonId: l2.lastInsertRowid, title: 'Components' }]))

  return {
    topicId: topic.lastInsertRowid,
    module1Id: mod1.lastInsertRowid,
    module2Id: mod2.lastInsertRowid,
    lesson1Id: l1.lastInsertRowid,
    lesson2Id: l2.lastInsertRowid,
    lesson3Id: l3.lastInsertRowid,
  }
}

describe('Exams API', () => {
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

    const { default: examsRouter } = await import('../routes/exams.js')
    const { default: dashboardRouter } = await import('../routes/dashboard.js')
    app = express()
    app.use(express.json())
    app.use('/api', examsRouter)
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

  describe('GET /api/topics/:id/modules/:mid/exam', () => {
    it('returns exam_not_ready when lessons are not all passed', async () => {
      const { topicId, moduleId, lesson1Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')

      const res = await request(app).get(`/api/topics/${topicId}/modules/${moduleId}/exam`)
      expect(res.status).toBe(403)
      expect(res.body.examNotReady).toBe(true)
      expect(res.body.lessonsRemaining).toBeGreaterThan(0)
    })

    it('returns 404 when no exam exists but all lessons passed', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const res = await request(app).get(`/api/topics/${topicId}/modules/${moduleId}/exam`)
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/no exam/i)
    })

    it('returns existing exam with persisted answers', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const questions = JSON.stringify([
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: lesson1Id },
      ])
      const answers = JSON.stringify({ q1: 'answer' })
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, answers, status) VALUES (?, ?, ?, ?, ?)',
        topicId, moduleId, questions, answers, 'pending'
      )

      const res = await request(app).get(`/api/topics/${topicId}/modules/${moduleId}/exam`)
      expect(res.status).toBe(200)
      expect(res.body.questions).toHaveLength(1)
      expect(res.body.answers.q1).toBe('answer')
      expect(res.body.status).toBe('pending')
    })
  })

  describe('POST /api/topics/:id/modules/:mid/exam', () => {
    it('returns 403 when not all lessons are passed', async () => {
      const { topicId, moduleId, lesson1Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')

      const res = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).send({})
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/complete all/i)
    })

    it('generates exam when all lessons are passed', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const res = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).send({})
      expect(res.status).toBe(200)
      expect(res.body.questions.length).toBeGreaterThanOrEqual(4)
      expect(res.body.status).toBe('pending')
    })

    it('returns existing pending exam instead of generating duplicate', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const questions = JSON.stringify([{ id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: lesson1Id }])
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, status) VALUES (?, ?, ?, ?)',
        topicId, moduleId, questions, 'pending'
      )

      const res = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam`).send({})
      expect(res.status).toBe(200)
      expect(res.body.questions).toHaveLength(1)
    })
  })

  describe('POST /api/topics/:id/modules/:mid/exam/submit', () => {
    it('blocks submission with empty answers', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const questions = JSON.stringify([
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: lesson1Id },
      ])
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, status) VALUES (?, ?, ?, ?)',
        topicId, moduleId, questions, 'pending'
      )

      const res = await request(app)
        .post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`)
        .send({ answers: {} })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/answer/i)
    })

    it('evaluates answers and returns pass result', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const questions = JSON.stringify([
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: lesson1Id },
        { id: 'q2', text: 'Q2', type: 'open-ended', weight: 2, lessonId: lesson1Id },
        { id: 'q3', text: 'Q3', type: 'application', weight: 2, lessonId: lesson2Id },
        { id: 'q4', text: 'Q4', type: 'debugging', weight: 2, lessonId: lesson2Id },
      ])
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, status) VALUES (?, ?, ?, ?)',
        topicId, moduleId, questions, 'pending'
      )

      const res = await request(app)
        .post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`)
        .send({ answers: { q1: 'a', q2: 'b', q3: 'c', q4: 'd' } })

      expect(res.status).toBe(200)
      expect(res.body.overallScore).toBe(85)
      expect(res.body.passed).toBe(true)
      expect(res.body.perLessonScores).toBeDefined()
    })

    it('marks module complete and schedules SRS on pass', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const questions = JSON.stringify([
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: lesson1Id },
      ])
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, status) VALUES (?, ?, ?, ?)',
        topicId, moduleId, questions, 'pending'
      )

      const res = await request(app)
        .post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`)
        .send({ answers: { q1: 'a' } })

      expect(res.status).toBe(200)
      expect(res.body.passed).toBe(true)

      const mod = dbModule.get('SELECT status, completed_at FROM modules WHERE id = ?', moduleId)
      expect(mod.status).toBe('completed')
      expect(mod.completed_at).toBeTruthy()
    })

    it('unlocks next module on pass', async () => {
      const ids = seedTopicWithTwoModules(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", ids.topicId, ids.lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", ids.topicId, ids.lesson2Id, 'passed')

      const questions = JSON.stringify([
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: ids.lesson1Id },
      ])
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, status) VALUES (?, ?, ?, ?)',
        ids.topicId, ids.module1Id, questions, 'pending'
      )

      const res = await request(app)
        .post(`/api/topics/${ids.topicId}/modules/${ids.module1Id}/exam/submit`)
        .send({ answers: { q1: 'a' } })

      expect(res.status).toBe(200)
      expect(res.body.passed).toBe(true)
      expect(res.body.nextModuleUnlocked).toBe(true)
    })

    it('returns fail result with weak lessons identified', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 65,
          passed: false,
          criticalGap: true,
          perLessonScores: {
            [lesson1Id]: { score: 90, questionCount: 2 },
            [lesson2Id]: { score: 40, questionCount: 2 },
          },
          weakLessons: [lesson2Id],
          feedback: [
            { questionId: 'q1', correctness: 'correct', score: 1, explanation: 'Correct.' },
          ],
          gaps: ['Weak in components'],
        }),
      })

      const questions = JSON.stringify([
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: lesson1Id },
        { id: 'q2', text: 'Q2', type: 'open-ended', weight: 2, lessonId: lesson2Id },
      ])
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, status) VALUES (?, ?, ?, ?)',
        topicId, moduleId, questions, 'pending'
      )

      const res = await request(app)
        .post(`/api/topics/${topicId}/modules/${moduleId}/exam/submit`)
        .send({ answers: { q1: 'a', q2: 'b' } })

      expect(res.status).toBe(200)
      expect(res.body.passed).toBe(false)
      expect(res.body.weakLessons.length).toBeGreaterThan(0)
      expect(res.body.perLessonScores).toBeDefined()
    })
  })

  describe('POST /api/topics/:id/modules/:mid/exam/retake', () => {
    it('creates a new full exam attempt', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const questions = JSON.stringify([{ id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: lesson1Id }])
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, answers, evaluation, status) VALUES (?, ?, ?, ?, ?, ?)',
        topicId, moduleId, questions, '{}', '{}', 'failed'
      )

      const res = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/retake`).send({})
      expect(res.status).toBe(200)
      expect(res.body.questions).toBeDefined()
      expect(res.body.status).toBe('pending')
    })
  })

  describe('POST /api/topics/:id/modules/:mid/exam/partial-retest', () => {
    it('returns 400 when no failed exam exists', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const res = await request(app).post(`/api/topics/${topicId}/modules/${moduleId}/exam/partial-retest`).send({ weakLessons: [lesson2Id] })
      expect(res.status).toBe(400)
    })

    it('generates partial retest for weak lessons', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const questions = JSON.stringify([
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: lesson1Id },
        { id: 'q2', text: 'Q2', type: 'open-ended', weight: 2, lessonId: lesson2Id },
      ])
      const evaluation = JSON.stringify({ overallScore: 65, passed: false, weakLessons: [lesson2Id] })
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, evaluation, status, type) VALUES (?, ?, ?, ?, ?, ?)',
        topicId, moduleId, questions, evaluation, 'failed', 'full'
      )
      const parentExamId = dbModule.get('SELECT id FROM exam_attempts WHERE topic_id = ? AND module_id = ?', topicId, moduleId).id

      const res = await request(app)
        .post(`/api/topics/${topicId}/modules/${moduleId}/exam/partial-retest`)
        .send({ weakLessons: [lesson2Id] })

      expect(res.status).toBe(200)
      expect(res.body.questions.length).toBeGreaterThan(0)
      expect(res.body.type).toBe('partial')
      expect(res.body.parentExamId).toBe(parentExamId)
    })

    it('can pass module via partial retest if original overall was >=75', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 80,
          passed: true,
          criticalGap: false,
          perLessonScores: {
            [lesson2Id]: { score: 80, questionCount: 2 },
          },
          weakLessons: [],
          feedback: [],
          gaps: [],
        }),
      })

      const questions = JSON.stringify([
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: lesson2Id },
      ])
      const evaluation = JSON.stringify({ overallScore: 80, passed: false, weakLessons: [lesson2Id], perLessonScores: { [lesson2Id]: { score: 40 } } })
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, evaluation, status, type) VALUES (?, ?, ?, ?, ?, ?)',
        topicId, moduleId, questions, evaluation, 'failed', 'full'
      )
      const parentExamId = dbModule.get('SELECT id FROM exam_attempts WHERE topic_id = ? AND module_id = ?', topicId, moduleId).id

      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, status, type, parent_exam_id) VALUES (?, ?, ?, ?, ?, ?)',
        topicId, moduleId, questions, 'pending', 'partial', parentExamId
      )
      const retestId = dbModule.get('SELECT id FROM exam_attempts WHERE topic_id = ? AND module_id = ? AND type = ?', topicId, moduleId, 'partial').id

      const res = await request(app)
        .post(`/api/topics/${topicId}/modules/${moduleId}/exam/partial-retest/${retestId}/submit`)
        .send({ answers: { q1: 'a' } })

      expect(res.status).toBe(200)
      expect(res.body.passed).toBe(true)
      expect(res.body.partialPass).toBe(true)
    })
  })

  describe('POST /api/topics/:id/modules/:mid/exam/save-progress', () => {
    it('persists in-progress answers for resume', async () => {
      const { topicId, moduleId, lesson1Id, lesson2Id } = seedTopicWithModule(dbModule)
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson1Id, 'passed')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lesson2Id, 'passed')

      const questions = JSON.stringify([{ id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: lesson1Id }])
      dbModule.run(
        'INSERT INTO exam_attempts (topic_id, module_id, questions, status) VALUES (?, ?, ?, ?)',
        topicId, moduleId, questions, 'pending'
      )

      const res = await request(app)
        .post(`/api/topics/${topicId}/modules/${moduleId}/exam/save-progress`)
        .send({ answers: { q1: 'partial answer' } })

      expect(res.status).toBe(200)

      const exam = dbModule.get('SELECT answers FROM exam_attempts WHERE topic_id = ? AND module_id = ?', topicId, moduleId)
      const saved = JSON.parse(exam.answers)
      expect(saved.q1).toBe('partial answer')
    })
  })
})
