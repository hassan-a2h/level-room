import { Router } from 'express'
import { get, run, transaction } from '../db.js'
import { codexAuth, isTrustedLocalAuthRequest } from '../llm/codex-auth.js'
import { API_KEY_ENV_VARS, getProviderCatalog, getProviderDefinition } from '../llm/provider-catalog.js'
import { resolveLlmConfig, requireLlmConfig } from '../utils/llm-config.js'

const router = Router()
const authRateLimits = new Map()
const VALIDATION_CODES = new Set([
  'MISSING_API_KEY',
  'MISSING_CODEX_AUTH',
  'CODEX_AUTH_UNAVAILABLE',
  'UNSUPPORTED_PROVIDER',
  'UNSUPPORTED_MODEL',
  'UNSUPPORTED_REASONING_EFFORT',
])

function allowAuthRequest(req, res, bucket, limit) {
  const client = req.socket?.remoteAddress || req.ip || 'local'
  const now = Date.now()
  const key = `${bucket}:${client}`
  let entry = authRateLimits.get(key)
  if (!entry || now - entry.startedAt >= 60_000) {
    entry = { startedAt: now, count: 0 }
    authRateLimits.set(key, entry)
  }
  if (authRateLimits.size > 1024) {
    for (const [entryKey, value] of authRateLimits) {
      if (now - value.startedAt >= 60_000) authRateLimits.delete(entryKey)
    }
  }
  if (entry.count >= limit) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((60_000 - (now - entry.startedAt)) / 1000))))
    res.status(429).json({ error: 'Too many Codex sign-in requests. Try again in a minute.' })
    return false
  }
  entry.count += 1
  return true
}

function getEnvStatus() {
  return Object.entries(API_KEY_ENV_VARS).map(([provider, envVar]) => ({
    provider,
    configured: Boolean(process.env[envVar]),
    envVar,
  }))
}

function safeSettings(config) {
  return {
    provider: config.provider,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    authType: config.authType,
    authStatus: config.authStatus,
    ready: config.ready,
    apiKeySet: config.apiKeySet,
    providers: getProviderCatalog(),
    envStatus: getEnvStatus(),
  }
}

function containsCredentialField(value) {
  if (Array.isArray(value)) return value.some(containsCredentialField)
  if (!value || typeof value !== 'object') return false
  const sensitiveNames = new Set(['apikey', 'access', 'refresh', 'refreshtoken', 'token', 'credential', 'accountid', 'authorization'])
  return Object.entries(value).some(([key, nested]) => sensitiveNames.has(key.toLowerCase().replace(/[^a-z]/g, '')) || containsCredentialField(nested))
}

function codexRequestGuard(req, res, next) {
  if (!isTrustedLocalAuthRequest(req)) {
    res.removeHeader('Access-Control-Allow-Origin')
    return res.status(403).json({ error: 'Codex sign-in is available only from this local app.' })
  }

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
  res.vary('Origin')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }
  if (req.method !== 'GET' && !req.is('application/json')) {
    return res.status(415).json({ error: 'Codex sign-in requests must use JSON.' })
  }
  const contentLength = Number(req.headers['content-length'] || 0)
  if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
    return res.status(413).json({ error: 'Codex sign-in request is too large.' })
  }
  next()
}

function codexErrorResponse(res, error) {
  const code = typeof error?.code === 'string' ? error.code : 'CODEX_AUTH_FAILED'
  const clientMessages = {
    CODEX_LOGIN_MODE_INVALID: 'Choose browser or device-code sign-in.',
    CODEX_MANUAL_CODE_INVALID: 'Enter a valid authorization code or redirect URL.',
    CODEX_MANUAL_CODE_NOT_REQUESTED: 'Codex is not waiting for an authorization code.',
    CODEX_FLOW_NOT_FOUND: 'This Codex sign-in session has expired. Start again.',
    CODEX_CREDENTIAL_STORE_BUSY: 'Codex connection storage is busy. Try again shortly.',
    CODEX_CREDENTIAL_STORE_UNAVAILABLE: 'Codex connection storage is unavailable. Check local disk permissions.',
    CODEX_CREDENTIAL_STORE_CORRUPT: 'Codex connection data is unreadable. Reconnect after resolving local storage.',
  }
  const clientCode = Object.hasOwn(clientMessages, code) || code.startsWith('CODEX_CREDENTIAL_STORE_')
    ? code
    : 'CODEX_AUTH_FAILED'
  const message = clientMessages[clientCode] || 'Codex sign-in could not be completed. Try again or use device-code sign-in.'
  const status = clientCode === 'CODEX_FLOW_NOT_FOUND' ? 404
    : clientCode === 'CODEX_LOGIN_MODE_INVALID' || clientCode === 'CODEX_MANUAL_CODE_INVALID' || clientCode === 'CODEX_MANUAL_CODE_NOT_REQUESTED' ? 400
      : 503
  return res.status(status).json({ error: message, code: clientCode })
}

