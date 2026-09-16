import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ContinuationFlow from '../pages/ContinuationFlow.jsx'

vi.mock('../api.js', () => ({
  getContinuationReadiness: vi.fn(),
  getContinuationOptions: vi.fn(),
  generateContinuation: vi.fn(),
  tweakContinuation: vi.fn(),
  confirmContinuation: vi.fn(),
}))

import {
  getContinuationReadiness,
  getContinuationOptions,
  generateContinuation,
  tweakContinuation,
  confirmContinuation,
} from '../api.js'

const readiness = {
  eligible: true,
  course: { id: 1, title: 'DevOps', status: 'completed', course_kind: 'core', course_stage: 0, level: 'Intermediate', time_per_week: '30 min/day' },
  lineage: [{ id: 1, title: 'DevOps', course_stage: 0 }],
}
const options = {
  options: [
    { id: 'observability', title: 'Observability', rationale: 'Trace systems.', builds_on: ['Core'], target_outcomes: ['Debug services'], free_stack: { primary: { kind: 'local', description: 'Run locally.' }, fallback: { kind: 'no_software', description: 'Use fixtures.' } } },
    { id: 'security', title: 'Security', rationale: 'Harden systems.', builds_on: ['Core'], target_outcomes: ['Apply defaults'], free_stack: { primary: { kind: 'local', description: 'Run locally.' }, fallback: { kind: 'no_software', description: 'Use fixtures.' } } },
    { id: 'platform', title: 'Platform', rationale: 'Automate delivery.', builds_on: ['Core'], target_outcomes: ['Automate locally'], free_stack: { primary: { kind: 'local', description: 'Run locally.' }, fallback: { kind: 'no_software', description: 'Use fixtures.' } } },
  ],
}
const curriculum = { course: { kind: 'advanced', stage: 1, focus: 'Observability' }, modules: [{ title: 'Module', lessons: [{ title: 'Lesson', depth: 'Advanced', estimated_time: 15, outcomes: ['Apply'], prerequisites: [] }] }] }

function streamResponse(value) {
  const encoded = new TextEncoder().encode(`event: curriculum\ndata: ${JSON.stringify(value)}\n\ndata: ${JSON.stringify('[DONE]')}\n\n`)
  let consumed = false
  return { ok: true, body: { getReader: () => ({ read: async () => consumed ? { done: true } : (consumed = true, { done: false, value: encoded }) }) } }
}

function renderFlow() {
  return render(<MemoryRouter initialEntries={['/topic/1/continue']}><Routes><Route path="/topic/:topicId/continue" element={<ContinuationFlow />} /><Route path="*" element={<h1>Lesson destination</h1>} /></Routes></MemoryRouter>)
}

describe('ContinuationFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getContinuationReadiness.mockResolvedValue(readiness)
    getContinuationOptions.mockResolvedValue(options)
    generateContinuation.mockResolvedValue(streamResponse(JSON.stringify(curriculum)))
    tweakContinuation.mockResolvedValue({ curriculum })
    confirmContinuation.mockResolvedValue({ topic: { id: 2 }, firstLessonId: 10 })
  })

  it('does not expose a continuation action for an incomplete course', async () => {
    getContinuationReadiness.mockResolvedValue({ eligible: false, reason: '2 module checkpoints remain.', course: readiness.course, lineage: readiness.lineage })
    renderFlow()
    expect(await screen.findByText(/finish this course/i)).toBeInTheDocument()
    expect(screen.getByText(/2 module checkpoints remain/i)).toBeInTheDocument()
    expect(getContinuationOptions).not.toHaveBeenCalled()
  })

  it('supports a suggested lane, profile editing, transient review and confirmation', async () => {
    renderFlow()
    expect(await screen.findByRole('heading', { name: /choose your next specialization/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /observability trace systems/i }))
    fireEvent.change(screen.getByLabelText(/learner level/i), { target: { value: 'Advanced' } })
    fireEvent.click(screen.getByRole('button', { name: /generate advanced course/i }))

    expect(await screen.findByRole('heading', { name: /review observability/i })).toBeInTheDocument()
    expect(generateContinuation).toHaveBeenCalledWith('1', { lane: 'Observability', level: 'Advanced', timeCommitment: '30 min/day' })

    fireEvent.click(screen.getByRole('button', { name: /tweak/i }))
    fireEvent.change(screen.getByPlaceholderText(/request changes/i), { target: { value: 'Add an incident drill.' } })
    fireEvent.click(screen.getByRole('button', { name: /apply tweak/i }))
    await waitFor(() => expect(tweakContinuation).toHaveBeenCalledWith('1', expect.objectContaining({ lane: 'Observability', request: 'Add an incident drill.' })))

    fireEvent.click(screen.getByRole('button', { name: /accept & start/i }))
    await waitFor(() => expect(confirmContinuation).toHaveBeenCalledWith('1', expect.objectContaining({ lane: 'Observability', level: 'Advanced' })))
    expect(await screen.findByRole('heading', { name: /lesson destination/i })).toBeInTheDocument()
  })

  it('keeps a custom lane transient until generation succeeds', async () => {
    renderFlow()
    await screen.findByRole('heading', { name: /choose your next specialization/i })
    fireEvent.change(screen.getByLabelText(/specialization lane/i), { target: { value: 'Kubernetes security' } })
    fireEvent.click(screen.getByRole('button', { name: /generate advanced course/i }))
    await screen.findByRole('heading', { name: /review kubernetes security/i })
    expect(confirmContinuation).not.toHaveBeenCalled()
  })

  it('offers a retry when lane suggestions fail', async () => {
    getContinuationOptions.mockRejectedValueOnce(new Error('Provider is temporarily unavailable.'))
    renderFlow()
    expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
    fireEvent.click(screen.getByRole('button', { name: /retry suggestions/i }))
    expect(await screen.findByRole('button', { name: /observability trace systems/i })).toBeInTheDocument()
    expect(getContinuationOptions).toHaveBeenCalledTimes(2)
  })
})
