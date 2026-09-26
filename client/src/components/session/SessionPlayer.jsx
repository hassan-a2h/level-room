import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { completeActivityBlock, getLesson, getLocalDate, submitActivityBlock } from '../../api.js'
import AppHeader from '../AppHeader.jsx'
import ArtifactPanel from '../ArtifactPanel.jsx'
import ActivityRenderer from './ActivityRenderer.jsx'
import SessionComplete from './SessionComplete.jsx'
import TutorSidecar from './TutorSidecar.jsx'

function finalBlock(block, entry) {
  return ['read', 'worked_example', 'reflection'].includes(block.type)
    ? entry?.status === 'completed'
    : entry?.status === 'passed'
}

function completedCount(document, state) {
  return document.blocks.filter((block) => block.required && finalBlock(block, state?.blocks?.[block.id])).length
}

function isConnectionError(error) {
  return error instanceof TypeError || /failed to fetch|network|connection/i.test(error?.message || '')
}

export default function SessionPlayer({ topicId, lessonId, session, progress, messages = [], activityDocument, activityState: initialState, activityProgress: initialProgress, artifactRequired = false }) {
  const [activityState, setActivityState] = useState(initialState)
  const [activityProgress, setActivityProgress] = useState(initialProgress)
  const [busy, setBusy] = useState(false)
  const [mutationError, setMutationError] = useState(null)
  const [reviewBlockId, setReviewBlockId] = useState(null)
  const [sessionComplete, setSessionComplete] = useState(progress?.state === 'passed')
  const mutationLock = useRef(false)
  const activeHeading = useRef(null)
  const currentBlockId = activityProgress?.currentBlockId ?? activityState?.currentBlockId ?? null
  const blocks = activityDocument?.blocks || []
  const currentIndex = blocks.findIndex((block) => block.id === currentBlockId)
  const currentBlock = blocks[currentIndex] || null
  const reviewBlock = blocks.find((block) => block.id === reviewBlockId)
  const viewedBlock = reviewBlock || currentBlock
  const viewedEntry = viewedBlock ? activityState?.blocks?.[viewedBlock.id] || {} : {}
  const done = sessionComplete || progress?.state === 'passed' || (!currentBlockId && completedCount(activityDocument, activityState) === (activityProgress?.total ?? blocks.filter((block) => block.required).length) && !artifactRequired)
  const percent = activityProgress?.percent ?? Math.floor(completedCount(activityDocument, activityState) / Math.max(1, blocks.filter((block) => block.required).length) * 100)
  const textualProgress = `${activityProgress?.completed ?? completedCount(activityDocument, activityState)} of ${activityProgress?.total ?? blocks.filter((block) => block.required).length}`
  const outcomeNames = useMemo(() => new Map((session?.outcomes || []).map((outcome) => [outcome.id, outcome.title])), [session?.outcomes])

  useEffect(() => { setActivityState(initialState); setActivityProgress(initialProgress) }, [initialState, initialProgress])
  useEffect(() => {
    if (currentBlockId && !reviewBlockId && activeHeading.current) activeHeading.current.focus()
  }, [currentBlockId, reviewBlockId])

  const applyResult = useCallback((result) => {
    if (result?.activityState) setActivityState(result.activityState)
    if (result?.activityProgress) setActivityProgress(result.activityProgress)
    if (result?.session?.completed || result?.completion?.completed) setSessionComplete(true)
  }, [])

  const mutate = useCallback(async (block, kind, payload = {}) => {
    if (!block || mutationLock.current || reviewBlockId || done) return
    mutationLock.current = true
    setBusy(true)
    setMutationError(null)
    try {
      const request = { ...payload, localDate: getLocalDate() }
      const result = kind === 'complete'
        ? await completeActivityBlock(topicId, lessonId, block.id, request)
        : await submitActivityBlock(topicId, lessonId, block.id, request)
      applyResult(result)
      setReviewBlockId(null)
    } catch (error) {
      if (error?.latestState) {
        setActivityState(error.latestState)
        const restoredCompleted = completedCount(activityDocument, error.latestState)
        setActivityProgress({ completed: restoredCompleted, total: blocks.filter((item) => item.required).length, percent: Math.floor(restoredCompleted / Math.max(1, blocks.filter((item) => item.required).length) * 100), currentBlockId: error.latestState.currentBlockId })
      }
      setMutationError(error)
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
    } catch (error) {
      setMutationError(error)
    }
  }, [lessonId, topicId])

  if (!activityDocument || !activityState) return <main className="session-page"><AppHeader variant="focus" title={session?.title || 'Session'} detail={session?.module_title} progress={textualProgress} returnTo="/" returnLabel="Trail" /><div className="session-error-panel" role="alert">Session state is unavailable. <Link to="/">Return to your Trail</Link></div></main>

  if (done) return <main className="session-page"><AppHeader variant="focus" title={session?.title || 'Session'} detail={session?.module_title} progress={textualProgress} returnTo="/" returnLabel="Trail" /><SessionComplete session={session} activityDocument={activityDocument} activityState={activityState} /></main>

  const allBlocksDone = !currentBlockId && completedCount(activityDocument, activityState) >= (activityProgress?.total ?? blocks.filter((block) => block.required).length)
  return (
    <main className="session-page">
      <AppHeader variant="focus" title={session?.title || 'Session'} detail={session?.module_title} progress={textualProgress} returnTo="/" returnLabel="Trail" />
      <div className="session-player-layout">
        <section className="session-player-main" aria-label="Session activity">
          <div className="session-player-meta"><span>{session?.estimated_time ? `About ${session.estimated_time} min` : 'Focused practice'}</span><span>{textualProgress} steps</span></div>
          <div className="session-progress-track" role="progressbar" aria-label="Session progress" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${percent}%` }} /></div>
          <ol className="session-step-markers" aria-label="Session steps">
            {blocks.map((block, index) => {
              const entry = activityState.blocks?.[block.id]
              const isCurrent = block.id === currentBlockId
              const isComplete = finalBlock(block, entry)
              const isFuture = block.required && (currentIndex >= 0 ? index > currentIndex : !isComplete)
              return <li key={block.id} className={`${isCurrent ? 'is-current' : ''} ${isComplete ? 'is-complete' : ''} ${isFuture ? 'is-locked' : ''}`}>
                {isComplete && index < currentIndex
                  ? <button type="button" aria-label={`Review ${block.title}`} onClick={() => setReviewBlockId(block.id)}><span aria-hidden="true">✓</span><span className="sr-only">{block.title}</span></button>
                  : <span aria-label={isCurrent ? `Step ${index + 1}, current` : isFuture ? `Step ${index + 1}, locked` : `Step ${index + 1}`}>{isComplete ? '✓' : isCurrent ? index + 1 : '·'}</span>}
              </li>
            })}
          </ol>

          {reviewBlock && <div className="session-review-banner"><p>Reviewing a completed step. Your saved response cannot be changed.</p><button type="button" className="ui-button ui-button-quiet" onClick={() => setReviewBlockId(null)}>Return to current step</button></div>}
          {mutationError && <div className="session-mutation-alert" role="alert"><p>{mutationError.code === 'ACTIVITY_STATE_CONFLICT'
            ? 'Your saved progress was updated. The latest Session step is now shown.'
            : isConnectionError(mutationError)
              ? 'Connection dropped. Your answer is still here; reconnect and try again.'
              : mutationError.message || 'That step could not be saved. Your answer is still here; try again.'}</p></div>}

          {viewedBlock && <article className={`session-activity-card ${busy ? 'is-busy' : ''}`} aria-labelledby={`activity-title-${viewedBlock.id}`}>
            <p className="session-eyebrow">{reviewBlock ? 'Completed step' : `Step ${currentIndex + 1} of ${blocks.filter((block) => block.required).length}`}</p>
            <h2 id={`activity-title-${viewedBlock.id}`} ref={reviewBlock ? undefined : activeHeading} tabIndex={-1}>{viewedBlock.title}</h2>
            <ActivityRenderer
              block={viewedBlock}
              persistedBlockState={viewedEntry}
              busy={busy}
              readOnly={Boolean(reviewBlock)}
              onComplete={(payload) => mutate(viewedBlock, 'complete', payload)}
              onSubmit={(response) => mutate(viewedBlock, 'submit', { response })}
            />
          </article>}

          {allBlocksDone && artifactRequired && <section className="session-build-handoff" aria-labelledby="build-title"><h2 id="build-title">One practical Build remains</h2><p>Apply what you practiced, then this Session will be complete.</p><ArtifactPanel topicId={topicId} lessonId={lessonId} lesson={session} onBack={() => {}} onPassed={refreshAfterBuild} /></section>}
          {!currentBlock && !allBlocksDone && <p role="alert">No active Session step is available. Return to your Trail and reload this Session.</p>}
        </section>
        <TutorSidecar topicId={topicId} lessonId={lessonId} activityBlockId={currentBlockId} messages={messages} />
      </div>
      <div className="session-mobile-action"><span>{textualProgress}</span>{currentBlockId && <span>{outcomeNames.get(currentBlock?.outcomeIds?.[0]) || 'Keep going'}</span>}</div>
    </main>
  )
}
