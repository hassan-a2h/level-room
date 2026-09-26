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
          activity_blocks TEXT,
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
          activity_state TEXT NOT NULL DEFAULT '{}',
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

  const migration004 = '004_add_quiz_attempts_table'
  const check004 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration004)
  if (!check004) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS quiz_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          lesson_id INTEGER NOT NULL,
          questions TEXT,
          answers TEXT,
          evaluation TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
          FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
        )
      `)
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration004)
    })()
  }

  const migration005 = '005_add_remediation_columns'
  const check005 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration005)
  if (!check005) {
    db.transaction(() => {
      try { db.exec('ALTER TABLE progress ADD COLUMN remediation_attempts INTEGER DEFAULT 0') } catch {}
      try { db.exec('ALTER TABLE progress ADD COLUMN last_gaps TEXT') } catch {}
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration005)
    })()
  }

  const migration006 = '006_add_module_exams'
  const check006 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration006)
  if (!check006) {
    db.transaction(() => {
      try { db.exec('ALTER TABLE modules ADD COLUMN status TEXT DEFAULT \'active\'') } catch {}
      try { db.exec('ALTER TABLE modules ADD COLUMN completed_at DATETIME') } catch {}
      db.exec(`
        CREATE TABLE IF NOT EXISTS exam_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          module_id INTEGER NOT NULL,
          questions TEXT,
          answers TEXT,
          evaluation TEXT,
          status TEXT DEFAULT 'pending',
          type TEXT DEFAULT 'full',
          parent_exam_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
          FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
        )
      `)
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration006)
    })()
  }

  const migration007 = '007_add_srs_review_type_and_module_id'
  const check007 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration007)
  if (!check007) {
    db.transaction(() => {
      try { db.exec('ALTER TABLE srs_queue ADD COLUMN review_type TEXT DEFAULT \'lesson\'') } catch {}
      try { db.exec('ALTER TABLE srs_queue ADD COLUMN module_id INTEGER') } catch {}
      try { db.exec('ALTER TABLE srs_queue ADD COLUMN review_history TEXT') } catch {}
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration007)
    })()
  }

  const migration008 = '008_make_srs_lesson_id_nullable'
  const check008 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration008)
  if (!check008) {
    db.transaction(() => {
      // SQLite doesn't support ALTER COLUMN, so recreate the table
      db.exec(`
        CREATE TABLE srs_queue_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          lesson_id INTEGER,
          module_id INTEGER,
          interval_index INTEGER DEFAULT 0,
          due_date DATE,
          status TEXT DEFAULT 'pending',
          last_reviewed DATETIME,
          score INTEGER,
          review_type TEXT DEFAULT 'lesson',
          review_history TEXT,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
          FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
        )
      `)
      db.exec(`
        INSERT INTO srs_queue_new (id, topic_id, lesson_id, module_id, interval_index, due_date, status, last_reviewed, score, review_type, review_history)
        SELECT id, topic_id, lesson_id, module_id, interval_index, due_date, status, last_reviewed, score, review_type, review_history
        FROM srs_queue
      `)
      db.exec('DROP TABLE srs_queue')
      db.exec('ALTER TABLE srs_queue_new RENAME TO srs_queue')
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration008)
    })()
  }

  const migration009 = '009_add_adaptive_difficulty_columns'
  const check009 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration009)
  if (!check009) {
    db.transaction(() => {
      try { db.exec("ALTER TABLE topics ADD COLUMN difficulty TEXT DEFAULT 'normal'") } catch {}
      try { db.exec('ALTER TABLE topics ADD COLUMN consecutive_passes INTEGER DEFAULT 0') } catch {}
      try { db.exec('ALTER TABLE topics ADD COLUMN consecutive_fails INTEGER DEFAULT 0') } catch {}
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration009)
    })()
  }

  const migration010 = '010_remove_api_key_from_llm_settings'
  const check010 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration010)
  if (!check010) {
    db.transaction(() => {
      // SQLite doesn't support DROP COLUMN, so recreate the table
      db.exec(`
        CREATE TABLE llm_settings_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`
        INSERT INTO llm_settings_new (id, provider, model, created_at)
        SELECT id, provider, model, created_at
        FROM llm_settings
      `)
      db.exec('DROP TABLE llm_settings')
      db.exec('ALTER TABLE llm_settings_new RENAME TO llm_settings')
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration010)
    })()
  }

  const migration011 = '011_add_llm_reasoning_effort'
  const check011 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration011)
  if (!check011) {
    db.transaction(() => {
      db.exec(`
        ALTER TABLE llm_settings
        ADD COLUMN reasoning_effort TEXT NOT NULL DEFAULT 'none'
      `)
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration011)
    })()
  }

  const migration012 = '012_add_course_lineage_and_task_assessment'
  const check012 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration012)
  if (!check012) {
    db.transaction(() => {
      const addColumn = (sql) => {
        try {
          db.exec(sql)
        } catch (err) {
          if (!/duplicate column name/i.test(err.message)) throw err
        }
      }

      addColumn("ALTER TABLE topics ADD COLUMN course_kind TEXT NOT NULL DEFAULT 'core'")
      addColumn('ALTER TABLE topics ADD COLUMN course_stage INTEGER NOT NULL DEFAULT 0')
      addColumn("ALTER TABLE topics ADD COLUMN course_focus TEXT NOT NULL DEFAULT ''")
      addColumn("ALTER TABLE topics ADD COLUMN course_summary TEXT NOT NULL DEFAULT ''")
      addColumn('ALTER TABLE topics ADD COLUMN course_completed_at DATETIME')
      addColumn("ALTER TABLE lessons ADD COLUMN task_spec TEXT NOT NULL DEFAULT ''")
      addColumn('ALTER TABLE quiz_attempts ADD COLUMN answer_key TEXT')
      addColumn('ALTER TABLE quiz_attempts ADD COLUMN format_version INTEGER NOT NULL DEFAULT 1')

      db.exec(`
        CREATE TABLE IF NOT EXISTS course_links (
          child_topic_id INTEGER PRIMARY KEY,
          parent_topic_id INTEGER NOT NULL,
          lane TEXT NOT NULL,
          normalized_lane TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          CHECK (child_topic_id <> parent_topic_id),
          UNIQUE (parent_topic_id, normalized_lane),
          FOREIGN KEY (child_topic_id) REFERENCES topics(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_topic_id) REFERENCES topics(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_course_links_parent ON course_links(parent_topic_id);
      `)

      db.exec(`
        UPDATE topics
        SET status = 'completed',
            course_completed_at = COALESCE(course_completed_at, CURRENT_TIMESTAMP)
        WHERE status = 'active'
          AND EXISTS (SELECT 1 FROM modules WHERE modules.topic_id = topics.id)
          AND NOT EXISTS (
            SELECT 1 FROM modules
            WHERE modules.topic_id = topics.id
              AND COALESCE(modules.status, 'active') <> 'completed'
          )
      `)

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration012)
    })()
  }

  const migration013 = '013_add_placement_assessments'
  const check013 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration013)
  if (!check013) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS placement_assessments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          requested_level TEXT NOT NULL,
          questions TEXT NOT NULL,
          answers TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          score INTEGER,
          recommended_level TEXT,
          feedback TEXT,
          gaps TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_placement_assessments_topic
          ON placement_assessments(topic_id, created_at DESC);
      `)
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration013)
    })()
  }

  const migration014 = '014_add_curriculum_recovery_state'
  const check014 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration014)
  if (!check014) {
    db.transaction(() => {
      const addColumn = (sql) => {
        try {
          db.exec(sql)
        } catch (err) {
          if (!/duplicate column name/i.test(err.message)) throw err
        }
      }

      addColumn("ALTER TABLE topics ADD COLUMN curriculum_state TEXT NOT NULL DEFAULT 'setup'")
      addColumn('ALTER TABLE topics ADD COLUMN curriculum_draft TEXT')
      addColumn('ALTER TABLE topics ADD COLUMN curriculum_error TEXT')
      addColumn('ALTER TABLE topics ADD COLUMN curriculum_generation_started_at DATETIME')
      addColumn('ALTER TABLE topics ADD COLUMN curriculum_generation_token TEXT')
      addColumn('ALTER TABLE placement_assessments ADD COLUMN target_score INTEGER')
      addColumn('ALTER TABLE placement_assessments ADD COLUMN stretch_score INTEGER')

      db.exec(`
        UPDATE topics
        SET curriculum_state = CASE
          WHEN EXISTS (SELECT 1 FROM modules WHERE modules.topic_id = topics.id) THEN 'confirmed'
          WHEN level IS NOT NULL AND time_per_week IS NOT NULL THEN 'ready_to_generate'
          ELSE 'setup'
        END
        WHERE curriculum_state = 'setup'
      `)

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration014)
    })()
  }

  const migration015 = '015_add_curriculum_generation_jobs'
  const check015 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration015)
  if (!check015) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS curriculum_generation_jobs (
          id TEXT PRIMARY KEY,
          topic_id INTEGER NOT NULL,
          state TEXT NOT NULL DEFAULT 'queued',
          attempt INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          provider TEXT,
          model TEXT,
          reasoning_effort TEXT,
          lease_owner TEXT,
          lease_expires_at DATETIME,
          next_attempt_at DATETIME,
          deadline_at DATETIME,
          error_code TEXT,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
          CHECK (state IN ('queued', 'running', 'retrying', 'completed', 'failed')),
          CHECK (attempt >= 0 AND max_attempts > 0 AND attempt <= max_attempts)
        );
        CREATE INDEX IF NOT EXISTS idx_curriculum_generation_jobs_topic
          ON curriculum_generation_jobs(topic_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_curriculum_generation_jobs_ready
          ON curriculum_generation_jobs(state, next_attempt_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_curriculum_generation_active_topic
          ON curriculum_generation_jobs(topic_id)
          WHERE state IN ('queued', 'running', 'retrying');
      `)

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration015)
    })()
  }

  const migration016 = '016_add_curriculum_generation_lease_owner'
  const check016 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration016)
  if (!check016) {
    db.transaction(() => {
      try {
        db.exec('ALTER TABLE curriculum_generation_jobs ADD COLUMN lease_owner TEXT')
      } catch (err) {
        if (!/duplicate column name/i.test(err.message)) throw err
      }
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration016)
    })()
  }

  const migration017 = '017_add_placement_question_scores'
  const check017 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration017)
  if (!check017) {
    db.transaction(() => {
      try {
        db.exec('ALTER TABLE placement_assessments ADD COLUMN question_scores TEXT')
      } catch (err) {
        if (!/duplicate column name/i.test(err.message)) throw err
      }
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration017)
    })()
  }

  const migration018 = '018_add_structured_activities'
  const check018 = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migration018)
  if (!check018) {
    db.transaction(() => {
      const columnExists = (table, column) => db.prepare(`PRAGMA table_info("${table}")`).all().some((entry) => entry.name === column)
      if (!columnExists('lessons', 'activity_blocks')) db.exec('ALTER TABLE lessons ADD COLUMN activity_blocks TEXT')
      if (!columnExists('progress', 'activity_state')) db.exec("ALTER TABLE progress ADD COLUMN activity_state TEXT NOT NULL DEFAULT '{}'")

      db.exec('DELETE FROM course_links')
      db.exec('DELETE FROM topics')
      db.exec('DELETE FROM streaks')
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration018)
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
