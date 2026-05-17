import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

function tempDbPath() {
  return path.join(os.tmpdir(), `test-dashboard-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Dashboard API', () => {
  let dbPath
  let dbModule
  let app

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()

    const { default: dashboardRouter } = await import('../routes/dashboard.js')
    app = express()
    app.use(express.json())
    app.use('/api', dashboardRouter)
  })

  afterEach(() => {
    if (dbModule && dbModule.default) {
      try { dbModule.default.close() } catch {}
    }
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  describe('GET /api/topics', () => {
    it('returns empty array when no topics exist', async () => {
      const res = await request(app).get('/api/topics')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ topics: [] })
    })

    it('returns topics with progress stats', async () => {
      // Insert topic with modules and lessons
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, "Basics")
      const l1 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, estimated_time) VALUES (?, ?, ?, ?)", mod.lastInsertRowid, 0, "JSX", 10)
      const l2 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, estimated_time) VALUES (?, ?, ?, ?)", mod.lastInsertRowid, 1, "Components", 15)

      // Mark one lesson passed
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state, completed_at) VALUES (?, ?, ?, ?)",
        topic.lastInsertRowid, l1.lastInsertRowid, "passed", new Date().toISOString())
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)",
        topic.lastInsertRowid, l2.lastInsertRowid, "not_started")

      const res = await request(app).get('/api/topics')
      expect(res.status).toBe(200)
      expect(res.body.topics).toHaveLength(1)
      expect(res.body.topics[0].title).toBe("React")
      expect(res.body.topics[0].progress).toBe(50) // 1 of 2 passed = 50%
      expect(res.body.topics[0].totalLessons).toBe(2)
      expect(res.body.topics[0].passedLessons).toBe(1)
    })
  })

  describe('GET /api/topics/:id/dashboard', () => {
    it('returns 404 for nonexistent topic', async () => {
      const res = await request(app).get('/api/topics/999/dashboard')
      expect(res.status).toBe(404)
    })

    it('returns dashboard data with modules, lessons, and progress', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, "Basics")
      const l1 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, prerequisites) VALUES (?, ?, ?, ?, ?, ?)",
        mod.lastInsertRowid, 0, "JSX", "Beginner", 10, "[]")
      const l2 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, prerequisites) VALUES (?, ?, ?, ?, ?, ?)",
        mod.lastInsertRowid, 1, "Components", "Beginner", 15, JSON.stringify([{ lessonId: l1.lastInsertRowid, title: "JSX" }]))

      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)",
        topic.lastInsertRowid, l1.lastInsertRowid, "passed")
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)",
        topic.lastInsertRowid, l2.lastInsertRowid, "not_started")

      const res = await request(app).get(`/api/topics/${topic.lastInsertRowid}/dashboard`)
      expect(res.status).toBe(200)
      expect(res.body.topic.title).toBe("React")
      expect(res.body.modules).toHaveLength(1)
      expect(res.body.modules[0].lessons).toHaveLength(2)
      expect(res.body.modules[0].lessons[0].state).toBe("passed")
      expect(res.body.modules[0].lessons[1].state).toBe("not_started")
      expect(res.body.modules[0].lessons[1].prerequisites).toHaveLength(1)
    })
  })

  describe('POST /api/topics', () => {
    it('creates a new topic', async () => {
      const res = await request(app).post('/api/topics').send({ title: 'Calculus' })
      expect(res.status).toBe(201)
      expect(res.body.topic.title).toBe('Calculus')
      expect(res.body.topic.id).toBeDefined()
    })

    it('rejects empty topic name', async () => {
      const res = await request(app).post('/api/topics').send({ title: '' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/topic name is required/i)
    })

    it('rejects whitespace-only topic name', async () => {
      const res = await request(app).post('/api/topics').send({ title: '   ' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/topic name is required/i)
    })

    it('rejects topic name over 100 characters', async () => {
      const res = await request(app).post('/api/topics').send({ title: 'a'.repeat(101) })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/too long/i)
    })

    it('accepts unicode and special characters', async () => {
      const res = await request(app).post('/api/topics').send({ title: '日本語 (Beginner) 101' })
      expect(res.status).toBe(201)
      expect(res.body.topic.title).toBe('日本語 (Beginner) 101')
    })

    it('blocks 4th active topic when limit is 3', async () => {
      dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "A", "active")
      dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "B", "active")
      dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "C", "active")

      const res = await request(app).post('/api/topics').send({ title: 'D' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/up to 3 active topics/i)
    })

    it('allows creating topic when one is archived', async () => {
      dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "A", "active")
      dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "B", "active")
      dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "C", "archived")

      const res = await request(app).post('/api/topics').send({ title: 'D' })
      expect(res.status).toBe(201)
    })
  })

  describe('POST /api/topics/:id/select', () => {
    it('updates last_active_at', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const before = dbModule.get("SELECT last_active_at FROM topics WHERE id = ?", topic.lastInsertRowid)
      expect(before.last_active_at).toBeNull()

      const res = await request(app).post(`/api/topics/${topic.lastInsertRowid}/select`).send({})
      expect(res.status).toBe(200)

      const after = dbModule.get("SELECT last_active_at FROM topics WHERE id = ?", topic.lastInsertRowid)
      expect(after.last_active_at).not.toBeNull()
    })
  })

  describe('DELETE /api/topics/:id', () => {
    it('deletes topic and cascades related data', async () => {
      const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "React", "active")
      const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, "Basics")
      const l1 = dbModule.run("INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, ?, ?)", mod.lastInsertRowid, 0, "JSX")
      dbModule.run("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)", topic.lastInsertRowid, l1.lastInsertRowid, "passed")
      dbModule.run("INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)", topic.lastInsertRowid, l1.lastInsertRowid, "user", "hello")
      dbModule.run("INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date) VALUES (?, ?, ?, ?)", topic.lastInsertRowid, l1.lastInsertRowid, 0, "2025-01-01")
      dbModule.run("INSERT INTO mistakes_log (topic_id, lesson_id, description) VALUES (?, ?, ?)", topic.lastInsertRowid, l1.lastInsertRowid, "mistake")

      const res = await request(app).delete(`/api/topics/${topic.lastInsertRowid}`)
      expect(res.status).toBe(200)

      const topics = dbModule.all("SELECT * FROM topics WHERE id = ?", topic.lastInsertRowid)
      expect(topics).toHaveLength(0)

      const progress = dbModule.all("SELECT * FROM progress WHERE topic_id = ?", topic.lastInsertRowid)
      expect(progress).toHaveLength(0)

      const messages = dbModule.all("SELECT * FROM messages WHERE topic_id = ?", topic.lastInsertRowid)
      expect(messages).toHaveLength(0)

      const srs = dbModule.all("SELECT * FROM srs_queue WHERE topic_id = ?", topic.lastInsertRowid)
      expect(srs).toHaveLength(0)

      const mistakes = dbModule.all("SELECT * FROM mistakes_log WHERE topic_id = ?", topic.lastInsertRowid)
      expect(mistakes).toHaveLength(0)
    })
  })

  describe('GET /api/topics/default', () => {
    it('returns 404 when no topics exist', async () => {
      const res = await request(app).get('/api/topics/default')
      expect(res.status).toBe(404)
    })

    it('returns the most recently active topic', async () => {
      const t1 = dbModule.run("INSERT INTO topics (title, status, last_active_at) VALUES (?, ?, ?)", "Old", "active", "2024-01-01T00:00:00Z")
      const t2 = dbModule.run("INSERT INTO topics (title, status, last_active_at) VALUES (?, ?, ?)", "Recent", "active", "2024-06-01T00:00:00Z")

      const res = await request(app).get('/api/topics/default')
      expect(res.status).toBe(200)
      expect(res.body.topic.id).toBe(t2.lastInsertRowid)
    })

    it('returns any topic when none have last_active_at', async () => {
      const t1 = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "A", "active")
      const t2 = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", "B", "active")

      const res = await request(app).get('/api/topics/default')
      expect(res.status).toBe(200)
      expect(res.body.topic.id).toBeDefined()
    })
  })
})
