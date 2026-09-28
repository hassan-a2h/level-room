import { describe, expect, it } from 'vitest'
import { buildContinuationViewModel, createContinuationState } from './controller.js'

describe('continuation controller model', () => {
  it('keeps profile and adjustment drafts while a preview is open', () => {
    const model = buildContinuationViewModel(createContinuationState({
      phase: 'preview', parentTrack: { id: 9, title: 'Foundations' }, readiness: { ready: true },
      level: 'Advanced', timeCommitment: '1 hour/day', profileStale: true,
      preview: { modules: [{ id: 3 }] }, selectedChapterId: 3,
      adjustmentDraft: 'Add a practical session', adjustmentOpen: true,
      busy: { generating: false, saving: false },
    }))

    expect(model).toMatchObject({
      phase: 'preview', parentTrack: { id: 9, title: 'Foundations' }, readiness: { ready: true },
      level: 'Advanced', timeCommitment: '1 hour/day', profileStale: true,
      preview: { modules: [{ id: 3 }] }, selectedChapterId: 3,
      adjustmentDraft: 'Add a practical session', adjustmentOpen: true,
    })
    expect(model.busy).toMatchObject({ generating: false, saving: false })
  })

  it('builds a complete loading model from no state', () => {
    const model = buildContinuationViewModel(createContinuationState())
    expect(model.phase).toBe('loading')
    expect(model.preview).toBeNull()
    expect(model.adjustmentOpen).toBe(false)
  })
})
