import { get, run, all } from '../db.js'

/**
 * Constants for difficulty thresholds.
 */
export const DIFFICULTY_LEVELS = {
  SCAFFOLDED: 'scaffolded',
  NORMAL: 'normal',
  HARD: 'hard',
}

export const CONSECUTIVE_PASSES_FOR_HARD = 3
export const CONSECUTIVE_FAILS_FOR_SCAFFOLDED = 2

/**
 * Record the result of a lesson or review for a topic and compute
 * adaptive difficulty state.
 *
 * Logic:
 * - Track the last N lesson results for the topic in a running sequence.
 * - 3 consecutive passes (passed or tested_out) -> increase difficulty (hard).
 * - 2 consecutive failures (remediating / failed) -> add scaffolding (scaffolded).
 * - Mixed results or cleared streak -> normal.
 *
 * Difficulty persists until the streak changes.
 *
 * @param {number} topicId
 * @param {boolean} passed
 * @returns {{ difficulty: string, streak: number, changed: boolean, previousDifficulty: string }}
 */
export function recordResultAndComputeDifficulty(topicId, passed) {
  const existing = get(
    'SELECT id, difficulty, consecutive_passes, consecutive_fails FROM topics WHERE id = ?',
    topicId,
  )
  if (!existing) {
    throw new Error(`Topic ${topicId} not found`)
  }

  const prevDifficulty = existing.difficulty || DIFFICULTY_LEVELS.NORMAL
  let passes = existing.consecutive_passes || 0
  let fails = existing.consecutive_fails || 0

  if (passed) {
    passes = passes + 1
    fails = 0
  } else {
    fails = fails + 1
    passes = 0
  }

  let newDifficulty = DIFFICULTY_LEVELS.NORMAL
  if (passes >= CONSECUTIVE_PASSES_FOR_HARD) {
    newDifficulty = DIFFICULTY_LEVELS.HARD
  } else if (fails >= CONSECUTIVE_FAILS_FOR_SCAFFOLDED) {
    newDifficulty = DIFFICULTY_LEVELS.SCAFFOLDED
  }

  run(
    'UPDATE topics SET difficulty = ?, consecutive_passes = ?, consecutive_fails = ? WHERE id = ?',
    newDifficulty,
    passes,
    fails,
    topicId,
  )

  return {
    difficulty: newDifficulty,
    streak: passed ? passes : fails,
    changed: newDifficulty !== prevDifficulty,
    previousDifficulty: prevDifficulty,
  }
}

/**
 * Get the current difficulty for a topic.
 * @param {number} topicId
 * @returns {{ difficulty: string, consecutive_passes: number, consecutive_fails: number }}
 */
export function getTopicDifficulty(topicId) {
  const row = get(
    'SELECT difficulty, consecutive_passes, consecutive_fails FROM topics WHERE id = ?',
    topicId,
  )
  if (!row) {
    return { difficulty: DIFFICULTY_LEVELS.NORMAL, consecutive_passes: 0, consecutive_fails: 0 }
  }
  return {
    difficulty: row.difficulty || DIFFICULTY_LEVELS.NORMAL,
    consecutive_passes: row.consecutive_passes || 0,
    consecutive_fails: row.consecutive_fails || 0,
  }
}

/**
 * Build a difficulty instruction string to inject into lesson/system prompts.
 * @param {number} topicId
 * @param {string|null} baseSystemPrompt
 * @returns {string}
 */
export function buildDifficultyInstruction(topicId, baseSystemPrompt = '') {
  const { difficulty, consecutive_passes, consecutive_fails } = getTopicDifficulty(topicId)
  const parts = [baseSystemPrompt]

  if (difficulty === DIFFICULTY_LEVELS.HARD) {
    parts.push(`The learner has demonstrated strong mastery recently (${consecutive_passes} consecutive passes). Challenge them with more complex problems, edge cases, and deeper synthesis. Do NOT simplify — expect fluency.`)
  } else if (difficulty === DIFFICULTY_LEVELS.SCAFFOLDED) {
    parts.push(`The learner is currently struggling (${consecutive_fails} consecutive failures). Provide simpler explanations, extra examples, and more step-by-step scaffolding. Be encouraging and break concepts into smaller pieces.`)
  }

  const recurring = all(
    'SELECT description FROM mistakes_log WHERE topic_id = ? AND recurring = 1 AND cleared_after < 2',
    topicId,
  )
  if (recurring.length > 0) {
    const gapsList = recurring.map((r) => `- ${r.description}`).join('\n')
    parts.push(`Known recurring weak areas for this learner (proactively address these in future explanations and questions):\n${gapsList}`)
  }

  return parts.filter(Boolean).join('\n\n')
}
