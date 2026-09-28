import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useReviewController } from './controller.js'

const questions = [
  { id: 'q1', text: 'First?' },
  { id: 'q2', text: 'Second?' },
]

describe('useReviewController', () => {
  it('collects all answers locally, submits one complete map, and reveals feedback in order', async () => {
    const submitReview = vi.fn().mockResolvedValue({
      feedback: [
        { questionId: 'q1', correct: true, explanation: 'First feedback.' },
        { questionId: 'q2', correct: false, explanation: 'Second feedback.' },
      ],
      passed: false,
      overallScore: 50,
    })
    const { result } = renderHook(() => useReviewController({
      sessionId: 'session-1', questions, submitReviewFn: submitReview, getLocalDateFn: () => '2026-09-28',
    }))

    act(() => result.current.setAnswer('q1', ' First answer '))
    act(() => result.current.nextQuestion())
    act(() => result.current.setAnswer('q2', 'Second answer'))
    expect(submitReview).not.toHaveBeenCalled()
    expect(result.current.model.answers).toEqual({ q1: ' First answer ', q2: 'Second answer' })

    act(() => result.current.reviewAnswers())
    expect(result.current.model.phase).toBe('answer-review')
    expect(submitReview).not.toHaveBeenCalled()
    await act(async () => { await result.current.submitAnswers() })
    expect(submitReview).toHaveBeenCalledOnce()
    expect(submitReview).toHaveBeenCalledWith('session-1', { q1: 'First answer', q2: 'Second answer' }, '2026-09-28')
    expect(result.current.model).toMatchObject({ phase: 'feedback', feedbackIndex: 0, result: null })
    expect(result.current.model.currentFeedback.explanation).toBe('First feedback.')

    act(() => result.current.nextFeedback())
    expect(result.current.model.currentFeedback.explanation).toBe('Second feedback.')
    act(() => result.current.nextFeedback())
    expect(result.current.model).toMatchObject({ phase: 'complete', result: { passed: false, overallScore: 50 } })
  })

  it('maps expired session 404 responses to the expired model', async () => {
    const submitReview = vi.fn().mockRejectedValue(Object.assign(new Error('Not found'), { status: 404, code: 'SESSION_NOT_FOUND' }))
    const { result } = renderHook(() => useReviewController({
      sessionId: 'expired', questions: [{ id: 'q1' }], submitReviewFn: submitReview,
    }))
    act(() => result.current.setAnswer('q1', 'answer'))
    act(() => result.current.reviewAnswers())

    await act(async () => { await result.current.submitAnswers() })

    expect(result.current.model.phase).toBe('expired')
    expect(result.current.model.error).toMatchObject({ kind: 'expired', retryable: false })
  })

  it('does not submit an incomplete answer map or submit twice while pending', async () => {
    let resolveSubmit
    const submitReview = vi.fn(() => new Promise((resolve) => { resolveSubmit = resolve }))
    const { result } = renderHook(() => useReviewController({ sessionId: 's', questions, submitReviewFn: submitReview }))

    act(() => result.current.setAnswer('q1', 'answer'))
    act(() => result.current.reviewAnswers())
    expect(result.current.model.phase).toBe('answers')
    await act(async () => { await result.current.submitAnswers() })
    expect(submitReview).not.toHaveBeenCalled()

    act(() => result.current.setAnswer('q2', 'answer'))
    act(() => result.current.reviewAnswers())
    act(() => { result.current.submitAnswers(); result.current.submitAnswers() })
    expect(submitReview).toHaveBeenCalledOnce()
    await act(async () => { resolveSubmit({ feedback: [] }) })
  })
})
