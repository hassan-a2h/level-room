import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { completeActivityBlock, getLesson, getLocalDate, submitActivityBlock } from '../../api.js'
import { toPublicError } from '../../lib/publicError.js'

export function isFinalBlock(block, entry) {
  return ['read', 'worked_example', 'reflection'].includes(block.type) ? entry?.status === 'completed' : entry?.status === 'passed'
}

function completedCount(document, state) {
  return (document?.blocks || []).filter((block) => block.required && isFinalBlock(block, state?.blocks?.[block.id])).length
}

export function isConnectionError(error) {
  return error instanceof TypeError || /failed to fetch|network|connection/i.test(error?.message || '')
}

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

export function useSessionController({ topicId, lessonId, session, progress, messages = [], activityDocument, activityState: initialState, activityProgress: initialProgress, artifactRequired = false } = {}) {
  const [activityState, setActivityState] = useState(initialState)
  const [activityProgress, setActivityProgress] = useState(initialProgress)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [reviewBlockId, setReviewBlockId] = useState(null)
  const [sessionComplete, setSessionComplete] = useState(progress?.state === 'passed')
  const [draftsByBlockId, setDraftsByBlockId] = useState({})
  const [tutor, setTutor] = useState({ draft: '', expanded: false, messages })
  const mutationLock = useRef(false)
  const blocks = activityDocument?.blocks || []
  const currentBlockId = activityProgress?.currentBlockId ?? activityState?.currentBlockId ?? null
  const currentBlock = blocks.find((block) => block.id === currentBlockId) || null
  const done = sessionComplete || progress?.state === 'passed' || (!currentBlockId && completedCount(activityDocument, activityState) === (activityProgress?.total ?? blocks.filter((block) => block.required).length) && !artifactRequired)
  const completed = activityProgress?.completed ?? completedCount(activityDocument, activityState)
  const total = activityProgress?.total ?? blocks.filter((block) => block.required).length
  const percent = activityProgress?.percent ?? Math.floor(completed / Math.max(1, total) * 100)
  const textualProgress = `${completed} of ${total}`
  const allBlocksDone = !currentBlockId && completed >= total

  useEffect(() => { setActivityState(initialState); setActivityProgress(initialProgress) }, [initialState, initialProgress])

  const applyResult = useCallback((result) => {
    if (result?.activityState) setActivityState(result.activityState)
    if (result?.activityProgress) setActivityProgress(result.activityProgress)
    if (result?.session?.completed || result?.completion?.completed) setSessionComplete(true)
  }, [])

  const mutate = useCallback(async (block, kind, payload = {}) => {
    if (!block || mutationLock.current || reviewBlockId || done) return
    mutationLock.current = true
    setBusy(true)
    setError(null)
    try {
      const request = { ...payload, localDate: getLocalDate() }
      const result = kind === 'complete'
        ? await completeActivityBlock(topicId, lessonId, block.id, request)
        : await submitActivityBlock(topicId, lessonId, block.id, request)
      applyResult(result)
      setReviewBlockId(null)
    } catch (requestError) {
      if (requestError?.latestState) {
        setActivityState(requestError.latestState)
        const restoredCompleted = completedCount(activityDocument, requestError.latestState)
        setActivityProgress({ completed: restoredCompleted, total: blocks.filter((item) => item.required).length, percent: Math.floor(restoredCompleted / Math.max(1, blocks.filter((item) => item.required).length) * 100), currentBlockId: requestError.latestState.currentBlockId })
      }
      setError(requestError)
    } finally {
      mutationLock.current = false
      setBusy(false)
    }
  }, [activityDocument, applyResult, blocks, done, lessonId, reviewBlockId, topicId])

  const refreshAfterBuild = useCallback(async () => {
    try {
      const latest = await getLesson(topicId, lessonId)
      setActivityState(latest.activityState)
      setActivityProgress(latest.activityProgress)
      if (latest.progress?.state === 'passed') setSessionComplete(true)
    } catch (refreshError) {
      setError(refreshError)
    }
  }, [lessonId, topicId])

  const setBlockDraft = useCallback((blockId, field, value) => {
    setDraftsByBlockId((current) => ({ ...current, [blockId]: { ...current[blockId], [field]: value } }))
  }, [])
  const updateTutor = useCallback((changes) => setTutor((current) => ({ ...current, ...changes })), [])
  const model = useMemo(() => buildSessionViewModel({ session, progress: activityProgress, activityDocument, activityState, sessionComplete, artifactRequired, reviewBlockId, draftsByBlockId, tutor, busy: { mutating: busy }, error }), [activityProgress, activityDocument, activityState, artifactRequired, busy, draftsByBlockId, error, reviewBlockId, session, sessionComplete, tutor])
  return { model, activityState, activityProgress, busy, error, setError, reviewBlockId, setReviewBlockId, sessionComplete, setSessionComplete, currentBlockId, currentBlock, done, allBlocksDone, percent, textualProgress, draftsByBlockId, setBlockDraft, tutor, updateTutor, mutate, refreshAfterBuild }
}
