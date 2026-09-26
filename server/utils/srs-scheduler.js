import { get, run, all, transaction } from '../db.js'

const SRS_INTERVALS = [1, 3, 7, 14, 30]

/**
 * Get the interval in days for a given interval index.
 * @param {number} intervalIndex
 * @returns {number}
 */
export function getIntervalDays(intervalIndex) {
  if (intervalIndex < 0) return SRS_INTERVALS[0]
  if (intervalIndex >= SRS_INTERVALS.length) return SRS_INTERVALS[SRS_INTERVALS.length - 1]
  return SRS_INTERVALS[intervalIndex]
}

/**
 * Compute the next due date given an interval index.
 * @param {number} intervalIndex
 * @returns {string} YYYY-MM-DD
 */
export function computeDueDate(intervalIndex) {
  const days = getIntervalDays(intervalIndex)
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

/**
 * Schedule an SRS review item for a lesson if one does not already exist.
 * If an existing pending item exists, it is updated (no duplicate rows).
 * @param {number} topicId
 * @param {number} lessonId
 * @returns {boolean}
 */
export function scheduleSrs(topicId, lessonId) {
  const existing = get(
    'SELECT id, interval_index FROM srs_queue WHERE topic_id = ? AND lesson_id = ? AND status = ?',
    topicId,
    lessonId,
    'pending',
  )
  if (!existing) {
    const dueDate = computeDueDate(0)
    run(
      'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status, review_type) VALUES (?, ?, ?, ?, ?, ?)',
      topicId,
      lessonId,
      0,
      dueDate,
      'pending',
      'lesson',
    )
    return true
  }
  return false
}

/**
 * Remove all SRS items for a lesson.
 * @param {number} topicId
 * @param {number} lessonId
 */
export function removeSrs(topicId, lessonId) {
  run('DELETE FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
}

/**
 * Update the SRS interval after a review.
 * @param {number} topicId
 * @param {number} lessonId
 * @param {number} scorePercentage 0-100
 * @returns {{ intervalIndex: number, dueDate: string, accelerated: boolean, regressed: boolean }}
 */
export function updateSrsAfterReview(topicId, lessonId, scorePercentage) {
  const existing = get(
    'SELECT id, interval_index FROM srs_queue WHERE topic_id = ? AND lesson_id = ? AND status = ?',
    topicId,
    lessonId,
    'pending',
  )
  if (!existing) {
    throw new Error('No pending SRS item found for this lesson')
  }

  let intervalIndex = existing.interval_index
  let accelerated = false
  let regressed = false

  if (scorePercentage >= 95) {
    // Accelerate: jump one extra step
    intervalIndex = Math.min(intervalIndex + 2, SRS_INTERVALS.length - 1)
    accelerated = true
  } else if (scorePercentage >= 80) {
    // Normal pass: advance one step
    intervalIndex = Math.min(intervalIndex + 1, SRS_INTERVALS.length - 1)
  } else {
    // Fail: regress one step
    intervalIndex = Math.max(intervalIndex - 1, 0)
    regressed = true
  }

  const dueDate = computeDueDate(intervalIndex)
  const now = new Date().toISOString()

  run(
    `UPDATE srs_queue SET interval_index = ?, due_date = ?, last_reviewed = ?, score = ?, status = ? WHERE id = ?`,
    intervalIndex,
    dueDate,
    now,
    scorePercentage,
    'pending',
    existing.id,
  )

  return { intervalIndex, dueDate, accelerated, regressed }
}

/**
 * Schedule cumulative reviews for a module after exam pass.
 * These are module-level reviews (lesson_id IS NULL) at 7d and 30d.
 * @param {number} topicId
 * @param {number} moduleId
 */
export function scheduleCumulativeReviews(topicId, moduleId) {
  const moduleRow = get('SELECT title FROM modules WHERE id = ?', moduleId)
  if (!moduleRow) return

  const now = new Date()
  const day7 = new Date(now)
  day7.setDate(day7.getDate() + 7)
  const day30 = new Date(now)
  day30.setDate(day30.getDate() + 30)

  // Remove any existing cumulative reviews for this module
  run(
    'DELETE FROM srs_queue WHERE topic_id = ? AND module_id = ? AND review_type = ?',
    topicId,
    moduleId,
    'cumulative',
  )

  run(
    'INSERT INTO srs_queue (topic_id, lesson_id, module_id, interval_index, due_date, status, review_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
    topicId,
    null,
    moduleId,
    2, // 7d interval
    day7.toISOString().split('T')[0],
    'pending',
    'cumulative',
  )

  run(
    'INSERT INTO srs_queue (topic_id, lesson_id, module_id, interval_index, due_date, status, review_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
    topicId,
    null,
    moduleId,
    4, // 30d interval
    day30.toISOString().split('T')[0],
    'pending',
    'cumulative',
  )
}

/**
 * Get all due SRS items.
 * @returns {Array<object>}
 */
export function getDueItems() {
  const today = new Date().toISOString().split('T')[0]
  return all(
    `SELECT sq.id, sq.topic_id, sq.lesson_id, sq.module_id, sq.interval_index, sq.due_date,
            sq.status, sq.review_type,
            t.title as topic_title,
            l.title as lesson_title,
            m.title as module_title
     FROM srs_queue sq
     LEFT JOIN topics t ON sq.topic_id = t.id
     LEFT JOIN lessons l ON sq.lesson_id = l.id
     LEFT JOIN modules m ON sq.module_id = m.id
     WHERE sq.status = ? AND sq.due_date <= ?
     ORDER BY sq.due_date ASC, sq.id ASC`,
    'pending',
    today,
  )
}

/**
 * Get due items count (today + overdue).
 * @returns {{ dueToday: number, overdue: number, totalDue: number }}
 */
export function getDueCounts() {
  const today = new Date().toISOString().split('T')[0]
  const rows = all(
    `SELECT due_date FROM srs_queue WHERE status = ? AND due_date <= ?`,
    'pending',
    today,
  )
  const dueToday = rows.filter((r) => r.due_date === today).length
  const overdue = rows.filter((r) => r.due_date < today).length
  return { dueToday, overdue, totalDue: rows.length }
}
