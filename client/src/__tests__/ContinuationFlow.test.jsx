import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ContinuationFlow from '../pages/ContinuationFlow.jsx'

vi.mock('../api.js', () => ({
  getContinuationReadiness: vi.fn(),
  getDashboard: vi.fn(),
  generateContinuation: vi.fn(),
  tweakContinuation: vi.fn(),
  confirmContinuation: vi.fn(),
}))

import {
  getContinuationReadiness,
  getDashboard,
  generateContinuation,
  tweakContinuation,
  confirmContinuation,
} from '../api.js'

const priorOutcomes = [
  { id: 'devops-deploy', title: 'Deploy a service safely', kind: 'skill', role: 'core', evidence: ['activity', 'checkpoint'] },
  { id: 'devops-traffic', title: 'Explain service traffic flow', kind: 'knowledge', role: 'core', evidence: ['activity', 'checkpoint'] },
]
const readiness = {
  eligible: true,
  course: { id: 1, title: 'DevOps Foundations', status: 'completed', course_kind: 'core', course_stage: 0, level: 'Intermediate', time_per_week: '30 min/day' },
  lineage: [{ id: 1, title: 'DevOps Foundations', course_stage: 0 }],
  summary: { outcomes: priorOutcomes, strengths: [priorOutcomes[0]], gaps: ['Explain rollback decisions'], artifactFeedback: ['Clear, reproducible deployment notes.'] },
}
const completedDashboard = {
  topic: { id: 1, title: 'DevOps Foundations', status: 'completed' },
  modules: [{
    id: 10,
    title: 'Safe deployments',
    skill_outcomes: priorOutcomes,
    lessons: [
      { id: 21, title: 'Release checks', outcomes: [priorOutcomes[0]], artifact_required: false, estimated_time: 15 },
      { id: 22, title: 'Build a release plan', outcomes: priorOutcomes, artifact_required: true, estimated_time: 30 },
    ],
  }],
}
const continuationOutcomes = [
  { id: 'release-breadth', title: 'Explain deployment strategies', kind: 'knowledge', role: 'breadth', evidence: ['activity', 'checkpoint'] },
  { id: 'release-core', title: 'Choose a safe rollback path', kind: 'skill', role: 'core', evidence: ['activity', 'checkpoint', 'artifact'] },
]
const curriculum = {
  title: 'Release Engineering',
  goal: 'Make changes dependable.',
  course: { kind: 'advanced', stage: 1, focus: 'balanced-next' },
  modules: [{
    title: 'Safer releases',
    summary: 'Practice the important decisions.',
    skill_outcomes: continuationOutcomes,
    lessons: [
      { title: 'Read a rollout', depth: 'Advanced', estimated_time: 15, outcomes: [continuationOutcomes[0]], prerequisites: [], artifact_required: false },
      { title: 'Choose a rollback', depth: 'Advanced', estimated_time: 18, outcomes: [continuationOutcomes[1]], prerequisites: ['Read a rollout'], artifact_required: true, task: { title: 'Rollback plan' } },
    ],
  }],
}

function streamResponse(value) {
  const encoded = new TextEncoder().encode(`event: curriculum\ndata: ${JSON.stringify(value)}\n\ndata: ${JSON.stringify('[DONE]')}\n\n`)
  let consumed = false
  return { ok: true, body: { getReader: () => ({ read: async () => consumed ? { done: true } : (consumed = true, { done: false, value: encoded }) }) } }
}

function DashboardDestination() {
  const location = useLocation()
  return <h1 data-testid="dashboard-destination">{location.pathname}{location.search}</h1>
}

