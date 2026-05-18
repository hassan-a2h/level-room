import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
      expect(screen.getByText(/no reviews due today/i)).toBeInTheDocument()
    })
  })

  it('lists due reviews with topic and lesson titles', async () => {
    getReviews.mockResolvedValue({
      due: [
        { id: 1, topicId: 1, lessonId: 1, dueDate: '2025-01-01', topicTitle: 'React', lessonTitle: 'JSX', isOverdue: true, intervalIndex: 0, reviewType: 'lesson' },
        { id: 2, topicId: 1, lessonId: 2, dueDate: '2025-01-02', topicTitle: 'React', lessonTitle: 'Components', isOverdue: false, intervalIndex: 1, reviewType: 'lesson' },
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
    expect(screen.getByText('Components')).toBeInTheDocument()
    expect(screen.getByText('Start Review')).toBeInTheDocument()
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
      expect(screen.getByRole('button', { name: /start review/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /start review/i }))

    await waitFor(() => {
      expect(startReviewSession).toHaveBeenCalled()
    })
  })
})
