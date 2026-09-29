import { useId } from 'react'
import { Check } from 'lucide-react'

const stages = ['Destination', 'Starting point', 'Learning rhythm', 'Track preview']

function Actions({ children }) {
  return <div className="mt-6 flex flex-wrap gap-3">{children}</div>
}

function ChapterDetails({ chapter, index, onSelect }) {
  const outcomes = Array.isArray(chapter.skill_outcomes) ? chapter.skill_outcomes : []
  const lessons = Array.isArray(chapter.lessons) ? chapter.lessons : []
  return <article className="ui-surface ui-surface-inset rounded-xl p-4">
    <h3 className="font-semibold ui-text">Chapter {index + 1} · {chapter.title}</h3>
    {chapter.summary && <p className="mt-1 text-sm ui-text-secondary">{chapter.summary}</p>}
    {outcomes.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm ui-text-secondary">{outcomes.map((outcome, i) => <li key={outcome.id || i}>{outcome.title}</li>)}</ul>}
    {lessons.length > 0 && <div className="mt-3 space-y-2">{lessons.map((lesson, lessonIndex) => <details key={lesson.id || lesson.title} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium ui-text">Session {lessonIndex + 1} · {lesson.title}</summary><div className="mt-2 space-y-2 text-sm ui-text-secondary">{lesson.outcomes?.length > 0 && <ul className="list-disc space-y-1 pl-5">{lesson.outcomes.map((outcome, outcomeIndex) => <li key={outcome.id || outcomeIndex}>{outcome.title || outcome}</li>)}</ul>}{lesson.prerequisites?.length > 0 && <p>Prerequisites: {lesson.prerequisites.map((item) => item.title || item).join(', ')}</p>}{lesson.task_spec?.title && <p><strong>Build:</strong> {lesson.task_spec.title}</p>}{lesson.artifact_required && !lesson.task_spec?.title && <span className="ui-status ui-status-neutral">Build</span>}</div></details>)}</div>}
    {onSelect && <button type="button" className="ui-button ui-button-secondary mt-3" onClick={onSelect}>Choose this Chapter</button>}
  </article>
}

function TrackPreview({ model }) {
  const chapters = model.preview?.curriculum?.modules || []
  const selected = chapters.findIndex((chapter, index) => (chapter.id || String(index)) === model.preview?.selectedChapterId)
  const selectedIndex = selected < 0 ? 0 : selected
  const selectedChapter = chapters[selectedIndex]
  const outcomes = [...new Map(chapters.flatMap((chapter) => chapter.skill_outcomes || []).filter((outcome) => outcome?.id).map((outcome) => [outcome.id, outcome])).values()]
  const coreCount = outcomes.filter((outcome) => outcome.role !== 'breadth').length
  const breadthCount = outcomes.filter((outcome) => outcome.role === 'breadth').length
  return <section aria-labelledby="track-preview-heading">
    <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">Track preview</p>
    <h1 id="track-preview-heading" className="mt-2 text-2xl font-bold ui-text">{model.preview?.curriculum?.title || `${model.destination || 'Your'} Track preview`}</h1>
    {model.error && <p className="ui-alert ui-alert-danger mt-4" role="alert">{model.error}</p>}
    <p className="ui-outcome-summary mt-4" aria-label="Track outcome summary">{outcomes.length} outcomes · {coreCount} core · {breadthCount} breadth</p>
    <p className="mt-2 text-sm ui-text-muted">Each Chapter ends with a checkpoint that revisits its core outcomes.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Track at a glance">
      <article className="ui-surface ui-surface-inset rounded-xl p-4"><h2 className="text-sm font-semibold ui-text-secondary">Learning rhythm</h2><p className="mt-1 ui-text">{[model.preview?.timeCommitment, model.preview?.pace].filter(Boolean).join(' · ') || 'Set for your schedule'}</p></article>
      <article className="ui-surface ui-surface-inset rounded-xl p-4"><h2 className="text-sm font-semibold ui-text-secondary">Chapters</h2><p className="mt-1 ui-text">{chapters.length}</p></article>
    </div>
    {selectedChapter && <div className="mt-5"><ChapterDetails chapter={selectedChapter} index={selectedIndex} /></div>}
    {chapters.length > 1 && <details className="ui-surface mt-4 rounded-xl p-4"><summary className="cursor-pointer font-semibold ui-text">Other Chapters</summary><div className="mt-3 space-y-3">{chapters.map((chapter, index) => index !== selectedIndex && <ChapterDetails key={chapter.id || chapter.title} chapter={chapter} index={index} onSelect={() => model.actions?.selectChapter?.(chapter.id || String(index))} />)}</div></details>}
    <Actions>
      <button type="button" className="ui-button ui-button-primary" onClick={model.actions?.confirm} disabled={model.busy?.submitting}>{model.busy?.submitting ? 'Adding to your Trail…' : 'Add to my Trail'}</button>
      <button type="button" className="ui-button ui-button-secondary" onClick={model.actions?.toggleTweak} disabled={model.busy?.submitting}>Tweak</button>
      {model.actions?.regenerate && <button type="button" className="ui-button ui-button-secondary" onClick={model.actions.regenerate} disabled={model.busy?.submitting}>Regenerate</button>}
      <button type="button" className="ui-button ui-button-quiet" onClick={model.actions?.back} disabled={model.busy?.submitting}>Back</button>
    </Actions>
    {model.preview?.tweakOpen && <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); model.actions?.tweak?.() }}>
      <label className="ui-field-label" htmlFor="track-tweak">What would you like to adjust?</label>
      <textarea id="track-tweak" className="ui-field w-full" value={model.preview?.tweakDraft || ''} onChange={(event) => model.actions?.setTweakDraft?.(event.target.value)} disabled={model.busy?.submitting} />
      <button className="ui-button ui-button-primary" type="submit" disabled={model.busy?.submitting || !model.preview?.tweakDraft?.trim()}>{model.busy?.submitting ? 'Adjusting…' : 'Apply Tweak'}</button>
      <button className="ui-button ui-button-quiet" type="button" onClick={model.actions?.toggleTweak} disabled={model.busy?.submitting}>Cancel</button>
    </form>}
  </section>
}

export default function OnboardingSurface({ model, variant, className }) {
  const id = useId()
  const stageIndex = Math.max(0, Math.min(3, model.stageIndex ?? 0))
  const options = model.levelOptions || []
  const placement = model.placement || {}
  const question = placement.questions?.[placement.questionIndex || 0]
  const prompt = model.substep === 'placement' && question
  const onDestinationSubmit = (event) => { event.preventDefault(); model.actions?.submitDestination?.() }
  return <main data-theme-view="OnboardingView" data-view-model={model ? 'connected' : 'placeholder'} className={className} data-pack-style={variant}>
    <nav className="mb-8" aria-label="Learning path setup">
      <p className="ui-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">Step {stageIndex + 1} of 4</p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">{stages.map((label, index) => <li key={label} aria-label={label} aria-current={stageIndex === index ? 'step' : undefined} className={`rounded-lg border p-2 text-sm ${stageIndex === index ? 'font-semibold ui-text' : 'ui-text-muted'}`}><span aria-hidden="true" className="mr-2">{index < stageIndex ? <Check /> : index + 1}</span>{label}</li>)}</ol>
    </nav>
    {!model.providerReady && <p className="ui-alert ui-alert-warning mb-5" role="alert">Connect an AI provider in Settings before creating a Track.<button type="button" className="ui-text-link ml-2 underline" onClick={model.actions?.openSettings}>Open Settings</button></p>}
    {model.error && (model.stage !== 'preview' || model.substep === 'generating') && <p className="ui-alert ui-alert-danger mb-5" role="alert">{model.error}</p>}
    <section className="ui-panel mx-auto max-w-3xl rounded-2xl p-5 sm:p-8" aria-labelledby={`${id}-heading`}>
      {model.stage === 'destination' && <>
        <p className="ui-text-muted mb-2 text-xs font-semibold uppercase tracking-wide">Your learning Trail</p>
        <h1 id={`${id}-heading`} className="text-2xl font-bold ui-text">What do you want to be able to do?</h1>
        <p className="mt-2 ui-text-secondary">Choose a destination such as React, Calculus, negotiation, or Japanese.</p>
        <form className="mt-6" onSubmit={onDestinationSubmit}>
          <label className="ui-field-label" htmlFor={`${id}-destination`}>Your learning destination</label>
          <input id={`${id}-destination`} className="ui-field mt-2 w-full" value={model.destination || ''} onChange={(event) => model.actions?.setDestination?.(event.target.value)} maxLength={100} placeholder="For example, React or Japanese" disabled={model.busy?.submitting} />
          <button className="ui-button ui-button-primary mt-5 w-full" type="submit" disabled={model.busy?.submitting}>{model.busy?.submitting ? 'Saving destination…' : 'Set my destination'}</button>
        </form>
      </>}
      {model.stage === 'starting_point' && <>
        <p className="ui-text-muted mb-2 text-xs font-semibold uppercase tracking-wide">Starting point</p>
        <h1 id={`${id}-heading`} className="text-2xl font-bold ui-text">{prompt ? 'Optional placement check' : 'Choose your starting point'}</h1>
        {!prompt && model.substep !== 'placement-choice' && model.busy?.questions && <p className="mt-5 ui-text-muted" role="status">Loading your starting choices…</p>}
        {!prompt && model.substep !== 'placement-choice' && !model.busy?.questions && options.length === 0 && <div className="mt-5"><p className="ui-text-secondary">We could not load your starting choices.</p><button type="button" className="ui-button ui-button-secondary mt-4" onClick={model.actions?.retryChoices}>Retry choices</button></div>}
        {!prompt && model.substep === 'placement-choice' && <><p className="mt-2 ui-text-secondary">Would you like a short check to refine this recommendation?</p><Actions><button type="button" className="ui-button ui-button-primary" onClick={model.actions?.takePlacement} disabled={model.busy?.placement}>Take a placement check</button><button type="button" className="ui-button ui-button-secondary" onClick={model.actions?.skipPlacement}>Skip placement check</button><button type="button" className="ui-button ui-button-quiet" onClick={model.actions?.back}>Back</button></Actions></>}
        {!prompt && model.substep === 'placement' && model.busy?.placement && <div className="mt-5 space-y-2" role="status" aria-label="Preparing placement check" aria-busy="true"><p className="font-medium ui-text">Preparing your placement check…</p><p className="ui-text-secondary">We’re shaping a few questions around your selected level.</p></div>}
        {!prompt && model.substep === 'placement' && !model.busy?.placement && model.error && <div className="mt-5"><p className="ui-text-secondary">Your starting choices are still saved. You can try the check again or continue without it.</p><Actions><button type="button" className="ui-button ui-button-primary" onClick={model.actions?.takePlacement}>Retry placement check</button><button type="button" className="ui-button ui-button-secondary" onClick={model.actions?.skipPlacement}>Skip placement check</button><button type="button" className="ui-button ui-button-quiet" onClick={model.actions?.back}>Back</button></Actions></div>}
        {!prompt && model.substep !== 'placement-choice' && model.substep !== 'placement' && <><p className="mt-2 ui-text-secondary">Choose the level that best fits what you know now.</p><div className="mt-5 grid gap-3 sm:grid-cols-3" role="group" aria-label="Starting point">{options.map((option) => <button key={option.value} type="button" aria-pressed={model.selectedLevel === option.value} onClick={() => model.actions?.chooseLevel?.(option.value)} className="ui-choice-card rounded-xl border p-4 text-left" disabled={model.busy?.submitting}><span className="block font-semibold">{option.label}</span>{option.description && <span className="mt-1 block text-sm ui-text-secondary">{option.description}</span>}</button>)}</div><Actions><button className="ui-button ui-button-primary" type="button" onClick={model.actions?.continueStartingPoint} disabled={!model.selectedLevel}>Continue</button><button className="ui-button ui-button-quiet" type="button" onClick={model.actions?.back}>Back to destination</button></Actions></>}
        {prompt && <div className="mt-5"><p className="font-medium ui-text">{question.text}</p>{question.type === 'multiple_choice' ? <div className="mt-3 grid gap-2" role="group" aria-label={question.text}>{(question.options || []).map((option) => <button key={option.value} className="ui-choice rounded-xl border p-3 text-left" type="button" aria-pressed={placement.answers?.[question.id] === option.value} onClick={() => model.actions?.answerPlacement?.(question.id, option.value)}>{option.label}</button>)}</div> : <textarea className="ui-field mt-3 w-full" aria-label={question.text} maxLength={2000} rows={4} value={placement.answers?.[question.id] || ''} onChange={(event) => model.actions?.answerPlacement?.(question.id, event.target.value)} />}
          {placement.result ? <div className="mt-4" role="status"><h2 className="font-semibold ui-text">A good starting point is {placement.result.recommendedLevel}</h2><p className="mt-1 ui-text-secondary">Your self-reported level was {placement.result.requestedLevel || model.selectedLevel}.</p><Actions><button type="button" className="ui-button ui-button-primary" onClick={model.actions?.acceptPlacement}>Continue with {placement.result.recommendedLevel}</button><button type="button" className="ui-button ui-button-secondary" onClick={model.actions?.skipPlacement}>Keep my self-reported level</button></Actions></div> : <Actions><button type="button" className="ui-button ui-button-secondary" onClick={model.actions?.previousPlacementQuestion} disabled={!placement.questionIndex || placement.loading}>Back</button>{placement.questionIndex < (placement.questions?.length || 0) - 1 ? <button type="button" className="ui-button ui-button-primary" onClick={model.actions?.nextPlacementQuestion} disabled={!placement.canAdvance || placement.loading}>Next question</button> : <button type="button" className="ui-button ui-button-primary" onClick={model.actions?.submitPlacement} disabled={!placement.canAdvance || placement.loading}>{placement.loading ? 'Checking…' : 'Check my starting point'}</button>}<button type="button" className="ui-button ui-button-quiet" onClick={model.actions?.skipPlacement}>Skip this check</button></Actions>}
        </div>}
      </>}
        {model.stage === 'learning_rhythm' && <>
        <p className="ui-text-muted mb-2 text-xs font-semibold uppercase tracking-wide">Learning rhythm</p><h1 id={`${id}-heading`} className="text-2xl font-bold ui-text">Set your learning rhythm</h1><p className="mt-2 ui-text-secondary">Choose a daily study window and a pace that feels sustainable.</p>
        {model.substep === 'pace' ? <><fieldset className="mt-6"><legend className="ui-field-label mb-3">Preferred pace</legend><div className="grid gap-3 sm:grid-cols-3">{(model.paceOptions || []).map((option) => <button key={option.value} type="button" className="ui-choice-card rounded-xl border p-4 text-left" aria-pressed={model.selectedPace === option.value} onClick={() => model.actions?.choosePace?.(option.value)}><span className="block font-semibold">{option.label}</span><span className="mt-1 block text-sm ui-text-secondary">{option.description}</span></button>)}</div></fieldset><Actions><button className="ui-button ui-button-secondary" type="button" onClick={model.actions?.back}>Back</button><button className="ui-button ui-button-primary" type="button" onClick={model.actions?.submitRhythm} disabled={model.busy?.submitting || !model.selectedTime}>{model.busy?.submitting ? 'Saving rhythm…' : 'Build my Track'}</button></Actions></> : <><fieldset className="mt-6"><legend className="ui-field-label mb-3">Daily study time</legend><div className="grid gap-2 sm:grid-cols-3">{(model.timeOptions || []).map((option) => <button key={option.value} type="button" className="ui-choice rounded-xl border p-3" aria-pressed={model.selectedTime === option.value} onClick={() => model.actions?.chooseTime?.(option.value)}>{option.label}</button>)}</div></fieldset><Actions><button className="ui-button ui-button-secondary" type="button" onClick={model.actions?.back}>Back</button><button className="ui-button ui-button-primary" type="button" onClick={model.actions?.continueRhythm} disabled={!model.selectedTime}>Continue</button></Actions></>}
      </>}
      {model.stage === 'preview' && model.substep === 'generating' && <>
        <h1 id={`${id}-heading`} className="text-2xl font-bold ui-text">{model.generation?.running ? 'Designing your Track…' : 'Your Track is ready to resume'}</h1><p className="mt-2 ui-text-secondary">{model.generation?.running ? 'We are shaping practice around your destination and available time. You can leave and return while it continues.' : 'Your setup is saved. Resume preparation or check whether a saved preview is ready.'}</p>
        {model.generation?.running ? <ol className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Track design stages">{(model.generation?.stages || []).map((stage, index) => <li className="ui-surface ui-surface-inset rounded-xl p-3" key={stage}>{index + 1}. {stage}</li>)}</ol> : <Actions><button className="ui-button ui-button-primary" type="button" onClick={model.actions?.resume} disabled={model.busy?.submitting}>{model.generation?.canResume ? 'Resume Track generation' : 'Check Track status'}</button><button className="ui-button ui-button-secondary" type="button" onClick={model.actions?.refreshRecovery} disabled={model.busy?.submitting}>Check again</button></Actions>}
      </>}
      {model.stage === 'preview' && model.substep !== 'generating' && <TrackPreview model={model} />}
    </section>
  </main>
}
