import { useState, useEffect } from 'react'
import { getSettings, saveSettings } from '../api.js'

const PROVIDER_MODELS = {
  openai: [
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'o3-mini', label: 'o3-mini' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'claude-3-5-sonnet-20241022' },
    { value: 'claude-3-opus-20240229', label: 'claude-3-opus-20240229' },
    { value: 'claude-3-haiku-20240307', label: 'claude-3-haiku-20240307' },
  ],
  fireworks: [
    { value: 'accounts/fireworks/models/llama-v3p1-70b-instruct', label: 'llama-v3p1-70b-instruct' },
    { value: 'accounts/fireworks/models/llama-v3p1-8b-instruct', label: 'llama-v3p1-8b-instruct' },
  ],
}

const DEFAULT_MODEL = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  fireworks: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
}

function SettingsPage() {
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [apiKeySet, setApiKeySet] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const data = await getSettings()
        const p = data.provider || ''
        setProvider(p)
        setModel(data.model || (p ? DEFAULT_MODEL[p] : ''))
        setApiKeySet(data.apiKeySet || false)
      } catch (err) {
        setError('Failed to load settings.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function handleProviderChange(e) {
    const p = e.target.value
    setProvider(p)
    const models = PROVIDER_MODELS[p] || []
    setModel(models[0]?.value || DEFAULT_MODEL[p] || '')
    setError(null)
    setSuccess(false)
  }

  function handleModelChange(e) {
    setModel(e.target.value)
    setError(null)
    setSuccess(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!provider) {
      setError('Please select a provider.')
      return
    }
    if (!model) {
      setError('Please select a model.')
      return
    }

    setSaving(true)
    try {
      const payload = { provider, model }
      if (apiKey.trim().length > 0) {
        payload.apiKey = apiKey.trim()
      }
      const result = await saveSettings(payload)
      setApiKeySet(result.apiKeySet || false)
      setApiKey('')
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading settings…</p>
      </div>
    )
  }

  const currentModels = PROVIDER_MODELS[provider] || []

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

        {success && (
          <div className="mb-4 rounded-md bg-green-50 p-3 text-green-800 text-sm" role="alert">
            Settings saved successfully.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-red-800 text-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="provider" className="block text-sm font-medium text-gray-700 mb-1">
              LLM Provider
            </label>
            <select
              id="provider"
              value={provider}
              onChange={handleProviderChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
            >
              <option value="">Select a provider</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="fireworks">Fireworks</option>
            </select>
          </div>

          <div>
            <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-1">
              Model
            </label>
            <select
              id="model"
              value={model}
              onChange={handleModelChange}
              disabled={!provider}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border disabled:bg-gray-100"
            >
              {currentModels.length === 0 && <option value="">Select a provider first</option>}
              {currentModels.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <div className="relative flex items-center">
              <input
                id="apiKey"
                type={apiKeyVisible ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setError(null)
                  setSuccess(false)
                }}
                placeholder={apiKeySet ? 'Key saved — enter new key to replace' : 'Enter your API key'}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border pr-10"
              />
              <button
                type="button"
                onClick={() => setApiKeyVisible((v) => !v)}
                className="absolute right-2 text-gray-500 hover:text-gray-700 p-1"
                aria-label={apiKeyVisible ? 'Hide key' : 'Show key'}
                title={apiKeyVisible ? 'Hide' : 'Show'}
              >
                {apiKeyVisible ? '🙈' : '👁️'}
              </button>
            </div>
            {apiKeySet && !apiKey && (
              <p className="mt-1 text-xs text-green-600">A key is already saved. Leave blank to keep it.</p>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || !provider || !model}
              className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SettingsPage
