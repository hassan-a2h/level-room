import { get } from '../db.js'

const DEFAULT_PROVIDER = 'fireworks'
const DEFAULT_MODEL = 'accounts/fireworks/routers/kimi-k2p6-turbo'

const ENV_KEY_MAP = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
}

/**
 * Resolve the active LLM configuration by combining the provider+model stored
 * in the database with the API key read from process.env.
 *
 * Returns { provider, model, apiKey, apiKeySet }.
 * If no settings row exists, falls back to defaults from process.env.
 */
export function resolveLlmConfig() {
  const row = get('SELECT provider, model FROM llm_settings LIMIT 1')

  const provider = row?.provider || process.env.LLM_PROVIDER || DEFAULT_PROVIDER
  const model = row?.model || process.env.LLM_MODEL || DEFAULT_MODEL

  const envVar = ENV_KEY_MAP[provider]
  const apiKey = envVar ? (process.env[envVar] || '') : ''

  return {
    provider,
    model,
    apiKey,
    apiKeySet: Boolean(apiKey && apiKey.length > 0),
  }
}

/**
 * Resolve configuration and throw a clear error if the API key is missing.
 * Use this in route handlers that need to call an LLM.
 */
export function requireLlmConfig() {
  const config = resolveLlmConfig()
  if (!config.apiKeySet) {
    const envVar = ENV_KEY_MAP[config.provider]
    const error = new Error(
      `${config.provider} API key not configured. Please set ${envVar} in your .env file and restart the server.`
    )
    error.code = 'MISSING_API_KEY'
    throw error
  }
  return config
}
