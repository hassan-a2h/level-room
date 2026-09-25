import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from '../pages/SettingsPage'

// Mock the fetch API
global.fetch = vi.fn()

function mockFetch(data, status = 200) {
  return vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve({ providers: MOCK_PROVIDERS, ...data }),
    })
  )
}

const MOCK_ENV_STATUS = [
  { provider: 'openai', configured: false, envVar: 'OPENAI_API_KEY' },
  { provider: 'anthropic', configured: false, envVar: 'ANTHROPIC_API_KEY' },
  { provider: 'fireworks', configured: true, envVar: 'FIREWORKS_API_KEY' },
]

const MOCK_PROVIDERS = [
  { id: 'openai', name: 'OpenAI API key', authType: 'api_key', defaultModel: 'gpt-4o', models: [{ id: 'gpt-4o', name: 'gpt-4o', reasoningEfforts: [] }] },
  { id: 'anthropic', name: 'Anthropic API key', authType: 'api_key', defaultModel: 'claude-3-5-sonnet-20241022', models: [{ id: 'claude-3-5-sonnet-20241022', name: 'claude-3-5-sonnet-20241022', reasoningEfforts: [] }] },
  { id: 'fireworks', name: 'Fireworks API key', authType: 'api_key', defaultModel: 'accounts/fireworks/routers/kimi-k2p6-turbo', models: [{ id: 'accounts/fireworks/routers/kimi-k2p6-turbo', name: 'kimi-k2p6-turbo', reasoningEfforts: [] }] },
  { id: 'openai-codex', name: 'OpenAI Codex subscription', authType: 'oauth', defaultModel: 'gpt-5.4', models: [{ id: 'gpt-5.4', name: 'GPT-5.4', reasoningEfforts: ['minimal', 'xhigh'] }] },
]

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all providers returned by the server catalog', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false, envStatus: MOCK_ENV_STATUS }))
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/provider/i)).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'OpenAI API key' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Anthropic API key' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Fireworks API key' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'OpenAI Codex subscription' })).toBeInTheDocument()
  })

  it('organizes appearance, learning, provider, privacy and destructive data controls', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false, envStatus: [] }))
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument())
    expect(screen.getAllByRole('radio')).toHaveLength(16)
    for (const section of ['Learning preferences', 'AI connection', 'Data and privacy', 'Danger zone']) {
      expect(screen.getByRole('heading', { name: section })).toBeInTheDocument()
    }
    expect(screen.getByText(/learning data lives in local SQLite/i)).toBeInTheDocument()
    expect(screen.getByText(/theme lives in browser storage/i)).toBeInTheDocument()
    expect(screen.getByText(/bounded learning context/i)).toBeInTheDocument()
    expect(screen.getByText(/credentials are never included in exports/i)).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['Appearance', 'Learning preferences', 'AI connection', 'Data and privacy', 'Danger zone'])
  })

  it('shows model selector that updates when provider changes', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false, envStatus: MOCK_ENV_STATUS }))
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/provider/i)).toBeInTheDocument())

    const providerSelect = screen.getByLabelText(/provider/i)
    fireEvent.change(providerSelect, { target: { value: 'openai' } })

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument()
    })
  })

  it('shows server-supported Codex models and reasoning choices only for Codex', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, envStatus: MOCK_ENV_STATUS }))
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    await screen.findByLabelText(/provider/i)
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai-codex' } })

    expect(await screen.findByRole('option', { name: 'GPT-5.4' })).toBeInTheDocument()
    expect(screen.getByLabelText(/reasoning level/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'xhigh' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Codex subscription sign-in/i })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    expect(screen.queryByLabelText(/reasoning level/i)).not.toBeInTheDocument()
  })

  it('saves the selected Codex reasoning level with the provider settings', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, envStatus: MOCK_ENV_STATUS }))
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    await screen.findByLabelText(/provider/i)
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai-codex' } })
    fireEvent.change(await screen.findByLabelText(/reasoning level/i), { target: { value: 'xhigh' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3200/api/settings',
      expect.objectContaining({ body: JSON.stringify({ provider: 'openai-codex', model: 'gpt-5.4', reasoningEffort: 'xhigh' }) }),
    ))
  })

  it('does not render an API key input field', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false, envStatus: MOCK_ENV_STATUS }))
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/provider/i)).toBeInTheDocument())
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument()
  })

  it('shows env configuration status indicators', async () => {
    fetch.mockImplementation(mockFetch({ provider: 'fireworks', model: 'accounts/fireworks/routers/kimi-k2p6-turbo', apiKeySet: true, envStatus: MOCK_ENV_STATUS }))
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText(/environment configuration/i)).toBeInTheDocument())
    expect(screen.getByText('OPENAI_API_KEY')).toBeInTheDocument()
    expect(screen.getByText('ANTHROPIC_API_KEY')).toBeInTheDocument()
    expect(screen.getByText('FIREWORKS_API_KEY')).toBeInTheDocument()
    expect(screen.getByText('Configured')).toBeInTheDocument()
    expect(screen.getAllByText('Not configured').length).toBe(2)
  })

  it('submits only provider and model on save', async () => {
    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false, envStatus: MOCK_ENV_STATUS }))
      .mockImplementationOnce(mockFetch({ provider: 'openai', model: 'gpt-4o', apiKeySet: true, envStatus: MOCK_ENV_STATUS }, 200))

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/provider/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: 'gpt-4o' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3200/api/settings',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'openai', model: 'gpt-4o', reasoningEffort: 'none' }),
        })
      )
    })
  })

  it('disables save button while submitting', async () => {
    let resolveSave
    const savePromise = new Promise((resolve) => { resolveSave = resolve })
    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false, envStatus: MOCK_ENV_STATUS }))
      .mockImplementationOnce(() => savePromise)

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/provider/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: 'gpt-4o' } })

    const saveBtn = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveBtn)
    expect(saveBtn).toBeDisabled()

    await act(async () => {
      resolveSave({ ok: true, status: 200, json: () => Promise.resolve({ provider: 'openai', model: 'gpt-4o', apiKeySet: true, envStatus: MOCK_ENV_STATUS }) })
    })
  })

  it('shows error when env key is not configured', async () => {
    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false, envStatus: MOCK_ENV_STATUS }))
      .mockImplementationOnce(mockFetch({ error: 'openai API key not configured. Please set OPENAI_API_KEY in your .env file and restart the server.' }, 400))

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/provider/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: 'gpt-4o' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(screen.getByText(/OPENAI_API_KEY/i)).toBeInTheDocument())
  })

  it('shows warning banner when no api key is configured', async () => {
    fetch.mockImplementation(mockFetch({ provider: 'openai', model: 'gpt-4o', apiKeySet: false, envStatus: [
      { provider: 'openai', configured: false, envVar: 'OPENAI_API_KEY' },
      { provider: 'anthropic', configured: false, envVar: 'ANTHROPIC_API_KEY' },
      { provider: 'fireworks', configured: false, envVar: 'FIREWORKS_API_KEY' },
    ] }))
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText(/environment configuration/i)).toBeInTheDocument())
    expect(screen.getByText(/No API key is configured/i)).toBeInTheDocument()
  })

  it('shows a calm save error instead of raw system details', async () => {
    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false, envStatus: MOCK_ENV_STATUS }))
      .mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'SQLITE_ERROR: constraint failed in provider_settings' }),
      }))
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    await screen.findByLabelText(/provider/i)
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save ai connection/i)
    expect(screen.queryByText(/SQLITE_ERROR|constraint failed|provider_settings/i)).not.toBeInTheDocument()
  })
})
