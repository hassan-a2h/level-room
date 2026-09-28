import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTopic, getSettings } from '../../api.js'
import { useOnboardingController } from './useOnboardingController.js'

vi.mock('../../api.js', () => ({ createTopic: vi.fn(), getSettings: vi.fn() }))

describe('useOnboardingController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSettings.mockResolvedValue({ ready: true })
  })

  it('sanitizes infrastructure errors before exposing them to the view', async () => {
    createTopic.mockRejectedValueOnce(new Error('SQLITE_ERROR: no such table: topics'))
    const { result } = renderHook(() => useOnboardingController({ navigate: vi.fn() }))
    await waitFor(() => expect(result.current.model.busy.submitting).toBe(false))
    act(() => result.current.actions.setDestination('Learn React'))
    await act(() => result.current.actions.submitDestination())
    expect(result.current.model.error).toBe('We could not create that Trail. Please try again.')
  })
})
