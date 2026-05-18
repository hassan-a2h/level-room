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
]

router.get('/export', (_req, res) => {
  try {
    const result = {
      version: '1.0.0',
      exported_at: new Date().toISOString(),
    }

    for (const table of TABLES) {
      const rows = all(`SELECT * FROM ${table}`)
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
        const rows = backup[table]
        if (rows.length === 0) {
          counts[table] = 0
          continue
        }

        const columns = Object.keys(rows[0]).filter((col) => col !== 'api_key')

        const placeholders = columns.map(() => '?').join(', ')
        const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
        const stmt = db.prepare(insertSql)

        for (const row of rows) {
          const values = columns.map((col) => row[col] ?? null)
          stmt.run(...values)
        }

        counts[table] = rows.length
      }
    })

    tx()

    return res.json({ success: true, counts })
  } catch (err) {
    console.error('Import error:', err.message)
    return res.status(500).json({ error: 'Failed to import data: ' + err.message })
  }
})

export default router
