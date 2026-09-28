import { toPublicError } from '../../lib/publicError.js'

export function createContinuationState(values = {}) {
  return {
    phase: 'loading',
    parentTrack: {},
    readiness: {},
    level: 'Intermediate',
    timeCommitment: '30 min/day',
    profileStale: false,
    preview: null,
    selectedChapterId: null,
    adjustmentDraft: '',
    adjustmentOpen: false,
    busy: { loading: true, generating: false, tweaking: false, confirming: false, saving: false },
    error: null,
    ...values,
    busy: { loading: true, generating: false, tweaking: false, confirming: false, saving: false, ...(values.busy || {}) },
  }
}

export function buildContinuationViewModel(input = {}) {
  const state = createContinuationState(input)
  return {
    phase: state.phase,
    parentTrack: state.parentTrack || {},
    readiness: state.readiness || {},
    level: state.level || null,
    timeCommitment: state.timeCommitment || null,
    profileStale: Boolean(state.profileStale),
    preview: state.preview || null,
    selectedChapterId: state.selectedChapterId ?? null,
    adjustmentDraft: state.adjustmentDraft || '',
    adjustmentOpen: Boolean(state.adjustmentOpen),
    busy: state.busy,
    error: typeof state.error === 'string' ? state.error : state.error ? toPublicError(state.error) : null,
  }
}
