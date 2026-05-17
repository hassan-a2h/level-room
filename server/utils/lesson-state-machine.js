import { get, run, transaction } from '../db.js'
import { updateMistakesAfterResult } from './mistakes-log.js'
import { recordResultAndComputeDifficulty } from './adaptive-difficulty.js'

const SRS_INTERVALS = [1, 3, 7, 14, 30]

export const STATES = {
  NOT_STARTED: 'not_started',
  PRACTICING: 'practicing',
  QUIZ_PENDING: 'quiz_pending',
  REMEDIATING: 'remediating',
  PASSED: 'passed',
  TESTED_OUT: 'tested_out',
  SKIPPED: 'skipped',
}

const TERMINAL_STATES = new Set([
  STATES.PASSED,
  STATES.TESTED_OUT,
  STATES.SKIPPED,
])

const ALLOWED_TRANSITIONS = {
  [STATES.NOT_STARTED]: [STATES.PRACTICING, STATES.SKIPPED, STATES.TESTED_OUT],
  [STATES.PRACTICING]: [STATES.QUIZ_PENDING, STATES.SKIPPED, STATES.TESTED_OUT],
  [STATES.QUIZ_PENDING]: [STATES.PASSED, STATES.REMEDIATING, STATES.SKIPPED],
  [STATES.REMEDIATING]: [STATES.QUIZ_PENDING, STATES.SKIPPED],
}

export class StateMachineError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'StateMachineError'
    this.code = code
  }
}

export function isValidState(state) {
  return Object.values(STATES).includes(state)
}

export function canTransition(from, to) {
  if (!isValidState(from) || !isValidState(to)) return false
  if (TERMINAL_STATES.has(from)) return false
  const allowed = ALLOWED_TRANSITIONS[from] || []
  return allowed.includes(to)
}

export function getValidTransitions(from) {
  if (!isValidState(from)) return []
  if (TERMINAL_STATES.has(from)) return []
  return [...(ALLOWED_TRANSITIONS[from] || [])]
}

/**
 * Check if a lesson's prerequisites are met.
 * @param {number} topicId
 * @param {number} lessonId
 * @returns {{ locked: boolean, unmet: Array<{lessonId:number,title:string}>, lessonNotFound?: boolean, lessonTitle?: string }}
 */
export function checkPrerequisites(topicId, lessonId) {
  const lesson = get(
    `SELECT l.prerequisites, l.title
     FROM lessons l
     JOIN modules m ON l.module_id = m.id
     WHERE l.id = ? AND m.topic_id = ?`,
    lessonId,
    topicId,
  )

  if (!lesson) {
    return { locked: true, unmet: [], lessonNotFound: true }
  }

  let prerequisites = []
  try {
    prerequisites = lesson.prerequisites ? JSON.parse(lesson.prerequisites) : []
  } catch {
    prerequisites = []
  }

  const unmet = []
  for (const pr of prerequisites) {
    const prereqProg = get(
      'SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?',
      topicId,
      pr.lessonId,
    )
    if (!prereqProg || !['passed', 'tested_out'].includes(prereqProg.state)) {
      unmet.push({ lessonId: pr.lessonId, title: pr.title })
    }
  }

  return { locked: unmet.length > 0, unmet, lessonTitle: lesson.title }
}

/**
 * Schedule an SRS review item for a lesson if one does not already exist.
 */
export function scheduleSrs(topicId, lessonId) {
  const existing = get(
    'SELECT id FROM srs_queue WHERE topic_id = ? AND lesson_id = ? AND status = ?',
    topicId,
    lessonId,
    'pending',
  )
  if (!existing) {
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + SRS_INTERVALS[0])
    run(
      'INSERT INTO srs_queue (topic_id, lesson_id, interval_index, due_date, status) VALUES (?, ?, ?, ?, ?)',
      topicId,
      lessonId,
      0,
      dueDate.toISOString().split('T')[0],
      'pending',
    )
    return true
  }
  return false
}

/**
 * Remove all SRS items for a lesson (defensive cleanup).
 */
