import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayCard from '../components/trail/TodayCard.jsx'
import TrailMap from '../components/trail/TrailMap.jsx'
import WeeklyRhythm from '../components/trail/WeeklyRhythm.jsx'
import FocusAreas from '../components/trail/FocusAreas.jsx'

const modules = [
  {
    id: 10,
    title: 'Foundations',
    summary: 'Learn the pieces.',
    status: 'completed',
    checkpointStatus: 'completed',
    lessonsRemaining: 0,
    skill_outcomes: [{ id: 'read-code', title: 'Read component code', kind: 'knowledge', role: 'core', evidence: ['activity'] }],
    lessons: [{ id: 100, title: 'JSX basics', state: 'passed', locked: false, estimated_time: 10, outcomes: [], prerequisites: [], buildRequired: true, buildType: 'code' }],
  },
  {
    id: 11,
    title: 'Components',
    summary: 'Compose clear interfaces.',
    status: 'active',
    checkpointStatus: 'in_progress',
    examReady: true,
    lessonsRemaining: 0,
    skill_outcomes: [
      { id: 'write-components', title: 'Write reusable components', kind: 'skill', role: 'core', evidence: ['activity', 'artifact'] },
      { id: 'compare-patterns', title: 'Compare component patterns', kind: 'knowledge', role: 'breadth', evidence: ['checkpoint'] },
    ],
    lessons: [{ id: 101, title: 'Reusable cards', state: 'practicing', locked: false, estimated_time: 16, currentActivity: 'Choose a boundary', outcomes: [], prerequisites: [], buildRequired: true, buildType: 'project' }],
  },
  {
    id: 12,
    title: 'Stateful UI',
    summary: 'Keep change predictable.',
    status: 'active',
    checkpointStatus: 'locked',
    lessonsRemaining: 1,
    skill_outcomes: [],
    lessons: [{ id: 102, title: 'Update a counter', state: 'not_started', locked: true, estimated_time: 12, outcomes: [], prerequisites: [{ lessonId: 101, title: 'Reusable cards' }], buildRequired: false, buildType: '' }],
  },
]

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('TodayCard', () => {
  it('renders a Session action and honest duration from the server action', () => {
    renderWithRouter(<TodayCard nextAction={{ kind: 'resume_session', topicId: 4, topicTitle: 'React', chapterTitle: 'Components', sessionTitle: 'Reusable cards', currentActivity: 'Choose a boundary', estimatedMinutes: 16, lessonId: 41 }} />)
    expect(screen.getByRole('heading', { name: /reusable cards/i })).toBeInTheDocument()
    expect(screen.getByText(/choose a boundary/i)).toBeInTheDocument()
    expect(screen.getByText(/16 min/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /continue session/i })).toHaveAttribute('href', '/topic/4/lesson/41')
  })

  it('renders all server-provided action kinds without recalculating priority', () => {
    const onStartCheckpoint = vi.fn()
    const cases = [
      [{ kind: 'resume_checkpoint', topicId: 4, moduleId: 12, chapterTitle: 'Stateful UI' }, /resume checkpoint/i],
      [{ kind: 'start_checkpoint', topicId: 4, moduleId: 12, chapterTitle: 'Stateful UI' }, /start checkpoint/i],
    ]
    for (const [nextAction, label] of cases) {
      const { unmount } = renderWithRouter(<TodayCard nextAction={nextAction} onStartCheckpoint={onStartCheckpoint} />)
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(onStartCheckpoint).toHaveBeenLastCalledWith(12)
      unmount()
    }

    const { rerender } = renderWithRouter(<TodayCard nextAction={{ kind: 'start_review', overdueReviews: 3 }} />)
    expect(screen.getByRole('link', { name: /start review/i })).toHaveAttribute('href', '/reviews')
    rerender(<MemoryRouter><TodayCard nextAction={{ kind: 'setup_track', topicId: 4, title: 'Finish setting up your Track' }} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /finish setup/i })).toHaveAttribute('href', '/onboarding?topicId=4')
    rerender(<MemoryRouter><TodayCard nextAction={{ kind: 'track_complete', topicId: 4, topicTitle: 'React' }} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /plan my next track/i })).toHaveAttribute('href', '/topic/4/continue')
    rerender(<MemoryRouter><TodayCard nextAction={{ kind: 'unavailable', title: 'This Trail needs attention' }} /></MemoryRouter>)
    expect(screen.getByText(/this trail needs attention/i)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers a secondary review action only when due work exists', () => {
    renderWithRouter(<TodayCard nextAction={{ kind: 'start_session', topicId: 4, lessonId: 41, sessionTitle: 'Reusable cards' }} reviewSummary={{ dueToday: 1, overdue: 0, totalDue: 1 }} />)
    expect(screen.getByRole('link', { name: /review due items/i })).toHaveAttribute('href', '/reviews')
  })
})

