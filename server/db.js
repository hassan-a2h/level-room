import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db')

let db

try {
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
} catch (err) {
  console.error('Failed to open SQLite database:', err.message)
  throw err
}

/**
 * Initialize the database schema and run any pending migrations.
 * Safe to call multiple times (idempotent).
 */
export function initSchema() {
  // Migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const migrationName = '001_initial_schema'
  const check = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migrationName)
  if (!check) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS topics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          slug TEXT,
          status TEXT DEFAULT 'active',
          level TEXT,
          goal TEXT,
          time_per_week TEXT,
          deadline TEXT,
          tone TEXT,
          focus TEXT,
          mode TEXT DEFAULT 'job-ready',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS modules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          module_index INTEGER NOT NULL,
          title TEXT NOT NULL,
          summary TEXT,
          skill_outcomes TEXT,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lessons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          module_id INTEGER NOT NULL,
          lesson_index INTEGER NOT NULL,
          title TEXT NOT NULL,
          depth TEXT,
          estimated_time INTEGER,
          outcomes TEXT,
          prerequisites TEXT,
          artifact_required INTEGER DEFAULT 0,
          artifact_type TEXT,
          artifact_rubric TEXT,
          FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          lesson_id INTEGER NOT NULL,
          state TEXT DEFAULT 'not_started',
          quiz_score INTEGER,
          quiz_attempts INTEGER DEFAULT 0,
          artifact_passed INTEGER DEFAULT 0,
          started_at DATETIME,
          completed_at DATETIME,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
          FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          lesson_id INTEGER NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
          FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS srs_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          lesson_id INTEGER NOT NULL,
          interval_index INTEGER DEFAULT 0,
          due_date DATE,
          status TEXT DEFAULT 'pending',
          last_reviewed DATETIME,
          score INTEGER,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
          FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS artifacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          progress_id INTEGER NOT NULL,
          content TEXT,
          rubric_scores TEXT,
          passed INTEGER,
          feedback TEXT,
          attempt_number INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (progress_id) REFERENCES progress(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS llm_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          api_key TEXT NOT NULL,
          model TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS mistakes_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          lesson_id INTEGER,
          description TEXT NOT NULL,
          recurring INTEGER DEFAULT 0,
          cleared_after INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
          FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS streaks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          current_streak INTEGER DEFAULT 0,
          max_streak INTEGER DEFAULT 0,
          last_active_date DATE
        );
      `)

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migrationName)
    })()
  }

  const migration002 = '002_add_last_active_at'
  const check002 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration002)
  if (!check002) {
    db.transaction(() => {
      db.exec(`
        ALTER TABLE topics ADD COLUMN last_active_at DATETIME;
      `)
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration002)
    })()
  }

  const migration003 = '003_add_lesson_chunk_tracking'
  const check003 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration003)
  if (!check003) {
    db.transaction(() => {
      try {
        db.exec(`ALTER TABLE progress ADD COLUMN current_chunk INTEGER DEFAULT 0`)
      } catch {}
      try {
        db.exec(`ALTER TABLE progress ADD COLUMN total_chunks INTEGER DEFAULT 0`)
      } catch {}
      try {
        db.exec(`ALTER TABLE topics ADD COLUMN interaction_mode TEXT DEFAULT 'socratic'`)
      } catch {}
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration003)
    })()
  }
}

/**
 * Execute a parameterized SELECT and return all rows.
 * @param {string} sql
 * @param {...any} params
 * @returns {Array<object>}
 */
export function all(sql, ...params) {
  try {
    return db.prepare(sql).all(...params)
  } catch (err) {
    console.error('DB all() error:', err.message, '| SQL:', sql, '| Params:', params)
    throw err
  }
}

/**
 * Execute a parameterized SELECT and return the first row.
 * @param {string} sql
 * @param {...any} params
 * @returns {object|undefined}
 */
export function get(sql, ...params) {
  try {
    return db.prepare(sql).get(...params)
  } catch (err) {
    console.error('DB get() error:', err.message, '| SQL:', sql, '| Params:', params)
    throw err
  }
}

/**
 * Execute a parameterized INSERT/UPDATE/DELETE.
 * @param {string} sql
 * @param {...any} params
 * @returns {{ lastInsertRowid: number, changes: number }}
 */
export function run(sql, ...params) {
  try {
    const stmt = db.prepare(sql)
    const result = stmt.run(...params)
    return {
      lastInsertRowid: result.lastInsertRowid,
      changes: result.changes,
    }
  } catch (err) {
    console.error('DB run() error:', err.message, '| SQL:', sql, '| Params:', params)
    throw err
  }
}

/**
 * Create a transaction wrapper around a callback.
 * @param {Function} fn
 * @returns {Function}
 */
export function transaction(fn) {
  return db.transaction(fn)
}

export default db
