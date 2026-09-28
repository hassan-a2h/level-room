import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

function sessionLabel(session, isLocked) {
  if (isLocked) return 'Locked'
  if (session.state === 'passed') return 'Mastered'
  if (session.state === 'practicing') return 'In progress'
  return 'Ready'
}

function checkpointPresentation(status) {
  if (status === 'completed') return { label: 'Checkpoint passed', description: 'Chapter checkpoint complete.' }
  if (status === 'in_progress') return { label: 'Checkpoint in progress', description: 'Your saved answers are ready to continue.' }
  if (status === 'ready') return { label: 'Checkpoint ready', description: 'Sessions complete. Show what you can do.' }
  return { label: 'Checkpoint locked', description: 'Complete this Chapter’s Sessions first.' }
}

export default function ChapterCard({
  chapter,
  chapterNumber,
  isCurrent = false,
  isFuture = false,
  showAllDetails = false,
  onStartSession,
  onStartCheckpoint,
}) {
  const completed = chapter.status === 'completed'
  const [expanded, setExpanded] = useState(showAllDetails || isCurrent || (!completed && !isFuture))
  const contentId = `chapter-details-${chapter.id}`
  const checkpoint = checkpointPresentation(chapter.checkpointStatus)
  const sessions = Array.isArray(chapter.sessions) ? chapter.sessions : Array.isArray(chapter.lessons) ? chapter.lessons : []
  const outcomes = Array.isArray(chapter.skill_outcomes) ? chapter.skill_outcomes.slice(0, 3) : []

  useEffect(() => {
    if (showAllDetails) setExpanded(true)
    else if (isCurrent) setExpanded(true)
    else if (completed) setExpanded(false)
    else if (isFuture) setExpanded(false)
  }, [isCurrent, completed, isFuture, showAllDetails])

  return (
    <li className={`relative list-none border-l-2 pl-4 sm:pl-6 ${isCurrent ? 'border-[var(--ui-focus)]' : 'ui-divider'}`}>
      <article aria-label={`Chapter ${chapterNumber}: ${chapter.title}`} className={`ui-surface ${isCurrent ? 'ui-surface-raised' : 'ui-surface-flat'} p-4 sm:p-5`}>
        <div className="flex items-start gap-3">
          <span className={`ui-chapter-marker mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold${isCurrent ? ' is-current' : ''}`} aria-hidden="true">
            {completed ? <Check /> : chapterNumber}
          </span>
          <div className="min-w-0 flex-1">
            {isFuture ? (
              <div className="chapter-card-future-heading flex min-h-11 items-center justify-between gap-3">
                <h3 className="min-w-0 text-base font-semibold ui-text">{chapter.title}</h3>
                <span className="ui-status ui-status-neutral">Coming up</span>
              </div>
            ) : (
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
                aria-controls={contentId}
                aria-expanded={expanded}
                aria-label={`Chapter ${chapterNumber}, ${chapter.title}${isCurrent ? ', current Chapter' : ''}${completed ? ', completed' : ''}`}
                onClick={() => setExpanded((value) => !value)}
              >
                <span>
                  <span className="block text-base font-semibold ui-text">{chapter.title}</span>
                  <span className="mt-0.5 block text-sm ui-text-muted">
                    {isCurrent ? 'Current Chapter' : 'Completed'}
                    {sessions.length > 0 ? ` · ${sessions.filter((session) => session.state === 'passed').length} of ${sessions.length} Sessions mastered` : ''}
                  </span>
                </span>
                <span aria-hidden="true" className="ui-text-muted">{expanded ? '−' : '+'}</span>
              </button>
            )}

            {isFuture && !showAllDetails ? (
              <div id={contentId} className="mt-3 space-y-2">
                <p className="text-xs ui-text-muted">Complete the earlier Chapter first.</p>
                {sessions[0] && (
                  <button
                    type="button"
                    className="ui-button ui-button-secondary min-h-10 text-sm"
                    aria-label={`${sessions[0].title}, locked`}
                    disabled
                  >
                    {sessions[0].title} · Locked
                  </button>
                )}
              </div>
            ) : (
              <div id={contentId} className="mt-4 space-y-4" hidden={!expanded}>
                {chapter.summary && <p className="text-sm ui-text-secondary">{chapter.summary}</p>}
                {outcomes.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide ui-text-muted">What you’ll learn</h4>
                    <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Outcomes for ${chapter.title}`}>
                      {outcomes.map((outcome) => (
                        <li key={outcome.id || outcome.title} className="rounded-full px-3 py-1 text-xs ui-text-secondary ui-surface-alt">
                          {outcome.title}{outcome.role === 'breadth' ? ' · Explore' : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide ui-text-muted">Sessions</h4>
                  <ul className="mt-2 space-y-2" aria-label={`Sessions in ${chapter.title}`}>
                    {sessions.map((session) => {
                      const locked = Boolean(session.locked) || isFuture
                      const label = sessionLabel(session, locked)
                      const prerequisites = Array.isArray(session.prerequisites) ? session.prerequisites : []
                      const lockReason = isFuture
                        ? 'Complete the earlier Chapter first.'
                        : prerequisites.length > 0
                          ? `Complete ${prerequisites.map((item) => item.title).join(', ')} first.`
                          : 'Complete earlier Sessions first.'

                      return (
                        <li key={session.id} className="ui-surface-flat flex flex-col gap-2 rounded-lg border ui-border p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium ui-text">{session.title}</span>
                              <span className={`ui-status ${session.state === 'passed' ? 'ui-status-success' : session.state === 'practicing' ? 'ui-status-progress' : 'ui-status-neutral'}`}>
                                {label}
                              </span>
                              {session.buildRequired && <span className="ui-status ui-status-warning">Build session</span>}
                            </div>
                            {session.currentActivity && session.state === 'practicing' && <p className="mt-1 text-xs ui-text-muted">Next: {session.currentActivity}</p>}
                            {locked && <p className="mt-1 text-xs ui-text-muted">{lockReason}</p>}
                          </div>
                          <button
                            type="button"
                            className="ui-button ui-button-secondary shrink-0 text-sm"
                            aria-label={`${session.title}, ${label.toLowerCase()}`}
                            disabled={locked}
                            onClick={() => onStartSession?.(session)}
                          >
                            {locked ? 'Locked' : session.state === 'practicing' ? 'Continue' : session.state === 'passed' ? 'Review' : 'Start'}
                          </button>
                        </li>
                      )
                    })}
                    {sessions.length === 0 && <li className="text-sm ui-text-muted">Sessions will appear here when this Chapter is ready.</li>}
                  </ul>
                </div>

                <div className="flex flex-col gap-2 border-t ui-divider pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium ui-text">{checkpoint.label}</p>
                    <p className="text-xs ui-text-muted">{checkpoint.description}</p>
                  </div>
                  {(chapter.checkpointStatus === 'ready' || chapter.checkpointStatus === 'in_progress') && !isFuture && (
                    <button
                      type="button"
                      className="ui-button ui-button-secondary shrink-0"
                      onClick={() => onStartCheckpoint?.(chapter.id)}
                    >
                      {chapter.checkpointStatus === 'in_progress' ? 'Resume checkpoint' : 'Start checkpoint'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </article>
    </li>
  )
}
