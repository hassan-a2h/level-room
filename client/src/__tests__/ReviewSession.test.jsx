import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ReviewSession from '../components/ReviewSession.jsx'

vi.mock('../api.js', () => ({
  submitReview: vi.fn(),
  cancelReview: vi.fn(),
  getLocalDate: vi.fn(() => '2026-09-14'),
}))

import { cancelReview, getLocalDate, submitReview } from '../api.js'

const questions = [
  { id: 'q1', text: 'What is a branch?', topicTitle: 'Git', lessonTitle: 'Branches' },
  { id: 'q2', text: 'What is a merge?', topicTitle: 'Git', lessonTitle: 'Merging' },
]

function CurrentPath() {
  const { pathname } = useLocation()
  return <output data-testid="current-path">{pathname}</output>
}

function renderReviewSession(state = { sessionId: 'session-1', questions, totalQuestions: 2, remainingCount: 3 }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/review/session-1', state }]}>
      <Routes>
        <Route path="/review/:sessionId" element={<ReviewSession />} />
        <Route path="/reviews" element={<h1>Review Queue</h1>} />
        <Route path="/" element={<h1>Dashboard</h1>} />
      </Routes>
      <CurrentPath />
    </MemoryRouter>,
  )
}

describe('ReviewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submitReview.mockReset()
    cancelReview.mockReset()
    getLocalDate.mockReturnValue('2026-09-14')
  })

  it('submits each answer, shows feedback and completes with a summary', async () => {
    submitReview
      .mockResolvedValueOnce({ feedback: [{ questionId: 'q1', correct: true, explanation: 'A branch is a movable line of development.' }] })
      .mockResolvedValueOnce({
        feedback: [{ questionId: 'q2', correct: true, explanation: 'A merge combines changes.' }],
        overallScore: 100,
        passed: true,
        totalQuestions: 2,
        perItemResults: [{ lessonTitle: 'Git basics', score: 100, correctCount: 2, totalCount: 2 }],
      })

    renderReviewSession()

    expect(screen.getAllByText('Question 1 of 2')).toHaveLength(2)
    expect(screen.getByText('3 more retrieval items queued for later')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: /answer/i }), { target: { value: 'A movable line of development.' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

    expect(await screen.findByText('Remembered')).toBeInTheDocument()
    expect(screen.getByText('A branch is a movable line of development.')).toBeInTheDocument()
    expect(submitReview).toHaveBeenCalledWith('session-1', { q1: 'A movable line of development.' }, '2026-09-14')
    expect(getLocalDate).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByText('Question 2 of 2')).toHaveLength(2)
    fireEvent.change(screen.getByRole('textbox', { name: /answer/i }), { target: { value: 'Combines changes.' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

    expect(await screen.findByRole('heading', { name: /ready to continue/i })).toBeInTheDocument()
    expect(screen.getAllByText('100%')).toHaveLength(2)
    expect(screen.getByText('Git basics')).toBeInTheDocument()
    expect(screen.getByText('Ready to continue')).toBeInTheDocument()
    expect(submitReview).toHaveBeenLastCalledWith('session-1', {
      q1: 'A movable line of development.',
      q2: 'Combines changes.',
    }, '2026-09-14')
    fireEvent.click(screen.getByRole('button', { name: /continue trail/i }))
    expect(screen.getByTestId('current-path')).toHaveTextContent('/')
  })

  it('uses gentle almost and revisit language for a close answer', async () => {
    submitReview.mockResolvedValueOnce({ feedback: [{ questionId: 'q1', correct: false, almost: true, explanation: 'You have the main idea; add how references are updated.' }] })
    renderReviewSession()

    fireEvent.change(screen.getByRole('textbox', { name: /answer/i }), { target: { value: 'A pointer to a line of development.' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

    expect(await screen.findByText('Almost')).toBeInTheDocument()
    expect(screen.getByText('You have the main idea; add how references are updated.')).toBeInTheDocument()
    expect(screen.queryByText('Incorrect')).not.toBeInTheDocument()
  })

  it('invites another pass without shame when an answer needs retrieval practice', async () => {
    submitReview.mockResolvedValueOnce({ feedback: [{ questionId: 'q1', correct: false, explanation: 'Revisit how a branch name points to a commit.' }] })
    renderReviewSession()

    fireEvent.change(screen.getByRole('textbox', { name: /answer/i }), { target: { value: 'It is a separate repository.' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

    expect(await screen.findByText('Revisit')).toBeInTheDocument()
    expect(screen.getByText('Revisit how a branch name points to a commit.')).toBeInTheDocument()
    expect(screen.queryByText(/failed|incorrect|needs review/i)).not.toBeInTheDocument()
  })

  it('preserves an answer and shows a recoverable submission error', async () => {
    submitReview.mockRejectedValueOnce(new Error('Network unavailable'))
    renderReviewSession()

    const answer = screen.getByRole('textbox', { name: /answer/i })
    fireEvent.change(answer, { target: { value: 'Keep this answer' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
    expect(answer).toHaveValue('Keep this answer')
    expect(screen.getByRole('button', { name: /submit answer/i })).toBeEnabled()
  })

  it('keeps an answer but does not expose raw database details in submission errors', async () => {
    submitReview.mockRejectedValueOnce(new Error('SQLITE_ERROR: constraint failed in review_queue'))
    renderReviewSession()
    const answer = screen.getByRole('textbox', { name: /answer/i })
    fireEvent.change(answer, { target: { value: 'A pointer to a commit.' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save this answer/i)
    expect(screen.queryByText(/SQLITE_ERROR|constraint failed|review_queue/i)).not.toBeInTheDocument()
    expect(answer).toHaveValue('A pointer to a commit.')
  })

  it('cancels the review and returns to the review queue', async () => {
    cancelReview.mockResolvedValue({})
    renderReviewSession()

    fireEvent.click(screen.getByRole('button', { name: /back to review queue/i }))

    expect(await screen.findByRole('heading', { name: /review queue/i })).toBeInTheDocument()
    expect(cancelReview).toHaveBeenCalledWith('session-1')
  })

  it('offers a route back to the review queue when there is no active session', async () => {
    renderReviewSession({ sessionId: null, questions: [] })

    expect(screen.getByRole('heading', { name: /no active review session/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /back to review queue/i }))

    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/reviews'))
  })
})
