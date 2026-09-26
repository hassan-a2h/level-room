import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmContinuation, generateContinuation, tweakContinuation } from '../api.js'

describe('balanced continuation API bodies', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends only profile overrides and the transient curriculum on every write', async () => {
    const fetchMock = vi.fn(async (_url, options) => ({
      ok: true,
      json: async () => ({ ok: true }),
      ...(!options?.headers?.Accept ? {} : { body: null }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await generateContinuation('9', { level: 'Advanced', timeCommitment: '1 hour/day' })
    await tweakContinuation('9', { level: 'Advanced', timeCommitment: '1 hour/day', curriculum: { title: 'Draft' }, request: 'More practice.' })
    await confirmContinuation('9', { level: 'Advanced', timeCommitment: '1 hour/day', curriculum: { title: 'Draft' } })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ level: 'Advanced', timeCommitment: '1 hour/day' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ level: 'Advanced', timeCommitment: '1 hour/day', curriculum: { title: 'Draft' }, request: 'More practice.' })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ level: 'Advanced', timeCommitment: '1 hour/day', curriculum: { title: 'Draft' } })
  })
})
