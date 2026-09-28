import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../components/AppHeader.jsx', () => ({ default: () => null }))
vi.mock('../components/CodexConnection.jsx', () => ({ default: () => null }))

import SettingsPage from '../pages/SettingsPage.jsx'

const providers = [{ id: 'openai', name: 'OpenAI', authType: 'api_key', defaultModel: 'gpt-4o', models: [{ id: 'gpt-4o', name: 'GPT-4o', reasoningEfforts: [] }] }]

describe('Settings operation retry', () => {
  beforeEach(() => { global.fetch = vi.fn() })

  it('retries a failed save without refetching or dropping the selected values', async () => {
    fetch.mockImplementation((_url, options = {}) => options.method === 'POST'
      ? Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ error: 'Provider unavailable.' }) })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ providers, provider: '', model: '', envStatus: [] }) }))

    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'AI connection' }))
    fireEvent.change(await screen.findByLabelText('LLM Provider'), { target: { value: 'openai' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2))
    expect(fetch.mock.calls.filter(([, options]) => options?.method !== 'POST')).toHaveLength(1)
    expect(screen.getByLabelText('LLM Provider')).toHaveValue('openai')
    expect(screen.getByLabelText('Model')).toHaveValue('gpt-4o')
  })
})
