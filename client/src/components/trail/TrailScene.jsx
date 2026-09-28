import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ChapterCard from './ChapterCard.jsx'
import FocusAreas from './FocusAreas.jsx'
import TodayCard from './TodayCard.jsx'
import WeeklyRhythm from './WeeklyRhythm.jsx'
import './trail-scene.css'

function ReviewDue({ summary }) {
  const totalDue = Number.isFinite(summary?.totalDue) ? Math.max(0, summary.totalDue) : 0
  const overdue = Number.isFinite(summary?.overdue) ? Math.max(0, summary.overdue) : 0
  const dueToday = Number.isFinite(summary?.dueToday) ? Math.max(0, summary.dueToday) : 0

  return (
    <section className="ui-surface ui-surface-raised p-4 sm:p-5" aria-label="Reviews due">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold ui-text">Reviews due</h2>
          {totalDue > 0 ? <p className="mt-1 text-sm ui-text-secondary">{overdue > 0 ? `${overdue} overdue · ` : ''}{dueToday} due today</p> : <p className="mt-1 text-sm ui-text-secondary">You’re clear for now.</p>}
        </div>
        <span className="rounded-full px-2.5 py-1 text-sm font-semibold ui-text" style={{ backgroundColor: 'var(--ui-surface-alt)' }} aria-label={`${totalDue} items due`}>{totalDue}</span>
      </div>
      <Link className="ui-button ui-button-secondary mt-3 min-h-10 text-sm" to="/reviews">{totalDue > 0 ? 'Start retrieval practice' : 'Open reviews'}</Link>
    </section>
  )
}

function TopicPopover({ model, onSelectTopic, onDeleteTopic }) {
  const [open, setOpen] = useState(false)
  if (!model.topics.length) return null

  return (
    <div className="trail-topic-popover">
      <button
        type="button"
        className="ui-button ui-button-secondary trail-topic-trigger"
        aria-label={`Choose Trail, current Trail ${model.topic.title || 'Your Track'}`}
        aria-expanded={open}
        aria-controls="trail-topic-options"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="trail-topic-current">{model.topic.title || 'Choose Trail'}</span><span aria-hidden="true">⌄</span>
      </button>
      <div id="trail-topic-options" className="trail-topic-menu" role="group" aria-label="Your Trails" hidden={!open}>
        {model.topics.map((topic) => (
          <div className="trail-topic-option" key={topic.id}>
            <button
              type="button"
              className="trail-topic-select"
              aria-pressed={topic.id === model.ui.activeTopicId}
              onClick={() => { setOpen(false); onSelectTopic?.(topic.id) }}
            >
              <span className="trail-topic-option-title">{topic.title}</span>
              <span className="trail-topic-option-state">
                {topic.status === 'completed' ? 'Track complete' : topic.status === 'archived' ? 'Archived' : `${Math.min(100, Math.max(0, topic.progress || 0))}% complete`}
              </span>
            </button>
            {!topic.hasChildren && (
              <button type="button" className="ui-button ui-button-quiet trail-topic-delete" aria-label={`Delete Trail ${topic.title}`} onClick={() => { setOpen(false); onDeleteTopic?.(topic.id) }}>
                Delete
              </button>
            )}
          </div>
        ))}
        <Link className="trail-topic-new" to="/onboarding" onClick={() => setOpen(false)}>New Trail</Link>
      </div>
    </div>
  )
}