export function removeSrs(topicId, lessonId) {
  run('DELETE FROM srs_queue WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
}

/**
 * Get the current progress row for a lesson.
 */
export function getProgress(topicId, lessonId) {
  return get(
    'SELECT id, state, quiz_score, quiz_attempts, artifact_passed, started_at, completed_at, current_chunk, total_chunks FROM progress WHERE topic_id = ? AND lesson_id = ?',
    topicId,
    lessonId,
  )
}

/**
 * Atomically transition a lesson to a new state.
 * @returns {{ fromState: string, toState: string, progressId: number }}
 */
export function transitionState({ topicId, lessonId, toState, updates = {} }) {
  if (!isValidState(toState)) {
    throw new StateMachineError(`Invalid target state: ${toState}`, 'INVALID_STATE')
  }

  const tx = transaction((_topicId, _lessonId, _toState, _updates) => {
    const progress = get(
      'SELECT id, state, quiz_score, quiz_attempts, artifact_passed, started_at, completed_at, current_chunk, total_chunks FROM progress WHERE topic_id = ? AND lesson_id = ?',
      _topicId,
      _lessonId,
    )

    const fromState = progress ? progress.state : STATES.NOT_STARTED

    if (!canTransition(fromState, _toState)) {
      throw new StateMachineError(
        `Cannot transition from ${fromState} to ${_toState}`,
        'INVALID_TRANSITION',
      )
    }

    if (_toState === STATES.PRACTICING && fromState === STATES.NOT_STARTED) {
      const prereq = checkPrerequisites(_topicId, _lessonId)
      if (prereq.locked) {
        throw new StateMachineError(
          `Prerequisites not met: ${prereq.unmet.map((u) => u.title).join(', ')}`,
          'PREREQUISITES_NOT_MET',
        )
      }
    }

    const now = new Date().toISOString()

    const quizScore = _updates.quizScore !== undefined ? _updates.quizScore : progress ? progress.quiz_score : null
    const quizAttempts =
      (progress ? progress.quiz_attempts || 0 : 0) + (_updates.incrementQuizAttempts ? 1 : 0)
    const artifactPassed =
      _updates.artifactPassed !== undefined
        ? _updates.artifactPassed
        : progress
          ? progress.artifact_passed
          : 0

    const isActiveState = ![STATES.NOT_STARTED, STATES.SKIPPED].includes(_toState)
    const startedAt =
      (!progress || !progress.started_at) && isActiveState ? now : null
    const completedAt = TERMINAL_STATES.has(_toState) ? now : null

    if (!progress) {
      const result = run(
        `INSERT INTO progress (topic_id, lesson_id, state, quiz_score, quiz_attempts, artifact_passed, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        _topicId,
        _lessonId,
        _toState,
        quizScore,
        quizAttempts,
        artifactPassed,
        startedAt,
        completedAt,
      )

      if (_toState === STATES.PASSED || _toState === STATES.TESTED_OUT) {
        scheduleSrs(_topicId, _lessonId)
      }

      return { fromState, toState: _toState, progressId: result.lastInsertRowid }
    }

    run(
      `UPDATE progress SET state = ?, quiz_score = ?, quiz_attempts = ?, artifact_passed = ?, started_at = coalesce(?, started_at), completed_at = ? WHERE id = ?`,
      _toState,
      quizScore,
      quizAttempts,
      artifactPassed,
      startedAt,
      completedAt,
      progress.id,
    )

    if (_toState === STATES.PASSED || _toState === STATES.TESTED_OUT) {
      scheduleSrs(_topicId, _lessonId)
    }

    return { fromState, toState: _toState, progressId: progress.id }
  })

  return tx(topicId, lessonId, toState, updates)
}

/**
 * Start practicing a lesson (not_started -> practicing).
 * Also initializes chunk tracking.
 */
export function startPracticing({ topicId, lessonId, currentChunk = 1, totalChunks = 3 }) {
  const tx = transaction((_topicId, _lessonId, _currentChunk, _totalChunks) => {
    const prereq = checkPrerequisites(_topicId, _lessonId)
    if (prereq.locked) {
      throw new StateMachineError('Prerequisites not met', 'PREREQUISITES_NOT_MET')
    }

    const progress = get(
      'SELECT id, state, started_at FROM progress WHERE topic_id = ? AND lesson_id = ?',
      _topicId,
      _lessonId,
    )
    const fromState = progress ? progress.state : STATES.NOT_STARTED

    if (!canTransition(fromState, STATES.PRACTICING)) {
      throw new StateMachineError(
        `Cannot start practicing from ${fromState}`,
        'INVALID_TRANSITION',
      )
    }

    const now = new Date().toISOString()

    if (!progress) {
      const result = run(
        'INSERT INTO progress (topic_id, lesson_id, state, started_at, current_chunk, total_chunks) VALUES (?, ?, ?, ?, ?, ?)',
        _topicId,
        _lessonId,
        STATES.PRACTICING,
        now,
        _currentChunk,
        _totalChunks,
      )
      return { fromState, toState: STATES.PRACTICING, progressId: result.lastInsertRowid }
    }

    run(
      'UPDATE progress SET state = ?, started_at = coalesce(?, started_at), current_chunk = ?, total_chunks = ? WHERE id = ?',
      STATES.PRACTICING,
      now,
      _currentChunk,
      _totalChunks,
      progress.id,
    )
    return { fromState, toState: STATES.PRACTICING, progressId: progress.id }
  })

  return tx(topicId, lessonId, currentChunk, totalChunks)
}

/**
 * Transition from practicing to quiz_pending (start a quiz).
 */
export function startQuiz({ topicId, lessonId }) {
  const tx = transaction((_topicId, _lessonId) => {
    const progress = get(
      'SELECT id, state FROM progress WHERE topic_id = ? AND lesson_id = ?',
      _topicId,
      _lessonId,
    )
    if (!progress || progress.state !== STATES.PRACTICING) {
      throw new StateMachineError(
        'Lesson must be in practicing state to start a quiz',
        'INVALID_STATE',
      )
    }
    run('UPDATE progress SET state = ? WHERE id = ?', STATES.QUIZ_PENDING, progress.id)
    return { fromState: progress.state, toState: STATES.QUIZ_PENDING, progressId: progress.id }
  })

  return tx(topicId, lessonId)
}

/**
 * Check if a lesson requires an artifact.
 * @param {number} lessonId
 * @returns {{ required: boolean, type: string|null }}
 */
export function getArtifactRequirement(lessonId) {
  const lesson = get('SELECT artifact_required, artifact_type FROM lessons WHERE id = ?', lessonId)
  return {
    required: !!lesson?.artifact_required,
    type: lesson?.artifact_type || null,
  }
}

/**
 * Record a quiz result and transition state atomically.
 * For lessons requiring an artifact, the lesson only transitions to passed
 * when BOTH quiz and artifact are passed.
 * @returns {{ fromState: string, toState: string, progressId: number }}
 */
export function recordQuizResult({ topicId, lessonId, passed, quizScore, answers, evaluation, attemptId }) {
  const tx = transaction((_topicId, _lessonId, _passed, _quizScore, _answers, _evaluation, _attemptId) => {
    const progress = get(
      'SELECT id, state, quiz_attempts, remediation_attempts, last_gaps, artifact_passed FROM progress WHERE topic_id = ? AND lesson_id = ?',
      _topicId,
      _lessonId,
    )
    if (!progress || progress.state !== STATES.QUIZ_PENDING) {
      throw new StateMachineError(
        'Lesson must be in quiz_pending state to record a quiz result',
        'INVALID_STATE',
      )
    }

    const artifactReq = getArtifactRequirement(_lessonId)
    const artifactPassed = !!progress.artifact_passed
    const canComplete = _passed && (!artifactReq.required || artifactPassed)

    const newState = canComplete ? STATES.PASSED : STATES.REMEDIATING
    const completedAt = canComplete ? new Date().toISOString() : null
    const gaps = Array.isArray(_evaluation?.gaps) ? _evaluation.gaps : []
    const gapsJson = JSON.stringify(gaps)
    const newRemediationAttempts = canComplete ? (progress.remediation_attempts || 0) : (progress.remediation_attempts || 0) + 1

    run(
      `UPDATE progress SET state = ?, quiz_score = ?, quiz_attempts = quiz_attempts + 1, completed_at = ?, remediation_attempts = ?, last_gaps = ? WHERE id = ?`,
      newState,
      _quizScore,
      completedAt,
      newRemediationAttempts,
      gapsJson,
      progress.id,
    )

    // Update mistakes log and adaptive difficulty
    updateMistakesAfterResult(_topicId, _lessonId, canComplete, gaps)
    try {
      recordResultAndComputeDifficulty(_topicId, canComplete)
    } catch (diffErr) {
      console.error('Adaptive difficulty error:', diffErr.message)
    }

    if (canComplete) {
      scheduleSrs(_topicId, _lessonId)
    }

    if (_attemptId) {
      run(
        'UPDATE quiz_attempts SET answers = ?, evaluation = ? WHERE id = ?',
        JSON.stringify(_answers),
        JSON.stringify(_evaluation),
        _attemptId,
      )
    }

    return { fromState: progress.state, toState: newState, progressId: progress.id }
  })

  return tx(topicId, lessonId, passed, quizScore, answers, evaluation, attemptId)
}

/**
 * Record an artifact evaluation result.
 * If the artifact passes and the quiz was already passed, transition to passed.
 * Otherwise, just mark artifact_passed on the progress row.
 * @returns {{ passed: boolean, stateChanged: boolean, fromState?: string, toState?: string }}
 */
export function recordArtifactResult({ topicId, lessonId, artifactPassed, quizScore }) {
  const tx = transaction((_topicId, _lessonId, _artifactPassed, _quizScore) => {
    const progress = get(
      'SELECT id, state, quiz_score, artifact_passed FROM progress WHERE topic_id = ? AND lesson_id = ?',
      _topicId,
      _lessonId,
    )

    const fromState = progress ? progress.state : STATES.NOT_STARTED

    if (_artifactPassed) {
      const canComplete = _quizScore !== null && _quizScore >= 80
      if (canComplete) {
        // Transition to passed (from any active state)
        if (!progress) {
          const now = new Date().toISOString()
          const result = run(
            'INSERT INTO progress (topic_id, lesson_id, state, quiz_score, artifact_passed, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            _topicId,
            _lessonId,
            STATES.PASSED,
            _quizScore,
            1,
            now,
            now,
          )
          scheduleSrs(_topicId, _lessonId)
          return { passed: true, stateChanged: true, fromState: STATES.NOT_STARTED, toState: STATES.PASSED, progressId: result.lastInsertRowid }
        }

        run(
          'UPDATE progress SET state = ?, artifact_passed = 1, completed_at = ? WHERE id = ?',
          STATES.PASSED,
          new Date().toISOString(),
          progress.id,
        )
        scheduleSrs(_topicId, _lessonId)
        return { passed: true, stateChanged: true, fromState: progress.state, toState: STATES.PASSED, progressId: progress.id }
      }
    }

    // Just record artifact_passed; do not change state
    if (!progress) {
      run(
        'INSERT INTO progress (topic_id, lesson_id, state, artifact_passed, started_at) VALUES (?, ?, ?, ?, ?)',
        _topicId,
        _lessonId,
        fromState,
        _artifactPassed ? 1 : 0,
        new Date().toISOString(),
      )
    } else {
      run(
        'UPDATE progress SET artifact_passed = ? WHERE id = ?',
        _artifactPassed ? 1 : 0,
        progress.id,
      )
    }

    return { passed: _artifactPassed, stateChanged: false }
  })

  return tx(topicId, lessonId, artifactPassed, quizScore)
}

/**
 * Skip a lesson.
 */
export function skipLesson({ topicId, lessonId }) {
  const tx = transaction((_topicId, _lessonId) => {
    const progress = get(
      'SELECT id, state FROM progress WHERE topic_id = ? AND lesson_id = ?',
      _topicId,
      _lessonId,
    )
    const fromState = progress ? progress.state : STATES.NOT_STARTED

    if (!canTransition(fromState, STATES.SKIPPED)) {
      throw new StateMachineError(
        `Cannot skip from ${fromState}`,
        'INVALID_TRANSITION',
      )
    }

    const now = new Date().toISOString()

    if (!progress) {
      const result = run(
        'INSERT INTO progress (topic_id, lesson_id, state, completed_at) VALUES (?, ?, ?, ?)',
        _topicId,
        _lessonId,
        STATES.SKIPPED,
        now,
      )
      removeSrs(_topicId, _lessonId)
      return { fromState, toState: STATES.SKIPPED, progressId: result.lastInsertRowid }
    }

    run(
      'UPDATE progress SET state = ?, completed_at = ? WHERE id = ?',
      STATES.SKIPPED,
      now,
      progress.id,
    )
    removeSrs(_topicId, _lessonId)
    return { fromState, toState: STATES.SKIPPED, progressId: progress.id }
  })

  return tx(topicId, lessonId)
}

/**
 * Start a test-out diagnostic. Returns the current state so the caller can restore on failure.
 */
export function startTestOut({ topicId, lessonId }) {
  const tx = transaction((_topicId, _lessonId) => {
    const prereq = checkPrerequisites(_topicId, _lessonId)
    if (prereq.locked) {
      throw new StateMachineError('Prerequisites not met', 'PREREQUISITES_NOT_MET')
    }

    const progress = get(
      'SELECT id, state FROM progress WHERE topic_id = ? AND lesson_id = ?',
      _topicId,
      _lessonId,
    )
    const fromState = progress ? progress.state : STATES.NOT_STARTED

    const allowed = [STATES.NOT_STARTED, STATES.PRACTICING, STATES.QUIZ_PENDING, STATES.REMEDIATING]
    if (!allowed.includes(fromState)) {
      throw new StateMachineError(
        `Cannot test-out from ${fromState}`,
        'INVALID_TRANSITION',
      )
    }

    return { fromState, progressId: progress ? progress.id : null }
  })

  return tx(topicId, lessonId)
}

/**
 * Finish a test-out diagnostic.
 * On pass: transition to tested_out and schedule SRS.
 * On fail: keep the current state, just record the attempt score.
 */
export function finishTestOut({ topicId, lessonId, passed, quizScore, answers, evaluation, attemptId }) {
  const tx = transaction((_topicId, _lessonId, _passed, _quizScore, _answers, _evaluation, _attemptId) => {
    const progress = get(
      'SELECT id, state, quiz_attempts FROM progress WHERE topic_id = ? AND lesson_id = ?',
      _topicId,
      _lessonId,
    )
    const fromState = progress ? progress.state : STATES.NOT_STARTED

    if (_passed) {
      if (!progress) {
        const now = new Date().toISOString()
        const result = run(
          'INSERT INTO progress (topic_id, lesson_id, state, quiz_score, quiz_attempts, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          _topicId,
          _lessonId,
          STATES.TESTED_OUT,
          _quizScore,
          1,
          now,
          now,
        )
        scheduleSrs(_topicId, _lessonId)
        if (_attemptId) {
          run(
            'UPDATE quiz_attempts SET answers = ?, evaluation = ? WHERE id = ?',
            JSON.stringify(_answers),
            JSON.stringify(_evaluation),
            _attemptId,
          )
        }
        return { passed: true, fromState, toState: STATES.TESTED_OUT, progressId: result.lastInsertRowid }
      }

      run(
        'UPDATE progress SET state = ?, quiz_score = ?, quiz_attempts = quiz_attempts + 1, completed_at = ? WHERE id = ?',
        STATES.TESTED_OUT,
        _quizScore,
        new Date().toISOString(),
        progress.id,
      )
      scheduleSrs(_topicId, _lessonId)
    } else {
      if (progress) {
        run(
          'UPDATE progress SET quiz_score = ?, quiz_attempts = quiz_attempts + 1 WHERE id = ?',
          _quizScore,
          progress.id,
        )
      } else {
        run(
          'INSERT INTO progress (topic_id, lesson_id, state, quiz_score, quiz_attempts) VALUES (?, ?, ?, ?, ?)',
          _topicId,
          _lessonId,
          STATES.NOT_STARTED,
          _quizScore,
          1,
        )
      }
    }

    // Update mistakes log and adaptive difficulty for test-out too
    const gaps = Array.isArray(_evaluation?.gaps) ? _evaluation.gaps : []
    updateMistakesAfterResult(_topicId, _lessonId, _passed, gaps)
    try {
      recordResultAndComputeDifficulty(_topicId, _passed)
    } catch (diffErr) {
      console.error('Adaptive difficulty error (test-out):', diffErr.message)
    }

    if (_attemptId) {
      run(
        'UPDATE quiz_attempts SET answers = ?, evaluation = ? WHERE id = ?',
        JSON.stringify(_answers),
        JSON.stringify(_evaluation),
        _attemptId,
      )
    }

    const toState = _passed ? STATES.TESTED_OUT : fromState
    return { passed: _passed, fromState, toState, progressId: progress ? progress.id : null }
  })

  return tx(topicId, lessonId, passed, quizScore, answers, evaluation, attemptId)
}

/**
 * Start a retest (remediating -> quiz_pending).
 */
export function startRetest({ topicId, lessonId }) {
  const tx = transaction((_topicId, _lessonId) => {
    const progress = get(
      'SELECT id, state FROM progress WHERE topic_id = ? AND lesson_id = ?',
      _topicId,
      _lessonId,
    )
    if (!progress || progress.state !== STATES.REMEDIATING) {
      throw new StateMachineError(
        'Lesson must be in remediating state to start a retest',
        'INVALID_STATE',
      )
    }
    run('UPDATE progress SET state = ? WHERE id = ?', STATES.QUIZ_PENDING, progress.id)
    return { fromState: progress.state, toState: STATES.QUIZ_PENDING, progressId: progress.id }
  })

  return tx(topicId, lessonId)
}
