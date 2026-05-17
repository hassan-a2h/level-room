import { Router } from 'express'
import { get, run, all } from '../db.js'
import { generateText, LlmClientError } from '../llm/client.js'

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
    'accounts/fireworks/models/llama-v3p1-70b-instruct',
    'accounts/fireworks/models/llama-v3p1-8b-instruct',
  ],
}

function isValidProvider(provider) {
  return VALID_PROVIDERS.includes(provider)
}

function isValidModel(provider, model) {
  const models = PROVIDER_MODELS[provider]
  if (!models) return false
  return models.includes(model)
}

function isMalformedKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return true
  if (apiKey.length < 5) return true
  const lower = apiKey.toLowerCase()
  if (lower.startsWith('invalid-') || lower.startsWith('bad-')) return true
  return false
}

/**
 * Get the single settings row (or undefined).
 */
function getSettingsRow() {
  return get('SELECT * FROM llm_settings LIMIT 1')
}

/**
 * Test an API key with a lightweight LLM call.
 */
async function testApiKey(provider, apiKey, model) {
  try {
    await generateText({
      provider,
      apiKey,
      model,
      messages: [{ role: 'user', content: 'Say hello.' }],
    })
    return { ok: true }
  } catch (err) {
    if (err instanceof LlmClientError) {
      if (err.code === 'AUTH_ERROR' || err.code === 'MISSING_API_KEY') {
        return { ok: false, error: 'Invalid API key. Please check your key and try again.', code: err.code }
      }
      if (err.code === 'RATE_LIMIT') {
        return { ok: false, error: 'Rate limit hit — try again in 60s', code: err.code }
      }
      if (err.code === 'PROVIDER_UNAVAILABLE') {
        return { ok: false, error: `${provider} is currently unreachable. Check your connection or try another provider in Settings.`, code: err.code }
      }
      return { ok: false, error: err.message, code: err.code }
    }
    return { ok: false, error: 'Unexpected error during validation.', code: 'UNKNOWN' }
  }
}

router.get('/', (_req, res) => {
  try {
    const row = getSettingsRow()
    if (!row) {
      return res.json({ provider: null, model: null, apiKeySet: false })
    }
    return res.json({
      provider: row.provider,
      model: row.model,
      apiKeySet: Boolean(row.api_key && row.api_key.length > 0),
    })
  } catch (err) {
    console.error('GET /api/settings error:', err.message)
    return res.status(500).json({ error: 'Failed to load settings.' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { provider, apiKey, model, clearKey } = req.body

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

    const existing = getSettingsRow()
    let finalApiKey = apiKey

    if (clearKey) {
      finalApiKey = ''
    } else if (!apiKey && existing && existing.api_key) {
      finalApiKey = existing.api_key
    } else if (!apiKey || (typeof apiKey === 'string' && apiKey.trim() === '')) {
      return res.status(400).json({ error: 'API key is required.' })
    }

    if (!clearKey && isMalformedKey(finalApiKey)) {
      return res.status(400).json({ error: 'Invalid API key format.' })
    }

    // Test the key with a real LLM call before persisting (skip if clearing)
    if (!clearKey) {
      const testResult = await testApiKey(provider, finalApiKey, model)
      if (!testResult.ok) {
        return res.status(400).json({ error: testResult.error, code: testResult.code })
      }
    }

    // Upsert: delete existing, insert new (only ever one row)
    run('DELETE FROM llm_settings')
    run('INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)', provider, finalApiKey, model)

    return res.json({
      provider,
      model,
      apiKeySet: Boolean(finalApiKey && finalApiKey.length > 0),
    })
  } catch (err) {
    console.error('POST /api/settings error:', err.message)
    return res.status(500).json({ error: 'Failed to save settings.' })
  }
})

router.post('/validate', async (req, res) => {
  try {
    const row = getSettingsRow()
    if (!row) {
      return res.status(400).json({ error: 'No settings configured. Please save settings first.' })
    }
    if (!row.api_key || row.api_key.length === 0) {
      return res.status(400).json({ error: 'API key missing. Please configure your API key in Settings.' })
    }

    const testResult = await testApiKey(row.provider, row.api_key, row.model)
    if (!testResult.ok) {
      return res.status(400).json({ error: testResult.error, code: testResult.code })
    }

    return res.json({ ok: true, provider: row.provider, model: row.model })
  } catch (err) {
    console.error('POST /api/settings/validate error:', err.message)
    return res.status(500).json({ error: 'Failed to validate settings.' })
  }
})

router.delete('/key', (_req, res) => {
  try {
    const row = getSettingsRow()
    if (row) {
      run('UPDATE llm_settings SET api_key = ? WHERE id = ?', '', row.id)
    }
    return res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/settings/key error:', err.message)
    return res.status(500).json({ error: 'Failed to clear API key.' })
  }
})

export default router
