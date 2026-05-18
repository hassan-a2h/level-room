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
      json: () => Promise.resolve(data),
    })
  )
}

const MOCK_ENV_STATUS = [
  { provider: 'openai', configured: false, envVar: 'OPENAI_API_KEY' },
  { provider: 'anthropic', configured: false, envVar: 'ANTHROPIC_API_KEY' },
  { provider: 'fireworks', configured: true, envVar: 'FIREWORKS_API_KEY' },
]

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders provider selector with three options', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false, envStatus: MOCK_ENV_STATUS }))
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/provider/i)).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'OpenAI' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Anthropic' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Fireworks' })).toBeInTheDocument()
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
          body: JSON.stringify({ provider: 'openai', model: 'gpt-4o' }),
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
})
