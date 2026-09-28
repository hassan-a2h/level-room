import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { useTheme } from '../theme/ThemeProvider.jsx'
import { useSettingsController } from '../features/settings/controller.js'
import { SkeletonSettings } from '../components/Skeleton.jsx'
import AppHeader from '../components/AppHeader.jsx'
import CodexConnection from '../components/CodexConnection.jsx'
import { useThemeView } from '../theme/ThemeProvider.jsx'

function SettingsContent({ onRetry }) {
  const { theme, selectTheme } = useTheme()
  const SettingsView = useThemeView('SettingsView')
  const controller = useSettingsController({ themeId: theme.id })
  const [retryAvailable, setRetryAvailable] = useState(true)
  const retryOperation = useRef(onRetry)
  const model = { ...controller.model, apiKeySet: controller.apiKeySet, retryAvailable }
  const { setCategory, changeProvider, changeModel, changeReasoningEffort, save, exportBackup, readImportFile, cancelImport, confirmImport, onCodexConnectionChange } = controller
  const exportSettings = useCallback(async () => {
    const data = await exportBackup()
    if (!data) return false
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mastery-roadmap-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    return true
  }, [exportBackup])
  const retrySave = useCallback(async () => {
    const result = await save()
    const canRetry = Boolean(model.provider && model.model)
    retryOperation.current = !result && canRetry ? retrySave : null
    setRetryAvailable(!result && canRetry)
    return result
  }, [model.model, model.provider, save])
  const retryExport = useCallback(async () => {
    const succeeded = await exportSettings()
    retryOperation.current = succeeded ? null : retryExport
    setRetryAvailable(!succeeded)
    return succeeded
  }, [exportSettings])
  const retryConfirmImport = useCallback(async () => {
    retryOperation.current = null
    setRetryAvailable(false)
    return confirmImport()
  }, [confirmImport])
  const retryAction = useCallback(() => retryOperation.current?.(), [])
  const chooseImportFile = useCallback(async (file) => {
    retryOperation.current = null
    setRetryAvailable(false)
    return readImportFile(file)
  }, [readImportFile])
  const cancelImportAndClearRetry = useCallback(() => {
    retryOperation.current = null
    setRetryAvailable(false)
    return cancelImport()
  }, [cancelImport])
  const actions = useMemo(() => ({
    selectCategory: setCategory,
    selectTheme,
    setProvider: changeProvider,
    setModel: changeModel,
    setReasoningEffort: changeReasoningEffort,
    saveProvider: retrySave,
    exportData: retryExport,
    chooseImportFile,
    cancelImport: cancelImportAndClearRetry,
    confirmImport: retryConfirmImport,
    retry: retryAction,
  }), [setCategory, selectTheme, changeProvider, changeModel, changeReasoningEffort, retrySave, retryExport, chooseImportFile, cancelImportAndClearRetry, retryConfirmImport, retryAction])

  if (model.phase === 'loading') return <><AppHeader /><SkeletonSettings /></>
  return <>
    <AppHeader />
    <Suspense fallback={<SkeletonSettings />}>
      <SettingsView model={model} actions={actions} slots={{ codexConnection: <CodexConnection onConnectionChange={onCodexConnectionChange} /> }} />
    </Suspense>
  </>
}

export default function SettingsPage() {
  const [generation, setGeneration] = useState(0)
  return <SettingsContent key={generation} onRetry={() => setGeneration((value) => value + 1)} />
}
