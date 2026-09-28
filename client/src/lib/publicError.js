const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'
const INTERNAL_DETAIL = /(?:sqlite[_-]|\b(?:sqlite|sql|database|foreign key|constraint|table|column|stack trace|exception|provider|openai|anthropic|gemini|ai sdk|api key|authorization|bearer|sk-[a-z0-9_-]+|networkerror|typeerror|referenceerror)\b|failed to fetch|\bat\s+\S+\s*\()/i

function errorStatus(error) {
  const status = Number(error?.status ?? error?.statusCode)
  return Number.isInteger(status) ? status : null
}

function safeMessage(error, fallbackMessage) {
  const value = typeof error?.message === 'string' ? error.message.trim() : ''
  if (!value || value.length > 240 || [...value].some((character) => character.charCodeAt(0) <= 0x08 || character === '\r' || character === '\n') || INTERNAL_DETAIL.test(value)) {
    return fallbackMessage
  }
  return value
}

export function toPublicError(error, fallbackMessage = FALLBACK_MESSAGE) {
  const fallback = typeof fallbackMessage === 'string' && fallbackMessage.trim()
    ? fallbackMessage.trim()
    : FALLBACK_MESSAGE
  const status = errorStatus(error)
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : ''
  const networkFailure = error instanceof TypeError || /network|failed to fetch|connection|offline/i.test(error?.message || '')

  const publicKinds = new Set(['offline', 'expired', 'validation', 'access', 'server', 'provider-unavailable', 'unknown'])
  if (
    error && typeof error === 'object' &&
    Object.keys(error).length === 3 &&
    publicKinds.has(error.kind) &&
    typeof error.retryable === 'boolean' &&
    typeof error.message === 'string' &&
    safeMessage(error, '') === error.message
  ) return error

  const providerConnectionLost = /provider.{0,24}connection.{0,12}(?:lost|failed)/i.test(error?.message || '')
  const providerUnavailable = providerConnectionLost || /provider.{0,24}(?:busy|unavailable|timeout|timed out)|(?:busy|unavailable|timeout|timed out).{0,24}provider/i.test(error?.message || '') ||
    (status !== null && status >= 500 && /provider|model|llm/.test(code))
  if (providerUnavailable) {
    return {
      kind: 'provider-unavailable',
      message: providerConnectionLost ? 'The provider connection was lost. Please try again.' : 'The provider is busy. Please try again shortly.',
      retryable: true,
    }
  }

  let kind = 'unknown'
  if (status === 404 || code.includes('expired')) kind = 'expired'
  else if (networkFailure) kind = 'offline'
  else if (status === 400 || status === 422) kind = 'validation'
  else if (status === 401 || status === 403) kind = 'access'
  else if (status !== null && status >= 500) kind = 'server'

  const retryable = typeof error?.retryable === 'boolean'
    ? error.retryable
    : networkFailure || status === 408 || status === 429 || (status !== null && status >= 500)

  return { kind, message: safeMessage(error, fallback), retryable }
}
