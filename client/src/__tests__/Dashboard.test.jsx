import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Dashboard from '../pages/Dashboard.jsx'

vi.mock('../api.js', () => ({
  getTopics: vi.fn(),
  getDashboard: vi.fn(),
  deleteTopic: vi.fn(),
  selectTopic: vi.fn(),
  getDefaultTopic: vi.fn(),
  getReviewCount: vi.fn(),
  getStreak: vi.fn(),
  getLocalDate: vi.fn(() => '2026-09-26'),
  getLocalTimeZone: vi.fn(() => 'Asia/Karachi'),
}))

import { getTopics, getDashboard, deleteTopic, getDefaultTopic, selectTopic, getReviewCount, getStreak } from '../api.js'

function CurrentLocation() {
  const location = useLocation()
  return <output data-testid="current-location">{location.pathname}{location.search}</output>
}

const defaultTopics = {
  topics: [
    { id: 1, title: 'React', status: 'active', progress: 30, totalLessons: 4, passedLessons: 1, hasChildren: false },
    { id: 2, title: 'Calculus', status: 'active', progress: 0, totalLessons: 3, passedLessons: 0, hasChildren: false },
  ],
}

const defaultDashboard = {
  topic: { id: 1, title: 'React', status: 'active', progress: 30, totalLessons: 4, passedLessons: 1, courseKind: 'core', courseStage: 0 },
  modules: [
    {
      id: 11,
      title: 'Components',
      summary: 'Build clear, reusable pieces.',
      status: 'active',
      checkpointStatus: 'locked',
      examReady: false,
      lessonsRemaining: 1,
      skill_outcomes: [{ id: 'write-components', title: 'Compose reusable components', kind: 'skill', role: 'core', evidence: ['activity'] }],
      lessons: [
        { id: 101, title: 'JSX foundations', state: 'passed', locked: false, estimated_time: 10, outcomes: [], prerequisites: [], buildRequired: true, buildType: 'code' },
        { id: 102, title: 'Build a profile card', state: 'not_started', locked: false, estimated_time: 15, outcomes: [], prerequisites: [], buildRequired: false, buildType: '' },
      ],
    },
    {
      id: 12,
      title: 'State and events',
      summary: 'Make interfaces respond.',
      status: 'active',
      checkpointStatus: 'locked',
      examReady: false,
      lessonsRemaining: 1,
      skill_outcomes: [],
      lessons: [{ id: 103, title: 'Handle a click', state: 'not_started', locked: true, estimated_time: 12, outcomes: [], prerequisites: [{ lessonId: 102, title: 'Build a profile card' }], buildRequired: false, buildType: '' }],
    },
  ],
  nextAction: { kind: 'start_session', topicId: 1, topicTitle: 'React', moduleId: 11, chapterTitle: 'Components', lessonId: 102, sessionTitle: 'Build a profile card', estimatedMinutes: 15 },
  reviewSummary: { dueToday: 2, overdue: 1, totalDue: 3 },
  weeklyRhythm: {
    activeDays: 3,
    days: [
      { date: '2026-09-20', label: 'Sun', active: true, sessions: 1, checkpoints: 0, reviews: 0 },
      { date: '2026-09-21', label: 'Mon', active: false, sessions: 0, checkpoints: 0, reviews: 0 },
      { date: '2026-09-22', label: 'Tue', active: true, sessions: 0, checkpoints: 1, reviews: 0 },
      { date: '2026-09-23', label: 'Wed', active: false, sessions: 0, checkpoints: 0, reviews: 0 },
      { date: '2026-09-24', label: 'Thu', active: true, sessions: 0, checkpoints: 0, reviews: 1 },
      { date: '2026-09-25', label: 'Fri', active: false, sessions: 0, checkpoints: 0, reviews: 0 },
      { date: '2026-09-26', label: 'Sat', active: false, sessions: 0, checkpoints: 0, reviews: 0 },
    ],
  },
  focusAreas: [{ id: 1, lessonId: 102, sessionTitle: 'Build a profile card', chapterTitle: 'Components', description: 'Try smaller component boundaries.', recurring: false }],
  mistakes: [],
}

