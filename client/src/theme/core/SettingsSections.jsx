import { useEffect, useRef } from 'react'
import ThemeSwitcher from '../../components/ThemeSwitcher.jsx'

const CATEGORIES = [
  ['appearance', 'Appearance'], ['learning', 'Learning'], ['ai', 'AI connection'],
  ['privacy', 'Data & privacy'], ['restore', 'Restore'],
]

export function SettingsCategoryNav({ model, actions, className = '' }) {
  return <nav className={`settings-category-nav ${className}`.trim()} aria-label="Settings categories">
    {CATEGORIES.map(([id, label]) => <button key={id} type="button" className="ui-button ui-button-quiet min-h-0 px-3 py-2 text-sm" aria-pressed={model.category === id} onClick={() => actions.selectCategory(id)}>{label}</button>)}
  </nav>
}

function AppearanceSettings({ model, actions }) {
  return <section id="appearance" className="settings-section settings-appearance ui-panel p-5 sm:p-6" aria-labelledby="appearance-heading">
    <h2 id="appearance-heading" className="text-xl font-semibold ui-text mb-4">Appearance</h2>
    <ThemeSwitcher variant="cards" themes={model.themes} value={model.themeId} onChange={actions.selectTheme} />
  </section>
}

function LearningSettings() {
  return <section className="settings-section settings-learning-preferences ui-panel p-5 sm:p-6" aria-labelledby="learning-preferences-heading">
    <h2 id="learning-preferences-heading" className="text-xl font-semibold ui-text mb-3">Learning preferences</h2>
    <p className="text-sm ui-text-secondary">Your chosen weekly rhythm and pace shape each Track when you build it. Review and adjust those choices in the Track preview before adding it to your Trail.</p>
  </section>
}

