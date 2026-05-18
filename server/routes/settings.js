import { Router } from 'express'
import { get, run } from '../db.js'
import { resolveLlmConfig, requireLlmConfig } from '../utils/llm-config.js'

const router = Router()

const VALID_PROVIDERS = ['openai', 'anthropic', 'fireworks']

const PROVIDER_MODELS = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'o3-mini',
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307',
  ],
  fireworks: [
    'accounts/fireworks/routers/kimi-k2p6-turbo',
    'accounts/fireworks/models/llama-v3p1-70b-instruct',
    'accounts/fireworks/models/llama-v3p1-8b-instruct',
  ],
}

const ENV_KEY_MAP = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
}

function isValidProvider(provider) {
  return VALID_PROVIDERS.includes(provider)
}

function isValidModel(provider, model) {
  const models = PROVIDER_MODELS[provider]
  if (!models) return false
  return models.includes(model)
}

/**
 * Get env configuration status for all providers.
 */
function getEnvStatus() {
  return VALID_PROVIDERS.map((p) => ({
    provider: p,
    configured: Boolean(process.env[ENV_KEY_MAP[p]] && process.env[ENV_KEY_MAP[p]].length > 0),
    envVar: ENV_KEY_MAP[p],
  }))
}

router.get('/', (_req, res) => {
  try {
    const config = resolveLlmConfig()
    return res.json({
      provider: config.provider,
      model: config.model,
      apiKeySet: config.apiKeySet,
      envStatus: getEnvStatus(),
    })
  } catch (err) {
    console.error('GET /api/settings error:', err.message)
    return res.status(500).json({ error: 'Failed to load settings.' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { provider, model } = req.body

    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'Provider is required.' })
    }
    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: `Unsupported provider: ${provider}. Supported: ${VALID_PROVIDERS.join(', ')}` })
    }

    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'Model is required.' })
    }
    if (!isValidModel(provider, model)) {
      return res.status(400).json({ error: `Invalid model "${model}" for provider ${provider}.` })
    }

    // Reject if an apiKey field is sent (old clients)
    if ('apiKey' in req.body) {
      return res.status(400).json({
        error: 'API keys are no longer stored in the app. Please set them in your .env file and restart the server.',
      })
    }

    // Validate that the selected provider has a configured env key
    const envVar = ENV_KEY_MAP[provider]
    if (!process.env[envVar] || process.env[envVar].length === 0) {
      return res.status(400).json({
        error: `${provider} API key not configured. Please set ${envVar} in your .env file and restart the server.`,
      })
    }

    // Upsert: delete existing, insert new (only ever one row)
    run('DELETE FROM llm_settings')
    run('INSERT INTO llm_settings (provider, model) VALUES (?, ?)', provider, model)

    return res.json({
      provider,
      model,
      apiKeySet: true,
      envStatus: getEnvStatus(),
    })
  } catch (err) {
    console.error('POST /api/settings error:', err.message)
    return res.status(500).json({ error: 'Failed to save settings.' })
  }
})

router.post('/validate', async (_req, res) => {
  try {
    const config = resolveLlmConfig()
    if (!config.apiKeySet) {
      const envVar = ENV_KEY_MAP[config.provider]
      return res.status(400).json({
        error: `${config.provider} API key not configured. Please set ${envVar} in your .env file and restart the server.`,
      })
    }

    return res.json({ ok: true, provider: config.provider, model: config.model })
  } catch (err) {
    console.error('POST /api/settings/validate error:', err.message)
    return res.status(500).json({ error: 'Failed to validate settings.' })
  }
})

export default router
