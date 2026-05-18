import { useState, useEffect, useRef } from 'react'
import { getSettings, saveSettings, exportData, importData } from '../api.js'
import { SkeletonSettings } from '../components/Skeleton.jsx'

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
    { value: 'accounts/fireworks/routers/kimi-k2p6-turbo', label: 'kimi-k2p6-turbo' },
    { value: 'accounts/fireworks/models/llama-v3p1-70b-instruct', label: 'llama-v3p1-70b-instruct' },
    { value: 'accounts/fireworks/models/llama-v3p1-8b-instruct', label: 'llama-v3p1-8b-instruct' },
  ],
}

const DEFAULT_MODEL = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  fireworks: 'accounts/fireworks/routers/kimi-k2p6-turbo',
}

function SettingsPage() {
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [apiKeySet, setApiKeySet] = useState(false)
  const [envStatus, setEnvStatus] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Import / Export state
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const fileInputRef = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await getSettings()
        const p = data.provider || ''
        setProvider(p)
        setModel(data.model || (p ? DEFAULT_MODEL[p] : ''))
        setApiKeySet(data.apiKeySet || false)
        setEnvStatus(data.envStatus || [])
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
      const result = await saveSettings({ provider, model })
      setApiKeySet(result.apiKeySet || false)
      setEnvStatus(result.envStatus || [])
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    setError(null)
    setSuccess(false)
    setExporting(true)
    try {
      const data = await exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mastery-roadmap-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to export data.')
    } finally {
      setExporting(false)
    }
  }

  function handleImportClick() {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setSuccess(false)
    setImporting(true)
    setImportProgress(10)

    try {
      const text = await file.text()
      setImportProgress(30)

      let backup
      try {
        backup = JSON.parse(text)
      } catch {
        throw new Error('Invalid backup file: not valid JSON.')
      }
      setImportProgress(50)

      const result = await importData(backup)
      setImportProgress(100)
      setSuccess(`Import complete. Restored ${Object.entries(result.counts || {})
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')}.`)
    } catch (err) {
      setError(err.message || 'Failed to import data.')
    } finally {
      setImporting(false)
      setImportProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  if (loading) {
    return <SkeletonSettings />
  }

  const currentModels = PROVIDER_MODELS[provider] || []

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

          {success && (
            <div className="mb-4 rounded-md bg-green-50 p-3 text-green-800 text-sm" role="alert">
              {typeof success === 'string' ? success : 'Settings saved successfully.'}
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
              <h3 className="text-sm font-medium text-gray-700 mb-2">Environment Configuration</h3>
              <p className="text-xs text-gray-500 mb-3">
                API keys are read from your <code>.env</code> file at server startup. Restart the server after editing <code>.env</code>.
              </p>
              <div className="space-y-2">
                {envStatus.map((status) => (
                  <div
                    key={status.provider}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <span className="text-sm capitalize text-gray-700">{status.provider}</span>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-gray-100 px-1 rounded">{status.envVar}</code>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          status.configured
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {status.configured ? 'Configured' : 'Not configured'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {!apiKeySet && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
                  No API key is configured for the selected provider. Set it in <code>.env</code> and restart the server.
                </p>
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

        {/* Data Management Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Management</h2>
          <p className="text-sm text-gray-600 mb-4">
            Export your learning data as a JSON backup, or restore from a previous backup.
            <br />
            <span className="text-xs text-gray-500">Note: API keys are not included in exports for security.</span>
          </p>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting…' : 'Export Data'}
            </button>

            <button
              type="button"
              onClick={handleImportClick}
              disabled={importing}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? 'Importing…' : 'Import Data'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Import backup file"
            />
          </div>

          {importing && (
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">{importProgress}% — please wait</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
