import { describe, expect, it } from 'vitest'
import { toPublicError } from '../lib/publicError.js'

describe('toPublicError', () => {
  it('keeps a short learner-safe message and retry hint', () => {
    expect(toPublicError({ message: 'Connection lost. Try again.', retryable: true }, 'Try again.')).toEqual({
      kind: 'offline',
      message: 'Connection lost. Try again.',
      retryable: true,
    })
  })

  it('uses the supplied fallback for SQL, stack, provider, and oversized details', () => {
    const fallbackMessage = 'Could not load this learning activity.'
    const unsafeMessages = [
      'SQLITE_CONSTRAINT: FOREIGN KEY constraint failed',
      'SQLITE_ERROR: disk I/O error',
      'Error: request failed\n    at ProviderClient.complete (src/provider.js:4:2)',
      'OpenAI API returned internal request id sk-secret-123',
      'x'.repeat(500),
    ]

    for (const message of unsafeMessages) {
      expect(toPublicError({ message }, fallbackMessage).message).toBe(fallbackMessage)
    }
  })

  it('classifies expired sessions and HTTP retryability without exposing server codes', () => {
    expect(toPublicError({ status: 404, code: 'REVIEW_SESSION_EXPIRED', message: 'Session expired' }, 'Try again.')).toEqual({
      kind: 'expired',
      message: 'Session expired',
      retryable: false,
    })
    expect(toPublicError({ status: 503, code: 'DATABASE_UNAVAILABLE' }, 'Try again.')).toEqual({
      kind: 'server',
      message: 'Try again.',
      retryable: true,
    })
  })

  it('uses a safe default fallback for unrecognized errors', () => {
    expect(toPublicError(null)).toEqual({
      kind: 'unknown',
      message: 'Something went wrong. Please try again.',
      retryable: false,
    })
  })
})
