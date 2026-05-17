import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('../llm/client.js', () => ({
  streamText: vi.fn((_params) => {
    return Promise.resolve({
      textStream: (async function* () { yield 'OK' })(),
    })
  }),
  generateText: vi.fn((_params) => {
    const system = _params?.system || ''
    if (system.toLowerCase().includes('artifact') || system.toLowerCase().includes('rubric')) {
      return Promise.resolve({
        text: JSON.stringify({
          overallScore: 75,
          passed: true,
          scores: {
            Correctness: 2,
            Completeness: 2,
            Clarity: 1,
            'Edge Cases': 1,
          },
          feedback: {
            Correctness: 'The solution is correct.',
            Completeness: 'All required parts are present.',
            Clarity: 'Could use more comments.',
            'Edge Cases': 'Handles basic edge cases but not all.',
          },
        }),
      })
    }
    if (system.toLowerCase().includes('generate 3-8 free-text quiz questions')) {
      return Promise.resolve({
        text: JSON.stringify({
          questions: [
            { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
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
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
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
  return path.join(os.tmpdir(), `test-artifact-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Artifact API', () => {
  let dbPath
  let dbModule
  let app

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()

    dbModule.run('INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)', 'openai', 'sk-test', 'gpt-4o')

    const { default: lessonsRouter } = await import('../routes/lessons.js')
    const { default: dashboardRouter } = await import('../routes/dashboard.js')
    const { default: curriculumRouter } = await import('../routes/curriculum.js')
    app = express()
    app.use(express.json({ limit: '6mb' }))
    app.use('/api', lessonsRouter)
    app.use('/api', dashboardRouter)
    app.use('/api', curriculumRouter)
  })

  afterEach(() => {
    if (dbModule && dbModule.default) {
      try { dbModule.default.close() } catch {}
    }
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  function seedTopicAndLesson(topicTitle = 'React', lessonTitle = 'JSX', artifactRequired = 1, artifactType = 'code') {
    const topic = dbModule.run("INSERT INTO topics (title, status, interaction_mode) VALUES (?, ?, ?)", topicTitle, 'active', 'code')
    const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
    const lesson = dbModule.run(
      "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites, artifact_required, artifact_type, artifact_rubric) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      mod.lastInsertRowid, 0, lessonTitle, 'Beginner', 10, JSON.stringify(['Understand JSX']), '[]', artifactRequired, artifactType, ''
    )
    return { topicId: topic.lastInsertRowid, lessonId: lesson.lastInsertRowid }
  }

  describe('POST /api/topics/:id/lessons/:lid/artifact', () => {
    it('submits a text artifact and returns structured evaluation', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'practicing', 3, 3)

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      expect(res.status).toBe(200)
      expect(res.body.evaluation).toBeDefined()
      expect(res.body.evaluation.scores).toBeDefined()
      expect(Object.keys(res.body.evaluation.scores)).toContain('Correctness')
      expect(Object.keys(res.body.evaluation.scores)).toContain('Completeness')
      expect(Object.keys(res.body.evaluation.scores)).toContain('Clarity')
      expect(Object.keys(res.body.evaluation.scores)).toContain('Edge Cases')
    })

    it('blocks empty or whitespace-only artifact submission', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: '   \n   ' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/empty|blank/i)
    })

    it('blocks missing content field', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({})

      expect(res.status).toBe(400)
    })

    it('persists artifact and evaluation to the database', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      const artifact = dbModule.get(
        'SELECT * FROM artifacts WHERE progress_id = (SELECT id FROM progress WHERE topic_id = ? AND lesson_id = ?)',
        topicId, lessonId
      )
      expect(artifact).toBeDefined()
      expect(artifact.content).toContain('function add')
      expect(artifact.attempt_number).toBe(1)
    })

    it('marks artifact_passed=1 when evaluation passes', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, quiz_score) VALUES (?, ?, ?, ?)", topicId, lessonId, 'practicing', 85)

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      expect(res.status).toBe(200)
      const prog = dbModule.get('SELECT artifact_passed, state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.artifact_passed).toBe(1)
    })

    it('does not transition to passed when quiz is not yet passed', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      const prog = dbModule.get('SELECT state, artifact_passed FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('practicing')
      expect(prog.artifact_passed).toBe(1)
    })

    it('transitions to passed when quiz was already passed and artifact now passes', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, quiz_score) VALUES (?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 85)

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      const prog = dbModule.get('SELECT state, artifact_passed, completed_at FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(prog.state).toBe('passed')
      expect(prog.artifact_passed).toBe(1)
      expect(prog.completed_at).toBeTruthy()
    })

    it('returns failure with weak dimensions highlighted when artifact fails', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 50,
          passed: false,
          scores: {
            Correctness: 0,
            Completeness: 1,
            Clarity: 1,
            'Edge Cases': 0,
          },
          feedback: {
            Correctness: 'The solution has a bug.',
            Completeness: 'Missing error handling.',
            Clarity: 'Readable but sparse.',
            'Edge Cases': 'Does not handle negative numbers.',
          },
        }),
      })

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      expect(res.status).toBe(200)
      expect(res.body.evaluation.passed).toBe(false)
      expect(res.body.evaluation.scores.Correctness).toBe(0)
      expect(res.body.evaluation.scores['Edge Cases']).toBe(0)
    })

    it('increments attempt_number on resubmission', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      const artifacts = dbModule.all(
        'SELECT * FROM artifacts WHERE progress_id = (SELECT id FROM progress WHERE topic_id = ? AND lesson_id = ?) ORDER BY attempt_number',
        topicId, lessonId
      )
      expect(artifacts).toHaveLength(2)
      expect(artifacts[0].attempt_number).toBe(1)
      expect(artifacts[1].attempt_number).toBe(2)
    })

    it('rejects malformed LLM evaluation with retryable error', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const { generateText } = await import('../llm/client.js')
      generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 500,
          passed: true,
          scores: { Correctness: 5, Completeness: 5, Clarity: 5, 'Edge Cases': 5 },
          feedback: { Correctness: 'bad' },
        }),
      })

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      expect(res.status).toBe(500)
      expect(res.body.error).toMatch(/invalid|malformed|rubric/i)
      expect(res.body.retryable).toBe(true)
    })

    it('accepts file upload with filename', async () => {
      const { topicId, lessonId } = seedTopicAndLesson('Design', 'Wireframing', 1, 'design')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const res = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'Uploaded: wireframe.png' })

      expect(res.status).toBe(200)
    })

    it('returns 403 for locked lesson', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", 'React', 'active')
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
      const prereq = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites, artifact_required, artifact_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", mod.lastInsertRowid, 0, 'A', 'Beginner', 10, JSON.stringify(['a']), '[]', 0, '')
      const lesson = dbModule.run(
        "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites, artifact_required, artifact_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        mod.lastInsertRowid, 1, 'B', 'Beginner', 10, JSON.stringify(['b']), JSON.stringify([{ lessonId: prereq.lastInsertRowid, title: 'A' }]), 1, 'code'
      )
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, prereq.lastInsertRowid, 'not_started')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, lesson.lastInsertRowid, 'not_started')

      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/lessons/${lesson.lastInsertRowid}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      expect(res.status).toBe(403)
    })
  })

  describe('GET /api/topics/:id/lessons/:lid/artifact', () => {
    it('returns the latest artifact submission', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      const res = await request(app).get(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
      expect(res.status).toBe(200)
      expect(res.body.content).toContain('function add')
      expect(res.body.evaluation).toBeDefined()
    })

    it('returns 404 when no artifact exists', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const res = await request(app).get(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/topics/:id/lessons/:lid includes artifact metadata', () => {
    it('returns artifact_required and artifact_type in lesson details', async () => {
      const { topicId, lessonId } = seedTopicAndLesson('React', 'JSX', 1, 'code')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      const res = await request(app).get(`/api/topics/${topicId}/lessons/${lessonId}`)
      expect(res.status).toBe(200)
      expect(res.body.lesson.artifact_required).toBe(true)
      expect(res.body.lesson.artifact_type).toBe('code')
    })

    it('includes artifact_passed in progress response', async () => {
      const { topicId, lessonId } = seedTopicAndLesson('React', 'JSX', 1, 'code')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, artifact_passed, quiz_score) VALUES (?, ?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 1, 85)

      const res = await request(app).get(`/api/topics/${topicId}/lessons/${lessonId}`)
      expect(res.status).toBe(200)
      expect(res.body.progress.artifact_passed).toBe(1)
    })
  })

  describe('Artifact + Quiz completion ordering', () => {
    it('completes lesson when artifact submitted first, then quiz passed', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'practicing')

      // Submit artifact first
      const artRes = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })
      expect(artRes.status).toBe(200)

      const progAfterArtifact = dbModule.get('SELECT state, artifact_passed FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(progAfterArtifact.state).toBe('practicing')
      expect(progAfterArtifact.artifact_passed).toBe(1)

      // Now take and pass quiz
      dbModule.run('UPDATE progress SET state = ? WHERE topic_id = ? AND lesson_id = ?', 'quiz_pending', topicId, lessonId)
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions) VALUES (?, ?, ?)',
        topicId, lessonId, JSON.stringify([{ id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 }])
      )

      const quizRes = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'JSX is JavaScript XML.' } })

      expect(quizRes.status).toBe(200)
      const progAfterQuiz = dbModule.get('SELECT state, artifact_passed FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(progAfterQuiz.state).toBe('passed')
      expect(progAfterQuiz.artifact_passed).toBe(1)
    })

    it('completes lesson when quiz passed first, then artifact submitted', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      // First pass quiz
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, quiz_score) VALUES (?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 85)
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions) VALUES (?, ?, ?)',
        topicId, lessonId, JSON.stringify([{ id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 }])
      )

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`)
        .send({ answers: { q1: 'JSX is JavaScript XML.' } })

      // Since artifact required, state should NOT be passed yet
      const progAfterQuiz = dbModule.get('SELECT state, artifact_passed, quiz_score FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(progAfterQuiz.quiz_score).toBe(85)

      // Now submit artifact
      const artRes = await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      expect(artRes.status).toBe(200)
      const progAfterArtifact = dbModule.get('SELECT state, artifact_passed, completed_at FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(progAfterArtifact.state).toBe('passed')
      expect(progAfterArtifact.artifact_passed).toBe(1)
      expect(progAfterArtifact.completed_at).toBeTruthy()
    })

    it('schedules SRS when both artifact and quiz pass', async () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, quiz_score) VALUES (?, ?, ?, ?)", topicId, lessonId, 'quiz_pending', 85)
      dbModule.run(
        'INSERT INTO quiz_attempts (topic_id, lesson_id, questions) VALUES (?, ?, ?)',
        topicId, lessonId, JSON.stringify([{ id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 }])
      )

      await request(app)
        .post(`/api/topics/${topicId}/lessons/${lessonId}/artifact`)
        .send({ content: 'function add(a, b) { return a + b; }' })

      const srs = dbModule.get('SELECT * FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      expect(srs).toBeDefined()
      expect(srs.interval_index).toBe(0)
    })
  })

  describe('Dashboard curriculum indicator', () => {
    it('includes artifact_required in curriculum lesson data', async () => {
      const { topicId, lessonId } = seedTopicAndLesson('React', 'JSX', 1, 'code')
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topicId, lessonId, 'not_started')

      const res = await request(app).get(`/api/topics/${topicId}/curriculum`)
      expect(res.status).toBe(200)
      const lesson = res.body.modules[0].lessons[0]
      expect(lesson.artifact_required).toBe(true)
    })
  })
})
