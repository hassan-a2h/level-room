import { Router } from 'express'
import db, { all, run, transaction } from '../db.js'
import { normalizeLane } from '../utils/course-lineage.js'

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
  'course_links',
]

const REQUIRED_TABLES = TABLES.filter((table) => table !== 'course_links')
const SUPPORTED_BACKUP_VERSIONS = new Set(['1.0.0', '1.1.0'])

const LEGACY_DISCARDED_SETTINGS_FIELDS = new Set(['api_key'])

function getTableColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name))
}

function prepareImportRows(backup) {
  const prepared = {}
  for (const table of TABLES) {
    if (backup[table] !== undefined && !Array.isArray(backup[table])) {
      return { error: `Invalid backup: "${table}" must be an array.` }
    }
    const rows = backup[table] || []
    const knownColumns = getTableColumns(table)
    prepared[table] = []
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return { error: `Invalid backup: each "${table}" row must be an object.` }
      }
      const cleanRow = {}
      for (const [column, value] of Object.entries(row)) {
        if (table === 'quiz_attempts' && column === 'answer_key') {
          return { error: 'Invalid backup: private quiz answer keys are not accepted.' }
        }
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

function validateLineageRows(topics, links) {
  if (!Array.isArray(links)) return { error: 'Invalid backup: "course_links" must be an array.' }
  const topicIds = new Set(topics.map((topic) => topic.id))
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]))
  const topicOrder = new Map(topics.map((topic, index) => [topic.id, index]))
  const childIds = new Set()
  const laneKeys = new Set()
  const parentByChild = new Map()

  for (const [index, link] of links.entries()) {
    if (!link || typeof link !== 'object' || Array.isArray(link)) return { error: `Invalid backup: course_links row ${index + 1} is invalid.` }
    const { child_topic_id: childId, parent_topic_id: parentId } = link
    if (!topicIds.has(childId) || !topicIds.has(parentId)) return { error: 'Invalid backup: course_links reference missing topics.' }
    if (childId === parentId) return { error: 'Invalid backup: a course cannot link to itself.' }
    if (topicOrder.get(parentId) >= topicOrder.get(childId)) return { error: 'Invalid backup: parent topics must appear before child topics.' }
    if (childIds.has(childId)) return { error: 'Invalid backup: a child topic may have only one parent.' }
    childIds.add(childId)
    const lane = typeof link.lane === 'string' ? link.lane.trim().replace(/\s+/g, ' ') : ''
    const normalizedLane = normalizeLane(lane)
    if (!lane || !normalizedLane || link.normalized_lane !== normalizedLane) return { error: 'Invalid backup: course link lane is not canonical.' }
    const laneKey = `${parentId}:${normalizedLane}`
    if (laneKeys.has(laneKey)) return { error: 'Invalid backup: duplicate course lane.' }
    laneKeys.add(laneKey)
    parentByChild.set(childId, parentId)

    const child = topicsById.get(childId)
    const parent = topicsById.get(parentId)
    const childStage = Number(child?.course_stage ?? 0)
    const parentStage = Number(parent?.course_stage ?? 0)
    if (!Number.isInteger(childStage) || !Number.isInteger(parentStage) || childStage !== parentStage + 1) return { error: 'Invalid backup: course stages must increase by one along every link.' }
  }

  for (const childId of parentByChild.keys()) {
    const visited = new Set()
    let node = childId
    while (parentByChild.has(node)) {
      if (visited.has(node)) return { error: 'Invalid backup: course lineage contains a cycle.' }
      visited.add(node)
      node = parentByChild.get(node)
    }
  }
  return { valid: true }
}

function isUnresolvedMixedAttempt(row) {
  if (Number(row?.format_version || 1) !== 2) return false
  if (row?.evaluation === null || row?.evaluation === undefined || row?.evaluation === '') return true
  if (typeof row.evaluation === 'string' && row.evaluation.trim() === 'null') return true
  return false
}

function isCredentialColumn(column) {
  const normalized = column.toLowerCase().replace(/[^a-z]/g, '')
  return ['access', 'refresh', 'refreshtoken', 'token', 'credential', 'accountid', 'authorization', 'apikey'].includes(normalized)
}

router.get('/export', (_req, res) => {
  try {
    const result = {
      version: '1.1.0',
      exported_at: new Date().toISOString(),
    }

    for (const table of TABLES) {
      let rows
      if (table === 'llm_settings') {
        rows = all('SELECT id, provider, model, reasoning_effort, created_at FROM llm_settings')
      } else if (table === 'quiz_attempts') {
        rows = all('SELECT id, topic_id, lesson_id, questions, answers, evaluation, created_at, format_version FROM quiz_attempts')
      } else {
        rows = all(`SELECT * FROM ${table}`)
      }
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

    const version = typeof backup.version === 'string' ? backup.version : '1.0.0'
    if (!SUPPORTED_BACKUP_VERSIONS.has(version)) {
      return res.status(400).json({ error: 'Invalid backup: unsupported version.' })
    }

    for (const table of REQUIRED_TABLES) {
      if (!(table in backup)) {
        return res.status(400).json({ error: `Invalid backup: missing table "${table}".` })
      }
      if (!Array.isArray(backup[table])) {
        return res.status(400).json({ error: `Invalid backup: "${table}" must be an array.` })
      }
    }

    const validated = prepareImportRows(backup)
    if (validated.error) return res.status(400).json({ error: validated.error })

    const lineageValidation = validateLineageRows(validated.rows.topics, validated.rows.course_links)
    if (lineageValidation.error) return res.status(400).json({ error: lineageValidation.error })

    const unresolvedMixedPairs = new Set()
    validated.rows.quiz_attempts = validated.rows.quiz_attempts.filter((row) => {
      if (!isUnresolvedMixedAttempt(row)) return true
      unresolvedMixedPairs.add(`${row.topic_id}:${row.lesson_id}`)
      return false
    })
    for (const row of validated.rows.progress) {
      if (unresolvedMixedPairs.has(`${row.topic_id}:${row.lesson_id}`) && row.state === 'quiz_pending') row.state = 'practicing'
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
