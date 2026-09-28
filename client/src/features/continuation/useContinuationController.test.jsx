import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateContinuation, getContinuationReadiness, getDashboard } from '../../api.js'
import { useContinuationController } from './useContinuationController.js'

vi.mock('../../api.js', () => ({
  generateContinuation: vi.fn(), getContinuationReadiness: vi.fn(), getDashboard: vi.fn(),
  tweakContinuation: vi.fn(), confirmContinuation: vi.fn(),
}))
vi.mock('../../curriculumStream.js', () => ({ readCurriculumStream: vi.fn(async (response) => response) }))

describe('useContinuationController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getContinuationReadiness.mockResolvedValue({ eligible: true, course: { level: 'Intermediate', time_per_week: '30 min/day' } })
    getDashboard.mockResolvedValue({ topic: { id: 1 }, modules: [] })
  })

  it('sanitizes readiness API failures before exposing the model error', async () => {
    getContinuationReadiness.mockRejectedValueOnce(new Error('SQLITE_ERROR: private database detail'))
    const { result } = renderHook(() => useContinuationController({ topicId: '1', navigate: vi.fn() }))
    await waitFor(() => expect(result.current.model.phase).toBe('error'))
    expect(result.current.model.error).toBe('Could not load your completed Track.')
  })

  it('keeps a safe preview error and preview after a tweak failure', async () => {
    const draft = { modules: [{ id: 2 }] }
    generateContinuation.mockResolvedValue(draft)
    const { result } = renderHook(() => useContinuationController({ topicId: '1', navigate: vi.fn() }))
    await waitFor(() => expect(result.current.model.phase).toBe('preview'))
    act(() => result.current.actions.setAdjustmentDraft('Add a practice session'))
    const { tweakContinuation } = await import('../../api.js')
    tweakContinuation.mockRejectedValueOnce(new Error('SQLITE_ERROR: private detail'))
    await act(() => result.current.actions.applyAdjustment())
    expect(result.current.model.preview).toBe(draft)
    expect(result.current.model.error).toBe('The plan could not be adjusted. Your current preview is still here.')
  })
})
