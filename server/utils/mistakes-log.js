import { get, run, all } from '../db.js'

/**
 * Log a mistake (gap) for a topic/lesson.
 * If the same description already exists as an active mistake, mark it as recurring
 * and reset its cleared_after counter.
 * @returns {{ id: number, recurring: number, wasNew: boolean }}
 */
export function logMistake(topicId, lessonId, description) {
  const existing = get(
    'SELECT id, recurring, cleared_after FROM mistakes_log WHERE topic_id = ? AND description = ? AND cleared_after < 2',
    topicId,
    description,
  )
  if (existing) {
    run(
      'UPDATE mistakes_log SET recurring = 1, cleared_after = 0, lesson_id = ? WHERE id = ?',
      lessonId,
      existing.id,
    )
    return { id: existing.id, recurring: 1, wasNew: false }
  }
  const result = run(
    'INSERT INTO mistakes_log (topic_id, lesson_id, description, recurring, cleared_after) VALUES (?, ?, ?, ?, ?)',
    topicId,
    lessonId,
    description,
    0,
    0,
  )
  return { id: result.lastInsertRowid, recurring: 0, wasNew: true }
}

/**
 * Update mistakes after a lesson/quiz result.
 * On pass: increments cleared_after for active mistakes not in current gaps.
 *           Resets cleared_after for mistakes that ARE in current gaps.
 *           When cleared_after reaches 2, the mistake is considered cleared.
 * On fail: resets cleared_after for ALL active mistakes (failure breaks
 *          consecutive success streak). Logs new gaps.
 *
 * @param {number} topicId
 * @param {number} lessonId
 * @param {boolean} passed
 * @param {string[]} gaps - gap descriptions from the current evaluation
 */
export function updateMistakesAfterResult(topicId, lessonId, passed, gaps = []) {
  const activeMistakes = all(
    'SELECT id, description, cleared_after FROM mistakes_log WHERE topic_id = ? AND cleared_after < 2',
    topicId,
  )

  if (!passed) {
    // Failure breaks consecutive-success streak for ALL active mistakes
    for (const mistake of activeMistakes) {
      run('UPDATE mistakes_log SET cleared_after = 0 WHERE id = ?', mistake.id)
    }
    // Log any new gaps from this failure
    for (const gap of gaps) {
      logMistake(topicId, lessonId, gap)
    }
    return
  }

  // Passed: increment cleared_after for mistakes not in current gaps;
  // reset for mistakes that reappear in the current evaluation
  for (const mistake of activeMistakes) {
    if (gaps.includes(mistake.description)) {
      // The gap is still present even though the lesson passed — reset progress
      run('UPDATE mistakes_log SET cleared_after = 0 WHERE id = ?', mistake.id)
    } else {
      const newClearedAfter = (mistake.cleared_after || 0) + 1
      if (newClearedAfter >= 2) {
        // Cleared: keep row but mark inactive via cleared_after = 2
        run(
          'UPDATE mistakes_log SET recurring = 0, cleared_after = 2 WHERE id = ?',
          mistake.id,
        )
      } else {
        run('UPDATE mistakes_log SET cleared_after = ? WHERE id = ?', newClearedAfter, mistake.id)
      }
    }
  }
}

/**
 * Get active (not fully cleared) mistakes for a topic.
 * @returns {Array<{id:number, lesson_id:number|null, description:string, recurring:number, cleared_after:number, created_at:string}>}
 */
export function getActiveMistakes(topicId) {
  return all(
    'SELECT id, lesson_id, description, recurring, cleared_after, created_at FROM mistakes_log WHERE topic_id = ? AND cleared_after < 2 ORDER BY recurring DESC, created_at DESC',
    topicId,
  )
}

/**
 * Get recurring (active and recurring) mistakes for a topic.
 * @returns {Array<{id:number, lesson_id:number|null, description:string, recurring:number, cleared_after:number, created_at:string}>}
 */
export function getRecurringMistakes(topicId) {
  return all(
    'SELECT id, lesson_id, description, recurring, cleared_after, created_at FROM mistakes_log WHERE topic_id = ? AND recurring = 1 AND cleared_after < 2 ORDER BY created_at DESC',
    topicId,
  )
}
