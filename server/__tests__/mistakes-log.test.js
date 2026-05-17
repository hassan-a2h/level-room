import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

function tempDbPath() {
  return path.join(os.tmpdir(), `test-ml-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Mistakes Log', () => {
  let dbPath
  let dbModule
  let ml

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    const { initSchema, get, run, all } = await import('../db.js')
    dbModule = { initSchema, get, run, all }
    dbModule.initSchema()
    ml = await import('../utils/mistakes-log.js')
  })

  afterEach(() => {
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  function seedTopicAndLesson() {
    const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", 'React', 'active')
    const mod = dbModule.run("INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)", topic.lastInsertRowid, 0, 'Basics')
    const lesson = dbModule.run(
      "INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites) VALUES (?, ?, ?, ?, ?, ?, ?)",
      mod.lastInsertRowid, 0, 'JSX', 'Beginner', 10, JSON.stringify(['Understand JSX']), '[]'
    )
    return { topicId: topic.lastInsertRowid, lessonId: lesson.lastInsertRowid }
  }

  describe('logMistake', () => {
    it('creates a new mistake entry on first occurrence', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      const result = ml.logMistake(topicId, lessonId, 'Confused JSX with HTML')
      expect(result.wasNew).toBe(true)
      expect(result.recurring).toBe(0)

      const row = dbModule.get('SELECT * FROM mistakes_log WHERE id = ?', result.id)
      expect(row.description).toBe('Confused JSX with HTML')
      expect(row.recurring).toBe(0)
      expect(row.cleared_after).toBe(0)
    })

    it('marks existing mistake as recurring on second occurrence', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      ml.logMistake(topicId, lessonId, 'Confused JSX with HTML')
      const result = ml.logMistake(topicId, lessonId, 'Confused JSX with HTML')
      expect(result.wasNew).toBe(false)
      expect(result.recurring).toBe(1)

      const row = dbModule.get('SELECT * FROM mistakes_log WHERE id = ?', result.id)
      expect(row.recurring).toBe(1)
      expect(row.cleared_after).toBe(0)
    })

    it('does not reactivate a fully cleared mistake', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      dbModule.run(
        'INSERT INTO mistakes_log (topic_id, lesson_id, description, recurring, cleared_after) VALUES (?, ?, ?, ?, ?)',
        topicId, lessonId, 'Confused JSX with HTML', 0, 2
      )
      const result = ml.logMistake(topicId, lessonId, 'Confused JSX with HTML')
      expect(result.wasNew).toBe(true)
    })
  })

  describe('updateMistakesAfterResult', () => {
    it('logs new gaps on failure', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      ml.updateMistakesAfterResult(topicId, lessonId, false, ['Gap A', 'Gap B'])
      const rows = dbModule.all('SELECT * FROM mistakes_log WHERE topic_id = ?', topicId)
      expect(rows).toHaveLength(2)
      expect(rows.map((r) => r.description)).toContain('Gap A')
      expect(rows.map((r) => r.description)).toContain('Gap B')
    })

    it('marks existing mistake recurring on failure with same gap', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      ml.logMistake(topicId, lessonId, 'Gap A')
      ml.updateMistakesAfterResult(topicId, lessonId, false, ['Gap A'])
      const row = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND description = ?', topicId, 'Gap A')
      expect(row.recurring).toBe(1)
    })

    it('increments cleared_after on pass without gaps', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      ml.logMistake(topicId, lessonId, 'Gap A')
      ml.updateMistakesAfterResult(topicId, lessonId, true, [])
      const row = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND description = ?', topicId, 'Gap A')
      expect(row.cleared_after).toBe(1)
    })

    it('clears mistake after 2 consecutive passes without the error', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      ml.logMistake(topicId, lessonId, 'Gap A')
      ml.updateMistakesAfterResult(topicId, lessonId, true, [])
      let row = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND description = ?', topicId, 'Gap A')
      expect(row.cleared_after).toBe(1)

      ml.updateMistakesAfterResult(topicId, lessonId, true, [])
      row = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND description = ?', topicId, 'Gap A')
      expect(row.cleared_after).toBe(2)
      expect(row.recurring).toBe(0)
    })

    it('resets cleared_after when gap reappears on pass', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      ml.logMistake(topicId, lessonId, 'Gap A')
      ml.updateMistakesAfterResult(topicId, lessonId, true, [])
      let row = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND description = ?', topicId, 'Gap A')
      expect(row.cleared_after).toBe(1)

      ml.updateMistakesAfterResult(topicId, lessonId, true, ['Gap A'])
      row = dbModule.get('SELECT * FROM mistakes_log WHERE topic_id = ? AND description = ?', topicId, 'Gap A')
      expect(row.cleared_after).toBe(0)
    })

    it('resets cleared_after for all active mistakes on failure', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      ml.logMistake(topicId, lessonId, 'Gap A')
      ml.logMistake(topicId, lessonId, 'Gap B')
      ml.updateMistakesAfterResult(topicId, lessonId, true, [])
      ml.updateMistakesAfterResult(topicId, lessonId, true, [])
      // Both should be cleared now
      let rows = dbModule.all('SELECT * FROM mistakes_log WHERE topic_id = ? AND cleared_after < 2', topicId)
      expect(rows).toHaveLength(0)

      // Log new gap after they were cleared
      ml.updateMistakesAfterResult(topicId, lessonId, false, ['Gap C'])
      rows = dbModule.all('SELECT * FROM mistakes_log WHERE topic_id = ? AND cleared_after < 2', topicId)
      expect(rows).toHaveLength(1)
      expect(rows[0].description).toBe('Gap C')
    })
  })

  describe('getActiveMistakes', () => {
    it('returns only active mistakes for the topic', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      ml.logMistake(topicId, lessonId, 'Gap A')
      ml.logMistake(topicId, lessonId, 'Gap B')
      // Simulate clearing one
      dbModule.run('UPDATE mistakes_log SET cleared_after = 2 WHERE description = ?', 'Gap B')

      const active = ml.getActiveMistakes(topicId)
      expect(active).toHaveLength(1)
      expect(active[0].description).toBe('Gap A')
    })
  })

  describe('getRecurringMistakes', () => {
    it('returns only recurring active mistakes', () => {
      const { topicId, lessonId } = seedTopicAndLesson()
      ml.logMistake(topicId, lessonId, 'Gap A')
      ml.logMistake(topicId, lessonId, 'Gap B')
      // Make one recurring
      dbModule.run('UPDATE mistakes_log SET recurring = 1 WHERE description = ?', 'Gap B')

      const recurring = ml.getRecurringMistakes(topicId)
      expect(recurring).toHaveLength(1)
      expect(recurring[0].description).toBe('Gap B')
    })
  })
})
