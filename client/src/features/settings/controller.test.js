import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildSettingsViewModel, useSettingsController } from './controller.js'

const providers = [
  { id: 'provider-a', authType: 'api_key', defaultModel: 'a-1', models: [{ id: 'a-1', reasoningEfforts: ['low'] }] },
  { id: 'openai-codex', authType: 'oauth', defaultModel: 'codex-1', models: [{ id: 'codex-1', reasoningEfforts: ['minimal', 'xhigh'] }] },
]

describe('settings controller', () => {
  it('loads catalogs, resets dependent model settings, and saves the active provider choice', async () => {
    const getSettingsFn = vi.fn().mockResolvedValue({ provider: '', providers, envStatus: [] })
    const saveSettingsFn = vi.fn().mockResolvedValue({ ready: true, apiKeySet: true, envStatus: [] })
    const { result } = renderHook(() => useSettingsController({
      getSettingsFn, saveSettingsFn,
    }))
    await waitFor(() => expect(result.current.model.phase).toBe('ready'))

    act(() => result.current.changeProvider('openai-codex'))
    expect(result.current.model).toMatchObject({ provider: 'openai-codex', model: 'codex-1', reasoningEffort: 'minimal' })
    act(() => result.current.changeModel('codex-1'))
    act(() => result.current.changeReasoningEffort('xhigh'))
    await act(async () => { await result.current.save() })

    expect(saveSettingsFn).toHaveBeenCalledWith({ provider: 'openai-codex', model: 'codex-1', reasoningEffort: 'xhigh' })
    expect(result.current.model).toMatchObject({ ready: true, saving: false })
  })

  it('retains a parsed import backup through confirmation and reports restore state', async () => {
    const getSettingsFn = vi.fn().mockResolvedValue({ provider: '', providers, envStatus: [] })
    const importDataFn = vi.fn().mockResolvedValue({ counts: { topics: 2, lessons: 4 } })
    const { result } = renderHook(() => useSettingsController({
      getSettingsFn,
      importDataFn,
    }))
    await waitFor(() => expect(result.current.model.phase).toBe('ready'))
    const file = { text: async () => JSON.stringify({ version: 1, topics: [] }) }
    await act(async () => { await result.current.readImportFile(file) })
    expect(result.current.model.pendingBackup).toEqual({ version: 1, topics: [] })

    await act(async () => { await result.current.confirmImport() })
    expect(importDataFn).toHaveBeenCalledWith({ version: 1, topics: [] })
    expect(result.current.model).toMatchObject({ pendingBackup: null, importState: { importing: false, progress: 0 } })
    expect(result.current.model.success).toContain('Restored 2 topics, 4 lessons')
  })

  it('builds canonical theme and Codex/export/import state when defaults are missing', () => {
    expect(buildSettingsViewModel()).toMatchObject({
      phase: 'loading', category: 'appearance', themes: expect.any(Array), themeId: 'morning-mist',
      providers: [], provider: null, model: null, reasoningEffort: null, environmentStatuses: [],
      codexConnection: {}, ready: false, saving: false, pendingBackup: null,
    })
  })

  it('accepts the active application theme catalog through injection', async () => {
    const themes = [{ id: 'theme-a', name: 'Theme A' }]
    const getSettingsFn = vi.fn().mockResolvedValue({ provider: '', providers, envStatus: [] })
    const { result } = renderHook(() => useSettingsController({ themes, getSettingsFn }))
    await waitFor(() => expect(result.current.model.phase).toBe('ready'))
    expect(result.current.model.themes).toEqual(themes)
  })
})
