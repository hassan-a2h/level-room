import ChapterCard from './ChapterCard.jsx'

function percent(value) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0
}

function currentChapterIndex(modules, currentModuleId) {
  const selected = modules.findIndex((chapter) => chapter.id === currentModuleId)
  if (selected >= 0) return selected
  const incomplete = modules.findIndex((chapter) => chapter.status !== 'completed')
  return incomplete >= 0 ? incomplete : Math.max(0, modules.length - 1)
}

function TrackProgress({ topic }) {
  const value = percent(topic?.progress)
  const status = topic?.status === 'completed' ? 'Track complete' : 'In progress'

  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] ui-text-muted">
          {topic?.courseStage > 0 ? `Track ${topic.courseStage + 1}` : 'Your learning Trail'} · {status}
        </p>
        <h2 className="mt-1 text-xl font-semibold ui-text">{topic?.title || 'Your Track'}</h2>
      </div>
      <div className="min-w-36">
        <div className="mb-1 flex justify-between gap-2 text-xs ui-text-muted">
          <span>Track progress</span>
          <span>{value}%</span>
        </div>
        <div
          className="ui-progress-track h-2"
          role="progressbar"
          aria-label={`${topic?.title || 'Track'} Track progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
        >
          <span className="ui-progress-value block h-full" style={{ width: `${value}%` }} />
        </div>
      </div>
    </div>
  )
}

function ParentTrack({ parent, onOpen }) {
  if (!parent?.title) return null

  return (
    <div className="mb-4 rounded-xl border ui-border p-3 text-sm ui-text-secondary">
      <span className="mr-2" aria-hidden="true">↗</span>
      {onOpen ? (
        <button type="button" className="ui-button ui-button-quiet min-h-0 p-0 text-sm" onClick={() => onOpen(parent.id)}>
          {`Builds on ${parent.title}`}
        </button>
      ) : <span>{`Builds on ${parent.title}`}</span>}
      <span className="block pl-6 pt-1 text-xs ui-text-muted">Your earlier progress stays part of the journey.</span>
    </div>
  )
}

export default function TrailMap({
  topic,
  modules = [],
  currentModuleId,
  part = 'all',
  onStartSession,
  onStartCheckpoint,
  onOpenPriorTrack,
}) {
  const chapters = Array.isArray(modules) ? modules : []
  const currentIndex = chapters.length ? currentChapterIndex(chapters, currentModuleId) : -1
  const completedOrCurrent = currentIndex < 0 ? chapters : chapters.slice(0, currentIndex + 1)
  const future = currentIndex < 0 ? [] : chapters.slice(currentIndex + 1)
  const lineage = Array.isArray(topic?.lineage) ? topic.lineage : []
  const prior = topic?.parent || (lineage.length > 1 ? lineage[lineage.length - 2] : null)

  const renderChapters = (items, startIndex, label) => (
    <ol className="relative space-y-3" aria-label={label}>
      {items.map((chapter, index) => {
        const chapterIndex = startIndex + index
        const isCurrent = chapterIndex === currentIndex && chapter.status !== 'completed'
        return (
          <ChapterCard
            key={chapter.id}
            chapter={chapter}
            chapterNumber={chapterIndex + 1}
            isCurrent={isCurrent}
            isFuture={chapterIndex > currentIndex && currentIndex >= 0}
            onStartSession={onStartSession}
            onStartCheckpoint={onStartCheckpoint}
          />
        )
      })}
    </ol>
  )

  const remainingSection = future.length > 0 ? (
      <section className="ui-surface ui-surface-raised p-5 sm:p-6" aria-label="Remaining Trail">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] ui-text-muted">Further along the Trail</p>
          <h2 className="mt-1 text-lg font-semibold ui-text">What comes next</h2>
        </div>
        {renderChapters(future, currentIndex + 1, 'Chapters ahead')}
      </section>
  ) : null

  const soFarSection = (
    <section className="ui-surface ui-surface-raised p-5 sm:p-6" aria-label="Your Trail so far">
      <TrackProgress topic={topic} />
      <ParentTrack parent={prior} onOpen={onOpenPriorTrack} />
      {chapters.length === 0 ? (
        <div className="rounded-xl border ui-border p-4 text-sm ui-text-secondary">
          Your Chapters will appear here once this Track is ready.
        </div>
      ) : renderChapters(completedOrCurrent, 0, 'Chapters completed so far')}
    </section>
  )

  if (part === 'remaining') return remainingSection
  if (part === 'so-far') return soFarSection
  return <>{soFarSection}{remainingSection}</>
}
