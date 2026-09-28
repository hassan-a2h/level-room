import { describe, expect, it } from 'vitest'
import { buildOnboardingViewModel, createOnboardingState } from './controller.js'

describe('onboarding controller model', () => {
  it('retains generation, placement, and preview drafts through a model rebuild', () => {
    const state = createOnboardingState({
      stage: 'preview',
      destination: 'Build a small web app',
      placementAnswers: { q1: 'some experience' },
      generation: { mode: 'stream', status: 'recoverable', eventId: 'evt-1', canResume: true },
      expandedSessionsById: { session7: true },
      adjustmentDraft: 'Add testing practice',
      adjustmentOpen: true,
    })
    const model = buildOnboardingViewModel(state)

    expect(model).toMatchObject({
      stage: 'preview',
      destination: 'Build a small web app',
      placement: { answers: { q1: 'some experience' } },
      generation: { mode: 'stream', status: 'recoverable', eventId: 'evt-1', canResume: true },
      preview: { expandedSessionsById: { session7: true }, adjustmentDraft: 'Add testing practice', adjustmentOpen: true },
    })
    expect(model.busy).toMatchObject({ submitting: false, generating: false })
  })

  it('returns a complete canonical model for empty onboarding state', () => {
    const model = buildOnboardingViewModel(createOnboardingState())
    expect(Object.keys(model)).toEqual(expect.arrayContaining([
      'stage', 'stageIndex', 'stageCount', 'substep', 'destination', 'levelOptions', 'selectedLevel', 'placement',
      'timeOptions', 'selectedTime', 'paceOptions', 'selectedPace', 'generation', 'preview', 'error', 'busy', 'providerReady',
    ]))
    expect(model.stage).toBe('destination')
    expect(model.generation.status).toBe('idle')
  })
})
