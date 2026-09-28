import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../../theme/ThemeProvider.jsx'
import Dashboard from '../../pages/Dashboard.jsx'

vi.mock('../../api.js', () => ({
  deleteTopic: vi.fn(),
  getDashboard: vi.fn(),
  getDefaultTopic: vi.fn(),
  getLocalDate: vi.fn(() => '2026-09-26'),
  getLocalTimeZone: vi.fn(() => 'Asia/Karachi'),
  getReviewCount: vi.fn(),
  getTopics: vi.fn(),
  selectTopic: vi.fn(),
}))

import { deleteTopic, getDashboard, getDefaultTopic, getReviewCount, getTopics, selectTopic } from '../../api.js'

const themes = ['living-atlas', 'curiosity-engine', 'mission-workshop']
const actionCases = [
  [{ kind: 'resume_session', topicId: 1, lessonId: 108, chapterTitle: 'Chapter', sessionTitle: 'Resume this Session' }, 'Continue Session', '/topic/1/lesson/108'],
  [{ kind: 'start_session', topicId: 1, lessonId: 109, chapterTitle: 'Chapter', sessionTitle: 'Start this Session' }, 'Start Session', '/topic/1/lesson/109'],
  [{ kind: 'start_review', topicId: 1, overdueReviews: 2 }, 'Start review', '/reviews'],
  [{ kind: 'start_checkpoint', topicId: 1, moduleId: 10 }, 'Start checkpoint', '/topic/1/chapter/10/checkpoint'],
  [{ kind: 'setup_track', topicId: 1, title: 'Finish setting up your Track' }, 'Continue setup', '/onboarding?topicId=1'],
  [{ kind: 'track_complete', topicId: 1, title: 'Plan next Track' }, 'Plan my next Track', '/topic/1/continue'],
  [{ kind: 'unavailable', topicId: 1, title: 'This Trail needs attention' }, null, null],
]
const topic = { id: 1, title: 'A very long learning destination title that should stay contained on narrow screens', status: 'active', progress: 25 }
const topics = [{ ...topic, hasChildren: true }, { id: 2, title: 'Second Trail', status: 'active', progress: 0, hasChildren: false }]

function makeChapters(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 10,
    title: index === 0 ? 'A chapter title long enough to test overflow in every theme layout' : `Chapter ${index + 1}`,
    status: index < 2 ? 'completed' : 'active',
    checkpointStatus: index < 2 ? 'completed' : 'locked',
    lessons: [{ id: index + 100, title: `Session ${index + 1}`, state: index < 2 ? 'passed' : 'not_started', locked: false }],
  }))
}

const dashboard = (count = 6, nextAction = { kind: 'start_session', topicId: 1, moduleId: 12, lessonId: 102, chapterTitle: 'Chapter 3', sessionTitle: 'Session 3' }) => ({
  topic,
  modules: makeChapters(count),
  nextAction,
  reviewSummary: { dueToday: 1, overdue: 0, totalDue: 1 },
  weeklyRhythm: { activeDays: 2, days: [] },
  focusAreas: [{ id: 1, lessonId: 102, sessionTitle: 'Session 3', chapterTitle: 'Chapter 3', description: 'Revisit this idea.' }],
})

function renderWithTheme(theme, initialEntry = '/') {
  window.localStorage.setItem('mastery-trail-theme-v2', theme)
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<Suspense fallback={<div role="status">Loading view…</div>}><Dashboard /></Suspense>} />
          <Route path="*" element={<div />} />
        </Routes>
        <CurrentLocation />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

function CurrentLocation() {
  const location = useLocation()
  return <output data-testid="current-location">{location.pathname}{location.search}</output>
}

