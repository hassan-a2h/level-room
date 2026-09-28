import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { validateViewModelFixture } from '../../theme/core/packContract.js'
import AtlasReview from '../../theme/packs/living-atlas/views/ReviewSessionView.jsx'
import CuriosityReview from '../../theme/packs/curiosity-engine/views/ReviewSessionView.jsx'
import WorkshopReview from '../../theme/packs/mission-workshop/views/ReviewSessionView.jsx'

const views = [AtlasReview, CuriosityReview, WorkshopReview]

function makeModel(overrides = {}) {
  return validateViewModelFixture('Review', {
    phase: 'answers', counts: {}, dueItems: [], sessionId: 'session-1',
    questions: [{ id: 'q1', text: 'What is a branch?', topicTitle: 'Git', lessonTitle: 'Branches' }, { id: 'q2', text: 'What is a merge?', topicTitle: 'Git', lessonTitle: 'Merging' }],
    currentQuestion: { id: 'q2', text: 'What is a merge?', topicTitle: 'Git', lessonTitle: 'Merging' },
    currentIndex: 1, totalQuestions: 2, remainingCount: 3, answers: { q1: 'A movable line.', q2: 'Combines changes.' },
    feedbackByQuestionId: {}, feedbackIndex: 0, result: null, ui: {}, busy: { submitting: false }, error: null,
    actions: { answer: vi.fn(), nextQuestion: vi.fn(), previousQuestion: vi.fn(), reviewAnswers: vi.fn(), editAnswer: vi.fn(), submit: vi.fn(), nextFeedback: vi.fn(), returnToQueue: vi.fn(), returnToTrail: vi.fn() },
    ...overrides,
  })
}

describe('review session theme parity', () => {
  it('collects one question at a time and offers a separate answer review step', () => {
    const reviewAnswers = vi.fn()
    for (const View of views) {
      reviewAnswers.mockClear()
      const { unmount } = render(<View model={makeModel({ actions: { ...makeModel().actions, reviewAnswers } })} />)
      expect(screen.getByRole('heading', { name: 'What is a merge?' })).toBeInTheDocument()
      expect(screen.queryByText('What is a branch?')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /review answers/i }))
      expect(reviewAnswers).toHaveBeenCalledOnce()
      unmount()
    }
  })

  it('shows one complete answer review and immutable feedback actions consistently', () => {
    for (const View of views) {
      const submit = vi.fn()
      const { unmount } = render(<View model={makeModel({
        phase: 'answer-review', actions: { ...makeModel().actions, submit },
      })} />)
      expect(screen.getByText('A movable line.')).toBeInTheDocument()
      expect(screen.getByText('What is a merge?')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /submit all answers/i }))
      expect(submit).toHaveBeenCalledOnce()
      unmount()
    }
  })

  it('shows submitted feedback without answer editing and provides the summary action', () => {
    const feedback = { questionId: 'q1', correct: true, explanation: 'A branch is a movable line of development.' }
    for (const View of views) {
      const { unmount } = render(<View model={makeModel({
        phase: 'feedback', currentFeedback: feedback, feedbackIndex: 0,
      })} />)
      expect(screen.getByText('A branch is a movable line of development.')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
      unmount()
    }
  })

  it('presents unavailable sessions as expired with a return action', () => {
    for (const View of views) {
      const returnToQueue = vi.fn()
      const { unmount } = render(<View model={makeModel({
        phase: 'expired', error: { message: 'This review session is no longer available.' },
        actions: { ...makeModel().actions, returnToQueue },
      })} />)
      expect(screen.getByRole('heading', { name: /review session unavailable/i })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /return to review queue/i }))
      expect(returnToQueue).toHaveBeenCalledOnce()
      unmount()
    }
  })

  it('shows the returned summary and Trail action consistently', () => {
    for (const View of views) {
      const returnToTrail = vi.fn()
      const { unmount } = render(<View model={makeModel({
        phase: 'complete', result: { passed: true, overallScore: 100, perItemResults: [{ lessonTitle: 'Git basics', score: 100, correctCount: 2, totalCount: 2 }] },
        actions: { ...makeModel().actions, returnToTrail },
      })} />)
      expect(screen.getByRole('heading', { name: 'Ready to continue' })).toBeInTheDocument()
      expect(screen.getByText('Git basics')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /continue trail/i }))
      expect(returnToTrail).toHaveBeenCalledOnce()
      unmount()
    }
  })
})
