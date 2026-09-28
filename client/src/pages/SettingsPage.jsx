import { Suspense, useCallback, useMemo, useState } from 'react'
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
  const model = { ...controller.model, apiKeySet: controller.apiKeySet }
  const { setCategory, changeProvider, changeModel, changeReasoningEffort, save, exportBackup, readImportFile, cancelImport, confirmImport, onCodexConnectionChange } = controller
  const exportSettings = useCallback(async () => {
    const data = await exportBackup()
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mastery-roadmap-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, [exportBackup])
  const actions = useMemo(() => ({
    selectCategory: setCategory,
    selectTheme,
    setProvider: changeProvider,
    setModel: changeModel,
    setReasoningEffort: changeReasoningEffort,
    saveProvider: save,
    exportData: exportSettings,
    chooseImportFile: readImportFile,
    cancelImport,
    confirmImport,
    retry: onRetry,
  }), [setCategory, selectTheme, changeProvider, changeModel, changeReasoningEffort, save, exportSettings, readImportFile, cancelImport, confirmImport, onRetry])

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
