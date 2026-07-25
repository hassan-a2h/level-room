import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Dashboard from '../pages/Dashboard'

vi.mock('../api.js', () => ({
  getTopics: vi.fn(),
  getDashboard: vi.fn(),
  deleteTopic: vi.fn(),
  selectTopic: vi.fn(),
  getDefaultTopic: vi.fn(),
  getReviewCount: vi.fn(),
  getStreak: vi.fn(),
  getLocalDate: vi.fn(() => '2024-06-01'),
}))

import { getTopics, getDashboard, deleteTopic, getDefaultTopic, selectTopic, getReviewCount, getStreak } from '../api.js'

function CurrentPath() {
  const { pathname } = useLocation()
  return <span data-testid="current-path">{pathname}</span>
}

function renderDashboardWithPath() {
  return render(
    <MemoryRouter>
      <Dashboard />
      <CurrentPath />
    </MemoryRouter>
  )
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no topics exist', async () => {
    getTopics.mockResolvedValue({ topics: [] })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 0, maxStreak: 0, backlog: false, streakBroken: false, message: 'Start your learning streak today!' })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/you have not started learning/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { level: 1, name: /your learning dashboard/i })).toBeInTheDocument()
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
    getReviewCount.mockResolvedValue({ totalDue: 3 })
    getStreak.mockResolvedValue({ currentStreak: 2, maxStreak: 5, backlog: false, streakBroken: false, message: '2-day streak — keep it going!' })
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

  it('exposes the active topic and keeps delete keyboard activation separate from topic selection', async () => {
    getTopics.mockResolvedValue({ topics: [
      { id: 1, title: 'React', progress: 50, totalLessons: 4, passedLessons: 2 },
      { id: 2, title: 'Calculus', progress: 0, totalLessons: 4, passedLessons: 0 },
    ] })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 0, maxStreak: 0, backlog: false, streakBroken: false, message: 'Start today!' })
    getDefaultTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getDashboard.mockResolvedValue({ topic: { id: 1, title: 'React' }, modules: [] })
    selectTopic.mockResolvedValue({ ok: true })

    renderDashboardWithPath()

    const reactCard = await screen.findByRole('button', { name: /react, 50% complete/i })
    const calculusCard = screen.getByRole('button', { name: /calculus, 0% complete/i })
    expect(reactCard).toHaveAttribute('aria-pressed', 'true')
    expect(calculusCard).toHaveAttribute('aria-pressed', 'false')

    const deleteButton = screen.getByRole('button', { name: /delete topic calculus/i })
    expect(deleteButton.closest('[role="button"]')).toBeNull()
    selectTopic.mockClear()
    fireEvent.keyDown(deleteButton, { key: 'Enter' })
    expect(selectTopic).not.toHaveBeenCalled()

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteTopic.mockResolvedValue({})
    fireEvent.click(deleteButton)
    await waitFor(() => expect(deleteTopic).toHaveBeenCalledWith(2))
    confirmSpy.mockRestore()
  })

  it('switches topic and refreshes graph', async () => {
    getTopics.mockResolvedValue({
      topics: [
        { id: 1, title: 'React', progress: 50, totalLessons: 2, passedLessons: 1, status: 'active' },
        { id: 2, title: 'Calculus', progress: 0, totalLessons: 2, passedLessons: 0, status: 'active' },
      ],
    })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 1, maxStreak: 1, backlog: false, streakBroken: false, message: '1-day streak — keep it going!' })
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
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 0, maxStreak: 0, backlog: false, streakBroken: false, message: 'Start your learning streak today!' })
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

  it('shows review badge when reviews are due', async () => {
    getTopics.mockResolvedValue({
      topics: [
        { id: 1, title: 'React', progress: 50, totalLessons: 4, passedLessons: 2, status: 'active' },
      ],
    })
    getReviewCount.mockResolvedValue({ totalDue: 3, dueToday: 2, overdue: 1 })
    getStreak.mockResolvedValue({ currentStreak: 3, maxStreak: 3, backlog: false, streakBroken: false, message: '3-day streak — great work today!' })
    getDefaultTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getDashboard.mockResolvedValue({
      topic: { id: 1, title: 'React' },
      modules: [
        {
          id: 1,
          title: 'Basics',
          lessons: [
            { id: 1, title: 'JSX', state: 'passed', depth: 'Beginner', estimated_time: 10, prerequisites: [] },
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

    expect(screen.getByRole('link', { name: /reviews, 3 due/i })).toBeInTheDocument()
  })

  it('prefers an unlocked practicing lesson for the continue action', async () => {
    getTopics.mockResolvedValue({ topics: [{ id: 7, title: 'React', progress: 25, totalLessons: 4, passedLessons: 1 }] })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 0, maxStreak: 0, backlog: false, streakBroken: false, message: 'Start learning today!' })
    getDefaultTopic.mockResolvedValue({ topic: { id: 7, title: 'React' } })
    getDashboard.mockResolvedValue({
      topic: { id: 7, title: 'React' },
      modules: [
        { id: 1, title: 'Basics', lessons: [
          { id: 1, title: 'Available lesson', state: 'not_started', locked: false, prerequisites: [] },
          { id: 2, title: 'Current lesson', state: 'practicing', locked: false, prerequisites: [] },
          { id: 3, title: 'Locked practice', state: 'practicing', locked: true, prerequisites: [] },
        ] },
      ],
    })

    renderDashboardWithPath()

    const continueButton = await screen.findByRole('button', { name: /continue lesson: current lesson/i })
    expect(screen.queryByRole('button', { name: /^start lesson: available lesson$/i })).not.toBeInTheDocument()
    fireEvent.click(continueButton)
    expect(screen.getByTestId('current-path')).toHaveTextContent('/topic/7/lesson/2')
  })

  it('hides the next lesson action while a different topic is loading', async () => {
    let resolveNextDashboard
    getTopics.mockResolvedValue({ topics: [
      { id: 1, title: 'React', progress: 25, totalLessons: 4, passedLessons: 1 },
      { id: 2, title: 'Calculus', progress: 0, totalLessons: 4, passedLessons: 0 },
    ] })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 0, maxStreak: 0, backlog: false, streakBroken: false, message: 'Start learning today!' })
    getDefaultTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getDashboard
      .mockResolvedValueOnce({
        topic: { id: 1, title: 'React' },
        modules: [{ id: 1, title: 'Basics', lessons: [
          { id: 10, title: 'Continue React', state: 'practicing', locked: false, prerequisites: [] },
        ] }],
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNextDashboard = resolve }))
    selectTopic.mockResolvedValue({ ok: true })

    renderDashboardWithPath()

    expect(await screen.findByRole('button', { name: /continue lesson: continue react/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /calculus, 0% complete/i }))
    await waitFor(() => expect(selectTopic).toHaveBeenCalledWith(2))

    expect(screen.queryByRole('button', { name: /continue lesson: continue react/i })).not.toBeInTheDocument()

    resolveNextDashboard({
      topic: { id: 2, title: 'Calculus' },
      modules: [{ id: 2, title: 'Limits', lessons: [
        { id: 20, title: 'Continue Calculus', state: 'practicing', locked: false, prerequisites: [] },
      ] }],
    })
    expect(await screen.findByRole('button', { name: /continue lesson: continue calculus/i })).toBeInTheDocument()
  })

  it('chooses the first unlocked actionable lesson when none is practicing', async () => {
    getTopics.mockResolvedValue({ topics: [{ id: 7, title: 'React', progress: 25, totalLessons: 5, passedLessons: 1 }] })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 0, maxStreak: 0, backlog: false, streakBroken: false, message: 'Start learning today!' })
    getDefaultTopic.mockResolvedValue({ topic: { id: 7, title: 'React' } })
    getDashboard.mockResolvedValue({
      topic: { id: 7, title: 'React' },
      modules: [
        { id: 1, title: 'Basics', lessons: [
          { id: 1, title: 'Passed lesson', state: 'passed', locked: false, prerequisites: [] },
          { id: 2, title: 'Tested out lesson', state: 'tested_out', locked: false, prerequisites: [] },
          { id: 3, title: 'Skipped lesson', state: 'skipped', locked: false, prerequisites: [] },
          { id: 4, title: 'Locked lesson', state: 'not_started', locked: true, prerequisites: [] },
          { id: 5, title: 'Pending lesson', state: 'quiz_pending', locked: false, prerequisites: [] },
          { id: 6, title: 'Next lesson', state: 'not_started', locked: false, prerequisites: [] },
          { id: 7, title: 'Later lesson', state: 'not_started', locked: false, prerequisites: [] },
        ] },
      ],
    })

    renderDashboardWithPath()

    const resumeButton = await screen.findByRole('button', { name: /resume lesson: pending lesson/i })
    fireEvent.click(resumeButton)
    expect(screen.getByTestId('current-path')).toHaveTextContent('/topic/7/lesson/5')
  })

  it('omits the next lesson action when every lesson is unavailable or complete', async () => {
    getTopics.mockResolvedValue({ topics: [{ id: 7, title: 'React', progress: 100, totalLessons: 4, passedLessons: 4 }] })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 0, maxStreak: 0, backlog: false, streakBroken: false, message: 'Start learning today!' })
    getDefaultTopic.mockResolvedValue({ topic: { id: 7, title: 'React' } })
    getDashboard.mockResolvedValue({
      topic: { id: 7, title: 'React' },
      modules: [
        { id: 1, title: 'Basics', lessons: [
          { id: 1, title: 'Passed lesson', state: 'passed', locked: false, prerequisites: [] },
          { id: 2, title: 'Tested out lesson', state: 'tested_out', locked: false, prerequisites: [] },
          { id: 3, title: 'Skipped lesson', state: 'skipped', locked: false, prerequisites: [] },
          { id: 4, title: 'Locked lesson', state: 'not_started', locked: true, prerequisites: [] },
        ] },
      ],
    })

    renderDashboardWithPath()

    await screen.findByRole('region', { name: /competence graph/i })
    expect(screen.queryByRole('button', { name: /lesson:/i })).not.toBeInTheDocument()
  })

  it('displays active streak banner on dashboard', async () => {
    getTopics.mockResolvedValue({
      topics: [{ id: 1, title: 'React', progress: 50, totalLessons: 4, passedLessons: 2, status: 'active' }],
    })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 5, maxStreak: 5, backlog: false, streakBroken: false, message: '5-day streak — great work today!' })
    getDefaultTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getDashboard.mockResolvedValue({
      topic: { id: 1, title: 'React' },
      modules: [{
        id: 1, title: 'Basics',
        lessons: [{ id: 1, title: 'JSX', state: 'passed', depth: 'Beginner', estimated_time: 10, prerequisites: [] }],
      }],
    })

    render(<MemoryRouter><Dashboard /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('streak-active')).toBeInTheDocument()
    })
    expect(screen.getByText(/5-day streak/i)).toBeInTheDocument()
  })

  it('displays streak-broken banner after a gap', async () => {
    getTopics.mockResolvedValue({
      topics: [{ id: 1, title: 'React', progress: 50, totalLessons: 4, passedLessons: 2, status: 'active' }],
    })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 3, maxStreak: 10, backlog: false, streakBroken: true, message: 'Your 3-day streak was broken. No pressure — pick up where you left off!' })
    getDefaultTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getDashboard.mockResolvedValue({
      topic: { id: 1, title: 'React' },
      modules: [{
        id: 1, title: 'Basics',
        lessons: [{ id: 1, title: 'JSX', state: 'passed', depth: 'Beginner', estimated_time: 10, prerequisites: [] }],
      }],
    })

    render(<MemoryRouter><Dashboard /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('streak-broken')).toBeInTheDocument()
    })
    expect(screen.getByText(/streak was broken/i)).toBeInTheDocument()
  })

  it('displays backlog banner after 7+ days inactive', async () => {
    getTopics.mockResolvedValue({
      topics: [{ id: 1, title: 'React', progress: 50, totalLessons: 4, passedLessons: 2, status: 'active' }],
    })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 2, maxStreak: 8, backlog: true, streakBroken: true, daysSince: 8, message: 'Your 2-day streak was broken. No pressure — pick up where you left off!' })
    getDefaultTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getDashboard.mockResolvedValue({
      topic: { id: 1, title: 'React' },
      modules: [{
        id: 1, title: 'Basics',
        lessons: [{ id: 1, title: 'JSX', state: 'passed', depth: 'Beginner', estimated_time: 10, prerequisites: [] }],
      }],
    })

    render(<MemoryRouter><Dashboard /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('streak-backlog')).toBeInTheDocument()
    })
    expect(screen.getByText(/8 days since last activity/i)).toBeInTheDocument()
  })

  it('displays start-streak banner for new user', async () => {
    getTopics.mockResolvedValue({
      topics: [{ id: 1, title: 'React', progress: 0, totalLessons: 4, passedLessons: 0, status: 'active' }],
    })
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getStreak.mockResolvedValue({ currentStreak: 0, maxStreak: 0, backlog: false, streakBroken: false, message: 'Start your learning streak today!' })
    getDefaultTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getDashboard.mockResolvedValue({
      topic: { id: 1, title: 'React' },
      modules: [{
        id: 1, title: 'Basics',
        lessons: [{ id: 1, title: 'JSX', state: 'not_started', depth: 'Beginner', estimated_time: 10, prerequisites: [] }],
      }],
    })

    render(<MemoryRouter><Dashboard /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('streak-start')).toBeInTheDocument()
    })
    expect(screen.getByText(/start your learning streak/i)).toBeInTheDocument()
  })
})