router.get('/', (_req, res) => {
  try {
    return res.json(safeSettings(resolveLlmConfig()))
  } catch {
    return res.status(500).json({ error: 'Failed to load settings.' })
  }
})

router.get('/catalog', (_req, res) => {
  res.json({ providers: getProviderCatalog(), envStatus: getEnvStatus() })
})

router.post('/', (req, res) => {
  try {
    const { provider, model, reasoningEffort = 'none' } = req.body || {}
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'Provider is required.' })
    }

    const definition = getProviderDefinition(provider)
    if (!definition) {
      const supported = getProviderCatalog().map(({ id }) => id)
      return res.status(400).json({ error: `Unsupported provider: ${provider}. Supported: ${supported.join(', ')}` })
    }
    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'Model is required.' })
    }
    const selectedModel = definition.models.find((entry) => entry.id === model)
    if (!selectedModel) return res.status(400).json({ error: `Invalid model "${model}" for provider ${provider}.` })
    if (typeof reasoningEffort !== 'string' || (provider === 'openai-codex'
      ? !selectedModel.reasoningEfforts.includes(reasoningEffort)
      : reasoningEffort !== 'none')) {
      return res.status(400).json({ error: 'The selected reasoning level is not supported by this model.' })
    }

    if (req.body && Object.hasOwn(req.body, 'apiKey')) {
      return res.status(400).json({
        error: 'API keys are no longer stored in the app. Please set them in your .env file and restart the server.',
      })
    }
    if (containsCredentialField(req.body)) {
      return res.status(400).json({
        error: 'Credentials cannot be submitted or stored in LLM settings. Use the local Codex sign-in flow.',
      })
    }
    if (definition.authType === 'api_key' && !process.env[definition.envVar]) {
      return res.status(400).json({
        error: `${provider} API key not configured. Please set ${definition.envVar} in your .env file and restart the server.`,
      })
    }

    transaction(() => {
      run('DELETE FROM llm_settings')
      run('INSERT INTO llm_settings (provider, model, reasoning_effort) VALUES (?, ?, ?)', provider, model, reasoningEffort)
    })()

    return res.json(safeSettings(resolveLlmConfig()))
  } catch {
    return res.status(500).json({ error: 'Failed to save settings.' })
  }
})

router.post('/validate', (_req, res) => {
  try {
    const config = requireLlmConfig()
    return res.json({ ok: true, provider: config.provider, model: config.model, reasoningEffort: config.reasoningEffort })
  } catch (error) {
    if (VALIDATION_CODES.has(error?.code)) {
      return res.status(400).json({ error: error.message, code: error.code })
    }
    return res.status(500).json({ error: 'Failed to validate settings.' })
  }
})

router.use('/codex', codexRequestGuard)
router.options('/codex/*', (_req, res) => res.status(204).end())

router.get('/codex/connection', (_req, res) => {
  res.json(codexAuth.getConnectionStatus())
})

router.post('/codex/login', async (req, res) => {
  if (!allowAuthRequest(req, res, 'login', 5)) return
  try {
    const result = await codexAuth.startLogin(req.body?.mode || 'browser')
    return res.status(202).json(result)
  } catch (error) {
    return codexErrorResponse(res, error)
  }
})

router.get('/codex/flow/:flowId', (req, res) => {
  const status = codexAuth.getFlowStatus(req.params.flowId)
  if (!status) return res.status(404).json({ error: 'This Codex sign-in session has expired. Start again.' })
  return res.json(status)
})

router.post('/codex/flow/:flowId/code', async (req, res) => {
  if (!allowAuthRequest(req, res, 'manual-code', 10)) return
  try {
    const result = await codexAuth.submitManualCode(req.params.flowId, req.body?.code)
    return res.json(result)
  } catch (error) {
    return codexErrorResponse(res, error)
  }
})

router.post('/codex/flow/:flowId/cancel', async (req, res) => {
  try {
    return res.json(await codexAuth.cancelFlow(req.params.flowId))
  } catch (error) {
    return codexErrorResponse(res, error)
  }
})

router.post('/codex/disconnect', async (_req, res) => {
  try {
    return res.json(await codexAuth.disconnect())
  } catch (error) {
    return codexErrorResponse(res, error)
  }
})

export default router
