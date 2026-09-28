import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { MemoryRouter } from 'react-router-dom'
import {
  THEME_VIEW_ACTIONS,
  THEME_VIEW_SLOTS,
  validateThemeViewContract,
} from '../theme/core/viewContracts.js'
import { fireEvent, render, screen } from '@testing-library/react'
import { THEMES } from '../theme/index.js'
import { createSessionBlockActions } from '../theme/core/sessionActionAdapters.js'
import AtlasSession from '../theme/packs/living-atlas/views/SessionView.jsx'
import CuriositySession from '../theme/packs/curiosity-engine/views/SessionView.jsx'
import WorkshopSession from '../theme/packs/mission-workshop/views/SessionView.jsx'
import AtlasBuild from '../theme/packs/living-atlas/views/BuildView.jsx'
import CuriosityBuild from '../theme/packs/curiosity-engine/views/BuildView.jsx'
import WorkshopBuild from '../theme/packs/mission-workshop/views/BuildView.jsx'
import AtlasSettings from '../theme/packs/living-atlas/views/SettingsView.jsx'
import CuriositySettings from '../theme/packs/curiosity-engine/views/SettingsView.jsx'
import WorkshopSettings from '../theme/packs/mission-workshop/views/SettingsView.jsx'

const modelFor = (name) => {
  const common = { phase: 'ready', busy: {}, error: null }
  if (name === 'Session') return { ...common, state: 'active', session: {}, progress: {}, blocks: [], currentBlock: null, viewedBlock: null, viewedEntry: null, draftsByBlockId: {}, reviewMode: false, artifactRequired: false, tutor: {}, publicError: null }
  if (name === 'Build') return { ...common, phase: 'brief', taskSpec: null, artifactType: 'text', evidence: {}, currentEvidenceStep: 'setup', content: '', fileName: null, rubric: [], evaluation: null, ui: { showHints: false } }
  return { ...common, phase: 'ready', category: 'appearance', themes: [], themeId: 'living-atlas', providers: [], provider: '', model: '', reasoningEffort: 'none', environmentStatuses: [], codexConnection: {}, ready: false, saving: false, exportState: { exporting: false }, importState: { importing: false, progress: 0 }, pendingBackup: null, success: null }
}

