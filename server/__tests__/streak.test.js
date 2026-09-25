import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

function tempDbPath() {
  return path.join(os.tmpdir(), `test-streak-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Streak Tracker', () => {
  let dbPath
  let dbModule
  let streakTracker

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()
    streakTracker = await import('../utils/streak-tracker.js')
  })

  afterEach(() => {
    if (dbModule && dbModule.default) {
      try { dbModule.default.close() } catch {}
    }
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  describe('computeStreakUpdate', () => {
    it('validates real calendar dates including leap days', () => {
      expect(streakTracker.isValidDate('2024-02-29')).toBe(true)
      expect(streakTracker.isValidDate('2026-02-31')).toBe(false)
      expect(streakTracker.isValidDate('2025-02-29')).toBe(false)
      expect(streakTracker.isValidDate('2026-2-03')).toBe(false)
    })

    it('parses local dates as timezone-independent calendar days', () => {
      const priorTz = process.env.TZ
      process.env.TZ = 'Pacific/Kiritimati'
      try {
        expect(streakTracker.parseDate('2024-02-29')).toBe(Date.UTC(2024, 1, 29))
        expect(streakTracker.daysBetween('2024-02-28', '2024-03-01')).toBe(2)
      } finally {
        if (priorTz === undefined) delete process.env.TZ
        else process.env.TZ = priorTz
      }
    })

    it('starts streak at 1 when no previous activity', () => {
      const result = streakTracker.computeStreakUpdate(null, '2024-01-15', 0, 0)
      expect(result.currentStreak).toBe(1)
      expect(result.maxStreak).toBe(1)
      expect(result.lastActiveDate).toBe('2024-01-15')
      expect(result.changed).toBe(true)
    })

    it('does not increment on same day', () => {
      const result = streakTracker.computeStreakUpdate('2024-01-15', '2024-01-15', 3, 5)
      expect(result.currentStreak).toBe(3)
      expect(result.maxStreak).toBe(5)
      expect(result.changed).toBe(false)
    })

    it('increments streak on consecutive day', () => {
      const result = streakTracker.computeStreakUpdate('2024-01-15', '2024-01-16', 3, 5)
      expect(result.currentStreak).toBe(4)
      expect(result.maxStreak).toBe(5)
      expect(result.changed).toBe(true)
    })

    it('resets streak after a one-day gap', () => {
      const result = streakTracker.computeStreakUpdate('2024-01-15', '2024-01-17', 3, 5)
      expect(result.currentStreak).toBe(1)
      expect(result.maxStreak).toBe(5)
      expect(result.changed).toBe(true)
    })

    it('resets streak after a seven-day gap', () => {
      const result = streakTracker.computeStreakUpdate('2024-01-01', '2024-01-09', 5, 5)
      expect(result.currentStreak).toBe(1)
      expect(result.maxStreak).toBe(5)
      expect(result.changed).toBe(true)
    })

    it('updates max streak when current exceeds it', () => {
      const result = streakTracker.computeStreakUpdate('2024-01-15', '2024-01-16', 4, 4)
      expect(result.currentStreak).toBe(5)
      expect(result.maxStreak).toBe(5)
    })

    it('handles month boundary correctly (consecutive)', () => {
      const result = streakTracker.computeStreakUpdate('2024-01-31', '2024-02-01', 2, 2)
      expect(result.currentStreak).toBe(3)
      expect(result.changed).toBe(true)
    })

    it('handles year boundary correctly (consecutive)', () => {
      const result = streakTracker.computeStreakUpdate('2023-12-31', '2024-01-01', 10, 10)
      expect(result.currentStreak).toBe(11)
      expect(result.changed).toBe(true)
    })

    it('handles timezone change without false break (same local date)', () => {
      // User travels but local date string stays the same
      const result = streakTracker.computeStreakUpdate('2024-01-15', '2024-01-15', 5, 5)
      expect(result.currentStreak).toBe(5)
      expect(result.changed).toBe(false)
    })

    it('handles timezone change with legitimate gap', () => {
      // User flies east, local date jumps forward by 1 day (legitimate gap)
      const result = streakTracker.computeStreakUpdate('2024-01-15', '2024-01-17', 5, 5)
      expect(result.currentStreak).toBe(1)
      expect(result.changed).toBe(true)
    })
  })

  describe('recordMasteryEvent', () => {
    it('creates streak row on first event', () => {
      const result = streakTracker.recordMasteryEvent('2024-01-15')
      expect(result.currentStreak).toBe(1)
      expect(result.maxStreak).toBe(1)
      expect(result.lastActiveDate).toBe('2024-01-15')
      expect(result.changed).toBe(true)

      const row = dbModule.get('SELECT * FROM streaks LIMIT 1')
      expect(row.current_streak).toBe(1)
      expect(row.max_streak).toBe(1)
      expect(row.last_active_date).toBe('2024-01-15')
    })

    it('does not double-count on same day', () => {
      streakTracker.recordMasteryEvent('2024-01-15')
      const result = streakTracker.recordMasteryEvent('2024-01-15')
      expect(result.currentStreak).toBe(1)
      expect(result.changed).toBe(false)

      const row = dbModule.get('SELECT * FROM streaks LIMIT 1')
      expect(row.current_streak).toBe(1)
    })

    it('increments streak on next calendar day', () => {
      streakTracker.recordMasteryEvent('2024-01-15')
      const result = streakTracker.recordMasteryEvent('2024-01-16')
      expect(result.currentStreak).toBe(2)
      expect(result.changed).toBe(true)

      const row = dbModule.get('SELECT * FROM streaks LIMIT 1')
      expect(row.current_streak).toBe(2)
    })

    it('resets streak after missing a day', () => {
      streakTracker.recordMasteryEvent('2024-01-15')
      const result = streakTracker.recordMasteryEvent('2024-01-17')
      expect(result.currentStreak).toBe(1)
      expect(result.streakBroken).toBe(true)

      const row = dbModule.get('SELECT * FROM streaks LIMIT 1')
      expect(row.current_streak).toBe(1)
    })

    it('tracks max streak across resets', () => {
      streakTracker.recordMasteryEvent('2024-01-15')
      streakTracker.recordMasteryEvent('2024-01-16')
      streakTracker.recordMasteryEvent('2024-01-17')
      // streak = 3, max = 3
      streakTracker.recordMasteryEvent('2024-01-19') // gap, reset to 1
      const row = dbModule.get('SELECT * FROM streaks LIMIT 1')
      expect(row.current_streak).toBe(1)
      expect(row.max_streak).toBe(3)
    })
  })

  describe('getStreakState', () => {
    it('returns zero state when no streak exists', () => {
      const state = streakTracker.getStreakState('2024-01-15')
      expect(state.currentStreak).toBe(0)
      expect(state.maxStreak).toBe(0)
      expect(state.daysSince).toBeNull()
      expect(state.backlog).toBe(false)
    })

    it('returns active streak state', () => {
      streakTracker.recordMasteryEvent('2024-01-15')
      const state = streakTracker.getStreakState('2024-01-15')
      expect(state.currentStreak).toBe(1)
      expect(state.maxStreak).toBe(1)
      expect(state.daysSince).toBe(0)
      expect(state.backlog).toBe(false)
      expect(state.streakBroken).toBe(false)
    })

    it('detects streak broken after one day gap', () => {
      streakTracker.recordMasteryEvent('2024-01-15')
      const state = streakTracker.getStreakState('2024-01-17')
      expect(state.daysSince).toBe(2)
      expect(state.streakBroken).toBe(true)
    })

    it('detects backlog after 7+ days inactive', () => {
      streakTracker.recordMasteryEvent('2024-01-01')
      const state = streakTracker.getStreakState('2024-01-09')
      expect(state.daysSince).toBe(8)
      expect(state.backlog).toBe(true)
    })

    it('does not flag backlog for active streak', () => {
      streakTracker.recordMasteryEvent('2024-01-08')
      const state = streakTracker.getStreakState('2024-01-09')
      expect(state.backlog).toBe(false)
      expect(state.daysSince).toBe(1)
    })
  })
})

describe('Streak API', () => {
  let dbPath
  let dbModule
  let app

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()

    // Seed a streak row for testing
    const { default: streakRouter } = await import('../routes/streak.js')
    app = express()
    app.use(express.json())
    app.use('/api', streakRouter)
  })

  afterEach(() => {
    if (dbModule && dbModule.default) {
      try { dbModule.default.close() } catch {}
    }
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  describe('GET /api/streak', () => {
    it('returns zero state initially', async () => {
      const res = await request(app).get('/api/streak?today=2024-01-15')
      expect(res.status).toBe(200)
      expect(res.body.currentStreak).toBe(0)
      expect(res.body.maxStreak).toBe(0)
      expect(res.body.backlog).toBe(false)
    })

    it('returns streak data after activity', async () => {
      dbModule.run('INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)', 5, 10, '2024-01-14')
      const res = await request(app).get('/api/streak?today=2024-01-15')
      expect(res.status).toBe(200)
      expect(res.body.currentStreak).toBe(5)
      expect(res.body.maxStreak).toBe(10)
      expect(res.body.daysSince).toBe(1)
      expect(res.body.backlog).toBe(false)
      expect(res.body.streakBroken).toBe(false)
    })

    it('detects broken streak after gap', async () => {
      dbModule.run('INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)', 5, 10, '2024-01-10')
      const res = await request(app).get('/api/streak?today=2024-01-15')
      expect(res.status).toBe(200)
      expect(res.body.currentStreak).toBe(5)
      expect(res.body.daysSince).toBe(5)
      expect(res.body.streakBroken).toBe(true)
    })

    it('detects backlog after 7+ days', async () => {
      dbModule.run('INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)', 3, 8, '2024-01-01')
      const res = await request(app).get('/api/streak?today=2024-01-09')
      expect(res.status).toBe(200)
      expect(res.body.backlog).toBe(true)
      expect(res.body.daysSince).toBe(8)
    })

    it('returns streak-broken message when gap exists', async () => {
      dbModule.run('INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)', 5, 10, '2024-01-10')
      const res = await request(app).get('/api/streak?today=2024-01-15')
      expect(res.status).toBe(200)
      expect(res.body.message).toMatch(/streak was broken/i)
    })

    it('returns encouraging message for active streak', async () => {
      dbModule.run('INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)', 5, 10, '2024-01-14')
      const res = await request(app).get('/api/streak?today=2024-01-15')
      expect(res.status).toBe(200)
      expect(res.body.message).toMatch(/5.day streak/i)
    })

    it('uses today query parameter for local date', async () => {
      dbModule.run('INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)', 1, 1, '2024-01-15')
      const res = await request(app).get('/api/streak?today=2024-01-15')
      expect(res.body.daysSince).toBe(0)
    })
  })

  describe('POST /api/streak/record', () => {
    it('records mastery event and updates streak', async () => {
      const res = await request(app)
        .post('/api/streak/record')
        .send({ localDate: '2024-01-15' })
      expect(res.status).toBe(200)
      expect(res.body.currentStreak).toBe(1)
      expect(res.body.maxStreak).toBe(1)

      const row = dbModule.get('SELECT * FROM streaks LIMIT 1')
      expect(row.last_active_date).toBe('2024-01-15')
    })

    it('rejects missing localDate', async () => {
      const res = await request(app).post('/api/streak/record').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/localDate is required/i)
    })

    it('rejects invalid localDate format', async () => {
      const res = await request(app)
        .post('/api/streak/record')
        .send({ localDate: 'not-a-date' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid date format/i)
    })

    it('does not double-count same day', async () => {
      await request(app).post('/api/streak/record').send({ localDate: '2024-01-15' })
      const res = await request(app)
        .post('/api/streak/record')
        .send({ localDate: '2024-01-15' })
      expect(res.status).toBe(200)
      expect(res.body.currentStreak).toBe(1)
      expect(res.body.changed).toBe(false)
    })

    it('increments on consecutive day', async () => {
      await request(app).post('/api/streak/record').send({ localDate: '2024-01-15' })
      const res = await request(app)
        .post('/api/streak/record')
        .send({ localDate: '2024-01-16' })
      expect(res.status).toBe(200)
      expect(res.body.currentStreak).toBe(2)
      expect(res.body.changed).toBe(true)
    })

    it('resets after gap', async () => {
      await request(app).post('/api/streak/record').send({ localDate: '2024-01-15' })
      const res = await request(app)
        .post('/api/streak/record')
        .send({ localDate: '2024-01-17' })
      expect(res.status).toBe(200)
      expect(res.body.currentStreak).toBe(1)
      expect(res.body.streakBroken).toBe(true)
    })
  })
})

describe('Streak integration with mastery events', () => {
  let dbPath
  let dbModule
  let streakTracker
  let quizApp

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()
    streakTracker = await import('../utils/streak-tracker.js')

    // Build a minimal app with just the streak route for testing the event endpoint
    const { default: streakRouter } = await import('../routes/streak.js')
    quizApp = express()
    quizApp.use(express.json())
    quizApp.use('/api', streakRouter)
  })

  afterEach(() => {
    if (dbModule && dbModule.default) {
      try { dbModule.default.close() } catch {}
    }
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  it('concurrent writes do not corrupt streak data', async () => {
    // Simulate two tabs recording events simultaneously
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(
        request(quizApp)
          .post('/api/streak/record')
          .send({ localDate: '2024-01-15' })
      )
    }
    const results = await Promise.all(promises)
    // All should succeed
    expect(results.every((r) => r.status === 200)).toBe(true)

    // Database should have exactly one row with streak 1 (not 10)
    const row = dbModule.get('SELECT * FROM streaks LIMIT 1')
    expect(row.current_streak).toBe(1)
    expect(row.max_streak).toBe(1)
  })
})
