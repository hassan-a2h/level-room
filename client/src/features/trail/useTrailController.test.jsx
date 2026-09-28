import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDashboard, getDefaultTopic, getReviewCount, getTopics, selectTopic } from '../../api.js'
import { useTrailController } from './useTrailController.js'

vi.mock('../../api.js', () => ({
  getDashboard: vi.fn(), getDefaultTopic: vi.fn(), getReviewCount: vi.fn(), getTopics: vi.fn(), selectTopic: vi.fn(), deleteTopic: vi.fn(),
  getLocalDate: () => '2026-09-28', getLocalTimeZone: () => 'Asia/Karachi',
}))

describe('useTrailController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getReviewCount.mockResolvedValue({ totalDue: 0 })
    getDefaultTopic.mockResolvedValue({ topic: { id: 1 } })
    getTopics.mockResolvedValue({ topics: [{ id: 1, title: 'Trail', hasChildren: false }] })
    getDashboard.mockResolvedValue({ topic: { id: 1, status: 'active' }, modules: [] })
  })

  it('converts API failures to a safe learner-facing error', async () => {
    getTopics.mockRejectedValueOnce(new Error('SQLITE_ERROR: no such table: topics'))
    const { result } = renderHook(() => useTrailController({ search: '', navigate: vi.fn() }))
    await waitFor(() => expect(result.current.model.state).toBe('error'))
    expect(result.current.model.error).toBe('Failed to load your Trail.')
  })

  it('switches the selected Trail through the controller actions', async () => {
    const { result } = renderHook(() => useTrailController({ search: '', navigate: vi.fn() }))
    await waitFor(() => expect(result.current.model.state).toBe('ready'))
    await act(() => result.current.actions.selectTopic(2))
    expect(selectTopic).toHaveBeenCalledWith(2)
    expect(getDashboard).toHaveBeenLastCalledWith(2, '2026-09-28', 'Asia/Karachi')
  })
})
