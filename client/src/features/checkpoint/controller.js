import { toPublicError } from '../../lib/publicError.js'

function hasAnswer(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function createCheckpointState(values = {}) {
  const { busy = {}, ...overrides } = values
  return {
    phase: 'intro',
    exam: null,
    questions: [],
    answers: {},
    currentIndex: 0,
    saveState: 'idle',
    evaluation: null,
    isPartialRetest: false,
    ready: true,
    lessonsRemaining: 0,
    error: null,
    ...overrides,
    busy: { loading: false, submitting: false, retaking: false, saving: false, ...busy },
  }
}

export function buildCheckpointViewModel(input = {}) {
  const state = createCheckpointState(input)
  const questions = Array.isArray(state.questions) ? state.questions : Array.isArray(state.exam?.questions) ? state.exam.questions : []
  const answers = state.answers || state.exam?.answers || {}
  const currentIndex = Math.max(0, Math.min(questions.length - 1, Number.isInteger(state.currentIndex) ? state.currentIndex : 0))
  return {
    phase: state.phase,
    module: state.module || state.exam?.module || {},
    outcomes: Array.isArray(state.outcomes) ? state.outcomes : state.exam?.outcomes || [],
    questions,
    currentQuestion: questions[currentIndex] || null,
    currentIndex,
    answers,
    answeredCount: questions.reduce((count, question) => count + Number(hasAnswer(answers[question.id])), 0),
    saveState: state.saveState,
    evaluation: state.evaluation || null,
    isPartialRetest: Boolean(state.isPartialRetest || state.exam?.type === 'partial'),
    ready: Boolean(state.ready),
    lessonsRemaining: Number.isFinite(state.lessonsRemaining) ? Math.max(0, state.lessonsRemaining) : 0,
    busy: state.busy,
    error: typeof state.error === 'string' ? state.error : state.error ? toPublicError(state.error) : null,
    answerRef: state.answerRef || null,
  }
}