function renderDashboard(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Dashboard />
      <CurrentLocation />
    </MemoryRouter>,
  )
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTopics.mockResolvedValue(defaultTopics)
    getDefaultTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getDashboard.mockResolvedValue(defaultDashboard)
    selectTopic.mockResolvedValue({ ok: true })
    deleteTopic.mockResolvedValue({ ok: true })
    getReviewCount.mockResolvedValue({ totalDue: 3, dueToday: 2, overdue: 1 })
    getStreak.mockResolvedValue({ currentStreak: 2, maxStreak: 4, backlog: false, streakBroken: false, message: 'Keep your gentle rhythm going.' })
  })

  it('shows an inviting empty state and a clear first-Track action', async () => {
    getTopics.mockResolvedValue({ topics: [] })
    renderDashboard()

    expect(await screen.findByRole('heading', { name: /your first trail starts here/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /start learning/i }))
    expect(screen.getByTestId('current-location')).toHaveTextContent('/onboarding')
  })

  it('renders Today first and the server-selected action starts the exact Session', async () => {
    renderDashboard()

    const today = await screen.findByRole('region', { name: /today's next step/i })
    expect(within(today).getByRole('heading', { name: /build a profile card/i })).toBeInTheDocument()
    expect(within(today).getByText(/15 min/i)).toBeInTheDocument()
    fireEvent.click(within(today).getByRole('link', { name: /start session/i }))
    expect(screen.getByTestId('current-location')).toHaveTextContent('/topic/1/lesson/102')
    expect(getDashboard).toHaveBeenCalledWith(1, '2026-09-26', 'Asia/Karachi')
  })

  it('keeps the next step before the route and support details', async () => {
    renderDashboard()
    const scene = await screen.findByRole('main')
    const action = within(scene).getByRole('region', { name: /today's next step/i })
    const path = within(scene).getByRole('region', { name: /your trail so far/i })
    const support = within(scene).getByRole('region', { name: /reviews due/i })
    expect(action.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(path.compareDocumentPosition(support) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the support details available without adding another dashboard fetch', async () => {
    renderDashboard()
    await screen.findByRole('region', { name: /today's next step/i })
    fireEvent.click(screen.getByRole('button', { name: /progress and focus/i }))
    expect(screen.getByRole('dialog', { name: /progress and focus/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /weekly rhythm/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /focus areas/i })).toBeInTheDocument()
    expect(getDashboard).toHaveBeenCalledTimes(1)
  })

  it('expands the current Chapter, collapses completed Chapters, marks Builds, and explains locked work', async () => {
    getDashboard.mockResolvedValue({
      ...defaultDashboard,
      nextAction: { ...defaultDashboard.nextAction, moduleId: 12, chapterTitle: 'State and events', lessonId: 103 },
      modules: [
        { ...defaultDashboard.modules[0], status: 'completed', checkpointStatus: 'completed', lessons: defaultDashboard.modules[0].lessons.map((lesson) => ({ ...lesson, state: 'passed', locked: false })) },
        { ...defaultDashboard.modules[1], checkpointStatus: 'ready', examReady: true, lessons: [{ ...defaultDashboard.modules[1].lessons[0], locked: false }] },
        { id: 13, title: 'Patterns', summary: '', status: 'active', checkpointStatus: 'locked', lessonsRemaining: 2, skill_outcomes: [], lessons: [{ id: 104, title: 'Compose a flow', state: 'not_started', locked: true, prerequisites: [], outcomes: [] }] },
      ],
    })
    renderDashboard()

    await screen.findByRole('region', { name: /your trail so far/i })
    fireEvent.click(screen.getByRole('button', { name: /view full track/i }))
    const track = screen.getByRole('dialog', { name: /full track/i })
    expect(within(track).getByRole('button', { name: /chapter 1, components/i })).toHaveAttribute('aria-expanded', 'true')
    const currentChapter = within(track).getByRole('button', { name: /chapter 2, state and events/i })
    expect(currentChapter).toHaveAttribute('aria-expanded', 'true')
    expect(within(track).getByText(/build session/i)).toBeInTheDocument()
    expect(within(track).getByText(/checkpoint ready/i)).toBeInTheDocument()
    const locked = within(track).getByRole('button', { name: /compose a flow, locked/i })
    expect(locked).toBeDisabled()
    expect(within(track).getByText(/complete the earlier chapter first/i)).toBeInTheDocument()

    fireEvent.click(within(track).getByRole('button', { name: /chapter 1, components/i }))
    expect(within(track).getByRole('button', { name: /chapter 1, components/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('switches Trails and selects a continuation from the URL without guessing priority', async () => {
    getDashboard
      .mockResolvedValueOnce(defaultDashboard)
      .mockResolvedValueOnce({ ...defaultDashboard, topic: { ...defaultDashboard.topic, id: 2, title: 'Calculus' }, nextAction: { kind: 'setup_track', topicId: 2, title: 'Finish setting up Calculus' }, modules: [] })
    getTopics.mockResolvedValue({ topics: defaultTopics.topics })
    renderDashboard()

    await screen.findByRole('region', { name: /today's next step/i })
    fireEvent.click(screen.getByRole('button', { name: /choose trail/i }))
    fireEvent.click(screen.getByText('Calculus').closest('button'))
    await waitFor(() => expect(selectTopic).toHaveBeenCalledWith(2))
    expect(await screen.findByRole('heading', { name: /^calcul(us)?$/i })).toBeInTheDocument()

    getDashboard.mockResolvedValueOnce({ ...defaultDashboard, topic: { ...defaultDashboard.topic, id: 2, title: 'Calculus' } })
    renderDashboard('/?topicId=2')
    await screen.findByRole('heading', { name: /^calcul(us)?$/i })
    expect(getDashboard).toHaveBeenCalledWith(2, '2026-09-26', 'Asia/Karachi')
  })

  it('does not offer deletion for a Trail that has linked continuations', async () => {
    getTopics.mockResolvedValue({ topics: [
      { ...defaultTopics.topics[0], hasChildren: true },
      { ...defaultTopics.topics[1], hasChildren: false },
    ] })
    renderDashboard()

    await screen.findByRole('region', { name: /today's next step/i })
    fireEvent.click(screen.getByRole('button', { name: /choose trail/i }))
    expect(screen.queryByRole('button', { name: /delete trail react/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete trail calculus/i })).toBeInTheDocument()
  })

  it('offers next-Track planning only when the server reports a completed Track', async () => {
    getDashboard.mockResolvedValue({
      ...defaultDashboard,
      topic: { ...defaultDashboard.topic, status: 'completed' },
      nextAction: { kind: 'track_complete', topicId: 1, topicTitle: 'React' },
      modules: defaultDashboard.modules.map((module) => ({ ...module, status: 'completed', checkpointStatus: 'completed' })),
    })
    renderDashboard()

    fireEvent.click(await screen.findByRole('link', { name: /plan my next track/i }))
    expect(screen.getByTestId('current-location')).toHaveTextContent('/topic/1/continue')
  })

  it('shows recoverable dashboard errors and a retry action', async () => {
    getDashboard.mockRejectedValueOnce(new Error('Dashboard connection failed.'))
    renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent(/dashboard connection failed/i)
    getDashboard.mockResolvedValueOnce(defaultDashboard)
    fireEvent.click(screen.getByRole('button', { name: /retry loading trail/i }))
    expect(await screen.findByRole('region', { name: /today's next step/i })).toBeInTheDocument()
  })
})
