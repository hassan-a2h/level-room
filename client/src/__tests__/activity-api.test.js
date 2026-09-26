import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeActivityBlock, ensureActivities, getLesson, sendChatMessage, submitActivityBlock } from '../api.js'

function response({ ok = true, status = 200, body = {}, jsonError = false } = {}) {
  return {
    ok,
    status,
    json: jsonError ? async () => { throw new Error('not json') } : async () => body,
  }
}

describe('structured Session API', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads the Session and activity document', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ body: { lesson: { id: 9 }, activityDocument: null } }))
    vi.stubGlobal('fetch', fetch)

    await expect(getLesson(2, 9)).resolves.toMatchObject({ lesson: { id: 9 }, activityDocument: null })
    expect(fetch).toHaveBeenCalledWith('http://localhost:3200/api/topics/2/lessons/9')
  })

  it('preserves generated status and sanitized document returned by ensure', async () => {
    const payload = { activityDocument: { schemaVersion: 1, blocks: [] }, activityState: { blocks: {} }, activityProgress: { completed: 0, total: 4 }, session: { completed: false } }
    const fetch = vi.fn().mockResolvedValue(response({ status: 201, body: payload }))
    vi.stubGlobal('fetch', fetch)

    await expect(ensureActivities(2, 9)).resolves.toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('http://localhost:3200/api/topics/2/lessons/9/activities', expect.objectContaining({ method: 'POST' }))
  })

  it('preserves typed JSON error fields and supports non-JSON errors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ ok: false, status: 409, body: { error: 'Activity changed.', code: 'ACTIVITY_STATE_CONFLICT', latestState: { currentBlockId: 'join' } } }))
      .mockResolvedValueOnce(response({ ok: false, status: 502, jsonError: true })))

    await expect(completeActivityBlock(2, 9, 'read-1', { action: 'continue' })).rejects.toMatchObject({
      message: 'Activity changed.', code: 'ACTIVITY_STATE_CONFLICT', status: 409, latestState: { currentBlockId: 'join' },
    })
    await expect(ensureActivities(2, 9)).rejects.toMatchObject({ message: 'HTTP 502', status: 502 })
  })

  it('preserves response content on scored submission requests and rejects network failures unchanged', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ body: { correct: false, status: 'needs_retry', feedback: 'Look at the join condition.' } }))
    vi.stubGlobal('fetch', fetch)
    await expect(submitActivityBlock(2, 9, 'choose-join', { response: 'b', localDate: '2026-09-26' })).resolves.toMatchObject({ status: 'needs_retry' })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ response: 'b', localDate: '2026-09-26' })

    const networkError = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError))
    await expect(submitActivityBlock(2, 9, 'choose-join', { response: 'b' })).rejects.toBe(networkError)
  })

  it('includes the active block ID in contextual tutor chat while leaving it optional', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, body: null })
    vi.stubGlobal('fetch', fetch)
    await sendChatMessage(2, 9, 'Give me a hint', 'choose-join')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ content: 'Give me a hint', activityBlockId: 'choose-join' })
  })
})
