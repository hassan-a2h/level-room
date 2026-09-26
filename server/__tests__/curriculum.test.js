import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { streamText } from '../llm/client.js'

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
    const modules = Array.from({ length: 3 }, (_, moduleIndex) => {
      const outcomes = Array.from({ length: 3 }, (_, outcomeIndex) => ({
        id: `chapter-${moduleIndex + 1}-outcome-${outcomeIndex + 1}`,
        title: `Chapter ${moduleIndex + 1} capability ${outcomeIndex + 1}`,
        kind: outcomeIndex === 1 ? 'skill' : 'knowledge',
        role: 'core',
        evidence: outcomeIndex === 1 ? ['activity'] : ['checkpoint'],
      }))
      return {
        title: `Foundations ${moduleIndex + 1}`,
        skill_outcomes: outcomes,
        lessons: outcomes.map((outcome, lessonIndex) => ({
          title: `Lesson ${moduleIndex + 1}.${lessonIndex + 1}`,
          depth: 'Beginner',
          estimated_time: 10,
          outcomes: [outcome],
          prerequisites: [],
          artifact_required: lessonIndex === 2,
          ...(lessonIndex === 2 ? { task } : {}),
        })),
      }
    })
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
              { id: 'q1', text: 'Explain why JSX is useful in a practical component.', type: 'objective', difficulty_band: 'target', rubric: 'Explains JSX and its practical trade-off.' },
              { id: 'q2', text: 'Describe a sound approach to component state and why.', type: 'objective', difficulty_band: 'target', rubric: 'Connects state ownership to component behavior.' },
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
          scores: [
            { question_id: 'q1', score: 88, feedback: 'Clear practical explanation.' },
            { question_id: 'q2', score: 88, feedback: 'Sound state reasoning.' },
            { question_id: 'q3', score: 88, feedback: 'Reproducible debugging process.' },
            { question_id: 'q4', score: 88, feedback: 'Good component boundary.' },
            { question_id: 'q5', score: 88, feedback: 'Behavior-focused test plan.' },
            { question_id: 'q6', score: 20, feedback: 'Needs deeper performance trade-offs.' },
          ],
          feedback: ['Strong grasp of the core concepts.'],
          gaps: [],
        }),
      })
    }
    // Tweak / regenerate prompts contain existing curriculum context and ask for changes
    if (content.includes('User request:') || content.includes('updated full curriculum') || content.includes('Existing curriculum:')) {
      const task = {
        title: 'Local setup', scenario: 'Use a safe local fixture.', goal: 'Create and verify the requested behavior.',
        constraints: ['Use test data only'], deliverables: ['Commands', 'Observed output'],
        success_criteria: ['The behavior is observable', 'The result is reproducible'], estimated_time: 10,
        primary_setup: { kind: 'local', description: 'Run locally.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
        free_fallback: { kind: 'no_software', description: 'Explain the expected local result.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
        hints: [], safety_notes: ['Use only systems you own.'],
      }
      return Promise.resolve({
        text: JSON.stringify({
          modules: [{
            title: 'Foundations',
            skill_outcomes: [
              { id: 'intro-knowledge', title: 'Explain the foundations', kind: 'knowledge', role: 'core', evidence: ['checkpoint'] },
              { id: 'testing-skill', title: 'Write and run tests', kind: 'skill', role: 'core', evidence: ['activity'] },
              { id: 'testing-knowledge', title: 'Explain test coverage', kind: 'knowledge', role: 'core', evidence: ['checkpoint'] },
            ],
            lessons: [
              { title: 'Intro', depth: 'Beginner', estimated_time: 10, outcomes: [{ id: 'intro-knowledge', title: 'Explain the foundations', kind: 'knowledge', role: 'core', evidence: ['checkpoint'] }], prerequisites: [], artifact_required: false },
              { title: 'Testing', depth: 'Intermediate', estimated_time: 20, outcomes: [{ id: 'testing-skill', title: 'Write and run tests', kind: 'skill', role: 'core', evidence: ['activity'] }], prerequisites: ['Intro'], artifact_required: false },
              { title: 'Coverage Build', depth: 'Intermediate', estimated_time: 20, outcomes: [{ id: 'testing-knowledge', title: 'Explain test coverage', kind: 'knowledge', role: 'core', evidence: ['checkpoint'] }], prerequisites: ['Testing'], artifact_required: true, task },
            ],
          }],
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
  wrapSdkError: (error) => error,
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

async function waitFor(condition, timeout = 1000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Condition was not met before the test deadline.')
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
    it('generates text-only diagnostic questions and verifies a non-beginner profile', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const start = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/placement/start`)
        .send({ level: 'Advanced' })

      expect(start.status).toBe(200)
      expect(start.body.assessmentId).toBeTypeOf('number')
      expect(start.body.questions).toHaveLength(6)
      expect(start.body.questions.every((question) => question.type === 'objective' && !question.options && !question.correct_answer)).toBe(true)
      expect(start.body.questions.filter((question) => question.difficultyBand === 'target')).toHaveLength(5)
      expect(start.body.questions.filter((question) => question.difficultyBand === 'stretch')).toHaveLength(1)

      const answers = Object.fromEntries(start.body.questions.map((question) => [question.id, 'A technically grounded explanation with a practical trade-off.']))
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
    it('returns a durable generation job', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, level, time_per_week) VALUES (?, ?, ?, ?)", "React", "active", "Beginner", "30 min/day")
      const res = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/curriculum/generate`)
      expect(res.status).toBe(202)
      expect(res.body.generation).toMatchObject({ topicId: Number(topic.lastInsertRowid), state: 'queued' })
      await waitFor(() => dbModule.get('SELECT curriculum_state FROM topics WHERE id = ?', topic.lastInsertRowid).curriculum_state === 'draft_ready')
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
            skill_outcomes: [
              { id: 'react-knowledge', title: 'Explain React foundations', kind: 'knowledge', role: 'core', evidence: ['checkpoint'] },
              { id: 'react-skill', title: 'Build a React component', kind: 'skill', role: 'core', evidence: ['activity'] },
            ],
            lessons: [
              { title: 'Intro', depth: 'Beginner', estimated_time: 10, outcomes: [{ id: 'react-knowledge', title: 'Explain React foundations', kind: 'knowledge', role: 'core', evidence: ['checkpoint'] }], prerequisites: [], artifact_required: false },
              { title: 'Component Build', depth: 'Beginner', estimated_time: 10, outcomes: [{ id: 'react-skill', title: 'Build a React component', kind: 'skill', role: 'core', evidence: ['activity'] }], prerequisites: ['Intro'], artifact_required: true, task: {
                title: 'Local setup', scenario: 'Use a safe local fixture.', goal: 'Create and verify the requested behavior.', constraints: ['Use test data only'], deliverables: ['Commands', 'Observed output'], success_criteria: ['The behavior is observable', 'The result is reproducible'], estimated_time: 10,
                primary_setup: { kind: 'local', description: 'Run locally.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
                free_fallback: { kind: 'no_software', description: 'Explain the expected local result.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false }, hints: [], safety_notes: ['Use only systems you own.'],
              } },
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
      expect(allLessons.length).toBe(2)
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
    it('restores omitted Chapter outcomes from valid structured Session outcomes', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, level, time_per_week) VALUES (?, ?, ?, ?)", "React", "active", "Beginner", "30 min/day")
      await request(app).post(`/api/topics/${topic.lastInsertRowid}/curriculum/generate`)
      await waitFor(() => dbModule.get('SELECT curriculum_state FROM topics WHERE id = ?', topic.lastInsertRowid).curriculum_state === 'draft_ready')
      const alternateShape = JSON.parse(dbModule.get('SELECT curriculum_draft FROM topics WHERE id = ?', topic.lastInsertRowid).curriculum_draft)
      for (const module of alternateShape.modules) delete module.skill_outcomes
      streamText.mockImplementationOnce(() => Promise.resolve({
        textStream: (async function* () { yield JSON.stringify(alternateShape) })(),
      }))

      const response = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/curriculum/tweak`)
        .send({ request: 'Clarify the practice examples.' })

      expect(response.status, JSON.stringify(response.body)).toBe(200)
      expect(response.body.modules[0].skill_outcomes).toHaveLength(3)
      expect(response.body.modules[0].skill_outcomes.map(({ id }) => id)).toEqual([
        'chapter-1-outcome-1',
        'chapter-1-outcome-2',
        'chapter-1-outcome-3',
      ])
      const prompt = streamText.mock.calls.at(-1)[0].system
      expect(prompt).toContain('Chapter must include a skill_outcomes array')
      expect(prompt).toContain('Session\'s outcomes must be complete structured objects')
      expect(prompt).toContain('artifact_required')
    })

    it('hides validator details when legacy string outcomes cannot satisfy the tweak contract', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status, level, time_per_week) VALUES (?, ?, ?, ?)", "React", "active", "Beginner", "30 min/day")
      await request(app).post(`/api/topics/${topic.lastInsertRowid}/curriculum/generate`)
      await waitFor(() => dbModule.get('SELECT curriculum_state FROM topics WHERE id = ?', topic.lastInsertRowid).curriculum_state === 'draft_ready')
      streamText.mockImplementationOnce(() => Promise.resolve({
        textStream: (async function* () {
          yield JSON.stringify({ modules: [{ title: 'Incomplete chapter', lessons: [{ outcomes: ['Explain the concept'] }] }] })
        })(),
      }))

      const response = await request(app)
        .post(`/api/topics/${topic.lastInsertRowid}/curriculum/tweak`)
        .send({ request: 'Clarify the practice examples.' })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('INVALID_CURRICULUM')
      expect(response.body.error).toMatch(/current preview.*try a smaller change/i)
      expect(response.body.error).not.toMatch(/Module 0|skill_outcomes|outcome objects/)
    })

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
      expect(res.status).toBe(202)
      expect(res.body.generation).toMatchObject({ topicId: Number(topic.lastInsertRowid), state: 'queued' })
      await waitFor(() => dbModule.get('SELECT curriculum_state FROM topics WHERE id = ?', topic.lastInsertRowid).curriculum_state === 'draft_ready')
    })
  })

  describe('removed lesson test-out routes', () => {
    it('does not expose duplicate curriculum test-out endpoints', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, "Basics")
      const l1 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, ?, ?)", mod.lastInsertRowid, 0, "JSX")

      const read = await request(app).get(`/api/topics/${topic.lastInsertRowid}/lessons/${l1.lastInsertRowid}/test-out`)
      const write = await request(app).post(`/api/topics/${topic.lastInsertRowid}/lessons/${l1.lastInsertRowid}/test-out`).send({ answers: [] })
      expect(read.status).toBe(404)
      expect(write.status).toBe(404)
    })
  })
})
