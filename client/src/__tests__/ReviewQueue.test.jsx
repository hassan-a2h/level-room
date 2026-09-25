import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ReviewQueue from '../pages/ReviewQueue'

vi.mock('../api.js', () => ({
  getReviews: vi.fn(),
  getReviewCount: vi.fn(),
  startReviewSession: vi.fn(),
  getLocalDate: vi.fn(() => '2024-06-01'),
}))

import { getReviews, getReviewCount, startReviewSession } from '../api.js'

describe('ReviewQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no reviews are due', async () => {
    getReviews.mockResolvedValue({ due: [], dueToday: 0, overdue: 0 })
    getReviewCount.mockResolvedValue({ dueToday: 0, overdue: 0, totalDue: 0 })

    render(
      <MemoryRouter>
        <ReviewQueue />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/no retrieval practice due today/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Continue Trail' })).toBeInTheDocument()
  })

  it('lists due reviews with topic and lesson titles', async () => {
    getReviews.mockResolvedValue({
      due: [
        { id: 1, topicId: 1, lessonId: 1, dueDate: '2025-01-01', topicTitle: 'React', moduleTitle: 'Foundations', lessonTitle: 'JSX', isOverdue: true, intervalIndex: 0, reviewType: 'lesson' },
        { id: 2, topicId: 1, lessonId: 2, dueDate: '2025-01-02', topicTitle: 'React', moduleTitle: 'Components', lessonTitle: 'Components', isOverdue: false, intervalIndex: 1, reviewType: 'lesson' },
      ],
      dueToday: 1,
      overdue: 1,
    })
    getReviewCount.mockResolvedValue({ dueToday: 1, overdue: 1, totalDue: 2 })

    render(
      <MemoryRouter>
        <ReviewQueue />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('JSX')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Components').length).toBeGreaterThan(0)
    expect(screen.getByText('Start retrieval practice')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Retrieval practice' })).toBeInTheDocument()
    expect(within(screen.getAllByRole('listitem')[0]).getByText('Track: React')).toBeInTheDocument()
    expect(screen.getByText('Chapter: Foundations')).toBeInTheDocument()
    expect(screen.getByText(/ready to revisit from 2025-01-01/i)).toBeInTheDocument()
  })

  it('shows overdue badge for overdue items', async () => {
    getReviews.mockResolvedValue({
      due: [
        { id: 1, topicId: 1, lessonId: 1, dueDate: '2024-01-01', topicTitle: 'React', lessonTitle: 'JSX', isOverdue: true, intervalIndex: 0, reviewType: 'lesson' },
      ],
      dueToday: 0,
      overdue: 1,
    })
    getReviewCount.mockResolvedValue({ dueToday: 0, overdue: 1, totalDue: 1 })

    render(
      <MemoryRouter>
        <ReviewQueue />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Overdue')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /reviews, 1 due/i })).toBeInTheDocument()
  })

  it('navigates to review session on Start Review click', async () => {
    getReviews.mockResolvedValue({
      due: [
        { id: 1, topicId: 1, lessonId: 1, dueDate: '2025-01-01', topicTitle: 'React', lessonTitle: 'JSX', isOverdue: false, intervalIndex: 0, reviewType: 'lesson' },
      ],
      dueToday: 1,
      overdue: 0,
    })
    getReviewCount.mockResolvedValue({ dueToday: 1, overdue: 0, totalDue: 1 })
    startReviewSession.mockResolvedValue({
      sessionId: 'abc-123',
      questions: [{ id: 'q1', text: 'What is JSX?', type: 'Recall', topicTitle: 'React', lessonTitle: 'JSX' }],
      totalQuestions: 1,
      remainingCount: 0,
    })

    render(
      <MemoryRouter>
        <ReviewQueue />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start retrieval practice/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /start retrieval practice/i }))

    await waitFor(() => {
      expect(startReviewSession).toHaveBeenCalled()
    })
  })

  it('uses clear fallback context when optional Track and date details are absent', async () => {
    getReviews.mockResolvedValue({ due: [{ id: 1, lessonTitle: null, dueDate: null, isOverdue: false }] })
    getReviewCount.mockResolvedValue({ totalDue: 1 })
    render(<MemoryRouter><ReviewQueue /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Retrieval practice item' })).toBeInTheDocument()
    expect(screen.getByText('Track: Your Track')).toBeInTheDocument()
    expect(screen.getByText('This retrieval practice is scheduled.')).toBeInTheDocument()
  })

  it('replaces raw service errors with a retryable retrieval-practice message', async () => {
    getReviews.mockRejectedValueOnce(new Error('SQLITE_ERROR: foreign key constraint failed'))
      .mockResolvedValueOnce({ due: [] })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    render(<MemoryRouter><ReviewQueue /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: /practice could not be loaded/i })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load retrieval practice/i)
    expect(screen.queryByText(/SQLITE_ERROR|foreign key constraint/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('heading', { name: /no retrieval practice due today/i })).toBeInTheDocument()
  })
})
