import { useState } from 'react'

const LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const TIMES = ['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day']
const STAGES = ['Reading your Trail', 'Balancing depth and breadth', 'Designing practical sessions', 'Validating the plan']

function ChapterCard({ chapter, index, compact = false, onSelect }) {
  return <article className="ui-surface ui-surface-inset rounded-xl p-4">
    <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">Chapter {index + 1}</p>
    <h2 className="mt-1 font-semibold ui-text">Chapter {index + 1} · {chapter.title}</h2>
    {!compact && chapter.summary && <p className="mt-1 text-sm ui-text-secondary">{chapter.summary}</p>}
    {!compact && chapter.skill_outcomes?.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm ui-text-secondary">{chapter.skill_outcomes.map((outcome, i) => <li key={outcome.id || i} data-outcome-role={outcome.role || 'core'}>{outcome.title || outcome}</li>)}</ul>}
    <p className="mt-3 text-xs ui-text-muted">{chapter.lessons?.length || 0} Sessions</p>
    {!compact && chapter.lessons?.length > 0 && <ul className="mt-2 space-y-1 text-sm ui-text-secondary">{chapter.lessons.map((lesson, i) => <li key={lesson.id || i}>{lesson.title}{lesson.task_spec?.title ? ` · Build: ${lesson.task_spec.title}` : ''}</li>)}</ul>}
    {onSelect && <button type="button" className="ui-button ui-button-secondary mt-3" onClick={onSelect}>Choose this Chapter</button>}
  </article>
}

function Preview({ model }) {
  const [showOthers, setShowOthers] = useState(false)
  const curriculum = model.preview || {}
  const chapters = Array.isArray(curriculum.modules) ? curriculum.modules : []
  const selectedIndex = Math.max(0, chapters.findIndex((chapter, index) => (chapter.id || String(index)) === model.selectedChapterId))
  const selectedChapter = chapters[selectedIndex]
  const lessons = chapters.flatMap((chapter) => chapter.lessons || [])
  const totalMinutes = lessons.reduce((sum, lesson) => sum + (Number.isFinite(lesson.estimated_time) ? lesson.estimated_time : 0), 0)
  return <section className="ui-panel rounded-2xl p-5 sm:p-7" aria-labelledby="continuation-preview-heading">
    <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">Your next finite Track</p>
    <h1 id="continuation-preview-heading" className="mt-2 text-2xl font-bold ui-text">{curriculum.title || 'Your next Track'}</h1>
    <p className="mt-2 max-w-2xl ui-text-secondary">About 80% core learning and 20% breadth: keep building the skills that matter while exploring useful neighboring ideas.</p>
    {model.readiness?.summary?.outcomes?.length > 0 && <section className="ui-surface ui-surface-inset mt-5 rounded-xl p-4" aria-label="Builds on what you already know"><h2 className="text-sm font-semibold ui-text">Builds on what you already know</h2><ul className="mt-2 flex flex-wrap gap-2">{model.readiness.summary.outcomes.slice(0, 8).map((item, i) => <li key={item.id || i} className="ui-status ui-status-neutral">{item.title || item}</li>)}</ul></section>}
    {selectedChapter && <div className="mt-5"><ChapterCard chapter={selectedChapter} index={selectedIndex} /></div>}
    {chapters.length > 1 && <>
      <button type="button" className="ui-button ui-button-secondary mt-4" aria-expanded={showOthers} aria-controls="other-chapters" onClick={() => setShowOthers((shown) => !shown)}>{showOthers ? 'Hide other Chapters' : 'Show other Chapters'}</button>
      {showOthers && <div id="other-chapters" className="mt-3 space-y-3" role="region" aria-label="Other Chapters">{chapters.map((chapter, index) => index !== selectedIndex && <ChapterCard key={chapter.id || chapter.title} chapter={chapter} index={index} onSelect={() => model.actions?.selectChapter?.(chapter.id || String(index))} />)}</div>}
    </>}
    <section className="ui-surface ui-surface-inset mt-5 rounded-xl p-4" aria-label="Learning rhythm">
      <h2 className="font-semibold ui-text">A rhythm that fits your week</h2><p className="mt-1 text-sm ui-text-secondary">{lessons.length} Sessions · about {totalMinutes} minutes of learning · planned for {model.timeCommitment}.</p><p className="mt-1 text-sm ui-text-muted">Level: {model.level}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="ui-field-label">Learner level<select className="ui-field mt-1 w-full" value={model.level || ''} onChange={(event) => model.actions?.setLevel?.(event.target.value)} disabled={model.busy?.working}>{LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label><label className="ui-field-label">Time commitment<select className="ui-field mt-1 w-full" value={model.timeCommitment || ''} onChange={(event) => model.actions?.setTimeCommitment?.(event.target.value)} disabled={model.busy?.working}>{TIMES.map((time) => <option key={time}>{time}</option>)}</select></label></div>
    </section>
    {model.profileStale && <p className="ui-alert ui-alert-warning mt-4" role="status">Your pace changed. Update the plan before adding it to your Trail.<button type="button" className="ui-button ui-button-secondary ml-3" onClick={model.actions?.refresh} disabled={model.busy?.working}>Update plan for this rhythm</button></p>}
    {model.error && <p className="ui-alert ui-alert-danger mt-4" role="alert">{model.error}</p>}
    <div className="mt-5 flex flex-wrap gap-3"><button type="button" className="ui-button ui-button-primary" onClick={model.actions?.confirm} disabled={model.busy?.working || model.profileStale}>{model.busy?.working ? 'Adding to your Trail…' : 'Add to my Trail'}</button><button type="button" className="ui-button ui-button-secondary" onClick={model.actions?.toggleAdjustment} disabled={model.busy?.working}>Adjust plan</button><button type="button" className="ui-button ui-button-quiet" onClick={model.actions?.defer} disabled={model.busy?.working}>Not now</button></div>
    {model.adjustmentOpen && <form className="mt-4 rounded-xl border p-4" onSubmit={(event) => { event.preventDefault(); model.actions?.applyAdjustment?.() }}><h2 className="font-semibold ui-text">Adjust this plan</h2><p className="mt-1 text-sm ui-text-secondary">Your current preview stays available if the adjustment fails.</p><label htmlFor="continuation-adjustment" className="ui-field-label mt-4 block">What would you like to adjust?</label><textarea id="continuation-adjustment" className="ui-field mt-1 min-h-28 w-full" maxLength={1000} value={model.adjustmentDraft || ''} onChange={(event) => model.actions?.setAdjustmentDraft?.(event.target.value)} disabled={model.busy?.working} /><div className="mt-3 flex gap-3"><button className="ui-button ui-button-primary" type="submit" disabled={model.busy?.working || !model.adjustmentDraft?.trim()}>{model.busy?.working ? 'Adjusting…' : 'Apply adjustment'}</button><button className="ui-button ui-button-secondary" type="button" onClick={model.actions?.toggleAdjustment} disabled={model.busy?.working}>Keep current plan</button></div></form>}
  </section>
}

export default function ContinuationSurface({ model, variant, className }) {
  return <main data-theme-view="ContinuationView" data-view-model={model ? 'connected' : 'placeholder'} data-pack-style={variant} className={className}>
    {model.phase === 'loading' && <section className="ui-panel p-10 text-center"><span className="ui-spinner mx-auto" role="status" aria-label="Loading completed Track" /></section>}
    {model.phase !== 'loading' && model.parentTrack?.readiness && <section className="ui-panel rounded-2xl p-5"><p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">Track complete</p><h1 className="mt-2 text-xl font-bold ui-text">Your Track is complete</h1><p className="mt-2 ui-text-secondary">{model.readiness?.course?.title || 'This Track'} is a finished chapter in your learning. Your progress stays on your Trail while the next plan takes shape.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{(model.parentTrack.dashboard?.modules || []).map((chapter, index) => <article key={chapter.id || chapter.title} className="ui-surface ui-surface-inset rounded-xl p-3"><h2 className="text-sm font-semibold ui-text">Chapter {index + 1} · {chapter.title}</h2><ul className="mt-2 space-y-1 text-sm ui-text-secondary">{(chapter.lessons || []).slice(0, 4).map((lesson, lessonIndex) => <li key={lesson.id || lessonIndex}>{lesson.title}{lesson.task?.title ? ` · Build: ${lesson.task.title}` : ''}</li>)}</ul><ul className="mt-2 space-y-1 text-xs ui-text-muted">{(chapter.skill_outcomes || []).slice(0, 4).map((outcome, outcomeIndex) => <li key={outcome.id || outcomeIndex}>{outcome.title}</li>)}</ul></article>)}</div>{model.readiness?.summary?.gaps?.length > 0 && <ul className="mt-3 text-sm ui-text-secondary">{model.readiness.summary.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>}<button type="button" className="ui-button ui-button-secondary mt-4" onClick={model.actions?.review}>Review this Track</button></section>}
    {model.phase === 'ineligible' && <section className="ui-panel rounded-2xl p-6"><h1 className="text-xl font-bold ui-text">Finish this Track first</h1><p className="mt-2 ui-text-secondary">{model.readiness?.reason || 'Complete each Chapter checkpoint to unlock your next Track.'}</p><button type="button" className="ui-button ui-button-primary mt-5" onClick={model.actions?.defer}>Back to my Trail</button></section>}
    {model.phase === 'generating' && <section className="ui-panel rounded-2xl p-6"><h1 className="text-xl font-bold ui-text">Designing your next Track</h1><p className="mt-2 ui-text-secondary">A thoughtful plan is taking shape from what you have learned.</p><ol className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Plan design stages">{STAGES.map((stage, index) => <li key={stage} className="ui-surface ui-surface-inset rounded-xl p-3">{index + 1}. {stage}</li>)}</ol></section>}
    {model.phase === 'error' && <section className="ui-panel rounded-2xl p-6"><h1 className="text-xl font-semibold ui-text">Your next Track is still within reach</h1>{model.error && <p className="ui-alert ui-alert-warning mt-4" role="alert">{model.error}</p>}<div className="mt-5 flex flex-wrap gap-3"><button type="button" className="ui-button ui-button-primary" onClick={model.actions?.retry} disabled={model.busy?.working}>Retry generation</button><button type="button" className="ui-button ui-button-secondary" onClick={model.actions?.defer}>Back to my Trail</button></div></section>}
    {model.phase === 'preview' && model.preview && <Preview model={model} />}
  </main>
}