function ChapterList({ chapters, allChapters, model, onStartSession, onStartCheckpoint, showAllDetails = false }) {
  const activeId = model.ui.currentChapterId
  const allCurrentIndex = allChapters.findIndex((chapter) => chapter.id === activeId)

  return (
    <ol className="trail-chapter-list" aria-label="Chapters in this Trail">
      {chapters.map((chapter) => {
        const index = allChapters.findIndex((item) => item.id === chapter.id)
        return (
          <ChapterCard
            key={chapter.id}
            chapter={chapter}
            chapterNumber={index + 1}
            isCurrent={chapter.id === activeId && chapter.status !== 'completed'}
            isFuture={allCurrentIndex >= 0 && index > allCurrentIndex}
            showAllDetails={showAllDetails}
            onStartSession={onStartSession}
            onStartCheckpoint={onStartCheckpoint}
          />
        )
      })}
    </ol>
  )
}

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="trail-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="trail-sheet ui-surface ui-surface-raised" role="dialog" aria-modal="true" aria-label={title}>
        <div className="trail-sheet-heading">
          <h2 className="text-xl font-semibold ui-text">{title}</h2>
          <button type="button" className="ui-button ui-button-secondary" onClick={onClose}>Close</button>
        </div>
        <div className="trail-sheet-content">{children}</div>
      </section>
    </div>
  )
}

function SetupState({ topic }) {
  const label = topic.curriculumState === 'setup' ? 'Finish setting up your Track' : topic.curriculumState === 'draft_ready' ? 'Your Track is ready to preview' : 'Resume building your Track'
  return (
    <section className="trail-state-card ui-surface ui-surface-raised" aria-label="Track setup">
      <p className="text-xs font-semibold uppercase tracking-wide ui-text-muted">One more step</p>
      <h2 className="mt-2 text-xl font-semibold ui-text">{label}</h2>
      <p className="mt-2 text-sm leading-6 ui-text-secondary">{topic.curriculumError || 'Your learning path is safe. Continue setup to see the Chapters and practice ahead.'}</p>
      <Link className="ui-button ui-button-primary mt-5" to={`/onboarding?topicId=${encodeURIComponent(topic.id)}`}>Continue setup</Link>
    </section>
  )
}

function EmptyState() {
  return (
    <section className="trail-empty ui-surface" aria-label="Start learning">
      <span className="trail-empty-mark" aria-hidden="true">✦</span>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] ui-text-muted">A fresh page</p>
      <h2 className="mt-2 text-2xl font-semibold ui-text">Your first Trail starts here</h2>
      <p className="mt-3 max-w-md text-sm leading-6 ui-text-secondary">Choose something you want to be able to do. We’ll shape it into a clear path of practice, useful feedback, and real progress.</p>
      <Link className="ui-button ui-button-primary mt-6" to="/onboarding">Start learning</Link>
    </section>
  )
}