describe('TrailMap', () => {
  it('renders Chapters in sequence with prior-lineage summary, current expansion, Build, lock, and checkpoint states', () => {
    render(
      <TrailMap
        topic={{ id: 4, title: 'React', courseStage: 1, progress: 48, parent: { id: 3, title: 'Web foundations', lane: 'balanced-next' } }}
        modules={modules}
        currentModuleId={11}
      />,
    )

    expect(screen.getByText(/builds on web foundations/i)).toBeInTheDocument()
    const completed = within(screen.getByRole('region', { name: /your trail so far/i })).getByRole('list', { name: /chapters completed so far/i })
    const ahead = within(screen.getByRole('region', { name: /remaining trail/i })).getByRole('list', { name: /chapters ahead/i })
    const chapters = [...completed.children, ...ahead.children]
    expect(chapters).toHaveLength(3)
    expect(chapters[0]).toHaveTextContent('Foundations')
    expect(chapters[1]).toHaveTextContent('Components')
    expect(chapters[2]).toHaveTextContent('Stateful UI')
    expect(screen.getByRole('button', { name: /chapter 1, foundations/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /chapter 2, components/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText(/build session/i)).toHaveLength(2)
    expect(screen.getByText(/checkpoint in progress/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update a counter, locked/i })).toBeDisabled()
    expect(screen.getByText(/complete the earlier chapter first/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /stateful ui/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /chapter 3, stateful ui/i })).not.toBeInTheDocument()
  })

  it('allows keyboard users to expand completed Chapters and start unlocked Sessions', () => {
    const onStartSession = vi.fn()
    render(<TrailMap topic={{ id: 4, title: 'React', progress: 50 }} modules={modules} currentModuleId={11} onStartSession={onStartSession} />)
    const foundations = screen.getByRole('button', { name: /chapter 1, foundations/i })
    fireEvent.click(foundations)
    expect(foundations).toHaveAttribute('aria-expanded', 'true')
    const currentSession = screen.getByRole('button', { name: /reusable cards, in progress/i })
    fireEvent.click(currentSession)
    expect(onStartSession).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }))
  })

  it('renders progress with a bounded accessible value', () => {
    render(<TrailMap topic={{ id: 4, title: 'React', progress: 240 }} modules={modules} currentModuleId={11} />)
    expect(screen.getByRole('progressbar', { name: /react track progress/i })).toHaveAttribute('aria-valuenow', '100')
  })
})

describe('WeeklyRhythm and FocusAreas', () => {
  it('renders seven named days and active-day total', () => {
    const days = Array.from({ length: 7 }, (_, index) => ({ date: `2026-09-${20 + index}`, label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index], active: index < 2, sessions: index === 0 ? 1 : 0, checkpoints: 0, reviews: index === 1 ? 1 : 0 }))
    render(<WeeklyRhythm rhythm={{ days, activeDays: 2 }} />)
    const region = screen.getByRole('region', { name: /weekly rhythm/i })
    expect(within(region).getByText(/2 active days/i)).toBeInTheDocument()
    expect(within(region).getAllByRole('listitem')).toHaveLength(7)
    expect(within(region).getByText(/sunday.*session/i)).toBeInTheDocument()
  })

  it('caps focus areas at three and links each to its related Session', () => {
    const areas = Array.from({ length: 4 }, (_, index) => ({ id: index + 1, lessonId: 20 + index, sessionTitle: `Session ${index + 1}`, chapterTitle: 'Foundations', description: `Practice focus ${index + 1}`, recurring: index === 0 }))
    const onOpenSession = vi.fn()
    render(<FocusAreas areas={areas} onOpenSession={onOpenSession} />)
    const region = screen.getByRole('region', { name: /focus areas/i })
    expect(within(region).getAllByRole('button')).toHaveLength(3)
    expect(within(region).queryByText(/practice focus 4/i)).not.toBeInTheDocument()
    fireEvent.click(within(region).getByRole('button', { name: /session 1/i }))
    expect(onOpenSession).toHaveBeenCalledWith(20)
  })
})