function AiSettings({ model, actions, codexConnection }) {
  const provider = model.provider || ''
  const selectedProvider = model.providers.find((item) => item.id === provider)
  const currentModels = selectedProvider?.models || []
  const currentModel = currentModels.find((item) => item.id === model.model)
  const reasoningEfforts = currentModel?.reasoningEfforts || []
  const configured = model.environmentStatuses.find((item) => item.provider === provider)?.configured ?? model.apiKeySet

  return <section className="settings-section settings-ai-connection ui-panel p-5 sm:p-6" aria-labelledby="ai-connection-heading">
    <h2 id="ai-connection-heading" className="text-xl font-semibold ui-text mb-5">AI connection</h2>
    <form onSubmit={(event) => { event.preventDefault(); actions.saveProvider() }} className="space-y-5">
      <div><label htmlFor="provider" className="ui-field-label">LLM Provider</label><select id="provider" value={provider} onChange={(event) => actions.setProvider(event.target.value)} className="ui-field w-full"><option value="">Select a provider</option>{model.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div><label htmlFor="model" className="ui-field-label">Model</label><select id="model" value={model.model || ''} onChange={(event) => actions.setModel(event.target.value)} disabled={!provider} className="ui-field w-full">{currentModels.length === 0 && <option value="">Select a provider first</option>}{currentModels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      {reasoningEfforts.length > 0 && <div><label htmlFor="reasoning-effort" className="ui-field-label">Reasoning level</label><select id="reasoning-effort" value={model.reasoningEffort || 'none'} onChange={(event) => actions.setReasoningEffort(event.target.value)} className="ui-field w-full">{reasoningEfforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></div>}
      {selectedProvider?.authType === 'api_key' && <div>
        <h3 className="text-sm font-semibold ui-text mb-2">Environment Configuration</h3>
        <p className="text-xs ui-text-muted mb-3">API keys are read from your <code>.env</code> file at server startup. Restart the server after editing <code>.env</code>.</p>
        <div className="space-y-2">{model.environmentStatuses.map((status) => <div key={status.provider} className="flex flex-wrap items-center justify-between gap-2 rounded-md border ui-border bg-[var(--ui-surface-alt)] px-3 py-2"><span className="text-sm capitalize ui-text-secondary">{status.provider}</span><div className="flex items-center gap-2"><code className="text-xs ui-text-secondary bg-[var(--ui-surface)] px-1 rounded">{status.envVar}</code><span className={`ui-status ${status.configured ? 'ui-status-success' : 'ui-status-danger'}`}>{status.configured ? 'Configured' : 'Not configured'}</span></div></div>)}</div>
        {!configured && provider && <p className="ui-alert ui-alert-warning mt-3 text-sm">No API key is configured for the selected provider. Set it in <code>.env</code> and restart the server.</p>}
      </div>}
      <div className="pt-2"><button type="submit" disabled={model.saving || !provider || !model.model} className="ui-button ui-button-primary">{model.saving ? 'Saving…' : 'Save Settings'}</button></div>
    </form>
    {provider === 'openai-codex' && <div className="space-y-3 mt-5">{codexConnection}{model.ready && <p className="text-sm ui-status ui-status-success" role="status">The selected Codex provider is ready for learning actions.</p>}<p className="text-xs ui-text-muted">Codex subscription sign-in is experimental and depends on an unofficial integration. OpenAI API-key usage is billed separately.</p></div>}
  </section>
}

function PrivacySettings({ model, actions }) {
  return <section className="settings-section settings-data-privacy ui-panel p-5 sm:p-6" aria-labelledby="data-privacy-heading">
    <h2 id="data-privacy-heading" className="text-xl font-semibold ui-text mb-4">Data &amp; privacy</h2>
    <div className="mb-4 space-y-2 text-sm ui-text-secondary"><p>Learning data lives in local SQLite on this device.</p><p>Your theme lives in browser storage.</p><p>When you use a configured provider, only bounded learning context is sent with that request.</p><p>Credentials are never included in exports.</p></div>
    <p className="text-sm ui-text-secondary mb-4">Export a JSON backup of your learning data to keep a portable copy.</p>
    <button type="button" onClick={actions.exportData} disabled={model.exportState.exporting} className="ui-button ui-button-secondary">{model.exportState.exporting ? 'Exporting…' : 'Export Data'}</button>
  </section>
}

function RestoreSettings({ model, actions }) {
  const fileInput = useRef(null)
  const importButton = useRef(null)
  const cancelButton = useRef(null)
  const replaceButton = useRef(null)
  const dialog = useRef(null)
  const pending = model.pendingBackup !== null
  const hadPending = useRef(false)
  useEffect(() => {
    if (pending) {
      cancelButton.current?.focus()
      hadPending.current = true
    } else if (hadPending.current && !model.importState.importing) {
      importButton.current?.focus()
      hadPending.current = false
    }
  }, [model.importState.importing, pending])
  useEffect(() => {
    if (!pending) return undefined
    const handleKeyDown = (event) => {
      if (!dialog.current?.contains(document.activeElement)) return
      if (event.key === 'Escape') { actions.cancelImport(); return }
      if (event.key !== 'Tab') return
      if (event.shiftKey && document.activeElement === cancelButton.current) { event.preventDefault(); replaceButton.current?.focus() }
      else if (!event.shiftKey && document.activeElement === replaceButton.current) { event.preventDefault(); cancelButton.current?.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [actions, pending])
  return <>
    <section className="settings-section settings-danger-zone ui-panel p-5 sm:p-6" aria-labelledby="danger-zone-heading">
      <h2 id="danger-zone-heading" className="text-xl font-semibold ui-text mb-4">Restore learning data</h2>
      <p className="text-sm ui-text-secondary mb-4">Restoring a backup replaces your current local learning data. Choose a backup only when you intend to replace it; you will confirm before anything changes.</p>
      <div className="flex flex-wrap gap-3 items-center"><button ref={importButton} type="button" onClick={() => fileInput.current?.click()} disabled={model.importState.importing} className="ui-button ui-button-primary">{model.importState.importing ? 'Importing…' : 'Import Data'}</button><input ref={fileInput} type="file" accept="application/json,.json" aria-label="Import backup file" className="hidden" onChange={(event) => { actions.chooseImportFile(event.target.files?.[0]); event.target.value = '' }} /></div>
      {model.importState.importing && <div className="mt-4"><div className="ui-progress-track w-full"><div className="ui-progress-value" style={{ width: `${model.importState.progress}%` }} /></div><p className="mt-1 text-xs ui-text-muted">{model.importState.progress}% — please wait</p></div>}
    </section>
    {pending && <div className="ui-dialog-backdrop"><div ref={dialog} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="restore-title" aria-describedby="restore-description" className="ui-panel ui-dialog"><h2 id="restore-title" className="text-xl font-semibold ui-text">Replace learning data?</h2><p id="restore-description" className="ui-text-secondary mt-2 mb-5">Restoring this backup will replace your current learning data. You can cancel now and nothing will be changed.</p><div className="flex flex-wrap justify-end gap-3"><button ref={cancelButton} type="button" className="ui-button ui-button-secondary" onClick={actions.cancelImport}>Cancel restore</button><button ref={replaceButton} type="button" className="ui-button ui-button-primary" onClick={actions.confirmImport}>Replace learning data</button></div></div></div>}
  </>
}

export function SettingsCategoryContent({ model, actions, slots }) {
  const sections = {
    appearance: <AppearanceSettings model={model} actions={actions} />,
    learning: <LearningSettings />,
    ai: <AiSettings model={model} actions={actions} codexConnection={slots.codexConnection} />,
    privacy: <PrivacySettings model={model} actions={actions} />,
    restore: <RestoreSettings model={model} actions={actions} />,
  }
  return <>{model.success && <div className="ui-alert ui-alert-success" role="alert">{typeof model.success === 'string' ? model.success : 'Settings saved successfully.'}</div>}{model.error && <div className="ui-alert ui-alert-danger" role="alert"><span>{model.error}</span>{model.retryAvailable && <button type="button" className="ui-button ui-button-quiet ml-3" onClick={actions.retry}>Retry</button>}</div>}{sections[model.category] || sections.appearance}</>
}
