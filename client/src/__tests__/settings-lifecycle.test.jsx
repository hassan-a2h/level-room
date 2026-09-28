import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from '../pages/SettingsPage.jsx'

vi.mock('../api.js', () => ({
  getSettings: vi.fn(), saveSettings: vi.fn(), exportData: vi.fn(), importData: vi.fn(),
  getCodexConnection: vi.fn(), getCodexLoginStatus: vi.fn(), startCodexLogin: vi.fn(),
  cancelCodexLogin: vi.fn(), disconnectCodex: vi.fn(), submitCodexManualCode: vi.fn(),
}))

import { cancelCodexLogin, getCodexConnection, getCodexLoginStatus, getSettings, startCodexLogin } from '../api.js'

describe('Settings category lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSettings.mockResolvedValue({
      provider: 'openai-codex', model: 'codex-model', providers: [{
        id: 'openai-codex', name: 'Codex', authType: 'oauth', defaultModel: 'codex-model',
        models: [{ id: 'codex-model', name: 'Codex model', reasoningEfforts: [] }],
      }], envStatus: [],
    })
    getCodexConnection.mockResolvedValue({ connected: false, status: 'disconnected' })
    startCodexLogin.mockResolvedValue({ flowId: 'active-flow', state: 'starting', mode: 'browser' })
    getCodexLoginStatus.mockResolvedValue({ flowId: 'active-flow', state: 'awaiting_manual_code', mode: 'browser' })
    cancelCodexLogin.mockResolvedValue({ flowId: 'active-flow', state: 'cancelled' })
  })

  it('keeps an active Codex sign-in mounted when switching categories', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'AI connection' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Connect with browser' }))
    expect(await screen.findByLabelText('Authorization code')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Learning' }))

    await waitFor(() => expect(cancelCodexLogin).not.toHaveBeenCalled())
    expect(screen.getByLabelText('Authorization code').closest('.settings-ai-connection')).toHaveAttribute('hidden')
  })
})
