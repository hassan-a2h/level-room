import { useState, useEffect, useRef, useCallback } from 'react'
import { getSettings, saveSettings, exportData, importData } from '../api.js'
import { SkeletonSettings } from '../components/Skeleton.jsx'
import AppHeader from '../components/AppHeader.jsx'
import ThemeSwitcher from '../components/ThemeSwitcher.jsx'
import CodexConnection from '../components/CodexConnection.jsx'

function safeSettingsError(error, fallback) {
  const message = typeof error?.message === 'string' ? error.message.trim() : ''
  if (!message || /sqlite|\bsql\b|database|foreign key|constraint|\btable\b|\bcolumn\b|stack trace|exception/i.test(message)) {
    return fallback
  }
  return message
}

function SettingsPage() {
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('none')
  const [providers, setProviders] = useState([])
  const [apiKeySet, setApiKeySet] = useState(false)
  const [ready, setReady] = useState(false)
  const [envStatus, setEnvStatus] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Import / Export state
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [pendingBackup, setPendingBackup] = useState(undefined)
  const fileInputRef = useRef(null)
  const cancelImportRef = useRef(null)
  const replaceImportRef = useRef(null)
  const importButtonRef = useRef(null)
  const hadPendingImport = useRef(false)

  useEffect(() => {
    if (pendingBackup !== undefined) {
      cancelImportRef.current?.focus()
      hadPendingImport.current = true
    } else if (hadPendingImport.current && !importing) {
      importButtonRef.current?.focus()
      hadPendingImport.current = false
    }
  }, [pendingBackup, importing])

  useEffect(() => {
    async function load() {
      try {
        const data = await getSettings()
        const p = data.provider || ''
        setProvider(p)
        const catalog = data.providers || []
        setProviders(catalog)
        const definition = catalog.find((entry) => entry.id === p)
        setModel(data.model || definition?.defaultModel || definition?.models?.[0]?.id || '')
        setReasoningEffort(data.reasoningEffort || 'none')
        setApiKeySet(data.apiKeySet || false)
        setReady(Boolean(data.ready))
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
    const definition = providers.find((entry) => entry.id === p)
    const selectedModel = definition?.models?.find((entry) => entry.id === definition.defaultModel) || definition?.models?.[0]
    setModel(selectedModel?.id || '')
    setReasoningEffort(selectedModel?.reasoningEfforts?.[0] || 'none')
    setReady(definition?.authType === 'api_key' && Boolean(envStatus.find((entry) => entry.provider === p)?.configured))
    setError(null)
    setSuccess(false)
  }

  function handleModelChange(e) {
    const nextModel = e.target.value
    setModel(nextModel)
    const selectedModel = currentModels.find((entry) => entry.id === nextModel)
    setReasoningEffort(selectedModel?.reasoningEfforts?.[0] || 'none')
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
      const result = await saveSettings({ provider, model, reasoningEffort })
      setApiKeySet(result.apiKeySet || false)
      setReady(Boolean(result.ready))
      setEnvStatus(result.envStatus || [])
      setSuccess(true)
    } catch (err) {
      setError(safeSettingsError(err, 'Could not save AI connection. Confirm provider setup and try again.'))
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
      setError(safeSettingsError(err, 'Could not export your learning data. Try again.'))
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

    try {
      const text = await file.text()
      let backup
      try {
        backup = JSON.parse(text)
      } catch {
        throw new Error('Invalid backup file: not valid JSON.')
      }
      setError(null)
      setSuccess(false)
      setPendingBackup(backup)
    } catch (err) {
      setError(err.message || 'Could not read that backup file. Check the file and try again.')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function handleConfirmImport() {
    if (pendingBackup === undefined) return
    setError(null)
    setSuccess(false)
    setImporting(true)
    setImportProgress(10)
    const backup = pendingBackup
    setPendingBackup(undefined)
    try {
      setImportProgress(50)
      const result = await importData(backup)
      setImportProgress(100)
      setSuccess(`Import complete. Restored ${Object.entries(result.counts || {})
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')}.`)
    } catch (err) {
      setError(safeSettingsError(err, 'Could not restore that backup. Check the file and try again.'))
    } finally {
      setImporting(false)
      setImportProgress(0)
    }
  }

  const onCodexConnectionChange = useCallback((connected) => {
    if (provider === 'openai-codex') setReady(connected)
  }, [provider])

  if (loading) {
    return <SkeletonSettings />
  }

  const currentProvider = providers.find((entry) => entry.id === provider)
  const currentModels = currentProvider?.models || []
  const currentModel = currentModels.find((entry) => entry.id === model)
  const currentReasoningEfforts = currentModel?.reasoningEfforts || []
  const selectedApiKeySet = envStatus.find((entry) => entry.provider === provider)?.configured ?? apiKeySet

  return (
    <>
    <AppHeader />
    <div className="ui-page px-4 py-6 sm:px-6">
      <main className="ui-container max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold ui-text">Settings</h1>

        <section id="appearance" className="settings-section settings-appearance ui-panel p-5 sm:p-6 scroll-mt-4" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className="text-xl font-semibold ui-text mb-4">Appearance</h2>
          <ThemeSwitcher variant="cards" />
        </section>

        {success && (
          <div className="ui-alert ui-alert-success" role="alert">
            {typeof success === 'string' ? success : 'Settings saved successfully.'}
          </div>
        )}

        {error && (
          <div className="ui-alert ui-alert-danger" role="alert">
            {error}
          </div>
        )}

        <section className="settings-section settings-learning-preferences ui-panel p-5 sm:p-6" aria-labelledby="learning-preferences-heading">
          <h2 id="learning-preferences-heading" className="text-xl font-semibold ui-text mb-3">Learning preferences</h2>
          <p className="text-sm ui-text-secondary">Your chosen weekly rhythm and pace shape each Track when you build it. Review and adjust those choices in the Track preview before adding it to your Trail.</p>
        </section>

        <section className="settings-section settings-ai-connection ui-panel p-5 sm:p-6" aria-labelledby="ai-connection-heading">
          <h2 id="ai-connection-heading" className="text-xl font-semibold ui-text mb-5">AI connection</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="provider" className="ui-field-label">
                LLM Provider
              </label>
              <select
                id="provider"
                value={provider}
                onChange={handleProviderChange}
                className="ui-field w-full"
              >
                <option value="">Select a provider</option>
                {providers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="model" className="ui-field-label">
                Model
              </label>
              <select
                id="model"
                value={model}
                onChange={handleModelChange}
                disabled={!provider}
                className="ui-field w-full"
              >
                {currentModels.length === 0 && <option value="">Select a provider first</option>}
                {currentModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {currentReasoningEfforts.length > 0 && (
              <div>
                <label htmlFor="reasoning-effort" className="ui-field-label">Reasoning level</label>
                <select id="reasoning-effort" value={reasoningEffort} onChange={(event) => setReasoningEffort(event.target.value)} className="ui-field w-full">
                  {currentReasoningEfforts.map((effort) => (
                    <option key={effort} value={effort}>{effort}</option>
                  ))}
                </select>
              </div>
            )}

            {currentProvider?.authType === 'api_key' && <div>
              <h3 className="text-sm font-semibold ui-text mb-2">Environment Configuration</h3>
              <p className="text-xs ui-text-muted mb-3">
                API keys are read from your <code>.env</code> file at server startup. Restart the server after editing <code>.env</code>.
              </p>
              <div className="space-y-2">
                {envStatus.map((status) => (
                  <div
                    key={status.provider}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border ui-border bg-[var(--ui-surface-alt)] px-3 py-2"
                  >
                    <span className="text-sm capitalize ui-text-secondary">{status.provider}</span>
                    <div className="flex items-center gap-2">
                      <code className="text-xs ui-text-secondary bg-[var(--ui-surface)] px-1 rounded">{status.envVar}</code>
                      <span className={`ui-status ${status.configured ? 'ui-status-success' : 'ui-status-danger'}`}>
                        {status.configured ? 'Configured' : 'Not configured'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {!selectedApiKeySet && provider && (
                <p className="ui-alert ui-alert-warning mt-3 text-sm">
                  No API key is configured for the selected provider. Set it in <code>.env</code> and restart the server.
                </p>
              )}
            </div>}

            {provider === 'openai-codex' && (
              <div className="space-y-3">
                <CodexConnection onConnectionChange={onCodexConnectionChange} />
                {ready && <p className="text-sm ui-status ui-status-success" role="status">The selected Codex provider is ready for learning actions.</p>}
                <p className="text-xs ui-text-muted">Codex subscription sign-in is experimental and depends on an unofficial integration. OpenAI API-key usage is billed separately.</p>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving || !provider || !model}
                className="ui-button ui-button-primary"
              >
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-section settings-data-privacy ui-panel p-5 sm:p-6" aria-labelledby="data-privacy-heading">
          <h2 id="data-privacy-heading" className="text-xl font-semibold ui-text mb-4">Data and privacy</h2>
          <div className="mb-4 space-y-2 text-sm ui-text-secondary">
            <p>Learning data lives in local SQLite on this device.</p>
            <p>Your theme lives in browser storage.</p>
            <p>When you use a configured provider, only bounded learning context is sent with that request.</p>
            <p>Credentials are never included in exports.</p>
          </div>
          <p className="text-sm ui-text-secondary mb-4">Export a JSON backup of your learning data to keep a portable copy.</p>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="ui-button ui-button-secondary"
          >
            {exporting ? 'Exporting…' : 'Export Data'}
          </button>
        </section>

        <section className="settings-section settings-danger-zone ui-panel p-5 sm:p-6" aria-labelledby="danger-zone-heading">
          <h2 id="danger-zone-heading" className="text-xl font-semibold ui-text mb-4">Danger zone</h2>
          <p className="text-sm ui-text-secondary mb-4">
            Restoring a backup replaces your current local learning data. Choose a backup only when you intend to replace it; you will confirm before anything changes.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              ref={importButtonRef}
              onClick={handleImportClick}
              disabled={importing}
              className="ui-button ui-button-primary"
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
                <div className="ui-progress-track w-full">
                  <div
                  className="ui-progress-value"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="mt-1 text-xs ui-text-muted">{importProgress}% — please wait</p>
            </div>
          )}
        </section>
      </main>
    </div>
    {pendingBackup !== undefined && (
      <div className="ui-dialog-backdrop">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-title"
          aria-describedby="restore-description"
          className="ui-panel ui-dialog"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setPendingBackup(undefined)
              return
            }
            if (event.key === 'Tab') {
              const first = cancelImportRef.current
              const last = replaceImportRef.current
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last?.focus()
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first?.focus()
              }
            }
          }}
        >
          <h2 id="restore-title" className="text-xl font-semibold ui-text">Replace learning data?</h2>
          <p id="restore-description" className="ui-text-secondary mt-2 mb-5">
            Restoring this backup will replace your current learning data. You can cancel now and nothing will be changed.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button ref={cancelImportRef} type="button" className="ui-button ui-button-secondary" onClick={() => setPendingBackup(undefined)}>
              Cancel restore
            </button>
            <button ref={replaceImportRef} type="button" className="ui-button ui-button-primary" onClick={handleConfirmImport}>
              Replace learning data
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export default SettingsPage
