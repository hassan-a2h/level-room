import { Router } from 'express'
import db, { all, run, transaction } from '../db.js'

const router = Router()

const TABLES = [
  'topics',
  'modules',
  'lessons',
  'progress',
  'messages',
  'srs_queue',
  'artifacts',
  'llm_settings',
  'mistakes_log',
  'streaks',
  'quiz_attempts',
  'exam_attempts',
  'placement_assessments',
]

const OPTIONAL_TABLES = new Set(['placement_assessments'])

const LEGACY_DISCARDED_SETTINGS_FIELDS = new Set(['api_key'])

function getTableColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name))
}

function prepareImportRows(backup) {
  const prepared = {}
  for (const table of TABLES) {
    const rows = backup[table] || (OPTIONAL_TABLES.has(table) ? [] : null)
    if (!rows) return { error: `Invalid backup: missing table "${table}".` }
    const knownColumns = getTableColumns(table)
    prepared[table] = []
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return { error: `Invalid backup: each "${table}" row must be an object.` }
      }
      const cleanRow = {}
      for (const [column, value] of Object.entries(row)) {
        if (table === 'llm_settings' && LEGACY_DISCARDED_SETTINGS_FIELDS.has(column.toLowerCase())) continue
        if (isCredentialColumn(column) || !knownColumns.has(column)) {
          return { error: 'Invalid backup: credential data or unsupported fields are not accepted.' }
        }
        cleanRow[column] = value
      }
      prepared[table].push(cleanRow)
    }
  }
  return { rows: prepared }
}

function isCredentialColumn(column) {
  const normalized = column.toLowerCase().replace(/[^a-z]/g, '')
  return ['access', 'refresh', 'refreshtoken', 'token', 'credential', 'accountid', 'authorization', 'apikey'].includes(normalized)
}

router.get('/export', (_req, res) => {
  try {
    const result = {
      version: '1.0.0',
      exported_at: new Date().toISOString(),
    }

    for (const table of TABLES) {
      const rows = table === 'llm_settings'
        ? all('SELECT id, provider, model, reasoning_effort, created_at FROM llm_settings')
        : all(`SELECT * FROM ${table}`)
      result[table] = rows
    }

    return res.json(result)
  } catch (err) {
    console.error('Export error:', err.message)
    return res.status(500).json({ error: 'Failed to export data.' })
  }
})

router.post('/import', (req, res) => {
  try {
    const backup = req.body

    if (!backup || typeof backup !== 'object') {
      return res.status(400).json({ error: 'Invalid backup: must be a JSON object.' })
    }

    const requiredTables = [
      'topics', 'modules', 'lessons', 'progress', 'messages',
      'srs_queue', 'artifacts', 'llm_settings', 'mistakes_log', 'streaks',
      'quiz_attempts', 'exam_attempts',
    ]

    for (const table of requiredTables) {
      if (!(table in backup)) {
        return res.status(400).json({ error: `Invalid backup: missing table "${table}".` })
      }
      if (!Array.isArray(backup[table])) {
        return res.status(400).json({ error: `Invalid backup: "${table}" must be an array.` })
      }
    }

    const validated = prepareImportRows(backup)
    if (validated.error) return res.status(400).json({ error: validated.error })

    const counts = {}

    const tx = transaction(() => {
      // Clear all tables in reverse dependency order
      const clearOrder = [...TABLES].reverse()
      for (const table of clearOrder) {
        run(`DELETE FROM ${table}`)
      }

      // Reset sqlite_sequence for auto-increment tables
      const seqCheck = all("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'")
      if (seqCheck.length > 0) {
        const placeholders = TABLES.map(() => '?').join(', ')
        run(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`, ...TABLES)
      }

      // Insert data in dependency order
      for (const table of TABLES) {
        const rows = validated.rows[table]
        if (rows.length === 0) {
          counts[table] = 0
          continue
        }

        for (const row of rows) {
          const columns = Object.keys(row)
          if (columns.length === 0) {
            db.prepare(`INSERT INTO "${table}" DEFAULT VALUES`).run()
            continue
          }
          const columnSql = columns.map((column) => `"${column}"`).join(', ')
          const placeholders = columns.map(() => '?').join(', ')
          const insertSql = `INSERT INTO "${table}" (${columnSql}) VALUES (${placeholders})`
          db.prepare(insertSql).run(...columns.map((column) => row[column] ?? null))
        }

        counts[table] = rows.length
      }
    })

    tx()

    return res.json({ success: true, counts })
  } catch (err) {
    console.error('Import error:', err.message)
    return res.status(400).json({ error: 'Invalid backup data. No changes were imported.' })
  }
})

export default router
