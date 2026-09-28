import { useEffect, useRef } from 'react'
import { useTheme } from '../theme/ThemeProvider.jsx'
import { useSettingsController } from '../features/settings/controller.js'
import { SkeletonSettings } from '../components/Skeleton.jsx'
import AppHeader from '../components/AppHeader.jsx'
import ThemeSwitcher from '../components/ThemeSwitcher.jsx'
import CodexConnection from '../components/CodexConnection.jsx'

function SettingsPage() {
  const { theme } = useTheme()
  const controller = useSettingsController({ themeId: theme.id })
  const { model: viewModel, apiKeySet } = controller
  const {
    provider, model, reasoningEffort, providers, ready, environmentStatuses: envStatus,
    phase, saving, error, success, exportState, importState, pendingBackup,
  } = viewModel
  const exporting = exportState.exporting
  const importing = importState.importing
  const importProgress = importState.progress
  const loading = phase === 'loading'
  const fileInputRef = useRef(null)
  const cancelImportRef = useRef(null)
  const replaceImportRef = useRef(null)
  const importButtonRef = useRef(null)
  const hadPendingImport = useRef(false)

  useEffect(() => {
    if (pendingBackup !== null) {
      cancelImportRef.current?.focus()
      hadPendingImport.current = true
    } else if (hadPendingImport.current && !importing) {
      importButtonRef.current?.focus()
      hadPendingImport.current = false
    }
  }, [pendingBackup, importing])

  async function handleSubmit(e) {
    e.preventDefault()
    await controller.save()
  }

  async function handleExport() {
    const data = await controller.exportBackup()
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mastery-roadmap-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
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
    await controller.readImportFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleConfirmImport() {
    await controller.confirmImport()
  }

  const onCodexConnectionChange = controller.onCodexConnectionChange

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
                value={provider || ''}
                onChange={(event) => controller.changeProvider(event.target.value)}
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
                value={model || ''}
                onChange={(event) => controller.changeModel(event.target.value)}
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
                <select id="reasoning-effort" value={reasoningEffort || 'none'} onChange={(event) => controller.changeReasoningEffort(event.target.value)} className="ui-field w-full">
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
    {pendingBackup !== null && (
      <div className="ui-dialog-backdrop">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-title"
          aria-describedby="restore-description"
          className="ui-panel ui-dialog"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              controller.cancelImport()
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
            <button ref={cancelImportRef} type="button" className="ui-button ui-button-secondary" onClick={controller.cancelImport}>
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
