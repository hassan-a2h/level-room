import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

function tempDbPath() {
  return path.join(os.tmpdir(), `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('database schema', () => {
  let dbPath
  let dbModule

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()
  })

  afterEach(() => {
    if (dbModule && dbModule.default) {
      try { dbModule.default.close() } catch {}
    }
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  it('creates all 10 required tables', () => {
    const tables = dbModule.default
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map(r => r.name)
    expect(tables).toContain('topics')
    expect(tables).toContain('modules')
    expect(tables).toContain('lessons')
    expect(tables).toContain('progress')
    expect(tables).toContain('messages')
    expect(tables).toContain('srs_queue')
    expect(tables).toContain('artifacts')
    expect(tables).toContain('llm_settings')
    expect(tables).toContain('mistakes_log')
    expect(tables).toContain('streaks')
  })

  it('enforces foreign keys via pragma', () => {
    const result = dbModule.default.prepare('PRAGMA foreign_keys').get()
    expect(result.foreign_keys).toBe(1)
  })

  it('honors DB_PATH environment variable', () => {
    expect(fs.existsSync(dbPath)).toBe(true)
  })

  it('default db path is ./data/app.db when DB_PATH is unset', async () => {
    delete process.env.DB_PATH
    vi.resetModules()
    const fallbackModule = await import('../db.js')
    const expectedPath = path.resolve('data', 'app.db')
    expect(fallbackModule.default.name).toBe(expectedPath)
    fallbackModule.default.close()
  })

  it('inserts a topic with parameterized query', () => {
    const insert = dbModule.default.prepare(
      'INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)'
    )
    const info = insert.run('React', 'react', 'active')
    expect(info.lastInsertRowid).toBeGreaterThan(0)
  })

  it('inserts a module linked to a topic via FK', () => {
    const db = dbModule.default
    const topic = db.prepare('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)').run('React', 'react', 'active')
    const moduleInsert = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)')
    const info = moduleInsert.run(topic.lastInsertRowid, 1, 'Intro')
    expect(info.lastInsertRowid).toBeGreaterThan(0)
  })

  it('prevents inserting a module with nonexistent topic_id', () => {
    const db = dbModule.default
    const insert = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)')
    expect(() => insert.run(9999, 1, 'Intro')).toThrow('FOREIGN KEY')
  })

  it('inserts a lesson linked to a module via FK', () => {
    const db = dbModule.default
    const topic = db.prepare('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)').run('React', 'react', 'active')
    const mod = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, 1, 'Intro')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time) VALUES (?, ?, ?, ?, ?)').run(mod.lastInsertRowid, 0, 'JSX', 'beginner', 10)
    expect(lesson.lastInsertRowid).toBeGreaterThan(0)
  })

  it('inserts progress row linked to topic and lesson', () => {
    const db = dbModule.default
    const topic = db.prepare('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)').run('React', 'react', 'active')
    const mod = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, 1, 'Intro')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time) VALUES (?, ?, ?, ?, ?)').run(mod.lastInsertRowid, 0, 'JSX', 'beginner', 10)
    const progress = db.prepare('INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid, 'not_started')
    expect(progress.lastInsertRowid).toBeGreaterThan(0)
  })

  it('inserts a message linked to topic and lesson', () => {
    const db = dbModule.default
    const topic = db.prepare('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)').run('React', 'react', 'active')
    const mod = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, 1, 'Intro')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time) VALUES (?, ?, ?, ?, ?)').run(mod.lastInsertRowid, 0, 'JSX', 'beginner', 10)
    const msg = db.prepare('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid, 'user', 'Hello')
    expect(msg.lastInsertRowid).toBeGreaterThan(0)
  })

  it('inserts an srs_queue item linked to topic and lesson', () => {
    const db = dbModule.default
    const topic = db.prepare('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)').run('React', 'react', 'active')
    const mod = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, 1, 'Intro')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time) VALUES (?, ?, ?, ?, ?)').run(mod.lastInsertRowid, 0, 'JSX', 'beginner', 10)
    const srs = db.prepare('INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid, 0, '2025-01-01', 'pending')
    expect(srs.lastInsertRowid).toBeGreaterThan(0)
  })

  it('inserts an artifact linked to progress', () => {
    const db = dbModule.default
    const topic = db.prepare('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)').run('React', 'react', 'active')
    const mod = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, 1, 'Intro')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time) VALUES (?, ?, ?, ?, ?)').run(mod.lastInsertRowid, 0, 'JSX', 'beginner', 10)
    const progress = db.prepare('INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid, 'not_started')
    const artifact = db.prepare('INSERT INTO artifacts (progress_id, content, passed) VALUES (?, ?, ?)').run(progress.lastInsertRowid, 'some code', 0)
    expect(artifact.lastInsertRowid).toBeGreaterThan(0)
  })

  it('inserts llm_settings row', () => {
    const db = dbModule.default
    const info = db.prepare('INSERT INTO llm_settings (provider, model) VALUES (?, ?)').run('openai', 'gpt-4')
    expect(info.lastInsertRowid).toBeGreaterThan(0)
  })

  it('inserts mistakes_log row linked to topic and lesson', () => {
    const db = dbModule.default
    const topic = db.prepare('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)').run('React', 'react', 'active')
    const mod = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, 1, 'Intro')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time) VALUES (?, ?, ?, ?, ?)').run(mod.lastInsertRowid, 0, 'JSX', 'beginner', 10)
    const mistake = db.prepare('INSERT INTO mistakes_log (topic_id, lesson_id, description) VALUES (?, ?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid, 'forgot semicolons')
    expect(mistake.lastInsertRowid).toBeGreaterThan(0)
  })

  it('inserts streaks row', () => {
    const db = dbModule.default
    const info = db.prepare('INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)').run(3, 5, '2025-01-01')
    expect(info.lastInsertRowid).toBeGreaterThan(0)
  })

  it('cascades topic deletion to related modules, lessons, progress, messages, srs_queue, artifacts, and mistakes_log', () => {
    const db = dbModule.default
    const topic = db.prepare('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)').run('React', 'react', 'active')
    const mod = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, 1, 'Intro')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time) VALUES (?, ?, ?, ?, ?)').run(mod.lastInsertRowid, 0, 'JSX', 'beginner', 10)
    const progress = db.prepare('INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid, 'not_started')
    db.prepare('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid, 'user', 'Hello')
    db.prepare('INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid, 0, '2025-01-01', 'pending')
    db.prepare('INSERT INTO artifacts (progress_id, content, passed) VALUES (?, ?, ?)').run(progress.lastInsertRowid, 'code', 0)
    db.prepare('INSERT INTO mistakes_log (topic_id, lesson_id, description) VALUES (?, ?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid, 'oops')

    db.prepare('DELETE FROM topics WHERE id = ?').run(topic.lastInsertRowid)

    const modules = db.prepare('SELECT * FROM modules WHERE topic_id = ?').all(topic.lastInsertRowid)
    const lessons = db.prepare('SELECT * FROM lessons WHERE module_id = ?').all(mod.lastInsertRowid)
    const progressRows = db.prepare('SELECT * FROM progress WHERE topic_id = ?').all(topic.lastInsertRowid)
    const messages = db.prepare('SELECT * FROM messages WHERE topic_id = ?').all(topic.lastInsertRowid)
    const srs = db.prepare('SELECT * FROM srs_queue WHERE topic_id = ?').all(topic.lastInsertRowid)
    const mistakes = db.prepare('SELECT * FROM mistakes_log WHERE topic_id = ?').all(topic.lastInsertRowid)

    // artifacts are linked to progress, which is gone, so they should be gone too
    const artifacts = db.prepare('SELECT * FROM artifacts WHERE progress_id = ?').all(progress.lastInsertRowid)

    expect(modules.length).toBe(0)
    expect(lessons.length).toBe(0)
    expect(progressRows.length).toBe(0)
    expect(messages.length).toBe(0)
    expect(srs.length).toBe(0)
    expect(artifacts.length).toBe(0)
    expect(mistakes.length).toBe(0)
  })

  it('is safe from SQL injection via parameterized queries', () => {
    const db = dbModule.default
    const maliciousTitle = "'; DROP TABLE topics; --"
    const insert = db.prepare('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)')
    const info = insert.run(maliciousTitle, 'safe-slug', 'active')
    expect(info.lastInsertRowid).toBeGreaterThan(0)

    const row = db.prepare('SELECT title FROM topics WHERE id = ?').get(info.lastInsertRowid)
    expect(row.title).toBe(maliciousTitle)

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name)
    expect(tables).toContain('topics')
  })

  it('query helpers are exported', () => {
    expect(dbModule.all).toBeInstanceOf(Function)
    expect(dbModule.get).toBeInstanceOf(Function)
    expect(dbModule.run).toBeInstanceOf(Function)
    expect(dbModule.transaction).toBeInstanceOf(Function)
  })

  it('run helper returns correct shape', () => {
    const result = dbModule.run('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)', 'Vue', 'vue', 'active')
    expect(result.lastInsertRowid).toBeGreaterThan(0)
    expect(result.changes).toBe(1)
  })

  it('get helper returns a single row', () => {
    dbModule.run('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)', 'Vue', 'vue', 'active')
    const row = dbModule.get('SELECT title FROM topics WHERE slug = ?', 'vue')
    expect(row.title).toBe('Vue')
  })

  it('all helper returns an array', () => {
    dbModule.run('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)', 'A', 'a', 'active')
    dbModule.run('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)', 'B', 'b', 'active')
    const rows = dbModule.all('SELECT title FROM topics WHERE status = ? ORDER BY title', 'active')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(Array.isArray(rows)).toBe(true)
  })

  it('transaction helper commits all statements atomically', () => {
    const tx = dbModule.transaction(() => {
      dbModule.run('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)', 'Tx1', 'tx1', 'active')
      dbModule.run('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)', 'Tx2', 'tx2', 'active')
    })
    tx()
    const rows = dbModule.all('SELECT * FROM topics WHERE slug IN (?, ?)', 'tx1', 'tx2')
    expect(rows.length).toBe(2)
  })

  it('transaction helper rolls back on error', () => {
    expect(() => {
      const tx = dbModule.transaction(() => {
        dbModule.run('INSERT INTO topics (title, slug, status) VALUES (?, ?, ?)', 'Rollback', 'rollback', 'active')
        throw new Error('Intentional failure')
      })
      tx()
    }).toThrow('Intentional failure')

    const row = dbModule.get('SELECT * FROM topics WHERE slug = ?', 'rollback')
    expect(row).toBeUndefined()
  })

  it('initSchema runs migrations table', () => {
    const tables = dbModule.default
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map(r => r.name)
    expect(tables).toContain('migrations')
  })

  it('adds course lineage and task assessment columns and tables', () => {
    const db = dbModule.default
    const topicColumns = db.prepare('PRAGMA table_info(topics)').all().map((column) => column.name)
    const lessonColumns = db.prepare('PRAGMA table_info(lessons)').all().map((column) => column.name)
    const quizColumns = db.prepare('PRAGMA table_info(quiz_attempts)').all().map((column) => column.name)

    expect(topicColumns).toEqual(expect.arrayContaining([
      'course_kind',
      'course_stage',
      'course_focus',
      'course_summary',
      'course_completed_at',
    ]))
    expect(lessonColumns).toContain('task_spec')
    expect(quizColumns).toEqual(expect.arrayContaining(['answer_key', 'format_version']))
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'course_links'").get()).toBeTruthy()
    expect(db.prepare("SELECT name FROM migrations WHERE name = '012_add_course_lineage_and_task_assessment'").get()).toBeTruthy()
  })

  it('adds durable curriculum recovery fields with safe defaults', () => {
    const db = dbModule.default
    const topicColumns = db.prepare('PRAGMA table_info(topics)').all().map((column) => column.name)
    const placementColumns = db.prepare('PRAGMA table_info(placement_assessments)').all().map((column) => column.name)

    expect(topicColumns).toEqual(expect.arrayContaining([
      'curriculum_state',
      'curriculum_draft',
      'curriculum_error',
      'curriculum_generation_started_at',
      'curriculum_generation_token',
    ]))
    expect(placementColumns).toEqual(expect.arrayContaining(['target_score', 'stretch_score']))

    const topic = db.prepare('INSERT INTO topics (title) VALUES (?)').run('Recovery defaults')
    expect(db.prepare('SELECT curriculum_state, curriculum_draft, curriculum_error FROM topics WHERE id = ?').get(topic.lastInsertRowid)).toEqual({
      curriculum_state: 'setup',
      curriculum_draft: null,
      curriculum_error: null,
    })
  })

  it('uses safe Core defaults for existing topic and lesson rows', () => {
    const db = dbModule.default
    const topic = db.prepare('INSERT INTO topics (title) VALUES (?)').run('Legacy topic')
    const mod = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, 0, 'Basics')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, ?, ?)').run(mod.lastInsertRowid, 0, 'First lesson')
    const storedTopic = db.prepare('SELECT course_kind, course_stage, course_focus, course_summary, course_completed_at FROM topics WHERE id = ?').get(topic.lastInsertRowid)
    const storedLesson = db.prepare('SELECT task_spec FROM lessons WHERE id = ?').get(lesson.lastInsertRowid)

    expect(storedTopic).toMatchObject({
      course_kind: 'core',
      course_stage: 0,
      course_focus: '',
      course_summary: '',
      course_completed_at: null,
    })
    expect(storedLesson.task_spec).toBe('')
  })

  it('adds the neutral reasoning default to an existing settings row', () => {
    const db = dbModule.default
    db.exec('DROP TABLE llm_settings')
    db.exec(`CREATE TABLE llm_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)
    const inserted = dbModule.run(
      'INSERT INTO llm_settings (provider, model) VALUES (?, ?)',
      'openai', 'gpt-4o'
    )
    dbModule.run('DELETE FROM migrations WHERE name = ?', '011_add_llm_reasoning_effort')

    dbModule.initSchema()

    const row = dbModule.get(
      'SELECT provider, model, reasoning_effort FROM llm_settings WHERE id = ?',
      inserted.lastInsertRowid
    )
    expect(row).toEqual({ provider: 'openai', model: 'gpt-4o', reasoning_effort: 'none' })
  })

  it('adds the structured activity columns to a fresh database with an empty state default', () => {
    const db = dbModule.default
    const lessonColumns = db.prepare('PRAGMA table_info(lessons)').all()
    const progressColumns = db.prepare('PRAGMA table_info(progress)').all()
    expect(lessonColumns.map((column) => column.name)).toContain('activity_blocks')
    expect(progressColumns.map((column) => column.name)).toContain('activity_state')

    const topic = db.prepare('INSERT INTO topics (title) VALUES (?)').run('Structured topic')
    const module = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, 0, 'Chapter')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, ?, ?)').run(module.lastInsertRowid, 0, 'Session')
    db.prepare('INSERT INTO progress (topic_id, lesson_id) VALUES (?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid)
    expect(db.prepare('SELECT activity_state FROM progress').get().activity_state).toBe('{}')
  })

  it('cuts a migration-017 database over once, cascading learning data and preserving provider settings', () => {
    const db = dbModule.default
    const parent = db.prepare("INSERT INTO topics (title, status, course_kind, course_stage) VALUES ('Parent', 'completed', 'core', 0)").run()
    const child = db.prepare("INSERT INTO topics (title, status, course_kind, course_stage) VALUES ('Child', 'active', 'continuation', 1)").run()
    db.prepare('INSERT INTO course_links (child_topic_id, parent_topic_id, lane, normalized_lane) VALUES (?, ?, ?, ?)').run(child.lastInsertRowid, parent.lastInsertRowid, 'Balanced next', 'balanced next')
    const module = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(parent.lastInsertRowid, 0, 'Chapter')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, ?, ?)').run(module.lastInsertRowid, 0, 'Session')
    const progress = db.prepare("INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, 'passed')").run(parent.lastInsertRowid, lesson.lastInsertRowid)
    db.prepare('INSERT INTO messages (topic_id, lesson_id, role, content) VALUES (?, ?, ?, ?)').run(parent.lastInsertRowid, lesson.lastInsertRowid, 'assistant', 'old lesson chat')
    db.prepare('INSERT INTO srs_queue (topic_id, lesson_id, module_id) VALUES (?, ?, ?)').run(parent.lastInsertRowid, lesson.lastInsertRowid, module.lastInsertRowid)
    db.prepare('INSERT INTO artifacts (progress_id, content, passed) VALUES (?, ?, ?)').run(progress.lastInsertRowid, 'old artifact', 1)
    db.prepare('INSERT INTO mistakes_log (topic_id, lesson_id, description) VALUES (?, ?, ?)').run(parent.lastInsertRowid, lesson.lastInsertRowid, 'old mistake')
    db.prepare('INSERT INTO quiz_attempts (topic_id, lesson_id, questions) VALUES (?, ?, ?)').run(parent.lastInsertRowid, lesson.lastInsertRowid, '[]')
    db.prepare('INSERT INTO exam_attempts (topic_id, module_id, questions) VALUES (?, ?, ?)').run(parent.lastInsertRowid, module.lastInsertRowid, '[]')
    db.prepare('INSERT INTO placement_assessments (topic_id, requested_level, questions) VALUES (?, ?, ?)').run(parent.lastInsertRowid, 'beginner', '[]')
    db.prepare('INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)').run(4, 8, '2026-09-26')
    const settings = db.prepare('INSERT INTO llm_settings (provider, model, reasoning_effort) VALUES (?, ?, ?)').run('openai', 'gpt-5.4', 'high')

    const lessonColumns = db.prepare('PRAGMA table_info(lessons)').all().map((column) => column.name)
    const progressColumns = db.prepare('PRAGMA table_info(progress)').all().map((column) => column.name)
    if (lessonColumns.includes('activity_blocks')) db.exec('ALTER TABLE lessons DROP COLUMN activity_blocks')
    if (progressColumns.includes('activity_state')) db.exec('ALTER TABLE progress DROP COLUMN activity_state')
    db.prepare('DELETE FROM migrations WHERE name = ?').run('018_add_structured_activities')

    dbModule.initSchema()

    expect(db.prepare('PRAGMA table_info(lessons)').all().map((column) => column.name)).toContain('activity_blocks')
    expect(db.prepare('PRAGMA table_info(progress)').all().map((column) => column.name)).toContain('activity_state')
    for (const table of ['topics', 'modules', 'lessons', 'progress', 'messages', 'srs_queue', 'artifacts', 'mistakes_log', 'quiz_attempts', 'exam_attempts', 'placement_assessments', 'course_links', 'streaks']) {
      expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, table).toBe(0)
    }
    expect(db.prepare('SELECT id, provider, model, reasoning_effort FROM llm_settings WHERE id = ?').get(settings.lastInsertRowid)).toEqual({
      id: settings.lastInsertRowid,
      provider: 'openai',
      model: 'gpt-5.4',
      reasoning_effort: 'high',
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM migrations WHERE name = ?').get('018_add_structured_activities').count).toBe(1)

    expect(() => dbModule.initSchema()).not.toThrow()
    expect(db.prepare('SELECT COUNT(*) AS count FROM migrations WHERE name = ?').get('018_add_structured_activities').count).toBe(1)
  })

  it('keeps existing foreign-key cascades after the cutover', () => {
    const db = dbModule.default
    const topic = db.prepare('INSERT INTO topics (title) VALUES (?)').run('Cascade topic')
    const module = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, 0, 'Chapter')
    const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title) VALUES (?, ?, ?)').run(module.lastInsertRowid, 0, 'Session')
    const progress = db.prepare('INSERT INTO progress (topic_id, lesson_id) VALUES (?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid)
    db.prepare('INSERT INTO artifacts (progress_id, content) VALUES (?, ?)').run(progress.lastInsertRowid, 'evidence')

    db.prepare('DELETE FROM topics WHERE id = ?').run(topic.lastInsertRowid)

    expect(db.prepare('SELECT COUNT(*) AS count FROM modules').get().count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM lessons').get().count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM progress').get().count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM artifacts').get().count).toBe(0)
  })
})