export default function TrailScene({ model, variant, onSelectTopic, onDeleteTopic, onStartSession, onStartCheckpoint, onOpenFocusArea, onRetry }) {
  const [sheet, setSheet] = useState(null)
  const visibleStartIndex = model.chapters.findIndex((chapter) => chapter.id === model.visibleChapters[0]?.id)
  const topic = model.topic
  const progress = Number.isFinite(topic.progress) ? Math.min(100, Math.max(0, Math.round(topic.progress))) : 0
  const status = topic.status === 'completed' ? 'Track complete' : 'In progress'

  return (
    <main className={`trail-scene trail-scene--${variant}`} data-theme-view="TrailView" data-view-state={model.state} aria-busy={model.busy.loading || model.busy.switching}>
      <div className="trail-scene-inner">
        <header className="trail-heading">
          <div className="trail-heading-copy">
            <p className="trail-eyebrow">A steady path to mastery</p>
            <h1 className="trail-page-title">Your learning Trail</h1>
            {topic.title && <p className="trail-heading-subtitle">One Session at a time</p>}
          </div>
          <TopicPopover model={model} onSelectTopic={onSelectTopic} onDeleteTopic={onDeleteTopic} />
        </header>

        {model.error && (
          <div className="trail-error" role="alert">
            <p>{model.error}</p><button type="button" className="ui-button ui-button-secondary" onClick={onRetry}>Retry loading Trail</button>
          </div>
        )}

        {model.state === 'loading' && <div className="trail-state-card ui-surface" role="status">Loading this Trail…</div>}
        {model.state === 'empty' && <EmptyState />}
        {model.state === 'error' && !model.error && <div className="trail-state-card ui-surface" role="alert"><p>We couldn’t load your Trail.</p><button type="button" className="ui-button ui-button-secondary mt-3" onClick={onRetry}>Retry loading Trail</button></div>}
        {model.state === 'setup' && <SetupState topic={topic} />}

        {(model.state === 'ready' || model.state === 'complete') && (
          <>
            <div className="trail-statusline">
              <span>{topic.courseStage > 0 ? `Track ${topic.courseStage + 1}` : 'Your learning Trail'} · {status}</span>
              <span className="trail-progress-label">Track progress · {progress}%</span>
            </div>
            <div className="trail-next-action">
              <TodayCard nextAction={model.nextAction} reviewSummary={model.review} onStartCheckpoint={onStartCheckpoint} />
            </div>

            {topic.status === 'completed' && model.nextAction.kind === 'track_complete' ? (
              <section className="trail-complete-note ui-surface ui-surface-raised" aria-label="Track complete">
                <p className="text-xs font-semibold uppercase tracking-wide ui-text-muted">Track complete</p>
                <h2 className="mt-2 text-xl font-semibold ui-text">You’ve reached the end of this Trail.</h2>
                <p className="mt-2 text-sm ui-text-secondary">Your progress is saved. Plan what you want to explore next.</p>
              </section>
            ) : null}

            <div className="trail-layout">
              <section className="trail-path ui-surface ui-surface-raised" aria-label="Your Trail so far">
                <div className="trail-path-heading">
                  <div className="min-w-0">
                    <p className="trail-eyebrow">{status}</p>
                    <h2 className="trail-track-title" title={topic.title || 'Your Track'} style={{ overflowWrap: 'anywhere' }}>{topic.title || 'Your Track'}</h2>
                  </div>
                  <div className="trail-progress" role="progressbar" aria-label={`${topic.title || 'Track'} Track progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </div>
                {topic.parent?.title && <button type="button" className="trail-parent-track" onClick={() => onSelectTopic?.(topic.parent.id)}>↗ Builds on {topic.parent.title}</button>}
                {model.chapters.length ? <ChapterList chapters={model.visibleChapters} allChapters={model.chapters} model={model} onStartSession={onStartSession} onStartCheckpoint={onStartCheckpoint} /> : <p className="trail-no-chapters">Your Chapters will appear here once this Track is ready.</p>}
                {model.chapters.length > model.visibleChapters.length && <p className="trail-window-note">Showing Chapters {visibleStartIndex + 1}–{visibleStartIndex + model.visibleChapters.length} of {model.chapters.length}</p>}
                <button type="button" className="ui-button ui-button-secondary trail-open-track" onClick={() => setSheet('track')}>View full Track</button>
              </section>

              <aside className="trail-support">
                <ReviewDue summary={model.review} />
                <button type="button" className="ui-button ui-button-quiet trail-open-progress" onClick={() => setSheet('progress')}>Progress and focus</button>
              </aside>
            </div>
          </>
        )}
      </div>

      {sheet === 'track' && (
        <Sheet title="Full Track" onClose={() => setSheet(null)}>
          <p className="mb-4 text-sm ui-text-secondary">All Chapters and Sessions in {topic.title || 'Your Track'}.</p>
          {model.chapters.length ? <ChapterList chapters={model.chapters} allChapters={model.chapters} model={model} onStartSession={onStartSession} onStartCheckpoint={onStartCheckpoint} showAllDetails /> : <p className="trail-no-chapters">Your Chapters will appear here once this Track is ready.</p>}
        </Sheet>
      )}
      {sheet === 'progress' && (
        <Sheet title="Progress and focus" onClose={() => setSheet(null)}>
          <div className="trail-progress-sheet">
            <WeeklyRhythm rhythm={model.rhythm} />
            <FocusAreas areas={model.focusAreas} onOpenSession={(sessionId) => { setSheet(null); onOpenFocusArea?.(sessionId) }} />
          </div>
        </Sheet>
      )}
    </main>
  )
}
