export default function FocusAreas({ areas = [], onOpenSession }) {
  const visibleAreas = Array.isArray(areas) ? areas.slice(0, 3) : []

  return (
    <section className="ui-surface ui-surface-raised p-4 sm:p-5" aria-label="Focus areas">
      <h2 className="font-semibold ui-text">Focus areas</h2>
      <p className="mt-1 text-sm ui-text-muted">A few ideas to revisit when you’re ready.</p>
      {visibleAreas.length ? (
        <ul className="mt-3 space-y-2">
          {visibleAreas.map((area) => (
            <li key={area.id} className="rounded-lg border ui-border p-3">
              <p className="text-sm ui-text-secondary">{area.description}</p>
              {area.recurring && <span className="mt-1 inline-block text-xs ui-text-muted">Worth another look</span>}
              <button
                type="button"
                className="ui-button ui-button-quiet mt-2 min-h-10 p-0 text-sm"
                onClick={() => onOpenSession?.(area.lessonId)}
                disabled={!Number.isSafeInteger(area.lessonId)}
              >
                Revisit {area.sessionTitle || 'Session'}
                {area.chapterTitle ? <span className="sr-only"> in {area.chapterTitle}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg px-3 py-3 text-sm ui-text-secondary" style={{ backgroundColor: 'var(--ui-surface-alt)' }}>
          No open focus areas right now. Keep following your Trail.
        </p>
      )}
    </section>
  )
}
