import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

function tempDbPath() {
  return path.join(os.tmpdir(), `test-export-import-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Data Export and Import API', () => {
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

    const { default: dataRouter } = await import('../routes/data.js')
    app = express()
    app.use(express.json({ limit: '50mb' }))
    app.use('/api/data', dataRouter)
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

  function seedDatabase() {
    const topic = dbModule.run(
      'INSERT INTO topics (title, status, level, time_per_week, last_active_at) VALUES (?, ?, ?, ?, ?)',
      'React', 'active', 'beginner', '30 min/day', '2024-01-01T00:00:00Z'
    )
    const topicId = topic.lastInsertRowid

    const mod = dbModule.run(
      'INSERT INTO modules (topic_id, module_index, title, summary) VALUES (?, ?, ?, ?)',
      topicId, 0, 'JSX & Components', 'Core React concepts'
    )
    const moduleId = mod.lastInsertRowid

    const lesson = dbModule.run(
      'INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time) VALUES (?, ?, ?, ?, ?)',
      moduleId, 0, 'Intro to JSX', 'beginner', 10
    )
    const lessonId = lesson.lastInsertRowid

    dbModule.run(
      'INSERT INTO progress (topic_id, lesson_id, state, quiz_score, quiz_attempts) VALUES (?, ?, ?, ?, ?)',
      topicId, lessonId, 'passed', 90, 1
    )

    dbModule.run(
      'INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)',
      topicId, lessonId, 'assistant', 'Welcome to JSX!'
    )

    dbModule.run(
      'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
      topicId, lessonId, 1, '2024-01-02', 'pending'
    )

    dbModule.run(
      'INSERT INTO llm_settings (provider, model) VALUES (?, ?)',
      'openai', 'gpt-4o'
    )

    dbModule.run(
      'INSERT INTO mistakes_log (topic_id, lesson_id, description, recurring) VALUES (?, ?, ?, ?)',
      topicId, lessonId, 'Confused props vs state', 1
    )

    dbModule.run(
      'INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)',
      5, 10, '2024-01-01'
    )

    return { topicId, moduleId, lessonId }
  }

  describe('GET /api/data/export', () => {
    it('exports all tables as JSON', async () => {
      seedDatabase()
      const res = await request(app).get('/api/data/export')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('topics')
      expect(res.body).toHaveProperty('modules')
      expect(res.body).toHaveProperty('lessons')
      expect(res.body).toHaveProperty('progress')
      expect(res.body).toHaveProperty('messages')
      expect(res.body).toHaveProperty('srs_queue')
      expect(res.body).toHaveProperty('artifacts')
      expect(res.body).toHaveProperty('llm_settings')
      expect(res.body).toHaveProperty('mistakes_log')
      expect(res.body).toHaveProperty('streaks')
      expect(res.body).toHaveProperty('quiz_attempts')
      expect(res.body).toHaveProperty('exam_attempts')
    })

    it('includes actual row data for each table', async () => {
      const { topicId } = seedDatabase()
      const res = await request(app).get('/api/data/export')
      expect(res.status).toBe(200)
      expect(res.body.topics).toHaveLength(1)
      expect(res.body.topics[0].title).toBe('React')
      expect(res.body.topics[0].id).toBe(topicId)
      expect(res.body.modules).toHaveLength(1)
      expect(res.body.lessons).toHaveLength(1)
      expect(res.body.progress).toHaveLength(1)
      expect(res.body.messages).toHaveLength(1)
      expect(res.body.srs_queue).toHaveLength(1)
      expect(res.body.llm_settings).toHaveLength(1)
      expect(res.body.mistakes_log).toHaveLength(1)
      expect(res.body.streaks).toHaveLength(1)
    })

    it('does not expose api_key in exported llm_settings', async () => {
      seedDatabase()
      const res = await request(app).get('/api/data/export')
      expect(res.status).toBe(200)
      expect(res.body.llm_settings).toHaveLength(1)
      expect(res.body.llm_settings[0].api_key).toBeUndefined()
      expect(res.body.llm_settings[0].provider).toBe('openai')
    })

    it('exports only the documented settings fields', async () => {
      seedDatabase()
      const res = await request(app).get('/api/data/export')
      expect(Object.keys(res.body.llm_settings[0]).sort()).toEqual(['created_at', 'id', 'model', 'provider', 'reasoning_effort'])
    })

    it('llm_settings export contains no api_key column', async () => {
      seedDatabase()
      const res = await request(app).get('/api/data/export')
      expect(res.status).toBe(200)
      expect(res.body.llm_settings[0]).not.toHaveProperty('api_key')
    })

    it('handles empty database gracefully', async () => {
      const res = await request(app).get('/api/data/export')
      expect(res.status).toBe(200)
      expect(res.body.topics).toHaveLength(0)
      expect(res.body.modules).toHaveLength(0)
      expect(res.body.lessons).toHaveLength(0)
      expect(res.body.progress).toHaveLength(0)
      expect(res.body.messages).toHaveLength(0)
      expect(res.body.srs_queue).toHaveLength(0)
      expect(res.body.artifacts).toHaveLength(0)
      expect(res.body.llm_settings).toHaveLength(0)
      expect(res.body.mistakes_log).toHaveLength(0)
      expect(res.body.streaks).toHaveLength(0)
    })
  })

  describe('POST /api/data/import', () => {
    it('restores all data from a valid backup', async () => {
      const { topicId } = seedDatabase()
      const exportRes = await request(app).get('/api/data/export')
      const backup = exportRes.body

      // Clear all data from existing tables
      const tables = ['topics', 'modules', 'lessons', 'progress', 'messages', 'srs_queue', 'artifacts', 'llm_settings', 'mistakes_log', 'streaks', 'quiz_attempts', 'exam_attempts']
      for (const t of tables) {
        dbModule.run(`DELETE FROM ${t}`)
      }

      const importRes = await request(app)
        .post('/api/data/import')
        .send(backup)

      expect(importRes.status).toBe(200)
      expect(importRes.body.success).toBe(true)
      expect(importRes.body.counts.topics).toBe(1)
      expect(importRes.body.counts.modules).toBe(1)

      // Verify restored data
      const topic = dbModule.get('SELECT * FROM topics WHERE id = ?', topicId)
      expect(topic).toBeTruthy()
      expect(topic.title).toBe('React')
    })

    it('rejects malformed JSON', async () => {
      const res = await request(app)
        .post('/api/data/import')
        .set('Content-Type', 'application/json')
        .send('not-json')
      expect(res.status).toBe(400)
    })

    it('rejects backup missing required tables', async () => {
      const res = await request(app)
        .post('/api/data/import')
        .send({ backupVersion: 2, topics: [], modules: [] }) // missing many tables
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid backup/i)
    })

    it('rejects backup with non-array table data', async () => {
      const res = await request(app)
        .post('/api/data/import')
        .send({ backupVersion: 2, topics: 'not-an-array', modules: [], lessons: [], progress: [], messages: [], srs_queue: [], artifacts: [], llm_settings: [], mistakes_log: [], streaks: [], quiz_attempts: [], exam_attempts: [], course_links: [] })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid backup/i)
    })

    it('restores data without duplicating existing rows', async () => {
      seedDatabase()
      const exportRes = await request(app).get('/api/data/export')
      const backup = exportRes.body

      // Import over existing data
      const importRes = await request(app)
        .post('/api/data/import')
        .send(backup)

      expect(importRes.status).toBe(200)

      // Verify no duplicate rows
      const topics = dbModule.all('SELECT * FROM topics')
      expect(topics).toHaveLength(1)
    })

    it('includes version metadata in export', async () => {
      const res = await request(app).get('/api/data/export')
      expect(res.status).toBe(200)
      expect(res.body.backupVersion).toBe(2)
      expect(res.body).toHaveProperty('exported_at')
    })

    it('exports only incomplete Session resets and sanitized completed checkpoints', async () => {
      const { topicId, moduleId, lessonId } = seedDatabase()
      const progress = dbModule.get('SELECT id FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      const manifest = [{ id: 'jsx-render-elements', title: 'Render JSX elements', kind: 'knowledge', role: 'core', evidence: ['activity', 'checkpoint'] }]
      dbModule.run('UPDATE modules SET skill_outcomes = ? WHERE id = ?', JSON.stringify(manifest), moduleId)
      dbModule.run('UPDATE lessons SET outcomes = ?, activity_blocks = ? WHERE id = ?', JSON.stringify(manifest), JSON.stringify({ answerKey: { private: 'activity-key-fixture' } }), lessonId)
      dbModule.run("UPDATE progress SET state = 'practicing', activity_state = ?, started_at = ?, completed_at = NULL WHERE id = ?", JSON.stringify({ answerKey: 'state-key-fixture', response: 'draft' }), '2026-09-26T12:00:00.000Z', progress.id)
      dbModule.run('INSERT INTO artifacts (progress_id, content, passed, feedback) VALUES (?, ?, ?, ?)', progress.id, 'completed build', 1, 'Build feedback')
      dbModule.run('INSERT INTO exam_attempts (topic_id, module_id, questions, answers, evaluation, status, type) VALUES (?, ?, ?, ?, ?, ?, ?)', topicId, moduleId,
        JSON.stringify({ schemaVersion: 1, publicQuestions: [{ id: 'q1', prompt: 'Which renders JSX?' }], answerKey: { q1: 'ReactDOM.render', private: 'checkpoint-key-fixture' } }),
        '{"q1":"ReactDOM.render"}', '{"passed":true}', 'passed', 'full')
      dbModule.run('INSERT INTO exam_attempts (topic_id, module_id, questions, status, type) VALUES (?, ?, ?, ?, ?)', topicId, moduleId,
        JSON.stringify({ schemaVersion: 1, publicQuestions: [], answerKey: { private: 'pending-key-fixture' } }), 'pending', 'full')

      const res = await request(app).get('/api/data/export')

      expect(res.status).toBe(200)
      expect(res.body.backupVersion).toBe(2)
      expect(res.body.modules[0].skill_outcomes).toBe(JSON.stringify(manifest))
      expect(res.body.lessons[0]).not.toHaveProperty('activity_blocks')
      expect(res.body.lessons[0].outcomes).toBe(JSON.stringify(manifest))
      expect(res.body.progress[0]).toMatchObject({ state: 'not_started', activity_state: '{}' })
      expect(res.body.progress[0].started_at).toBeNull()
      expect(res.body.progress[0].completed_at).toBeNull()
      expect(res.body.exam_attempts).toHaveLength(1)
      expect(res.body.exam_attempts[0].status).toBe('passed')
      expect(JSON.parse(res.body.exam_attempts[0].questions)).toEqual({ schemaVersion: 1, publicQuestions: [{ id: 'q1', prompt: 'Which renders JSX?' }] })
      expect(res.body.artifacts[0].content).toBe('completed build')
      expect(JSON.stringify(res.body)).not.toContain('activity-key-fixture')
      expect(JSON.stringify(res.body)).not.toContain('state-key-fixture')
      expect(JSON.stringify(res.body)).not.toContain('checkpoint-key-fixture')
      expect(JSON.stringify(res.body)).not.toContain('pending-key-fixture')
    })

    it('exports course lineage while omitting legacy per-Session quiz attempts', async () => {
      const { topicId } = seedDatabase()
      const child = dbModule.run("INSERT INTO topics (title, status, course_kind, course_stage, course_focus) VALUES ('React Security', 'active', 'advanced', 1, 'Security')")
      dbModule.run('INSERT INTO course_links (child_topic_id, parent_topic_id, lane, normalized_lane) VALUES (?, ?, ?, ?)', child.lastInsertRowid, topicId, 'Security', 'security')

      const res = await request(app).get('/api/data/export')
      expect(res.status).toBe(200)
      expect(res.body.course_links).toHaveLength(1)
      expect(res.body.course_links[0]).toMatchObject({ child_topic_id: child.lastInsertRowid, parent_topic_id: topicId, normalized_lane: 'security' })
      expect(res.body.quiz_attempts).toEqual([])
      expect(res.body.topics[0]).toHaveProperty('course_kind')
    })

    it('restores llm_settings without api_key if not present', async () => {
      seedDatabase()
      const exportRes = await request(app).get('/api/data/export')
      const backup = exportRes.body

      // The export should NOT include api_key
      expect(backup.llm_settings[0].api_key).toBeUndefined()

      // Clear all data from existing tables
      const tables = ['topics', 'modules', 'lessons', 'progress', 'messages', 'srs_queue', 'artifacts', 'llm_settings', 'mistakes_log', 'streaks', 'quiz_attempts', 'exam_attempts']
      for (const t of tables) {
        dbModule.run(`DELETE FROM ${t}`)
      }

      const importRes = await request(app)
        .post('/api/data/import')
        .send(backup)

      expect(importRes.status).toBe(200)
      const settings = dbModule.get('SELECT * FROM llm_settings')
      expect(settings.provider).toBe('openai')
      // api_key column no longer exists
      expect(settings.api_key).toBeUndefined()
    })

    it('imports a pre-reasoning settings row with the neutral default', async () => {
      const backup = {
        backupVersion: 2,
        topics: [], modules: [], lessons: [], progress: [], messages: [],
        srs_queue: [], artifacts: [],
        llm_settings: [{ id: 1, provider: 'openai', model: 'gpt-4o', created_at: '2024-01-01 00:00:00' }],
        mistakes_log: [], streaks: [], quiz_attempts: [], exam_attempts: [], course_links: [],
      }

      const res = await request(app).post('/api/data/import').send(backup)

      expect(res.status).toBe(200)
      expect(dbModule.get('SELECT provider, model, reasoning_effort FROM llm_settings')).toEqual({
        provider: 'openai',
        model: 'gpt-4o',
        reasoning_effort: 'none',
      })
    })

    it('rejects missing, old, and unknown backup versions before changing data', async () => {
      const { topicId } = seedDatabase()
      const current = (await request(app).get('/api/data/export')).body
      const versions = [undefined, 1, '1.1.0', 3, '2']

      for (const version of versions) {
        const backup = JSON.parse(JSON.stringify(current))
        delete backup.backupVersion
        if (version !== undefined) backup.backupVersion = version
        const res = await request(app).post('/api/data/import').send(backup)
        expect(res.status).toBe(400)
        expect(res.body.code).toBe('BACKUP_VERSION_UNSUPPORTED')
        expect(dbModule.get('SELECT title FROM topics WHERE id = ?', topicId).title).toBe('React')
      }
    })

    it('normalizes incomplete imported Sessions so their activities can be regenerated', async () => {
      const { topicId, lessonId } = seedDatabase()
      dbModule.run("UPDATE progress SET state = 'practicing', activity_state = ?, started_at = ? WHERE topic_id = ? AND lesson_id = ?", '{"currentBlockId":"old-block"}', '2026-09-26T12:00:00.000Z', topicId, lessonId)
      const backup = (await request(app).get('/api/data/export')).body

      const res = await request(app).post('/api/data/import').send(backup)

      expect(res.status).toBe(200)
      expect(dbModule.get('SELECT state, activity_state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)).toEqual({ state: 'not_started', activity_state: '{}' })
      expect(dbModule.get('SELECT activity_blocks FROM lessons WHERE id = ?', lessonId).activity_blocks).toBeNull()
    })

    it('rejects private activity and checkpoint documents before replacing existing data', async () => {
      const { topicId, moduleId, lessonId } = seedDatabase()
      const backup = (await request(app).get('/api/data/export')).body
      backup.lessons[0].activity_blocks = JSON.stringify({ answerKey: { q1: 'private' } })
      backup.exam_attempts = [{
        topic_id: topicId,
        module_id: moduleId,
        questions: JSON.stringify({ schemaVersion: 1, publicQuestions: [], answerKey: { private: 'private-checkpoint-fixture' } }),
        status: 'passed',
        type: 'full',
      }]

      const res = await request(app).post('/api/data/import').send(backup)

      expect(res.status).toBe(400)
      expect(res.text).not.toContain('private-checkpoint-fixture')
      expect(dbModule.get('SELECT title FROM topics WHERE id = ?', topicId).title).toBe('React')
      expect(dbModule.get('SELECT activity_blocks FROM lessons WHERE id = ?', lessonId).activity_blocks).toBeNull()
    })

    it('rejects answer keys and invalid lineage before replacing existing data', async () => {
      const { topicId } = seedDatabase()
      const child = dbModule.run("INSERT INTO topics (title, status, course_kind, course_stage) VALUES ('Child', 'active', 'advanced', 1)")
      const backup = (await request(app).get('/api/data/export')).body
      backup.quiz_attempts = [{ topic_id: topicId, lesson_id: backup.lessons[0].id, questions: '[]', answers: '{}', evaluation: null, answer_key: '{"secret":"a"}', format_version: 2 }]
      backup.course_links = [{ child_topic_id: child.lastInsertRowid, parent_topic_id: topicId, lane: 'Security', normalized_lane: 'wrong' }]

      const res = await request(app).post('/api/data/import').send(backup)
      expect(res.status).toBe(400)
      expect(res.text).not.toContain('secret')
      expect(dbModule.get('SELECT title FROM topics WHERE id = ?', topicId).title).toBe('React')
    })

    it('rejects missing, duplicate, self, cyclic, and stage-invalid links without mutation', async () => {
      const { topicId } = seedDatabase()
      const childOne = dbModule.run("INSERT INTO topics (title, status, course_kind, course_stage) VALUES ('Child one', 'active', 'advanced', 1)")
      const childTwo = dbModule.run("INSERT INTO topics (title, status, course_kind, course_stage) VALUES ('Child two', 'active', 'advanced', 1)")
      const exported = (await request(app).get('/api/data/export')).body
      const cases = [
        (backup) => { backup.course_links = [{ child_topic_id: childOne.lastInsertRowid, parent_topic_id: 99999, lane: 'Missing', normalized_lane: 'missing' }] },
        (backup) => { backup.course_links = [{ child_topic_id: childOne.lastInsertRowid, parent_topic_id: topicId, lane: 'Security', normalized_lane: 'security' }, { child_topic_id: childTwo.lastInsertRowid, parent_topic_id: topicId, lane: 'SECURITY', normalized_lane: 'security' }] },
        (backup) => { backup.course_links = [{ child_topic_id: topicId, parent_topic_id: topicId, lane: 'Self', normalized_lane: 'self' }] },
        (backup) => { backup.course_links = [{ child_topic_id: childOne.lastInsertRowid, parent_topic_id: topicId, lane: 'Security', normalized_lane: 'security' }, { child_topic_id: topicId, parent_topic_id: childOne.lastInsertRowid, lane: 'Cycle', normalized_lane: 'cycle' }] },
        (backup) => { backup.topics.find((topic) => topic.id === childOne.lastInsertRowid).course_stage = 3; backup.course_links = [{ child_topic_id: childOne.lastInsertRowid, parent_topic_id: topicId, lane: 'Security', normalized_lane: 'security' }] },
      ]
      for (const mutate of cases) {
        const backup = JSON.parse(JSON.stringify(exported))
        mutate(backup)
        const res = await request(app).post('/api/data/import').send(backup)
        expect(res.status).toBe(400)
        expect(dbModule.get('SELECT title FROM topics WHERE id = ?', topicId).title).toBe('React')
      }
    })

    it('does not import legacy per-Session quiz attempts', async () => {
      const { topicId, lessonId } = seedDatabase()
      const backup = (await request(app).get('/api/data/export')).body
      backup.quiz_attempts = [{ topic_id: topicId, lesson_id: lessonId, questions: '[]' }]

      const res = await request(app).post('/api/data/import').send(backup)
      expect(res.status).toBe(400)
      expect(dbModule.get('SELECT COUNT(*) AS count FROM quiz_attempts').count).toBe(0)
      expect(dbModule.get('SELECT title FROM topics WHERE id = ?', topicId).title).toBe('React')
    })

    it('round-trips branches and task evidence', async () => {
      const { topicId, lessonId } = seedDatabase()
      const progress = dbModule.get('SELECT id FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      dbModule.run('INSERT INTO artifacts (progress_id, content, rubric_scores, passed, feedback) VALUES (?, ?, ?, ?, ?)', progress.id, '{"commands":"echo ok"}', '{"reproducible":true}', 1, 'Good evidence')
      const child = dbModule.run("INSERT INTO topics (title, status, course_kind, course_stage, course_focus) VALUES ('Child', 'active', 'advanced', 1, 'Security')")
      dbModule.run('INSERT INTO course_links (child_topic_id, parent_topic_id, lane, normalized_lane) VALUES (?, ?, ?, ?)', child.lastInsertRowid, topicId, 'Security', 'security')
      const backup = (await request(app).get('/api/data/export')).body

      const res = await request(app).post('/api/data/import').send(backup)
      expect(res.status).toBe(200)
      expect(res.body.counts.course_links).toBe(1)
      expect(res.body.counts.artifacts).toBe(1)
      expect(dbModule.get('SELECT course_focus FROM topics WHERE id = ?', child.lastInsertRowid).course_focus).toBe('Security')
      expect(dbModule.get('SELECT feedback FROM artifacts').feedback).toBe('Good evidence')
      expect(dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId).state).toBe('passed')
    })

    it('drops legacy api_key fields but rejects OAuth credentials before replacing any data', async () => {
      seedDatabase()
      const backup = {
        backupVersion: 2,
        topics: [], modules: [], lessons: [], progress: [], messages: [],
        srs_queue: [], artifacts: [],
        llm_settings: [{ id: 1, provider: 'openai', model: 'gpt-4o', api_key: 'old-key-fixture' }],
        mistakes_log: [], streaks: [], quiz_attempts: [], exam_attempts: [], course_links: [],
      }

      const compatible = await request(app).post('/api/data/import').send(backup)
      expect(compatible.status).toBe(200)
      expect(dbModule.get('SELECT provider, model FROM llm_settings')).toEqual({ provider: 'openai', model: 'gpt-4o' })

      const preservedTopicId = seedDatabase().topicId
      const unsafe = { ...backup, topics: [{ id: preservedTopicId, title: 'Replacement' }], llm_settings: [{
        id: 1, provider: 'openai-codex', model: 'gpt-5.4', reasoning_effort: 'xhigh', access: 'oauth-secret-fixture',
      }] }
      const rejected = await request(app).post('/api/data/import').send(unsafe)
      expect(rejected.status).toBe(400)
      expect(rejected.text).not.toContain('oauth-secret-fixture')
      expect(dbModule.get('SELECT title FROM topics WHERE id = ?', preservedTopicId).title).toBe('React')
    })
  })
})
