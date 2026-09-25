import { useMemo, useState, useCallback, useId } from 'react'

function getChapters(curriculum) {
  return Array.isArray(curriculum?.modules) ? curriculum.modules : []
}

function getOutcomes(chapter) {
  return Array.isArray(chapter?.skill_outcomes) ? chapter.skill_outcomes.filter((outcome) => outcome && typeof outcome.title === 'string') : []
}

function getSessionOutcomes(session) {
  return Array.isArray(session?.outcomes) ? session.outcomes.filter((outcome) => outcome && typeof outcome.title === 'string') : []
}

function isBuild(session) {
  return Boolean(session?.artifact_required || session?.task_spec || getSessionOutcomes(session).some((outcome) => outcome.evidence?.includes('artifact')))
}

function ChapterSession({ session, index }) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const outcomes = getSessionOutcomes(session)
  const prerequisites = Array.isArray(session?.prerequisites)
    ? session.prerequisites.filter((prerequisite) => typeof prerequisite?.title === 'string' && prerequisite.title.trim())
    : []

  return (
    <article className="ui-session-preview ui-surface ui-surface-flat">
      <div className="ui-session-preview-heading">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="ui-disclosure-button"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} Session details`}
          aria-expanded={expanded}
          aria-controls={detailsId}
        >
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="ui-text-muted text-xs">Session {index + 1}</p>
          <h3 className="ui-text font-semibold">{session.title}</h3>
        </div>
        <div className="ui-session-preview-meta">
          {Number.isFinite(session.estimated_time) && <span className="ui-text-muted text-sm">About {session.estimated_time} min</span>}
          {isBuild(session) && <span className="ui-build-marker" aria-label="Practical Build">Build</span>}
        </div>
      </div>
      {expanded && (
        <div id={detailsId} className="ui-session-preview-details" role="region" aria-label={`${session.title} details`}>
          <div>
            <h4 className="ui-text-secondary text-sm font-semibold">Outcomes</h4>
            {outcomes.length > 0 ? (
              <ul className="ui-outcome-list">
                {outcomes.map((outcome) => <li key={outcome.id}>{outcome.title}</li>)}
              </ul>
            ) : <p className="ui-text-muted text-sm">This Session contributes to its Chapter outcomes.</p>}
          </div>
          {prerequisites.length > 0 && (
            <div className="ui-session-prerequisites">
              <h4 className="ui-text-secondary text-sm font-semibold">Session prerequisites</h4>
              <ul className="ui-outcome-list">{prerequisites.map((prerequisite) => <li key={prerequisite.lessonId || prerequisite.title}>{prerequisite.title}</li>)}</ul>
            </div>
          )}
          {session.task_spec?.title && <p className="ui-text-secondary text-sm"><strong>Build:</strong> {session.task_spec.title}</p>}
        </div>
      )}
    </article>
  )
}

export default function CurriculumConfirmation({
  curriculum,
  topicName = '',
  timeCommitment = '',
  pace = '',
  onConfirm,
  onTweak,
  onRegenerate,
  onBack,
  submitting = false,
  error = '',
  isTrackSetup = false,
}) {
  const [adjusting, setAdjusting] = useState(false)
  const [adjustment, setAdjustment] = useState('')
  const chapters = getChapters(curriculum)
  const summary = useMemo(() => {
    const outcomesById = new Map()
    for (const chapter of chapters) {
      for (const outcome of getOutcomes(chapter)) {
        if (outcome.id && !outcomesById.has(outcome.id)) outcomesById.set(outcome.id, outcome)
      }
    }
    const outcomes = [...outcomesById.values()]
    return {
      outcomes: outcomes.length,
      core: outcomes.filter((outcome) => outcome.role === 'core').length,
      breadth: outcomes.filter((outcome) => outcome.role === 'breadth').length,
      builds: chapters.flatMap((chapter) => Array.isArray(chapter.lessons) ? chapter.lessons : []).filter(isBuild),
    }
  }, [chapters])

  const handleAdjustmentSubmit = useCallback((event) => {
    event.preventDefault()
    const request = adjustment.trim()
    if (!request || submitting) return
    onTweak?.(request)
    setAdjustment('')
    setAdjusting(false)
  }, [adjustment, onTweak, submitting])

  return (
    <section className="ui-track-preview space-y-6" aria-labelledby="track-preview-title">
      <header className="ui-track-preview-header">
        <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">Track preview</p>
        <h1 id="track-preview-title" className="mt-1 text-2xl font-bold ui-text">
          {topicName ? `${topicName} Track preview` : 'Your Track preview'}
        </h1>
        <p className="ui-text-secondary mt-3">
          This Track focuses on the outcomes you will use most, then adds a smaller breadth set to connect them to the wider field.
        </p>
        <p className="ui-outcome-summary mt-4" aria-label="Track outcome summary">
          {summary.outcomes} outcomes · {summary.core} core · {summary.breadth} breadth
        </p>
      </header>

      {error && <div className="ui-alert ui-alert-danger" role="alert">{error}</div>}

      <section className="ui-preview-summary-grid" aria-label="Track at a glance">
        <article className="ui-summary-card">
          <h2 className="ui-text-secondary text-sm font-semibold">Chapters</h2>
          <p className="ui-text mt-1 text-2xl font-bold">{chapters.length}</p>
          <p className="ui-text-muted text-sm">Each Chapter ends with a checkpoint that revisits its core outcomes.</p>
        </article>
        <article className="ui-summary-card">
          <h2 className="ui-text-secondary text-sm font-semibold">Learning rhythm</h2>
          <p className="ui-text mt-1 font-semibold">{[timeCommitment, pace].filter(Boolean).join(' · ') || 'Set for your schedule'}</p>
          <p className="ui-text-muted text-sm">A practical pace that leaves room to revisit important ideas.</p>
        </article>
        <article className="ui-summary-card">
          <h2 className="ui-text-secondary text-sm font-semibold">Practical Builds</h2>
          <p className="ui-text mt-1 text-2xl font-bold">{summary.builds.length}</p>
          <p className="ui-text-muted text-sm">Apply the outcomes in useful, concrete work.</p>
        </article>
      </section>

      {summary.breadth > 0 && (
        <section className="ui-breadth-note" aria-label="Breadth outcomes">
          <h2 className="ui-text-secondary text-sm font-semibold">A little wider context</h2>
          <ul className="ui-outcome-list">
            {chapters.flatMap((chapter) => getOutcomes(chapter).filter((outcome) => outcome.role === 'breadth').map((outcome) => (
              <li key={outcome.id}><span className="ui-outcome-role ui-outcome-breadth">Breadth</span> {outcome.title}</li>
            )))}
          </ul>
        </section>
      )}

      <div className="ui-chapter-list" aria-label="Track outline">
        {chapters.map((chapter, chapterIndex) => {
          const outcomes = getOutcomes(chapter)
          const sessions = Array.isArray(chapter.lessons) ? chapter.lessons : []
          return (
            <section key={chapter.id || chapter.title} className="ui-chapter-preview" aria-labelledby={`chapter-${chapterIndex + 1}`}>
              <header className="ui-chapter-preview-heading">
                <h2 id={`chapter-${chapterIndex + 1}`} className="ui-text text-lg font-semibold">Chapter {chapterIndex + 1} · {chapter.title}</h2>
                <p className="ui-text-muted text-sm">{sessions.length} Sessions · {outcomes.length} outcomes</p>
              </header>
              <ul className="ui-chapter-outcomes">
                {outcomes.map((outcome) => (
                  <li key={outcome.id} className="ui-chapter-outcome">
                    <span className={`ui-outcome-role ${outcome.role === 'breadth' ? 'ui-outcome-breadth' : 'ui-outcome-core'}`}>
                      {outcome.role === 'breadth' ? 'Breadth' : 'Core'}
                    </span>
                    <span className="ui-text">{outcome.title}</span>
                  </li>
                ))}
              </ul>
              <div className="ui-session-list">
                {sessions.map((session, sessionIndex) => <ChapterSession key={session.id || session.title} session={session} index={sessionIndex} />)}
              </div>
            </section>
          )
        })}
      </div>

      <div className="ui-track-preview-actions">
        {!adjusting ? (
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onConfirm} disabled={submitting} className="ui-button ui-button-primary">
              {isTrackSetup ? (submitting ? 'Adding to your Trail…' : 'Add to my Trail') : (submitting ? 'Saving...' : 'Accept & Start')}
            </button>
            <button type="button" onClick={() => setAdjusting(true)} disabled={submitting} className="ui-button ui-button-secondary">{isTrackSetup ? 'Adjust plan' : 'Tweak'}</button>
            {isTrackSetup
              ? <button type="button" onClick={onBack} disabled={submitting} className="ui-button ui-button-quiet">Not now</button>
              : <button type="button" onClick={onRegenerate} disabled={submitting} className="ui-button ui-button-secondary">Regenerate</button>}
          </div>
        ) : (
          <form className="ui-adjustment-panel space-y-3" onSubmit={handleAdjustmentSubmit}>
            <label htmlFor="track-adjustment" className="ui-field-label">{isTrackSetup ? 'What would you like to adjust?' : 'Request changes'}</label>
            <textarea
              id="track-adjustment"
              value={adjustment}
              onChange={(event) => setAdjustment(event.target.value)}
              placeholder={isTrackSetup ? '' : "Request changes, e.g., 'Add a module on testing' or 'Make it more beginner-friendly'"}
              rows={3}
              className="ui-field w-full resize-y"
              disabled={submitting}
            />
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={submitting || !adjustment.trim()} className="ui-button ui-button-primary">{isTrackSetup ? 'Apply adjustments' : 'Apply Tweak'}</button>
              {isTrackSetup && onRegenerate && <button type="button" onClick={onRegenerate} disabled={submitting} className="ui-button ui-button-secondary">Refresh preview</button>}
              <button type="button" onClick={() => setAdjusting(false)} disabled={submitting} className="ui-button ui-button-quiet">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
