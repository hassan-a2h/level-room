import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SessionPlayer from '../components/session/SessionPlayer.jsx'

vi.mock('../api.js', () => ({
  completeActivityBlock: vi.fn(), submitActivityBlock: vi.fn(), getLesson: vi.fn(), getLocalDate: () => '2026-09-26', sendChatMessage: vi.fn(),
}))
vi.mock('../components/ArtifactPanel.jsx', () => ({ default: () => <div>Build form</div> }))

import { completeActivityBlock, submitActivityBlock } from '../api.js'

const blocks = [
  { id: 'read-intro', type: 'read', title: 'Start here', content: 'Read the idea.', required: true, estimatedMinutes: 2, outcomeIds: ['joins'] },
  { id: 'choose-join', type: 'choice', title: 'Choose a join', prompt: 'Which join keeps left rows?', options: [{ id: 'inner', label: 'INNER JOIN' }, { id: 'left', label: 'LEFT JOIN' }], required: true, estimatedMinutes: 3, outcomeIds: ['joins'] },
  { id: 'read-next', type: 'read', title: 'Next idea', content: 'Later content is hidden.', required: true, estimatedMinutes: 2, outcomeIds: ['joins'] },
]
const doc = { schemaVersion: 1, lesson: { lessonId: 8 }, blocks }
const initialState = { currentBlockId: 'choose-join', blocks: { 'read-intro': { status: 'completed', attempts: 1 }, 'choose-join': { status: 'active', attempts: 0 } } }
const props = { topicId: '2', lessonId: '8', session: { id: 8, title: 'Joins', module_title: 'SQL', estimated_time: 8, outcomes: [{ id: 'joins', title: 'Explain joins', role: 'core' }] }, progress: { state: 'practicing' }, activityDocument: doc, activityState: initialState, activityProgress: { completed: 1, total: 3, percent: 33, currentBlockId: 'choose-join' } }
async function renderPlayer(extra = {}) {
  const view = render(<MemoryRouter><SessionPlayer {...props} {...extra} /></MemoryRouter>)
  await screen.findByRole('main')
  return view
}

describe('SessionPlayer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows one active block, earlier read-only content, locked future markers, and textual progress', async () => {
    await renderPlayer()
    expect(screen.queryByText('Read the idea.')).not.toBeInTheDocument()
    expect(screen.getByText('Which join keeps left rows?')).toBeInTheDocument()
    expect(screen.queryByText('Later content is hidden.')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Session progress' })).toHaveAttribute('aria-valuetext', '1 of 3')
    expect(screen.getByRole('list', { name: /session steps/i }).querySelectorAll('li')).toHaveLength(3)
  })

  it('allows a completed block to be reopened in read-only review', async () => {
    await renderPlayer()
    fireEvent.click(screen.getByRole('button', { name: /review start here/i }))
    expect(screen.getByText('Read the idea.')).toBeInTheDocument()
    expect(screen.getByText(/read and saved/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument()
  })

  it('sends one completion mutation and trusts the returned state', async () => {
    completeActivityBlock.mockResolvedValue({ status: 'completed', activityState: { currentBlockId: 'choose-join', blocks: { 'read-intro': { status: 'completed' }, 'choose-join': { status: 'active' } } }, activityProgress: { completed: 1, total: 3, currentBlockId: 'choose-join' } })
    await renderPlayer({ activityState: { ...initialState, currentBlockId: 'read-intro', blocks: { 'read-intro': { status: 'active', attempts: 0 } } }, activityProgress: { completed: 0, total: 3, currentBlockId: 'read-intro' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(completeActivityBlock).toHaveBeenCalledWith('2', '8', 'read-intro', { action: 'continue', localDate: '2026-09-26' }))
    expect(await screen.findByRole('progressbar', { name: 'Session progress' })).toHaveAttribute('aria-valuetext', '1 of 3')
  })

  it('preserves selected input after network loss and offers retry', async () => {
    submitActivityBlock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await renderPlayer()
    fireEvent.click(screen.getByRole('radio', { name: 'LEFT JOIN' }))
    fireEvent.click(screen.getByRole('button', { name: /check answer/i }))
    expect(await screen.findByText(/connection dropped/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'LEFT JOIN' })).toBeChecked()
    submitActivityBlock.mockResolvedValueOnce({ correct: true, status: 'passed', feedback: 'You identified the preserved side.', activityState: { currentBlockId: 'read-next', blocks: { 'read-intro': { status: 'completed' }, 'choose-join': { status: 'passed', attempts: 1, response: 'left', feedback: 'You identified the preserved side.' }, 'read-next': { status: 'active' } } }, activityProgress: { completed: 2, total: 3, percent: 66, currentBlockId: 'read-next' } })
    fireEvent.click(screen.getByRole('button', { name: /check answer/i }))
    expect(await screen.findByRole('progressbar', { name: 'Session progress' })).toHaveAttribute('aria-valuetext', '2 of 3')
  })

  it('allows only one active mutation request', async () => {
    let resolveMutation
    completeActivityBlock.mockReturnValueOnce(new Promise((resolve) => { resolveMutation = resolve }))
    await renderPlayer({ activityState: { ...initialState, currentBlockId: 'read-intro', blocks: { 'read-intro': { status: 'active', attempts: 0 } } }, activityProgress: { completed: 0, total: 3, currentBlockId: 'read-intro' } })
    const button = screen.getByRole('button', { name: /continue/i })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(completeActivityBlock).toHaveBeenCalledTimes(1)
    resolveMutation({ activityState: initialState, activityProgress: props.activityProgress, completion: { completed: false } })
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Session progress' })).toHaveAttribute('aria-valuetext', '1 of 3'))
  })

  it('explains a state conflict and restores the server-provided latest state', async () => {
    const latestState = { currentBlockId: 'read-next', blocks: { 'read-intro': { status: 'completed' }, 'choose-join': { status: 'passed', attempts: 1, response: 'left' }, 'read-next': { status: 'active', attempts: 0 } } }
    completeActivityBlock.mockRejectedValueOnce(Object.assign(new Error('Changed'), { code: 'ACTIVITY_STATE_CONFLICT', latestState }))
    await renderPlayer({ activityState: { ...initialState, currentBlockId: 'read-intro', blocks: { 'read-intro': { status: 'active', attempts: 0 } } }, activityProgress: { completed: 0, total: 3, currentBlockId: 'read-intro' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByText(/your saved progress was updated/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Session progress' })).toHaveAttribute('aria-valuetext', '2 of 3')
  })

  it('shows completion summary and outcome evidence for an already completed Session', async () => {
    await renderPlayer({ progress: { state: 'passed' }, activityState: { currentBlockId: null, blocks: { 'read-intro': { status: 'completed', response: 'Remember joins.' }, 'choose-join': { status: 'passed', response: 'left' }, 'read-next': { status: 'completed' } } }, activityProgress: { completed: 3, total: 3, percent: 100, currentBlockId: null } })
    expect(screen.getByRole('heading', { name: /session complete/i })).toBeInTheDocument()
    expect(screen.getByText('Explain joins')).toBeInTheDocument()
    expect(screen.getByText(/review this idea tomorrow/i)).toBeInTheDocument()
  })
})
