import { describe, expect, it } from 'vitest'
import {
  GENERATION_MAX_ATTEMPTS,
  isRetryableGenerationError,
  retryDelayMs,
} from '../utils/curriculum-generation-policy.js'

describe('curriculum generation retry policy', () => {
  it('allows exactly three total attempts for retryable failures', () => {
    expect(GENERATION_MAX_ATTEMPTS).toBe(3)
    expect(isRetryableGenerationError({ code: 'MALFORMED_CURRICULUM', retryable: true })).toBe(true)
    expect(isRetryableGenerationError({ code: 'LLM_TIMEOUT', retryable: true })).toBe(true)
    expect(isRetryableGenerationError({ code: 'MISSING_API_KEY', retryable: false })).toBe(false)
    expect(isRetryableGenerationError({ code: 'REQUEST_ABORTED', retryable: true })).toBe(false)
  })

  it('uses bounded exponential delays with deterministic jitter injection', () => {
    expect(retryDelayMs(1, () => 0)).toBe(1000)
    expect(retryDelayMs(2, () => 0.999)).toBe(5999)
    expect(retryDelayMs(3, () => 0)).toBe(10000)
  })
})
