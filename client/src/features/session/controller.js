import { toPublicError } from '../../lib/publicError.js'

export function createSessionState(values = {}) {
  return {
    session: null,
    progress: null,
    loading: false,
    sessionComplete: false,
    activityDocument: null,
    activityState: null,
    activityProgress: null,
    draftsByBlockId: {},
    reviewBlockId: null,
    tutor: { draft: '', expanded: false, messages: [] },
    busy: { loading: false, mutating: false, refreshingBuild: false },
    error: null,
    artifactRequired: false,
    ...values,
    draftsByBlockId: values.draftsByBlockId || {},
    tutor: { draft: '', expanded: false, messages: [], ...(values.tutor || {}) },
    busy: { loading: false, mutating: false, refreshingBuild: false, ...(values.busy || {}) },
  }
}

export function buildSessionViewModel(input = {}) {
  const state = createSessionState(input)
  const blocks = Array.isArray(state.activityDocument?.blocks) ? state.activityDocument.blocks : []
  const entries = state.activityState?.blocks || {}
  const currentBlockId = state.activityProgress?.currentBlockId ?? state.activityState?.currentBlockId ?? null
  const currentBlock = blocks.find((block) => block.id === currentBlockId) || null
  const viewedBlock = blocks.find((block) => block.id === state.reviewBlockId) || currentBlock
  const error = state.error ? toPublicError(state.error, 'The Session could not be loaded. Your saved progress is safe; try again.') : null
  let phase = state.loading ? 'loading' : state.data?.locked ? 'locked' : error?.kind === 'expired' ? 'expired' : 'active'
  if (!state.loading && !error && (state.sessionComplete || state.progress?.state === 'passed' || state.data?.progress?.state === 'passed')) phase = 'complete'
  return {
    state: phase,
    session: state.session || state.data?.lesson || {},
    progress: state.activityProgress || state.progress || state.data?.progress || {},
    blocks,
    currentBlock,
    viewedBlock,
    viewedEntry: viewedBlock ? entries[viewedBlock.id] || {} : null,
    draftsByBlockId: state.draftsByBlockId,
    reviewMode: Boolean(state.reviewBlockId && viewedBlock),
    artifactRequired: Boolean(state.artifactRequired || state.session?.artifact_required || state.data?.lesson?.artifact_required),
    tutor: state.tutor,
    busy: state.busy,
    publicError: error,
  }
}
