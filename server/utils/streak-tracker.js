import { get, run, transaction } from '../db.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validate a YYYY-MM-DD string.
 * @param {string} dateStr
 * @returns {boolean}
 */
export function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false
  if (!DATE_RE.test(dateStr)) return false
  const d = new Date(dateStr + 'T00:00:00')
  return !Number.isNaN(d.getTime())
}

/**
 * Parse a YYYY-MM-DD into a UTC timestamp at midnight.
 * @param {string} dateStr
 * @returns {number}
 */
export function parseDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').getTime()
}

/**
 * Compute the difference in calendar days between two YYYY-MM-DD strings.
 * Positive when dateB is after dateA.
 * @param {string} dateA
 * @param {string} dateB
 * @returns {number}
 */
export function daysBetween(dateA, dateB) {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((parseDate(dateB) - parseDate(dateA)) / msPerDay)
}

/**
 * Compute streak update from previous state and today's local date.
 * @param {string|null} lastActiveDate
 * @param {string} today
 * @param {number} currentStreak
 * @param {number} maxStreak
 * @returns {{ currentStreak: number, maxStreak: number, lastActiveDate: string, changed: boolean, streakBroken: boolean }}
 */
export function computeStreakUpdate(lastActiveDate, today, currentStreak, maxStreak) {
  if (!lastActiveDate) {
    return {
      currentStreak: 1,
      maxStreak: Math.max(1, maxStreak),
      lastActiveDate: today,
      changed: true,
      streakBroken: false,
    }
  }

  const diff = daysBetween(lastActiveDate, today)

  // Same day: no change
  if (diff === 0) {
    return {
      currentStreak,
      maxStreak: Math.max(currentStreak, maxStreak),
      lastActiveDate: today,
      changed: false,
      streakBroken: false,
    }
  }

  // Consecutive day (exactly +1)
  if (diff === 1) {
    const nextStreak = currentStreak + 1
    return {
      currentStreak: nextStreak,
      maxStreak: Math.max(nextStreak, maxStreak),
      lastActiveDate: today,
      changed: true,
      streakBroken: false,
    }
  }

  // Gap of 2+ days: reset
  return {
    currentStreak: 1,
    maxStreak: Math.max(currentStreak, maxStreak),
    lastActiveDate: today,
    changed: true,
    streakBroken: true,
  }
}

/**
 * Record a mastery event atomically in the database.
 * Uses a transaction so concurrent writes serialize safely (better-sqlite3 WAL locking).
 * @param {string} localDate YYYY-MM-DD in the user's local timezone
 * @returns {{ currentStreak: number, maxStreak: number, lastActiveDate: string, changed: boolean, streakBroken: boolean }}
 */
export function recordMasteryEvent(localDate) {
  if (!isValidDate(localDate)) {
    throw new Error(`Invalid date format: expected YYYY-MM-DD, got "${localDate}"`)
  }

  const tx = transaction((_localDate) => {
    let row = get('SELECT id, current_streak, max_streak, last_active_date FROM streaks LIMIT 1')

    if (!row) {
      run(
        'INSERT INTO streaks (current_streak, max_streak, last_active_date) VALUES (?, ?, ?)',
        1, 1, _localDate,
      )
      return {
        currentStreak: 1,
        maxStreak: 1,
        lastActiveDate: _localDate,
        changed: true,
        streakBroken: false,
      }
    }

    const update = computeStreakUpdate(
      row.last_active_date,
      _localDate,
      row.current_streak,
      row.max_streak,
    )

    if (update.changed) {
      run(
        'UPDATE streaks SET current_streak = ?, max_streak = ?, last_active_date = ? WHERE id = ?',
        update.currentStreak,
        update.maxStreak,
        update.lastActiveDate,
        row.id,
      )
    }

    return update
  })

  return tx(localDate)
}

/**
 * Get the current streak state.
 * @param {string|null} today YYYY-MM-DD or null to auto-compute from UTC
 * @returns {{ currentStreak: number, maxStreak: number, lastActiveDate: string|null, daysSince: number|null, streakBroken: boolean, backlog: boolean, message: string }}
 */
export function getStreakState(today) {
  const todayStr = today || new Date().toISOString().split('T')[0]
  const row = get('SELECT id, current_streak, max_streak, last_active_date FROM streaks LIMIT 1')

  if (!row || !row.last_active_date) {
    return {
      currentStreak: 0,
      maxStreak: 0,
      lastActiveDate: null,
      daysSince: null,
      streakBroken: false,
      backlog: false,
      message: 'Start your learning streak today!',
    }
  }

  const diff = daysBetween(row.last_active_date, todayStr)
  const streakBroken = diff >= 2
  const backlog = diff >= 7

  let message
  if (streakBroken) {
    message = `Your ${row.current_streak}-day streak was broken. No pressure — pick up where you left off!`
  } else if (row.current_streak === 0) {
    message = 'Start your learning streak today!'
  } else if (diff === 0) {
    message = `${row.current_streak}-day streak — great work today!`
  } else {
    message = `${row.current_streak}-day streak — keep it going!`
  }

  return {
    currentStreak: row.current_streak,
    maxStreak: row.max_streak,
    lastActiveDate: row.last_active_date,
    daysSince: diff,
    streakBroken,
    backlog,
    message,
  }
}
