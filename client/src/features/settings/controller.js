import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportData, getSettings, importData, saveSettings } from '../../api.js'
import { DEFAULT_THEME_ID, THEMES } from '../../theme/index.js'
import { toPublicError } from '../../lib/publicError.js'

export function buildSettingsViewModel(state = {}) {
  return {
    phase: state.loading === false ? 'ready' : state.phase || 'loading',
    category: state.category || 'appearance',
    themes: Array.isArray(state.themes) ? state.themes : THEMES,
    themeId: state.themeId || DEFAULT_THEME_ID,
    providers: Array.isArray(state.providers) ? state.providers : [],
    provider: state.provider || null,
    model: state.model || null,
    reasoningEffort: state.reasoningEffort || null,
    environmentStatuses: Array.isArray(state.environmentStatuses) ? state.environmentStatuses : [],
    codexConnection: state.codexConnection || {},
    ready: Boolean(state.ready),
    saving: Boolean(state.saving),
    exportState: { exporting: false, ...(state.exportState || {}) },
    importState: { importing: false, progress: 0, ...(state.importState || {}) },
    pendingBackup: state.pendingBackup ?? null,
    success: state.success || null,
    error: state.error || null,
  }
}

export function useSettingsController({
  themeId = DEFAULT_THEME_ID,
  themes = THEMES,
  getSettingsFn = getSettings,
  saveSettingsFn = saveSettings,
  exportDataFn = exportData,
  importDataFn = importData,
} = {}) {
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('none')
  const [providers, setProviders] = useState([])
  const [apiKeySet, setApiKeySet] = useState(false)
  const [ready, setReady] = useState(false)
  const [environmentStatuses, setEnvironmentStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [pendingBackup, setPendingBackup] = useState(null)
  const [category, setCategory] = useState('appearance')
  const [codexConnection, setCodexConnection] = useState({})

  useEffect(() => {
    let active = true
    getSettingsFn().then((data) => {
      if (!active) return
      const selectedProvider = data.provider || ''
      const catalog = Array.isArray(data.providers) ? data.providers : []
      const definition = catalog.find((entry) => entry.id === selectedProvider)
      setProvider(selectedProvider)
      setProviders(catalog)
      setModel(data.model || definition?.defaultModel || definition?.models?.[0]?.id || '')
      setReasoningEffort(data.reasoningEffort || 'none')
      setApiKeySet(Boolean(data.apiKeySet))
      setReady(Boolean(data.ready))
      setEnvironmentStatuses(Array.isArray(data.envStatus) ? data.envStatus : [])
    }).catch((requestError) => {
      if (active) setError(toPublicError(requestError, 'Failed to load settings.').message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [getSettingsFn])

  const changeProvider = useCallback((nextProvider) => {
    const definition = providers.find((entry) => entry.id === nextProvider)
    const selectedModel = definition?.models?.find((entry) => entry.id === definition.defaultModel) || definition?.models?.[0]
    setProvider(nextProvider)
    setModel(selectedModel?.id || '')
    setReasoningEffort(selectedModel?.reasoningEfforts?.[0] || 'none')
    setReady(definition?.authType === 'api_key' && Boolean(environmentStatuses.find((entry) => entry.provider === nextProvider)?.configured))
    setError(null)
    setSuccess(null)
  }, [environmentStatuses, providers])

  const changeModel = useCallback((nextModel) => {
    const selectedModel = providers.find((entry) => entry.id === provider)?.models?.find((entry) => entry.id === nextModel)
    setModel(nextModel)
    setReasoningEffort(selectedModel?.reasoningEfforts?.[0] || 'none')
    setError(null)
    setSuccess(null)
  }, [provider, providers])

  const changeReasoningEffort = useCallback((value) => setReasoningEffort(value), [])

  const save = useCallback(async () => {
    setError(null)
    setSuccess(null)
    if (!provider) { setError('Please select a provider.'); return null }
    if (!model) { setError('Please select a model.'); return null }
    setSaving(true)
    try {
      const result = await saveSettingsFn({ provider, model, reasoningEffort })
      setApiKeySet(Boolean(result.apiKeySet))
      setReady(Boolean(result.ready))
      setEnvironmentStatuses(Array.isArray(result.envStatus) ? result.envStatus : [])
      setSuccess(true)
      return result
    } catch (requestError) {
      setError(toPublicError(requestError, 'Could not save AI connection. Confirm provider setup and try again.').message)
      return null
    } finally {
      setSaving(false)
    }
  }, [model, provider, reasoningEffort, saveSettingsFn])

  const exportBackup = useCallback(async () => {
    setError(null)
    setSuccess(null)
    setExporting(true)
    try {
      const backup = await exportDataFn()
      setSuccess(true)
      return backup
    } catch (requestError) {
      setError(toPublicError(requestError, 'Could not export your learning data. Try again.').message)
      return null
    } finally {
      setExporting(false)
    }
  }, [exportDataFn])

  const readImportFile = useCallback(async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      const backup = JSON.parse(text)
      setError(null)
      setSuccess(null)
      setPendingBackup(backup)
    } catch {
      setError('Invalid backup file: not valid JSON.')
    }
  }, [])

  const cancelImport = useCallback(() => setPendingBackup(null), [])

  const confirmImport = useCallback(async () => {
    if (pendingBackup === null) return null
    const backup = pendingBackup
    setError(null)
    setSuccess(null)
    setImporting(true)
    setImportProgress(10)
    setPendingBackup(null)
    try {
      setImportProgress(50)
      const result = await importDataFn(backup)
      setImportProgress(100)
      setSuccess(`Import complete. Restored ${Object.entries(result.counts || {}).map(([key, count]) => `${count} ${key}`).join(', ')}.`)
      return result
    } catch (requestError) {
      setError(toPublicError(requestError, 'Could not restore that backup. Check the file and try again.').message)
      return null
    } finally {
      setImporting(false)
      setImportProgress(0)
    }
  }, [importDataFn, pendingBackup])

  const onCodexConnectionChange = useCallback((connected) => {
    setCodexConnection({ connected: Boolean(connected) })
    if (provider === 'openai-codex') setReady(Boolean(connected))
  }, [provider])

  const modelView = useMemo(() => buildSettingsViewModel({
    loading, category, themeId, themes, providers, provider, model, reasoningEffort, environmentStatuses,
    codexConnection, ready, saving,
    exportState: { exporting }, importState: { importing, progress: importProgress },
    pendingBackup, success, error,
  }), [category, codexConnection, error, environmentStatuses, exporting, importProgress, importing, loading, model, pendingBackup, provider, providers, ready, reasoningEffort, saving, success, themeId, themes])

  return { model: modelView, apiKeySet, setCategory, changeProvider, changeModel, changeReasoningEffort, save, exportBackup, readImportFile, confirmImport, cancelImport, onCodexConnectionChange }
}
