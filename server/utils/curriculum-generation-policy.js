export const GENERATION_MAX_ATTEMPTS = 3
export const GENERATION_ATTEMPT_TIMEOUT_MS = 8 * 60 * 1000
export const GENERATION_DEADLINE_MS = 25 * 60 * 1000
export const GENERATION_LEASE_MS = 2 * 60 * 1000

const NON_RETRYABLE_CODES = new Set([
  'REQUEST_ABORTED',
  'MISSING_API_KEY',
  'MISSING_CODEX_AUTH',
  'CODEX_AUTH_UNAVAILABLE',
  'CODEX_AUTH_FAILED',
  'CODEX_ACCOUNT_CHANGED',
  'UNSUPPORTED_MODEL',
  'UNSUPPORTED_REASONING_EFFORT',
  'UNSUPPORTED_PROVIDER',
  'CURRICULUM_GENERATION_SUPERSEDED',
])

export function isRetryableGenerationError(error) {
  return Boolean(error?.retryable) && !NON_RETRYABLE_CODES.has(error?.code)
}

export function retryDelayMs(attempt, random = Math.random) {
  const normalizedAttempt = Math.max(1, Number(attempt) || 1)
  const base = Math.min(10_000, 1000 * (5 ** (normalizedAttempt - 1)))
  return Math.min(10_000, base + Math.floor(Math.max(0, Math.min(0.999, random())) * 1000))
}
