import { describe, expect, it } from 'vitest'
import { buildCheckpointViewModel, createCheckpointState } from './controller.js'

describe('checkpoint controller model', () => {
  it('retains autosaved answers and targeted retest state with the current question', () => {
    const questions = [{ id: 'q1' }, { id: 'q2' }]
    const model = buildCheckpointViewModel(createCheckpointState({
      phase: 'player', exam: { id: 'retest-1', outcomes: ['o2'] }, questions,
      answers: { q1: 'Saved answer' }, currentIndex: 1, saveState: 'saved',
      evaluation: null, isPartialRetest: true, ready: true, lessonsRemaining: 0,
      busy: { loading: false, submitting: false },
    }))

    expect(model).toMatchObject({
      phase: 'player', questions, currentQuestion: questions[1], currentIndex: 1,
      answers: { q1: 'Saved answer' }, answeredCount: 1, saveState: 'saved',
      isPartialRetest: true, busy: { loading: false, submitting: false },
    })
  })

  it('normalizes empty checkpoint values and preserves readiness gating', () => {
    const model = buildCheckpointViewModel(createCheckpointState({ ready: false, lessonsRemaining: 2 }))
    expect(model.phase).toBe('intro')
    expect(model.ready).toBe(false)
    expect(model.lessonsRemaining).toBe(2)
    expect(model.answers).toEqual({})
    expect(model.currentQuestion).toBeNull()
  })
})
