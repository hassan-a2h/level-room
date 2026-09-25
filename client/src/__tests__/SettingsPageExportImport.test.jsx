import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from '../pages/SettingsPage'

global.fetch = vi.fn()

global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = vi.fn()

// Custom File class with working text() for jsdom
const _fileContents = new WeakMap()
class MockFile {
  constructor(parts, name, options = {}) {
    this.name = name
    this.type = options.type || ''
    this._content = Array.isArray(parts) ? parts.join('') : String(parts)
  }
  text() {
    return Promise.resolve(this._content)
  }
}
global.File = MockFile

function mockFetch(data, status = 200) {
  return () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
    })
}

describe('SettingsPage privacy and backup controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders export and import buttons', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false }))
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: /data and privacy/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /export data/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import data/i })).toBeInTheDocument()
  })

  it('triggers export on button click', async () => {
    const backupData = {
      version: '1.0.0',
      exported_at: '2024-01-01',
      topics: [{ id: 1, title: 'React' }],
      modules: [],
      lessons: [],
      progress: [],
      messages: [],
      srs_queue: [],
      artifacts: [],
      llm_settings: [],
      mistakes_log: [],
      streaks: [],
      quiz_attempts: [],
      exam_attempts: [],
    }

    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false }))
      .mockImplementationOnce(mockFetch(backupData))

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /export data/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /export data/i }))

    await waitFor(() => {
      const exportCalls = fetch.mock.calls.filter((call) => call[0] === 'http://localhost:3200/api/data/export')
      expect(exportCalls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows error when export fails', async () => {
    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false }))
      .mockImplementationOnce(mockFetch({ error: 'Server error' }, 500))

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /export data/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /export data/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/server error/i)
    })
  })

  it('accepts a file input for import', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false }))

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /import data/i })).toBeInTheDocument())

    const fileInput = screen.getByLabelText(/import backup file/i)
    expect(fileInput).toHaveAttribute('type', 'file')
    expect(fileInput).toHaveClass('hidden')
  })

  it('triggers import on file selection', async () => {
    const importResult = { success: true, counts: { topics: 1, modules: 0 } }

    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false }))
      .mockImplementationOnce(mockFetch(importResult))

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /import data/i })).toBeInTheDocument())

    const fileInput = screen.getByLabelText(/import backup file/i)
    const file = new File([JSON.stringify({ topics: [], modules: [], lessons: [], progress: [], messages: [], srs_queue: [], artifacts: [], llm_settings: [], mistakes_log: [], streaks: [], quiz_attempts: [], exam_attempts: [] })], 'backup.json', { type: 'application/json' })

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    expect(screen.getByRole('dialog', { name: /replace learning data/i })).toHaveTextContent(/replace your current learning data/i)
    fireEvent.click(screen.getByRole('button', { name: /replace learning data/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3200/api/data/import',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })
  })

  it('cancels restore without sending the import request', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false }))
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('button', { name: /import data/i })).toBeInTheDocument())
    const fileInput = screen.getByLabelText(/import backup file/i)
    const file = new File([JSON.stringify({ topics: [] })], 'backup.json', { type: 'application/json' })

    await act(async () => { fireEvent.change(fileInput, { target: { files: [file] } }) })
    fireEvent.click(screen.getByRole('button', { name: /cancel restore/i }))

    expect(fetch.mock.calls.some(([url]) => url === 'http://localhost:3200/api/data/import')).toBe(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps keyboard focus inside restore confirmation and returns it after Escape', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false }))
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('button', { name: /import data/i })).toBeInTheDocument())
    const fileInput = screen.getByLabelText(/import backup file/i)
    const file = new File([JSON.stringify({ topics: [] })], 'backup.json', { type: 'application/json' })

    await act(async () => { fireEvent.change(fileInput, { target: { files: [file] } }) })

    const cancel = screen.getByRole('button', { name: /cancel restore/i })
    const replace = screen.getByRole('button', { name: /replace learning data/i })
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(replace).toHaveFocus()
    fireEvent.keyDown(replace, { key: 'Tab' })
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(cancel, { key: 'Escape' })

    await waitFor(() => expect(screen.getByRole('button', { name: /import data/i })).toHaveFocus())
    expect(fetch.mock.calls.some(([url]) => url === 'http://localhost:3200/api/data/import')).toBe(false)
  })

  it('shows error when import file is invalid JSON', async () => {
    fetch.mockImplementation(mockFetch({ provider: null, model: null, apiKeySet: false }))

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /import data/i })).toBeInTheDocument())

    const fileInput = screen.getByLabelText(/import backup file/i)
    const file = new File(['not-json'], 'backup.json', { type: 'application/json' })

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not valid json/i)
    })
  })

  it('disables buttons during export/import operations', async () => {
    let resolveExport
    const exportPromise = new Promise((resolve) => { resolveExport = resolve })

    fetch
      .mockImplementationOnce(mockFetch({ provider: null, model: null, apiKeySet: false }))
      .mockImplementationOnce(() => exportPromise)

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /export data/i })).toBeInTheDocument())

    const exportBtn = screen.getByRole('button', { name: /export data/i })
    fireEvent.click(exportBtn)

    await waitFor(() => expect(exportBtn).toBeDisabled())

    await act(async () => {
      resolveExport({ ok: true, status: 200, json: () => Promise.resolve({ version: '1.0.0', topics: [] }) })
    })
  })
})