describe('theme view composition contracts', () => {
  it('defines the public actions and the narrow slots for these surfaces', () => {
    expect(THEME_VIEW_ACTIONS).toMatchObject({
      Session: expect.arrayContaining(['completeBlock', 'submitBlock', 'reviewBlock', 'openTutor', 'returnToTrail']),
      Build: expect.arrayContaining(['begin', 'setEvidence', 'selectFile', 'submit', 'revise', 'returnToTrail']),
      Settings: expect.arrayContaining(['selectCategory', 'selectTheme', 'setProvider', 'saveProvider', 'exportData', 'chooseImportFile', 'cancelImport', 'confirmImport']),
    })
    expect(THEME_VIEW_SLOTS).toEqual({
      Session: ['activity', 'tutor'],
      Build: ['genericArtifactInput'],
      Settings: ['codexConnection'],
    })
  })

  it('adapts Session block actions by documented block ID and payload signatures', () => {
    const blocks = [{ id: 'read-1' }, { id: 'quiz-2' }]
    const mutate = vi.fn()
    const actions = createSessionBlockActions(blocks, mutate)
    actions.completeBlock('read-1', { action: 'continue' })
    actions.submitBlock('quiz-2', 'answer')
    expect(mutate).toHaveBeenNthCalledWith(1, blocks[0], 'complete', { action: 'continue' })
    expect(mutate).toHaveBeenNthCalledWith(2, blocks[1], 'submit', { response: 'answer' })
    expect(THEME_VIEW_ACTIONS.Session).not.toContain('retryLoad')
    expect(THEME_VIEW_ACTIONS.Session).not.toContain('sendTutorMessage')
  })

  it('requires complete model, action, and slot contracts before rendering a themed view', () => {
    for (const name of ['Session', 'Build', 'Settings']) {
      const actions = Object.fromEntries(THEME_VIEW_ACTIONS[name].map((action) => [action, vi.fn()]))
      const slots = Object.fromEntries(THEME_VIEW_SLOTS[name].map((slot) => [slot, null]))
      expect(() => validateThemeViewContract(name, { model: modelFor(name), actions, slots })).not.toThrow()
      expect(() => validateThemeViewContract(name, { model: modelFor(name), actions: {}, slots })).toThrow(/actions\./)
      expect(() => validateThemeViewContract(name, { model: modelFor(name), actions, slots: { ...slots, unexpected: null } })).toThrow(/slots\.unexpected/)
    }
  })

  it('renders Session composition from the shared model and activity/tutor slots in every pack', () => {
    for (const View of [AtlasSession, CuriositySession, WorkshopSession]) {
      const { unmount } = render(h(MemoryRouter, null, h(View, { model: { ...modelFor('Session'), session: { title: 'Signal and noise', module_title: 'Foundations' }, progress: { percent: 40, completed: 2, total: 5 } }, actions: Object.fromEntries(THEME_VIEW_ACTIONS.Session.map((action) => [action, vi.fn()])), slots: { activity: h('article', null, 'Current activity'), tutor: h('aside', null, 'Guide panel') } })))
      expect(screen.getByRole('heading', { name: 'Signal and noise' })).toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: 'Session progress' })).toHaveAttribute('aria-valuenow', '40')
      expect(screen.getByText('Current activity')).toBeInTheDocument()
      expect(screen.getByText('Guide panel')).toBeInTheDocument()
      unmount()
    }
  })

  it('renders Build fields from the model and delegates submission in every pack', () => {
    for (const View of [AtlasBuild, CuriosityBuild, WorkshopBuild]) {
      const submit = vi.fn()
      const actions = Object.fromEntries(THEME_VIEW_ACTIONS.Build.map((action) => [action, vi.fn()]))
      actions.submit = submit
      const { unmount } = render(h(View, { model: { ...modelFor('Build'), taskSpec: { title: 'Trace a request', scenario: 'Follow one request.', goal: 'Record its path.', constraints: [], deliverables: [], success_criteria: [], safety_notes: ['Use local data only.'] }, evidence: { setup: 'Local', actions: 'Followed', result: 'Recorded', reflection: 'Clear' } }, actions, slots: { genericArtifactInput: h('label', null, 'Build submission', h('textarea', { 'aria-label': 'Build submission' })) } }))
      expect(screen.getByRole('heading', { name: 'Build' })).toBeInTheDocument()
      expect(screen.getByText('Trace a request')).toBeInTheDocument()
      expect(screen.getByText(/Use local data only/)).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Setup' })).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Build submission' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /submit build/i }))
      expect(submit).toHaveBeenCalledOnce()
      unmount()
    }
  })

  it('lets every Build view review complete evidence before submitting', () => {
    for (const View of [AtlasBuild, CuriosityBuild, WorkshopBuild]) {
      const reviewSubmission = vi.fn()
      const actions = Object.fromEntries(THEME_VIEW_ACTIONS.Build.map((action) => [action, vi.fn()]))
      actions.reviewSubmission = reviewSubmission
      const { unmount } = render(h(View, { model: { ...modelFor('Build'), taskSpec: { title: 'Trace a request', scenario: 'Follow one request.', goal: 'Record its path.', constraints: [], deliverables: [], success_criteria: [], safety_notes: ['Use local data only.'] }, evidence: { setup: 'Local', actions: 'Followed', result: 'Recorded', reflection: 'Clear' } }, actions, slots: { genericArtifactInput: null } }))
      fireEvent.click(screen.getByRole('button', { name: /review submission/i }))
      expect(reviewSubmission).toHaveBeenCalledOnce()
      unmount()
      const review = render(h(View, { model: { ...modelFor('Build'), phase: 'review', taskSpec: { title: 'Trace a request', scenario: 'Follow one request.', goal: 'Record its path.', constraints: [], deliverables: [], success_criteria: [], safety_notes: ['Use local data only.'] }, evidence: { setup: 'Local', actions: 'Followed', result: 'Recorded', reflection: 'Clear' } }, actions, slots: { genericArtifactInput: null } }))
      expect(screen.getAllByRole('listitem').find((item) => item.textContent === 'Review')).toHaveAttribute('aria-current', 'step')
      expect(screen.getByRole('heading', { name: 'Review your submission' })).toBeInTheDocument()
      expect(screen.getByText('Followed')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /edit evidence/i }))
      expect(actions.setPhase).toHaveBeenCalledWith('evidence')
      review.unmount()
    }
  })

  it('renders Settings category navigation and delegates category changes in every pack', () => {
    for (const View of [AtlasSettings, CuriositySettings, WorkshopSettings]) {
      const selectCategory = vi.fn()
      const actions = Object.fromEntries(THEME_VIEW_ACTIONS.Settings.map((action) => [action, vi.fn()]))
      actions.selectCategory = selectCategory
      const { unmount } = render(h(View, { model: { ...modelFor('Settings'), themes: THEMES, category: 'appearance' }, actions, slots: { codexConnection: null } }))
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'AI connection' }))
      expect(selectCategory).toHaveBeenCalledWith('ai')
      unmount()
    }
  })

  it('only offers Settings retry when the adapter has a safe retry operation', () => {
    for (const View of [AtlasSettings, CuriositySettings, WorkshopSettings]) {
      const retry = vi.fn()
      const actions = Object.fromEntries(THEME_VIEW_ACTIONS.Settings.map((action) => [action, vi.fn()]))
      actions.retry = retry
      const { unmount } = render(h(View, { model: { ...modelFor('Settings'), themes: THEMES, category: 'appearance', error: 'Save failed.', retryAvailable: false }, actions, slots: { codexConnection: null } }))
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
      unmount()
      const result = render(h(View, { model: { ...modelFor('Settings'), themes: THEMES, category: 'appearance', error: 'Save failed.', retryAvailable: true }, actions, slots: { codexConnection: null } }))
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      expect(retry).toHaveBeenCalledOnce()
      result.unmount()
    }
  })
})
