import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../AppHeader.jsx'
import ArtifactPanel from '../ArtifactPanel.jsx'
import ActivityRenderer from './ActivityRenderer.jsx'
import SessionComplete from './SessionComplete.jsx'
import TutorSidecar from './TutorSidecar.jsx'
import { isConnectionError, isFinalBlock, useSessionController } from '../../features/session/controller.js'
import { useThemeView } from '../../theme/ThemeProvider.jsx'

function SessionThemeShell({ model, children }) {
  const View = useThemeView('SessionView')
  return <Suspense fallback={<div className="session-loading-card" role="status">Preparing your Session…</div>}><View model={model}>{children}</View></Suspense>
}

export default function SessionPlayer({ topicId, lessonId, session, progress, messages = [], activityDocument, activityState: initialState, activityProgress: initialProgress, artifactRequired = false }) {
  const controller = useSessionController({ topicId, lessonId, session, progress, messages, activityDocument, activityState: initialState, activityProgress: initialProgress, artifactRequired })
  const { model: viewModel, activityState, activityProgress, busy, error: mutationError, reviewBlockId, setReviewBlockId, currentBlockId, done, allBlocksDone, percent, textualProgress, draftsByBlockId, setBlockDraft, tutor, updateTutor, mutate, refreshAfterBuild } = controller
  const activeHeading = useRef(null)
  const blocks = viewModel.blocks
  const currentIndex = blocks.findIndex((block) => block.id === currentBlockId)
  const currentBlock = viewModel.currentBlock
  const viewedBlock = viewModel.viewedBlock
  const viewedEntry = viewModel.viewedEntry || {}
  const outcomeNames = useMemo(() => new Map((session?.outcomes || []).map((outcome) => [outcome.id, outcome.title])), [session?.outcomes])
  const reviewBlock = viewModel.reviewMode ? viewedBlock : null

  useEffect(() => {
    if (currentBlockId && !reviewBlockId && activeHeading.current) activeHeading.current.focus()
  }, [currentBlockId, reviewBlockId])

  if (!activityDocument || !activityState) return <main className="session-page"><AppHeader variant="focus" title={session?.title || 'Session'} detail={session?.module_title} progress={textualProgress} returnTo="/" returnLabel="Trail" /><div className="session-error-panel" role="alert">Session state is unavailable. <Link to="/">Return to your Trail</Link></div></main>

  if (done) return <SessionThemeShell model={viewModel}><main className="session-page"><AppHeader variant="focus" title={session?.title || 'Session'} detail={session?.module_title} progress={textualProgress} returnTo="/" returnLabel="Trail" /><SessionComplete session={session} activityDocument={activityDocument} activityState={activityState} /></main></SessionThemeShell>

  const allBlocksDoneForView = allBlocksDone
  return (
    <SessionThemeShell model={viewModel}><main className="session-page">
      <AppHeader variant="focus" title={session?.title || 'Session'} detail={session?.module_title} progress={textualProgress} returnTo="/" returnLabel="Trail" />
      <div className="session-player-layout">
        <section className="session-player-main" aria-label="Session activity">
          <div className="session-player-meta"><span>{session?.estimated_time ? `About ${session.estimated_time} min` : 'Focused practice'}</span><span>{textualProgress} steps</span></div>
          <div className="session-progress-track" role="progressbar" aria-label="Session progress" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${percent}%` }} /></div>
          <ol className="session-step-markers" aria-label="Session steps">
            {blocks.map((block, index) => {
              const entry = activityState.blocks?.[block.id]
              const isCurrent = block.id === currentBlockId
              const isComplete = isFinalBlock(block, entry)
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
              draft={draftsByBlockId[viewedBlock.id]?.value}
              onDraftChange={(value) => setBlockDraft(viewedBlock.id, 'value', value)}
            />
          </article>}

          {allBlocksDoneForView && artifactRequired && <section className="session-build-handoff" aria-labelledby="build-title"><h2 id="build-title">One practical Build remains</h2><p>Apply what you practiced, then this Session will be complete.</p><ArtifactPanel topicId={topicId} lessonId={lessonId} lesson={session} onBack={() => {}} onPassed={refreshAfterBuild} /></section>}
          {!currentBlock && !allBlocksDoneForView && <p role="alert">No active Session step is available. Return to your Trail and reload this Session.</p>}
        </section>
        <TutorSidecar topicId={topicId} lessonId={lessonId} activityBlockId={currentBlockId} messages={messages} draft={tutor.draft} open={tutor.expanded} onDraftChange={(draft) => updateTutor({ draft })} onOpenChange={(expanded) => updateTutor({ expanded })} />
      </div>
      <div className="session-mobile-action"><span>{textualProgress}</span>{currentBlockId && <span>{outcomeNames.get(currentBlock?.outcomeIds?.[0]) || 'Keep going'}</span>}</div>
    </main></SessionThemeShell>
  )
}
