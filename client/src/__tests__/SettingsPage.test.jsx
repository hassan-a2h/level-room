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

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders provider selector with three options', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false }))
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
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false }))
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

  it('masks API key input by default', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false }))
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/api key/i)).toBeInTheDocument())
    const apiKeyInput = screen.getByLabelText(/api key/i)
    expect(apiKeyInput).toHaveAttribute('type', 'password')
  })

  it('toggles API key visibility when clicking the eye icon', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false }))
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/api key/i)).toBeInTheDocument())
    const apiKeyInput = screen.getByLabelText(/api key/i)
    const toggleBtn = screen.getByRole('button', { name: /show/i })

    fireEvent.click(toggleBtn)
    expect(apiKeyInput).toHaveAttribute('type', 'text')

    fireEvent.click(toggleBtn)
    expect(apiKeyInput).toHaveAttribute('type', 'password')
  })

  it('shows placeholder when key is already saved', async () => {
    fetch.mockImplementation(mockFetch({ provider: 'openai', model: 'gpt-4o', apiKeySet: true }))
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/api key/i)).toBeInTheDocument())
    const apiKeyInput = screen.getByLabelText(/api key/i)
    expect(apiKeyInput).toHaveAttribute('placeholder', expect.stringMatching(/saved/i))
  })

  it('submits settings on save', async () => {
    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false }))
      .mockImplementationOnce(mockFetch({ provider: 'openai', model: 'gpt-4o', apiKeySet: true }, 200))

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/provider/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: 'gpt-4o' } })
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: 'sk-test12345678' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3200/api/settings',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('sk-test12345678'),
        })
      )
    })
  })

  it('disables save button while submitting', async () => {
    let resolveSave
    const savePromise = new Promise((resolve) => { resolveSave = resolve })
    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false }))
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
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: 'sk-test12345678' } })

    const saveBtn = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveBtn)
    expect(saveBtn).toBeDisabled()

    await act(async () => {
      resolveSave({ ok: true, status: 200, json: () => Promise.resolve({ provider: 'openai', model: 'gpt-4o', apiKeySet: true }) })
    })
  })

  it('shows error message on invalid key', async () => {
    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false }))
      .mockImplementationOnce(mockFetch({ error: 'Invalid API key format.' }, 400))

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/provider/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: 'gpt-4o' } })
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: 'bad-key' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(screen.getByText(/invalid/i)).toBeInTheDocument())
  })

  it('shows error on rate limit response', async () => {
    fetch
      .mockImplementationOnce(mockFetch({ provider: 'openai', model: 'gpt-4o', apiKeySet: true }))
      .mockImplementationOnce(mockFetch({ error: 'Rate limit hit — try again in 60s', code: 'RATE_LIMIT' }, 400))

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByLabelText(/provider/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: 'gpt-4o-mini' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(screen.getByText(/rate limit/i)).toBeInTheDocument())
  })
})