describe('Trail theme parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    getTopics.mockResolvedValue({ topics })
    getDefaultTopic.mockResolvedValue({ topic })
    getDashboard.mockResolvedValue(dashboard())
    getReviewCount.mockResolvedValue({ totalDue: 1, dueToday: 1, overdue: 0 })
    selectTopic.mockResolvedValue({ ok: true })
    deleteTopic.mockResolvedValue({ ok: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it.each(themes)('%s presents the same ready Trail model and bounded Chapter window', async (theme) => {
    renderWithTheme(theme)

    const scene = await screen.findByRole('main')
    expect(scene).toHaveAttribute('data-theme-view', 'TrailView')
    expect(document.querySelectorAll('[data-theme-view="TrailView"]')).toHaveLength(1)
    expect(within(scene).getByRole('heading', { name: topic.title })).toBeInTheDocument()
    expect(within(scene).getByRole('region', { name: /today's next step/i })).toBeInTheDocument()
    expect(within(scene).getByRole('button', { name: /view full track/i })).toBeInTheDocument()
    expect(within(scene).getAllByRole('article', { name: /chapter/i }).length).toBeLessThanOrEqual(5)
    expect(getTopics).toHaveBeenCalledTimes(1)
    expect(getDashboard).toHaveBeenCalledTimes(1)
  })

  it.each(themes)('%s keeps topic actions in the heading popover and preserves deletion rules', async (theme) => {
    renderWithTheme(theme)

    const switcher = await screen.findByRole('button', { name: /choose trail/i })
    fireEvent.click(switcher)
    const menu = screen.getByRole('group', { name: /your trails/i })
    expect(screen.queryByRole('button', { name: /delete trail a very long learning destination/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete trail second trail/i })).toBeInTheDocument()
    fireEvent.click(within(menu).getByText('Second Trail').closest('button'))
    await waitFor(() => expect(selectTopic).toHaveBeenCalledWith(2))
    fireEvent.click(screen.getByRole('button', { name: /choose trail/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete trail second trail/i }))
    await waitFor(() => expect(deleteTopic).toHaveBeenCalledWith(2))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Second Trail'))
  })

  it.each(themes)('%s exposes every Chapter and the progress details in separate sheets', async (theme) => {
    getDashboard.mockResolvedValue(dashboard(20))
    renderWithTheme(theme)

    fireEvent.click(await screen.findByRole('button', { name: /view full track/i }))
    const trackSheet = screen.getByRole('dialog', { name: /full track/i })
    expect(within(trackSheet).getAllByRole('article', { name: /chapter/i })).toHaveLength(20)
    expect(within(trackSheet).getAllByRole('list', { name: /sessions in/i })).toHaveLength(20)
    fireEvent.click(within(trackSheet).getByRole('button', { name: /close/i }))
    fireEvent.click(screen.getByRole('button', { name: /progress and focus/i }))
    const progressSheet = screen.getByRole('dialog', { name: /progress and focus/i })
    expect(within(progressSheet).getByRole('region', { name: /weekly rhythm/i })).toBeInTheDocument()
    expect(within(progressSheet).getByRole('region', { name: /focus areas/i })).toBeInTheDocument()
  })

  it.each(themes)('%s keeps empty, setup, completed, and error states actionable', async (theme) => {
    getTopics.mockResolvedValueOnce({ topics: [] })
    const { unmount } = renderWithTheme(theme)
    expect(await screen.findByRole('heading', { name: /your first trail starts here/i })).toBeInTheDocument()
    unmount()

    getTopics.mockResolvedValue({ topics })
    getDashboard.mockResolvedValueOnce({ ...dashboard(0), topic: { ...topic, resumeAvailable: true, curriculumState: 'setup' }, modules: [] })
    const setup = renderWithTheme(theme)
    expect(await screen.findByRole('heading', { name: /finish setting up your track/i })).toBeInTheDocument()
    setup.unmount()

    getDashboard.mockResolvedValueOnce({ ...dashboard(1), topic: { ...topic, status: 'completed' }, nextAction: { kind: 'track_complete', topicId: 1, topicTitle: topic.title } })
    const complete = renderWithTheme(theme)
    expect(await screen.findByRole('link', { name: /plan my next track/i })).toBeInTheDocument()
    complete.unmount()

    getDashboard.mockRejectedValueOnce(new Error('Dashboard connection failed.'))
    renderWithTheme(theme)
    expect(await screen.findByRole('alert')).toHaveTextContent(/dashboard connection failed/i)
  })

  it.each(themes)('%s keeps the compact Chapter window correct for 0, 1, 5, 6, and 20 Chapters', async (theme) => {
    for (const count of [0, 1, 5, 6, 20]) {
      getDashboard.mockResolvedValueOnce(dashboard(count))
      const { unmount } = renderWithTheme(theme)
      const scene = await screen.findByRole('main')
      const chapterCards = within(scene).queryAllByRole('article', { name: /chapter/i })
      expect(chapterCards.length).toBeLessThanOrEqual(5)
      expect(chapterCards.length).toBe(count < 6 ? count : 5)
      unmount()
    }
  })

  it.each(themes.flatMap((theme) => actionCases.map((testCase) => [theme, ...testCase])))('%s maps nextAction kind %s to its canonical action', async (theme, action, label, path) => {
    const complete = action.kind === 'track_complete'
    const setup = action.kind === 'setup_track'
    getDashboard.mockResolvedValueOnce({
      ...dashboard(setup ? 0 : action.kind === 'start_checkpoint' ? 1 : 6, action),
      topic: { ...topic, status: complete ? 'completed' : 'active', resumeAvailable: setup, curriculumState: 'setup' },
    })
    renderWithTheme(theme)
    await screen.findByRole('main')
    if (action.kind === 'start_checkpoint') {
      fireEvent.click(await screen.findByRole('button', { name: label }))
    } else if (label) {
      fireEvent.click(await screen.findByRole('link', { name: label }))
    } else {
      expect(await screen.findByText(/trail data needs attention/i)).toBeInTheDocument()
    }
    if (path) expect(screen.getByTestId('current-location')).toHaveTextContent(path)
  })

  it.each(themes)('%s keeps long titles contained and checkpoint actions focused', async (theme) => {
    const longTitle = 'A chapter name with a deliberately long unbroken word ' + 'unbreakable'.repeat(12)
    const data = dashboard(1, { kind: 'start_checkpoint', topicId: 1, moduleId: 10, chapterTitle: longTitle })
    data.modules[0].title = longTitle
    getDashboard.mockResolvedValue(data)
    renderWithTheme(theme)

    const title = await screen.findByText(topic.title, { selector: '.trail-track-title' })
    expect(title).toHaveClass('trail-track-title')
    expect(title.parentElement).toHaveClass('min-w-0')
    expect(title).toHaveClass('break-words')
    expect(screen.getAllByText(longTitle).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /start checkpoint/i }))
    expect(screen.getByTestId('current-location')).toHaveTextContent('/topic/1/chapter/10/checkpoint')
  })
})
