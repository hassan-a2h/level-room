import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SessionPage from '../pages/SessionPage.jsx'

vi.mock('../api.js', () => ({
  getLesson: vi.fn(),
  ensureActivities: vi.fn(),
}))
vi.mock('../components/session/SessionPlayer.jsx', () => ({ default: ({ session, activityDocument, activityState }) => <div data-testid="player">{session.title}:{activityDocument.blocks.length}:{activityState.currentBlockId}</div> }))

import { ensureActivities, getLesson } from '../api.js'

const block = { id: 'read-start', type: 'read', title: 'Begin', required: true, estimatedMinutes: 2, outcomeIds: ['sql-joins'], content: 'Learn joins.' }
const doc = { schemaVersion: 1, lesson: { lessonId: 8 }, blocks: [block] }
const state = { currentBlockId: 'read-start', blocks: { 'read-start': { status: 'active', attempts: 0 } } }
const lessonPayload = (overrides = {}) => ({
  lesson: { id: 8, title: 'Joins', module_title: 'SQL', estimated_time: 8, outcomes: [{ id: 'sql-joins', title: 'Explain joins' }] },
  progress: { state: 'practicing' }, activityDocument: doc, activityState: state,
  activityProgress: { completed: 0, total: 1, percent: 0, currentBlockId: 'read-start' }, locked: false, ...overrides,
})

function renderPage() {
  return render(<MemoryRouter initialEntries={['/topic/2/lesson/8']}><Routes><Route path="/topic/:topicId/lesson/:lessonId" element={<SessionPage />} /><Route path="/" element={<h1>Trail</h1>} /></Routes></MemoryRouter>)
}

describe('SessionPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads cached activities without calling generation', async () => {
    getLesson.mockResolvedValue(lessonPayload())
    renderPage()
    expect(await screen.findByTestId('player')).toHaveTextContent('Joins:1:read-start')
    expect(getLesson).toHaveBeenCalledTimes(1)
    expect(ensureActivities).not.toHaveBeenCalled()
  })

  it('generates only when the read document is null, then passes returned state to the player', async () => {
    getLesson.mockResolvedValue(lessonPayload({ activityDocument: null, activityState: null, activityProgress: null, progress: { state: 'not_started' } }))
    ensureActivities.mockResolvedValue({ activityDocument: doc, activityState: state, activityProgress: { completed: 0, total: 1 }, session: { completed: false } })
    renderPage()
    expect(await screen.findByTestId('player')).toHaveTextContent('Joins:1:read-start')
    expect(ensureActivities).toHaveBeenCalledWith('2', '8')
  })

  it('shows a locked prerequisite state and never generates', async () => {
    getLesson.mockResolvedValue(lessonPayload({ locked: true, activityDocument: null, unmetPrerequisites: [{ title: 'Earlier Session' }] }))
    renderPage()
    expect(await screen.findByText(/complete an earlier session first/i)).toBeInTheDocument()
    expect(screen.getByText('Earlier Session')).toBeInTheDocument()
    expect(ensureActivities).not.toHaveBeenCalled()
  })

  it('offers retry and Back to Trail after a provider failure', async () => {
    getLesson.mockResolvedValue(lessonPayload({ activityDocument: null, activityState: null, activityProgress: null }))
    ensureActivities.mockRejectedValueOnce(new Error('Provider unavailable.')).mockResolvedValueOnce({ activityDocument: doc, activityState: state, activityProgress: { completed: 0, total: 1 } })
    renderPage()
    expect(await screen.findByText('Provider unavailable.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByTestId('player')).toBeInTheDocument()
    expect(ensureActivities).toHaveBeenCalledTimes(2)
  })

  it('preserves in-progress route context when loading fails and supports retry', async () => {
    getLesson.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(lessonPayload())
    renderPage()
    expect(await screen.findByText(/connection/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByTestId('player')).toBeInTheDocument()
  })

  it('shows a safe recovery view for an invalid cached activity document', async () => {
    getLesson.mockRejectedValueOnce(Object.assign(new Error('Stored activities are invalid.'), { code: 'ACTIVITY_DOCUMENT_INVALID' }))
    renderPage()
    expect(await screen.findByText(/saved session activity needs attention/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to trail/i })).toBeInTheDocument()
    expect(ensureActivities).not.toHaveBeenCalled()
  })
})
