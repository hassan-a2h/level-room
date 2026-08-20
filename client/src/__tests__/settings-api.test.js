import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getProviderCatalog,
  getCodexConnection,
  startCodexLogin,
  getCodexLoginStatus,
  submitCodexManualCode,
  cancelCodexLogin,
  disconnectCodex,
  saveSettings,
} from '../api.js'

describe('Settings API helpers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the local catalog and saves provider, model, and reasoning effort', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ providers: [{ id: 'openai-codex' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetch)

    await expect(getProviderCatalog()).resolves.toEqual({ providers: [{ id: 'openai-codex' }] })
    await saveSettings({ provider: 'openai-codex', model: 'gpt-5.4', reasoningEffort: 'xhigh' })

    expect(fetch.mock.calls[0][0]).toBe('http://localhost:3200/api/settings/catalog')
    expect(fetch.mock.calls[1][1].body).toBe(JSON.stringify({ provider: 'openai-codex', model: 'gpt-5.4', reasoningEffort: 'xhigh' }))
  })

  it('sends only the selected OAuth interaction and one-time code to local endpoints', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) })
    vi.stubGlobal('fetch', fetch)

    await startCodexLogin('device_code')
    await getCodexConnection()
    await getCodexLoginStatus('flow/fixture')
    await submitCodexManualCode('flow-1', 'one-time-code')
    await cancelCodexLogin('flow-1')
    await disconnectCodex()

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3200/api/settings/codex/login',
      'http://localhost:3200/api/settings/codex/connection',
      'http://localhost:3200/api/settings/codex/flow/flow%2Ffixture',
      'http://localhost:3200/api/settings/codex/flow/flow-1/code',
      'http://localhost:3200/api/settings/codex/flow/flow-1/cancel',
      'http://localhost:3200/api/settings/codex/disconnect',
    ])
    expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({ mode: 'device_code' }))
    expect(fetch.mock.calls[3][1].body).toBe(JSON.stringify({ code: 'one-time-code' }))
  })

  it('surfaces sanitized server messages from rejected auth requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'Try again later.' }) }))

    await expect(startCodexLogin()).rejects.toThrow('Try again later.')
  })
})
