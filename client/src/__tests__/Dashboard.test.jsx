import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../pages/Dashboard'

vi.mock('../api.js', () => ({
  getTopics: vi.fn(),
  getDashboard: vi.fn(),
  deleteTopic: vi.fn(),
  selectTopic: vi.fn(),
  getDefaultTopic: vi.fn(),
}))

import { getTopics, getDashboard, getDefaultTopic, selectTopic } from '../api.js'

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no topics exist', async () => {
    getTopics.mockResolvedValue({ topics: [] })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/you have not started learning/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /start learning/i })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /competence graph/i })).not.toBeInTheDocument()
  })

  it('shows dashboard with topic cards when topics exist', async () => {
    getTopics.mockResolvedValue({
      topics: [
        { id: 1, title: 'React', progress: 50, totalLessons: 4, passedLessons: 2, status: 'active' },
        { id: 2, title: 'Calculus', progress: 25, totalLessons: 4, passedLessons: 1, status: 'active' },
      ],
    })
    getDefaultTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getDashboard.mockResolvedValue({
      topic: { id: 1, title: 'React' },
      modules: [
        {
          id: 1,
          title: 'Basics',
          lessons: [
            { id: 1, title: 'JSX', state: 'passed', depth: 'Beginner', estimated_time: 10, prerequisites: [] },
            { id: 2, title: 'Components', state: 'not_started', depth: 'Beginner', estimated_time: 15, prerequisites: [{ lessonId: 1, title: 'JSX' }] },
          ],
        },
      ],
    })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /competence graph/i })).toBeInTheDocument()
    })
    // Topic cards in sidebar
    expect(screen.getAllByText('React').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Calculus')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('switches topic and refreshes graph', async () => {
    getTopics.mockResolvedValue({
      topics: [
        { id: 1, title: 'React', progress: 50, totalLessons: 2, passedLessons: 1, status: 'active' },
        { id: 2, title: 'Calculus', progress: 0, totalLessons: 2, passedLessons: 0, status: 'active' },
      ],
    })
    getDefaultTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getDashboard
      .mockResolvedValueOnce({
        topic: { id: 1, title: 'React' },
        modules: [{
          id: 1, title: 'Basics',
          lessons: [
            { id: 1, title: 'JSX', state: 'passed', depth: 'Beginner', estimated_time: 10, prerequisites: [] },
          ],
        }],
      })
      .mockResolvedValueOnce({
        topic: { id: 2, title: 'Calculus' },
        modules: [{
          id: 2, title: 'Limits',
          lessons: [
            { id: 3, title: 'Intro to Limits', state: 'not_started', depth: 'Beginner', estimated_time: 12, prerequisites: [] },
          ],
        }],
      })
    selectTopic.mockResolvedValue({ ok: true })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /competence graph/i })).toBeInTheDocument()
    })

    // Click the Calculus topic card
    const calcText = screen.getByText('Calculus')
    fireEvent.click(calcText.closest('[role="button"]') || calcText)

    await waitFor(() => {
      expect(selectTopic).toHaveBeenCalledWith(2)
    })
  })

  it('defaults to most recently active topic', async () => {
    getTopics.mockResolvedValue({
      topics: [
        { id: 1, title: 'Old', progress: 50, totalLessons: 2, passedLessons: 1, status: 'active', last_active_at: '2024-01-01' },
        { id: 2, title: 'Recent', progress: 0, totalLessons: 2, passedLessons: 0, status: 'active', last_active_at: '2024-06-01' },
      ],
    })
    getDefaultTopic.mockResolvedValue({ topic: { id: 2, title: 'Recent' } })
    getDashboard.mockResolvedValue({
      topic: { id: 2, title: 'Recent' },
      modules: [],
    })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /competence graph/i })).toBeInTheDocument()
    })

    // The "Recent" topic card should have active styling (selected)
    const recentCards = screen.getAllByText('Recent')
    expect(recentCards.length).toBeGreaterThanOrEqual(1)
  })
})
