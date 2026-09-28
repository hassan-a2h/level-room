import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitReview } from '../api.js'

describe('review API', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('preserves the HTTP status and response code for an expired submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Review session not found or expired.', code: 'REVIEW_SESSION_EXPIRED' }),
    }))

    await expect(submitReview('missing', { q1: 'answer' }, '2026-09-28')).rejects.toMatchObject({
      message: 'Review session not found or expired.',
      code: 'REVIEW_SESSION_EXPIRED',
      status: 404,
    })
  })
})
