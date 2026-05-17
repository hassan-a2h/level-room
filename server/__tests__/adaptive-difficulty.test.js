import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

function tempDbPath() {
  return path.join(os.tmpdir(), `test-ad-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Adaptive Difficulty', () => {
  let dbPath
  let dbModule
  let ad

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    const { initSchema, get, run, all } = await import('../db.js')
    dbModule = { initSchema, get, run, all }
    dbModule.initSchema()
    ad = await import('../utils/adaptive-difficulty.js')
  })

  afterEach(() => {
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  function seedTopic(title = 'React') {
    const topic = dbModule.run("INSERT INTO topics (title, status) VALUES (?, ?)", title, 'active')
    return topic.lastInsertRowid
  }

  describe('recordResultAndComputeDifficulty', () => {
    it('starts at normal difficulty', () => {
      const topicId = seedTopic()
      const result = ad.recordResultAndComputeDifficulty(topicId, true)
      expect(result.difficulty).toBe('normal')
      expect(result.streak).toBe(1)
      expect(result.changed).toBe(false)
    })

    it('increases to hard after 3 consecutive passes', () => {
      const topicId = seedTopic()
      ad.recordResultAndComputeDifficulty(topicId, true)
      ad.recordResultAndComputeDifficulty(topicId, true)
      const result = ad.recordResultAndComputeDifficulty(topicId, true)
      expect(result.difficulty).toBe('hard')
      expect(result.streak).toBe(3)
      expect(result.changed).toBe(true)
      expect(result.previousDifficulty).toBe('normal')
    })

    it('drops to scaffolded after 2 consecutive failures', () => {
      const topicId = seedTopic()
      ad.recordResultAndComputeDifficulty(topicId, false)
      const result = ad.recordResultAndComputeDifficulty(topicId, false)
      expect(result.difficulty).toBe('scaffolded')
      expect(result.streak).toBe(2)
      expect(result.changed).toBe(true)
    })

    it('resets pass streak on failure', () => {
      const topicId = seedTopic()
      ad.recordResultAndComputeDifficulty(topicId, true)
      ad.recordResultAndComputeDifficulty(topicId, true)
      const result = ad.recordResultAndComputeDifficulty(topicId, false)
      expect(result.difficulty).toBe('normal')
      expect(result.streak).toBe(1)
    })

    it('resets fail streak on pass', () => {
      const topicId = seedTopic()
      ad.recordResultAndComputeDifficulty(topicId, false)
      const result = ad.recordResultAndComputeDifficulty(topicId, true)
      expect(result.difficulty).toBe('normal')
      expect(result.streak).toBe(1)
    })

    it('persists difficulty state to topics table', () => {
      const topicId = seedTopic()
      ad.recordResultAndComputeDifficulty(topicId, true)
      ad.recordResultAndComputeDifficulty(topicId, true)
      ad.recordResultAndComputeDifficulty(topicId, true)
      const row = dbModule.get('SELECT difficulty, consecutive_passes, consecutive_fails FROM topics WHERE id = ?', topicId)
      expect(row.difficulty).toBe('hard')
      expect(row.consecutive_passes).toBe(3)
      expect(row.consecutive_fails).toBe(0)
    })

    it('throws for non-existent topic', () => {
      expect(() => ad.recordResultAndComputeDifficulty(99999, true)).toThrow('Topic 99999 not found')
    })
  })

  describe('getTopicDifficulty', () => {
    it('returns default normal for new topic', () => {
      const topicId = seedTopic()
      const result = ad.getTopicDifficulty(topicId)
      expect(result.difficulty).toBe('normal')
      expect(result.consecutive_passes).toBe(0)
      expect(result.consecutive_fails).toBe(0)
    })

    it('reflects recorded results', () => {
      const topicId = seedTopic()
      ad.recordResultAndComputeDifficulty(topicId, true)
      ad.recordResultAndComputeDifficulty(topicId, true)
      const result = ad.getTopicDifficulty(topicId)
      expect(result.difficulty).toBe('normal')
      expect(result.consecutive_passes).toBe(2)
    })
  })

  describe('buildDifficultyInstruction', () => {
    it('includes hard instruction when difficulty is hard', () => {
      const topicId = seedTopic()
      ad.recordResultAndComputeDifficulty(topicId, true)
      ad.recordResultAndComputeDifficulty(topicId, true)
      ad.recordResultAndComputeDifficulty(topicId, true)
      const instruction = ad.buildDifficultyInstruction(topicId)
      expect(instruction).toContain('Challenge them with more complex problems')
    })

    it('includes scaffolded instruction when difficulty is scaffolded', () => {
      const topicId = seedTopic()
      ad.recordResultAndComputeDifficulty(topicId, false)
      ad.recordResultAndComputeDifficulty(topicId, false)
      const instruction = ad.buildDifficultyInstruction(topicId)
      expect(instruction).toContain('simpler explanations')
      expect(instruction).toContain('extra examples')
    })

    it('includes recurring weak areas when they exist', () => {
      const topicId = seedTopic()
      dbModule.run(
        'INSERT INTO mistakes_log (topic_id, lesson_id, description, recurring, cleared_after) VALUES (?, ?, ?, ?, ?)',
        topicId, null, 'Confused JSX with HTML', 1, 0
      )
      const instruction = ad.buildDifficultyInstruction(topicId)
      expect(instruction).toContain('Known recurring weak areas')
      expect(instruction).toContain('Confused JSX with HTML')
    })

    it('returns empty string when no special conditions', () => {
      const topicId = seedTopic()
      const instruction = ad.buildDifficultyInstruction(topicId, '')
      expect(instruction).toBe('')
    })

    it('combines difficulty instruction with base prompt', () => {
      const topicId = seedTopic()
      ad.recordResultAndComputeDifficulty(topicId, false)
      ad.recordResultAndComputeDifficulty(topicId, false)
      const base = 'Base system prompt content.'
      const instruction = ad.buildDifficultyInstruction(topicId, base)
      expect(instruction).toContain(base)
      expect(instruction).toContain('struggling')
    })
  })
})