function renderFlow() {
  return render(
    <MemoryRouter initialEntries={['/topic/1/continue']}>
      <Routes>
        <Route path="/topic/:topicId/continue" element={<ContinuationFlow />} />
        <Route path="/" element={<DashboardDestination />} />
        <Route path="*" element={<h1>Other destination</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ContinuationFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getContinuationReadiness.mockResolvedValue(readiness)
    getDashboard.mockResolvedValue(completedDashboard)
    generateContinuation.mockImplementation(() => Promise.resolve(streamResponse(curriculum)))
    tweakContinuation.mockResolvedValue({ curriculum })
    confirmContinuation.mockResolvedValue({ topic: { id: 2 }, dashboardPath: '/?topicId=2' })
  })

  it('shows completion details and generates a balanced continuation automatically', async () => {
    renderFlow()

    expect(await screen.findByRole('heading', { name: /your track is complete/i })).toBeInTheDocument()
    expect(screen.getByText('Build a release plan')).toBeInTheDocument()
    expect(screen.getAllByText('Explain service traffic flow')).toHaveLength(2)
    expect(screen.getByText(/rollback decisions/i)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /release engineering/i })).toBeInTheDocument()
    expect(screen.getByText(/about 80% core learning and 20% breadth/i)).toBeInTheDocument()
    expect(screen.getByText('Explain deployment strategies').closest('li')).toHaveAttribute('data-outcome-role', 'breadth')
    expect(generateContinuation).toHaveBeenCalledWith('1', { level: 'Intermediate', timeCommitment: '30 min/day' })
    expect(screen.queryByText(/lane/i)).not.toBeInTheDocument()
  })

  it('does not offer generation for an incomplete Track', async () => {
    getContinuationReadiness.mockResolvedValue({ ...readiness, eligible: false, reason: 'One Chapter checkpoint remains.' })
    renderFlow()

    expect(await screen.findByRole('heading', { name: /finish this track first/i })).toBeInTheDocument()
    expect(screen.getByText(/one chapter checkpoint remains/i)).toBeInTheDocument()
    expect(generateContinuation).not.toHaveBeenCalled()
  })

  it('regenerates transient drafts after refresh or re-entry without local persistence', async () => {
    const first = renderFlow()
    expect(await screen.findByRole('heading', { name: /release engineering/i })).toBeInTheDocument()
    first.unmount()
    renderFlow()
    expect(await screen.findByRole('heading', { name: /release engineering/i })).toBeInTheDocument()
    expect(generateContinuation).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem('continuation-draft')).toBeNull()
  })

  it('keeps the completion summary visible and retries a failed generation', async () => {
    generateContinuation.mockRejectedValueOnce(new Error('The provider is busy.'))
    renderFlow()

    expect(await screen.findByRole('alert')).toHaveTextContent(/provider is busy/i)
    expect(screen.getByRole('heading', { name: /your track is complete/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry generation/i }))
    expect(await screen.findByRole('heading', { name: /release engineering/i })).toBeInTheDocument()
    expect(generateContinuation).toHaveBeenCalledTimes(2)
  })

  it('tweaks the transient draft without a lane and preserves the current preview on failure', async () => {
    renderFlow()
    await screen.findByRole('heading', { name: /release engineering/i })
    tweakContinuation.mockRejectedValueOnce(new Error('Could not revise the plan.'))
    fireEvent.click(screen.getByRole('button', { name: /adjust plan/i }))
    fireEvent.change(screen.getByLabelText(/what would you like to adjust/i), { target: { value: 'Add a rollback simulation.' } })
    fireEvent.click(screen.getByRole('button', { name: /apply adjustment/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not revise/i)
    expect(screen.getByRole('heading', { name: /release engineering/i })).toBeInTheDocument()
    expect(tweakContinuation).toHaveBeenCalledWith('1', expect.objectContaining({ request: 'Add a rollback simulation.' }))
    expect(tweakContinuation.mock.calls[0][1]).not.toHaveProperty('lane')
  })

  it('requires regeneration when the learner changes the plan pace', async () => {
    renderFlow()
    await screen.findByRole('heading', { name: /release engineering/i })
    fireEvent.change(screen.getByLabelText(/learner level/i), { target: { value: 'Advanced' } })

    expect(screen.getByRole('status')).toHaveTextContent(/your pace changed/i)
    expect(screen.getByRole('button', { name: /add to my trail/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /update plan for this rhythm/i }))

    await waitFor(() => expect(generateContinuation).toHaveBeenCalledTimes(2))
    expect(generateContinuation).toHaveBeenLastCalledWith('1', { level: 'Advanced', timeCommitment: '30 min/day' })
    expect(await screen.findByRole('button', { name: /add to my trail/i })).toBeEnabled()
  })

  it('preserves the preview after confirm failure and navigates to the new Track dashboard after success', async () => {
    confirmContinuation.mockRejectedValueOnce(new Error('The new Track could not be added.'))
    renderFlow()
    await screen.findByRole('heading', { name: /release engineering/i })
    fireEvent.click(screen.getByRole('button', { name: /add to my trail/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be added/i)
    expect(screen.getByRole('heading', { name: /release engineering/i })).toBeInTheDocument()
    expect(confirmContinuation).toHaveBeenCalledWith('1', expect.objectContaining({ curriculum, level: 'Intermediate', timeCommitment: '30 min/day' }))
    expect(confirmContinuation.mock.calls[0][1]).not.toHaveProperty('lane')
    fireEvent.click(screen.getByRole('button', { name: /add to my trail/i }))
    expect(await screen.findByTestId('dashboard-destination')).toHaveTextContent('/?topicId=2')
  })

  it('lets the learner defer the next Track and return to the completed Track', async () => {
    renderFlow()
    expect(await screen.findByRole('heading', { name: /release engineering/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(await screen.findByTestId('dashboard-destination')).toHaveTextContent('/?topicId=1')
    expect(confirmContinuation).not.toHaveBeenCalled()
  })
})
