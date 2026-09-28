import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import ArtifactPanel from '../ArtifactPanel.jsx'
import ActivityRenderer from './ActivityRenderer.jsx'
import SessionComplete from './SessionComplete.jsx'
import TutorSidecar from './TutorSidecar.jsx'
import { isFinalBlock, useSessionController } from '../../features/session/controller.js'
import { useThemeView } from '../../theme/ThemeProvider.jsx'
import { createSessionBlockActions } from '../../theme/core/sessionActionAdapters.js'

function SessionThemeSurface({ model, actions, slots }) {
  const View = useThemeView('SessionView')
  return <Suspense fallback={<div className="session-loading-card" role="status">Preparing your Session…</div>}><View model={model} actions={actions} slots={slots} /></Suspense>
}

export default function SessionPlayer({ topicId, lessonId, session, progress, messages = [], activityDocument, activityState: initialState, activityProgress: initialProgress, artifactRequired = false }) {
  const navigate = useNavigate()
  const controller = useSessionController({ topicId, lessonId, session, progress, messages, activityDocument, activityState: initialState, activityProgress: initialProgress, artifactRequired })
  const { model, activityState, busy, error: mutationError, reviewBlockId, setReviewBlockId, currentBlockId, done, allBlocksDone, percent, textualProgress, draftsByBlockId, setBlockDraft, tutor, updateTutor, mutate, refreshAfterBuild } = controller
  const activeHeading = useRef(null)
  const blocks = model.blocks
  const currentIndex = blocks.findIndex((block) => block.id === currentBlockId)
  const currentBlock = model.currentBlock
  const viewedBlock = model.viewedBlock
  const viewedEntry = model.viewedEntry || {}
  const reviewBlock = model.reviewMode ? viewedBlock : null
  const blockActions = useMemo(() => createSessionBlockActions(blocks, mutate), [blocks, mutate])

  useEffect(() => {
    if (currentBlockId && !reviewBlockId && activeHeading.current) activeHeading.current.focus()
  }, [currentBlockId, reviewBlockId])

  const actions = useMemo(() => ({
    setBlockDraft: (blockId, value) => setBlockDraft(blockId, 'value', value),
    setOrdering: (blockId, orderedIds) => setBlockDraft(blockId, 'value', orderedIds),
    revealWorkedStep: (blockId, count) => setBlockDraft(blockId, 'value', count),
    ...blockActions,
    reviewBlock: (blockId) => setReviewBlockId(blockId),
    returnToCurrentBlock: () => setReviewBlockId(null),
    openTutor: () => updateTutor({ expanded: true }),
    closeTutor: () => updateTutor({ expanded: false }),
    setTutorDraft: (draft) => updateTutor({ draft }),
    returnToTrail: () => navigate('/'),
  }), [blockActions, navigate, setBlockDraft, setReviewBlockId, updateTutor])

  if (!activityDocument || !activityState) return <main className="session-page"><div className="session-error-panel" role="alert">Session state is unavailable. <Link to="/">Return to your Trail</Link></div></main>

  if (done) return <SessionThemeSurface model={{ ...model, state: 'complete' }} actions={actions} slots={{ activity: <SessionComplete session={session} activityDocument={activityDocument} activityState={activityState} />, tutor: null }} />

  const activity = <>
    <ol className="session-step-markers" aria-label="Session steps">
      {blocks.map((block, index) => {
        const entry = activityState.blocks?.[block.id]
        const isCurrent = block.id === currentBlockId
        const isComplete = isFinalBlock(block, entry)
        const isFuture = block.required && (currentIndex >= 0 ? index > currentIndex : !isComplete)
        return <li key={block.id} className={`${isCurrent ? 'is-current' : ''} ${isComplete ? 'is-complete' : ''} ${isFuture ? 'is-locked' : ''}`}>
          {isComplete && index < currentIndex
            ? <button type="button" aria-label={`Review ${block.title}`} onClick={() => actions.reviewBlock(block.id)}><Check aria-hidden="true" /><span className="sr-only">{block.title}</span></button>
            : <span aria-label={isCurrent ? `Step ${index + 1}, current` : isFuture ? `Step ${index + 1}, locked` : `Step ${index + 1}`}>{isComplete ? <Check aria-hidden="true" /> : isCurrent ? index + 1 : <span className="session-step-marker-empty" aria-hidden="true" />}</span>}
        </li>
      })}
    </ol>
    {mutationError && <div className="session-mutation-alert" role="alert"><p>{mutationError.code === 'ACTIVITY_STATE_CONFLICT'
      ? 'Your saved progress was updated. The latest Session step is now shown.'
      : mutationError instanceof TypeError || /failed to fetch|network|connection/i.test(mutationError.message || '')
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
        onComplete={(payload) => actions.completeBlock(viewedBlock.id, payload)}
        onSubmit={(response) => actions.submitBlock(viewedBlock.id, response)}
        draft={draftsByBlockId[viewedBlock.id]?.value}
        onDraftChange={(value) => actions.setBlockDraft(viewedBlock.id, value)}
      />
    </article>}
    {allBlocksDone && artifactRequired && <section className="session-build-handoff" aria-labelledby="build-title"><h2 id="build-title">One practical Build remains</h2><p>Apply what you practiced, then this Session will be complete.</p><ArtifactPanel topicId={topicId} lessonId={lessonId} lesson={session} onBack={() => {}} onPassed={refreshAfterBuild} /></section>}
    {!currentBlock && !allBlocksDone && <p role="alert">No active Session step is available. Return to your Trail and reload this Session.</p>}
  </>
  const tutorSlot = <TutorSidecar topicId={topicId} lessonId={lessonId} activityBlockId={currentBlockId} messages={tutor.messages} draft={tutor.draft} open={tutor.expanded} onDraftChange={actions.setTutorDraft} onOpenChange={(expanded) => expanded ? actions.openTutor() : actions.closeTutor()} onMessagesChange={(nextMessages) => updateTutor({ messages: nextMessages })} />

  return <SessionThemeSurface model={{ ...model, progress: { ...model.progress, percent, textual: textualProgress } }} actions={actions} slots={{ activity, tutor: tutorSlot }} />
}
