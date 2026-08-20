import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CodexConnection from '../components/CodexConnection.jsx'

vi.mock('../api.js', () => ({
  getCodexConnection: vi.fn(),
  startCodexLogin: vi.fn(),
  getCodexLoginStatus: vi.fn(),
  submitCodexManualCode: vi.fn(),
  cancelCodexLogin: vi.fn(),
  disconnectCodex: vi.fn(),
}))

import {
  getCodexConnection,
  startCodexLogin,
  getCodexLoginStatus,
  submitCodexManualCode,
  cancelCodexLogin,
  disconnectCodex,
} from '../api.js'

describe('CodexConnection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getCodexConnection.mockResolvedValue({ connected: false, status: 'disconnected' })
  })

  it('shows local browser and device-code sign-in choices', async () => {
    render(<CodexConnection />)

    expect(await screen.findByText(/not connected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect with browser/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /use device code/i })).toBeInTheDocument()
  })

  it('opens only the validated authorization link and accepts a manual code', async () => {
    startCodexLogin.mockResolvedValue({ flowId: 'flow-1', state: 'starting', mode: 'browser' })
    getCodexLoginStatus.mockResolvedValue({
      flowId: 'flow-1', state: 'awaiting_manual_code', mode: 'browser',
      authUrl: 'https://auth.openai.com/authorize?state=fixture',
    })
    submitCodexManualCode.mockResolvedValue({ accepted: true })
    getCodexConnection.mockResolvedValueOnce({ connected: false, status: 'disconnected' })
      .mockResolvedValueOnce({ connected: true, status: 'connected' })

    render(<CodexConnection />)
    fireEvent.click(await screen.findByRole('button', { name: /connect with browser/i }))

    const link = await screen.findByRole('link', { name: /continue with openai/i })
    expect(link).toHaveAttribute('href', 'https://auth.openai.com/authorize?state=fixture')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    fireEvent.change(screen.getByLabelText(/authorization code/i), { target: { value: 'one-time-code' } })
    fireEvent.click(screen.getByRole('button', { name: /submit code/i }))
    await waitFor(() => expect(submitCodexManualCode).toHaveBeenCalledWith('flow-1', 'one-time-code'))
  })

  it('refreshes the connection status after OAuth completes', async () => {
    getCodexConnection.mockResolvedValueOnce({ connected: false, status: 'disconnected' })
      .mockResolvedValueOnce({ connected: true, status: 'connected' })
    startCodexLogin.mockResolvedValue({ flowId: 'flow-complete', state: 'starting', mode: 'browser' })
    getCodexLoginStatus.mockResolvedValue({ flowId: 'flow-complete', state: 'complete', mode: 'browser' })

    render(<CodexConnection />)
    fireEvent.click(await screen.findByRole('button', { name: /connect with browser/i }))

    expect(await screen.findByText('Connected to Codex.')).toBeInTheDocument()
    expect(getCodexConnection).toHaveBeenCalledTimes(2)
  })

  it('offers account switching without requiring the current local connection to be removed first', async () => {
    getCodexConnection.mockResolvedValue({ connected: true, status: 'connected' })
    startCodexLogin.mockResolvedValue({ flowId: 'flow-switch', state: 'starting', mode: 'browser' })
    getCodexLoginStatus.mockResolvedValue({ flowId: 'flow-switch', state: 'failed', mode: 'browser', errorCode: 'CODEX_LOGIN_FAILED' })

    render(<CodexConnection />)
    fireEvent.click(await screen.findByRole('button', { name: /connect another account/i }))

    expect(startCodexLogin).toHaveBeenCalledWith('browser')
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign-in failed/i)
    expect(screen.getByText('Connected to Codex.')).toBeInTheDocument()
  })

  it('shows the device code and lets the learner cancel the flow', async () => {
    startCodexLogin.mockResolvedValue({ flowId: 'flow-2', state: 'starting', mode: 'device_code' })
    getCodexLoginStatus.mockResolvedValue({
      flowId: 'flow-2', state: 'awaiting_device_code', mode: 'device_code',
      deviceCode: { userCode: 'ABCD-EFGH', verificationUri: 'https://auth.openai.com/codex/device', expiresInSeconds: 600 },
    })
    cancelCodexLogin.mockResolvedValue({ flowId: 'flow-2', state: 'cancelled' })

    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    try {
      render(<CodexConnection />)
      fireEvent.click(await screen.findByRole('button', { name: /use device code/i }))

      expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /open device verification/i })).toHaveAttribute('href', 'https://auth.openai.com/codex/device')
      fireEvent.click(screen.getByRole('button', { name: /copy device code/i }))
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABCD-EFGH'))
      fireEvent.click(screen.getByRole('button', { name: /cancel sign-in/i }))
      await waitFor(() => expect(cancelCodexLogin).toHaveBeenCalledWith('flow-2'))
      expect(screen.getByText(/not connected/i)).toBeInTheDocument()
    } finally {
      if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
      else delete navigator.clipboard
    }
  })

  it('asks before removing the local connection', async () => {
    getCodexConnection.mockResolvedValue({ connected: true, status: 'connected' })
    disconnectCodex.mockResolvedValue({ connected: false, status: 'disconnected' })
    vi.stubGlobal('confirm', vi.fn(() => true))

    render(<CodexConnection />)
    fireEvent.click(await screen.findByRole('button', { name: /disconnect codex/i }))

    expect(confirm).toHaveBeenCalled()
    await waitFor(() => expect(disconnectCodex).toHaveBeenCalled())
    expect(screen.getByText(/not connected/i)).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
