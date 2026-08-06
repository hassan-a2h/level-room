import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import OfflineIndicator from '../components/OfflineIndicator.jsx'

describe('OfflineIndicator', () => {
  let fetchMock

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock = vi.spyOn(global, 'fetch')
  })

  afterEach(() => {
    vi.useRealTimers()
    fetchMock.mockRestore()
  })

  it('does not render when backend is reachable', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    render(<OfflineIndicator />)
    // Wait for initial check
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3200/health',
        expect.any(Object)
      )
    })
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument()
  })

  it('renders offline banner when backend is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('Connection refused'))
    render(<OfflineIndicator />)
    await waitFor(() => {
      expect(screen.getByTestId('offline-banner')).toBeInTheDocument()
    })
    expect(screen.getByText(/cannot reach the learning engine/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('ui-alert-warning')
  })

  it('can be dismissed', async () => {
    fetchMock.mockRejectedValue(new Error('Connection refused'))
    render(<OfflineIndicator />)
    await waitFor(() => {
      expect(screen.getByTestId('offline-banner')).toBeInTheDocument()
    })
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i })
    fireEvent.click(dismissBtn)
    await waitFor(() => {
      expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument()
    })
  })

  it('polls health endpoint periodically', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    render(<OfflineIndicator />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    // Advance timers to trigger next poll
    vi.advanceTimersByTime(15000)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })
})
