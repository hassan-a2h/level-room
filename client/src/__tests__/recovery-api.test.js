import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateCurriculum, getCurriculumRecovery, waitForCurriculumGeneration } from '../api.js'

describe('curriculum recovery API helper', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads the durable onboarding state and saved draft', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ curriculumState: 'draft_ready', curriculum: { modules: [] } }),
    })
    vi.stubGlobal('fetch', fetch)

    await expect(getCurriculumRecovery(12)).resolves.toEqual({
      curriculumState: 'draft_ready',
      curriculum: { modules: [] },
    })
    expect(fetch).toHaveBeenCalledWith('http://localhost:3200/api/topics/12/curriculum/recovery')
  })

  it('returns the durable generation envelope instead of waiting for the provider', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ generation: { id: 'job-1', state: 'queued' } }),
    })
    vi.stubGlobal('fetch', fetch)

    await expect(generateCurriculum(12)).resolves.toEqual({ generation: { id: 'job-1', state: 'queued' } })
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3200/api/topics/12/curriculum/generate',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Accept: 'application/json' }) }),
    )
  })

  it('falls back from an SSE completion to the saved draft', async () => {
    const recovery = { curriculumState: 'draft_ready', curriculum: { modules: [{ title: 'Basics' }] }, generation: { id: 'job-1', state: 'completed' } }
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => recovery })
    vi.stubGlobal('fetch', fetch)
    const events = []
    class FakeEventSource {
      constructor(url) { this.url = url; this.listeners = {} }
      addEventListener(name, callback) {
        this.listeners[name] = callback
        if (name === 'generation') queueMicrotask(() => callback({ data: JSON.stringify({ id: 'job-1', state: 'completed' }) }))
      }
      close() {}
    }
    vi.stubGlobal('EventSource', FakeEventSource)

    await expect(waitForCurriculumGeneration(12, { id: 'job-1', state: 'queued' }, (status) => events.push(status.state)))
      .resolves.toEqual(recovery.curriculum)
    expect(events).toContain('completed')
    expect(fetch).toHaveBeenCalledWith('http://localhost:3200/api/topics/12/curriculum/recovery')
  })

  it('cancels the SSE subscription when the caller aborts', async () => {
    const closeMock = vi.fn()
    class FakeEventSource {
      addEventListener() {}
      close() { closeMock() }
    }
    vi.stubGlobal('EventSource', FakeEventSource)
    const controller = new AbortController()
    const waiting = waitForCurriculumGeneration(12, { id: 'job-1', state: 'running' }, undefined, { signal: controller.signal })

    controller.abort()

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    expect(closeMock).toHaveBeenCalledOnce()
  })
})
