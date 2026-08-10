import { get } from '../db.js'
import { codexAuth } from '../llm/codex-auth.js'
import { LlmClientError } from '../llm/errors.js'
import { getProviderDefinition } from '../llm/provider-catalog.js'

const DEFAULT_PROVIDER = 'fireworks'
const DEFAULT_MODEL = 'accounts/fireworks/routers/kimi-k2p6-turbo'

/**
 * Capture provider, model, effort, and auth generation together for one operation.
 * The returned API key is server-only and must never be sent to the client.
 */
export function resolveLlmConfig() {
  const row = get('SELECT provider, model, reasoning_effort FROM llm_settings LIMIT 1')
  const provider = row?.provider || process.env.LLM_PROVIDER || DEFAULT_PROVIDER
  const providerDefinition = getProviderDefinition(provider)
  const model = row?.model || process.env.LLM_MODEL || providerDefinition?.defaultModel || DEFAULT_MODEL
  const reasoningEffort = row?.reasoning_effort || 'none'
  const modelDefinition = providerDefinition?.models.find((entry) => entry.id === model)
  const apiKey = providerDefinition?.envVar ? (process.env[providerDefinition.envVar] || '') : ''
  const apiKeySet = Boolean(apiKey)

  let authStatus = apiKeySet ? 'configured' : 'not_configured'
  let credentialGeneration
  if (providerDefinition?.authType === 'oauth') {
    const runtime = codexAuth.getRuntimeSnapshot()
    authStatus = runtime.status
    credentialGeneration = runtime.credentialGeneration
  }

  let configError
  if (!providerDefinition) {
    configError = 'UNSUPPORTED_PROVIDER'
  } else if (!modelDefinition) {
    configError = 'UNSUPPORTED_MODEL'
  } else if (providerDefinition.authType === 'oauth') {
    if (!modelDefinition.reasoningEfforts.includes(reasoningEffort)) {
      configError = 'UNSUPPORTED_REASONING_EFFORT'
    }
  } else if (reasoningEffort !== 'none') {
    configError = 'UNSUPPORTED_REASONING_EFFORT'
  }

  const ready = !configError && (providerDefinition?.authType === 'oauth'
    ? authStatus === 'connected' && Boolean(credentialGeneration)
    : apiKeySet)

  return Object.freeze({
    provider,
    model,
    reasoningEffort,
    authType: providerDefinition?.authType,
    authStatus,
    apiKey,
    apiKeySet,
    ready,
    configError,
    credentialGeneration,
  })
}

/** Resolve one immutable LLM snapshot or fail before any route mutates learning state. */
export function requireLlmConfig() {
  const config = resolveLlmConfig()
  if (config.configError) {
    throw new LlmClientError('The selected LLM model or reasoning setting is invalid. Check Settings.', {
      code: config.configError,
      retryable: false,
    })
  }
  if (config.ready) return config

  if (config.authType === 'oauth') {
    const code = config.authStatus === 'unavailable' ? 'CODEX_AUTH_UNAVAILABLE' : 'MISSING_CODEX_AUTH'
    const message = config.authStatus === 'unavailable'
      ? 'Codex connection data is unavailable. Check local storage permissions and reconnect.'
      : 'Connect a ChatGPT subscription in Settings before starting an AI learning action.'
    throw new LlmClientError(message, { code, retryable: false })
  }

  const definition = getProviderDefinition(config.provider)
  const envVar = definition?.envVar
  throw new LlmClientError(
    envVar
      ? `${config.provider} API key not configured. Please set ${envVar} in your .env file and restart the server.`
      : 'The selected LLM provider is not supported.',
    { code: 'MISSING_API_KEY', retryable: false },
  )
}
