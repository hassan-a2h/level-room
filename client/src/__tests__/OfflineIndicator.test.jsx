import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
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
    expect(screen.getByText(/learning service is unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/saved learning data remains on this device/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('ui-alert-warning')
    expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument()
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
    act(() => vi.advanceTimersByTime(15000))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  it('offers a manual retry and clears the banner when the service returns', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection refused')).mockResolvedValueOnce({ ok: true })
    render(<OfflineIndicator />)
    const retry = await screen.findByRole('button', { name: /retry connection/i })
    fireEvent.click(retry)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument())
  })
})
