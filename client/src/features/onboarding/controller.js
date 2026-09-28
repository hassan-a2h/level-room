import { toPublicError } from '../../lib/publicError.js'

const STAGES = Object.freeze(['destination', 'starting_point', 'learning_rhythm', 'preview'])

export function createOnboardingState(values = {}) {
  return {
    stage: 'destination',
    destination: '',
    selectedLevel: null,
    placementAnswers: {},
    selectedTime: null,
    selectedPace: 'steady',
    generation: { mode: 'auto', status: 'idle', progress: null, eventId: null, canResume: true },
    curriculum: null,
    expandedSessionsById: {},
    adjustmentDraft: '',
    adjustmentOpen: false,
    error: null,
    providerReady: true,
    busy: { submitting: false, loadingQuestions: false, placement: false, generating: false, recovering: false },
    ...values,
    generation: { mode: 'auto', status: 'idle', progress: null, eventId: null, canResume: true, ...(values.generation || {}) },
    busy: { submitting: false, loadingQuestions: false, placement: false, generating: false, recovering: false, ...(values.busy || {}) },
  }
}

export function buildOnboardingViewModel(input = {}) {
  const state = createOnboardingState(input)
  const stageIndex = Math.max(0, STAGES.indexOf(state.stage))
  const placement = {
    questions: Array.isArray(state.placementQuestions) ? state.placementQuestions : [],
    answers: state.placementAnswers || {},
    result: state.placementResult || null,
    phase: state.placementPhase || null,
  }
  const generation = {
    ...state.generation,
    recovery: state.recovery || null,
  }
  return {
    stage: STAGES.includes(state.stage) ? state.stage : STAGES[0],
    stageIndex,
    stageCount: STAGES.length,
    substep: state.placementPhase || null,
    destination: state.destination || '',
    levelOptions: Array.isArray(state.levelOptions) ? state.levelOptions : [],
    selectedLevel: state.selectedLevel || state.level || null,
    placement,
    timeOptions: Array.isArray(state.timeOptions) ? state.timeOptions : [],
    selectedTime: state.selectedTime || state.timeCommitment || null,
    paceOptions: Array.isArray(state.paceOptions) ? state.paceOptions : [],
    selectedPace: state.selectedPace || state.pace || null,
    generation,
    preview: {
      curriculum: state.curriculum || null,
      expandedSessionsById: state.expandedSessionsById || {},
      adjustmentDraft: state.adjustmentDraft || '',
      adjustmentOpen: Boolean(state.adjustmentOpen),
    },
    error: typeof state.error === 'string' ? state.error : state.error ? toPublicError(state.error) : null,
    busy: state.busy,
    providerReady: Boolean(state.providerReady),
  }
}
