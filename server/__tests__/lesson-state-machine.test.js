import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

function tempDbPath() {
  return path.join(os.tmpdir(), `test-session-state-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Session state primitives', () => {
  let dbPath
  let dbModule
  let stateMachine

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()
    stateMachine = await import('../utils/lesson-state-machine.js')
  })

  afterEach(() => {
    try { dbModule.default.close() } catch {}
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  it('exposes only not_started, practicing, and passed', () => {
    expect(Object.values(stateMachine.STATES)).toEqual(['not_started', 'practicing', 'passed'])
  })

  it('treats only passed prerequisite Sessions as unlocked', () => {
    const topic = dbModule.run("INSERT INTO topics (title, status) VALUES ('React', 'active')")
    const module = dbModule.run('INSERT INTO modules (topic_id, module_index, title) VALUES (?, 0, ?)', topic.lastInsertRowid, 'Basics')
    const prerequisite = dbModule.run('INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, 0, ?)', module.lastInsertRowid, 'Components')
    const lesson = dbModule.run('INSERT INTO lessons (module_id, lesson_index, title, prerequisites) VALUES (?, 1, ?, ?)', module.lastInsertRowid, 'Hooks', JSON.stringify([{ lessonId: prerequisite.lastInsertRowid, title: 'Components' }]))

    dbModule.run('INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)', topic.lastInsertRowid, prerequisite.lastInsertRowid, 'skipped')
    expect(stateMachine.checkPrerequisites(topic.lastInsertRowid, lesson.lastInsertRowid).locked).toBe(true)
    dbModule.run('UPDATE progress SET state = ? WHERE lesson_id = ?', 'passed', prerequisite.lastInsertRowid)
    expect(stateMachine.checkPrerequisites(topic.lastInsertRowid, lesson.lastInsertRowid).locked).toBe(false)
  })

  it('schedules at most one pending SRS review per Session', () => {
    const topic = dbModule.run("INSERT INTO topics (title, status) VALUES ('React', 'active')")
    const module = dbModule.run('INSERT INTO modules (topic_id, module_index, title) VALUES (?, 0, ?)', topic.lastInsertRowid, 'Basics')
    const lesson = dbModule.run('INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, 0, ?)', module.lastInsertRowid, 'Hooks')

    expect(stateMachine.scheduleSrs(topic.lastInsertRowid, lesson.lastInsertRowid)).toBe(true)
    expect(stateMachine.scheduleSrs(topic.lastInsertRowid, lesson.lastInsertRowid)).toBe(false)
    expect(dbModule.get('SELECT COUNT(*) AS count FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topic.lastInsertRowid, lesson.lastInsertRowid).count).toBe(1)
  })
})
