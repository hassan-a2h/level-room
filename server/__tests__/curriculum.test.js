import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('../llm/client.js', () => ({
  streamText: vi.fn(() => {
    const task = {
      title: 'Local setup',
      scenario: 'Use a safe local fixture.',
      goal: 'Create and verify the requested behavior.',
      constraints: ['Use test data only'],
      deliverables: ['Commands', 'Observed output'],
      success_criteria: ['The behavior is observable', 'The result is reproducible'],
      estimated_time: 10,
      primary_setup: { kind: 'local', description: 'Run locally.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
      free_fallback: { kind: 'no_software', description: 'Explain the expected local result.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
      hints: [],
      safety_notes: ['Use only systems you own.'],
    }
    const modules = Array.from({ length: 3 }, (_, moduleIndex) => ({
      title: `Foundations ${moduleIndex + 1}`,
      lessons: Array.from({ length: 3 }, (_, lessonIndex) => ({
        title: `Lesson ${moduleIndex + 1}.${lessonIndex + 1}`,
        depth: 'Beginner',
        estimated_time: 10,
        outcomes: ['Understand basics'],
        prerequisites: [],
        task,
      })),
    }))
    const payload = JSON.stringify({ course: { kind: 'core', stage: 0 }, modules })
    return Promise.resolve({
      textStream: (async function* () {
        yield payload
      })(),
    })
  }),
  generateText: vi.fn((_params) => {
    const content = _params?.messages?.[0]?.content || ''
    if (content.includes('placement assessment')) {
      if (content.includes('Generate placement assessment questions')) {
        return Promise.resolve({
          text: JSON.stringify({
            questions: [
              { id: 'q1', text: 'Which approach best explains JSX?', type: 'multiple_choice', difficulty_band: 'target', options: [{ value: 'A', label: 'A syntax extension' }, { value: 'B', label: 'A database' }], correct_answer: 'A' },
              { id: 'q2', text: 'Which approach best handles component state?', type: 'multiple_choice', difficulty_band: 'target', options: [{ value: 'A', label: 'Local state' }, { value: 'B', label: 'Random globals' }], correct_answer: 'A' },
              { id: 'q3', text: 'Explain how you would debug a render loop.', type: 'objective', difficulty_band: 'target', rubric: 'Names a reproducible debugging process.' },
              { id: 'q4', text: 'Describe a maintainable component boundary.', type: 'objective', difficulty_band: 'target', rubric: 'Connects boundaries to cohesion and change.' },
              { id: 'q5', text: 'How would you test a user interaction?', type: 'objective', difficulty_band: 'target', rubric: 'Describes a behavior-focused test.' },
              { id: 'q6', text: 'How would you optimize a complex rendering bottleneck?', type: 'objective', difficulty_band: 'stretch', rubric: 'Makes a measured tradeoff using profiling evidence.' },
            ],
          }),
        })
      }
      return Promise.resolve({
        text: JSON.stringify({
          target_score: 88,
          stretch_score: 20,
          feedback: ['Strong grasp of the core concepts.'],
          gaps: [],
        }),
      })
    }
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
    process.env.OPENAI_API_KEY = 'sk-test'
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()

    // Seed LLM settings so curriculum routes don't return 400 for missing settings
    dbModule.run(
      'INSERT INTO llm_settings (provider, model) VALUES (?, ?)',
      'openai', 'gpt-4o'
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
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.FIREWORKS_API_KEY
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_MODEL
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

    it('canonicalizes a legacy time label before storing it', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/profile`)
        .send({ level: 'beginner', timeCommitment: '30 min' })
      expect(res.status).toBe(200)
      expect(res.body.timeCommitment).toBe('30 min/day')
      expect(dbModule.get('SELECT time_per_week FROM topics WHERE id = ?', topic.lastInsertRowid).time_per_week).toBe('30 min/day')
    })
  })

  describe('GET /api/topics/:id/setup-questions', () => {
    it('returns deterministic setup choices with accepted values', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/setup-questions`)
      expect(res.status).toBe(200)
      expect(res.body.questions).toHaveLength(2)
      expect(res.body.questions[0].text).toBeDefined()
      expect(res.body.questions[0].options).toBeDefined()
      expect(res.body.questions[0].options.map((option) => option.value)).toEqual(['Beginner', 'Intermediate', 'Advanced'])
      expect(res.body.questions[1].options.map((option) => option.value)).toEqual(['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day'])
    })

    it('returns 404 for nonexistent topic', async () => {
      const res = await request(app).get('/api/topics/999/setup-questions')
      expect(res.status).toBe(404)
    })

    it('does not require an LLM provider just to render canonical setup choices', async () => {
      dbModule.run('DELETE FROM llm_settings')
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/setup-questions`)
      expect(res.status).toBe(200)
      expect(res.body.questions[0].options[0].value).toBe('Beginner')
    })
  })

  describe('placement assessment', () => {
    it('generates mixed diagnostic questions and verifies a non-beginner profile', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const start = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/placement/start`)
        .send({ level: 'Advanced' })

      expect(start.status).toBe(200)
      expect(start.body.assessmentId).toBeTypeOf('number')
      expect(start.body.questions).toHaveLength(6)
      expect(start.body.questions).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'multiple_choice', options: expect.any(Array) }),
        expect.objectContaining({ type: 'objective' }),
      ]))
      expect(start.body.questions.every((question) => !question.correct_answer && !question.rubric)).toBe(true)
      expect(start.body.questions.filter((question) => question.difficultyBand === 'target')).toHaveLength(5)
      expect(start.body.questions.filter((question) => question.difficultyBand === 'stretch')).toHaveLength(1)

      const answers = Object.fromEntries(start.body.questions.map((question) => [
        question.id,
        question.type === 'multiple_choice' ? question.options[0].value : 'A technically grounded explanation.',
      ]))
      const submit = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/placement/submit`)
        .send({ assessmentId: start.body.assessmentId, answers })

      expect(submit.status).toBe(200)
      expect(submit.body.targetScore).toBe(88)
      expect(submit.body.stretchScore).toBe(20)
      expect(submit.body.score).toBe(74)
      expect(submit.body.recommendedLevel).toBe('Advanced')
      expect(submit.body.passed).toBe(true)

      const profile = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/profile`)
        .send({
          level: 'Advanced',
          selfReportedLevel: 'Advanced',
          timeCommitment: '30 min/day',
          placementAssessmentId: start.body.assessmentId,
        })
      expect(profile.status).toBe(200)
      expect(dbModule.get('SELECT level FROM topics WHERE id = ?', topic.lastInsertRowid).level).toBe('Advanced')
    })

    it('rejects a non-beginner profile without a completed placement assessment', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/profile`)
        .send({ level: 'Intermediate', selfReportedLevel: 'Intermediate', timeCommitment: '30 min/day' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/placement/i)
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
      const existingModule = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Legacy')
      dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)", existingModule.lastInsertRowid, 0, 'Old intro', 'Beginner', 10, JSON.stringify(['Understand basics']), '[]')

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

    it('rejects a new course draft outside bounded module and lesson counts', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, level, time_per_week) VALUES (?, ?, ?, ?)", "React", "active", "Beginner", "30 min/day")
      const curriculum = {
        modules: [{
          title: 'Foundations',
          lessons: [{
            title: 'Intro', depth: 'Beginner', estimated_time: 10, outcomes: ['Understand basics'], prerequisites: [],
            task: {
              title: 'Local task', scenario: 'Local scenario', goal: 'Do the task', constraints: ['Use test data'],
              deliverables: ['Commands', 'Output'], success_criteria: ['Works', 'Repeatable'], estimated_time: 10,
              primary_setup: { kind: 'local', description: 'Run locally', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
              free_fallback: { kind: 'no_software', description: 'Explain the local result', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
              hints: [], safety_notes: [],
            },
          }],
        }],
      }

      const res = await request(app).post(`/api/topics/${topic.lastInsertRowid}/curriculum/confirm`).send({ curriculum })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/3.*5|bounded|module/i)
      expect(dbModule.get('SELECT COUNT(*) AS count FROM modules WHERE topic_id = ?', topic.lastInsertRowid).count).toBe(0)
    })

    it('rejects a started course replacement without deleting its history', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, level, time_per_week) VALUES (?, ?, ?, ?)", "React", "active", "Beginner", "30 min/day")
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, "Foundations")
      const lesson = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, ?, ?)", mod.lastInsertRowid, 0, "Intro")
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, lesson.lastInsertRowid, 'practicing')

      const res = await request(app).post(`/api/topics/${topic.lastInsertRowid}/curriculum/confirm`).send({ curriculum: { modules: [{ title: 'New', lessons: [{ title: 'New lesson', depth: 'Beginner', estimated_time: 10, outcomes: ['Learn'], prerequisites: [] }] }] } })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('CURRICULUM_LOCKED')
      expect(dbModule.get('SELECT title FROM modules WHERE topic_id = ?', topic.lastInsertRowid).title).toBe('Foundations')
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
      expect(dbModule.all(
        'SELECT l.title FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.topic_id = ? ORDER BY l.lesson_index',
        topic.lastInsertRowid,
      ).map(({ title }) => title)).toEqual(['Intro'])
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
