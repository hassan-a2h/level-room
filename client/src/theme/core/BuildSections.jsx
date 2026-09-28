const DIMENSIONS = ['Correctness', 'Completeness', 'Clarity', 'Edge Cases']

export function BuildStageIndicator({ active, busy, className = '' }) {
  const stages = ['Brief', 'Evidence', 'Review', 'Evaluating', 'Result']
  const current = stages.indexOf(active)
  return <ol className={`build-stage-list ${className}`.trim()} aria-label="Build stages">{stages.map((stage, index) => <li key={stage} aria-current={active === stage ? 'step' : undefined} className={`${active === stage ? 'is-current' : ''} ${index < current ? 'is-complete' : ''}`.trim()}>{stage}{stage === 'Evaluating' && busy ? '…' : ''}</li>)}</ol>
}

export function BuildBrief({ taskSpec, actions, model }) {
  if (!taskSpec) return null
  return <section className="build-brief ui-panel p-4" aria-labelledby="task-title">
    <h3 id="task-title" className="text-base font-semibold ui-text">{taskSpec.title}</h3>
    {Number.isFinite(model.estimatedTime) && model.estimatedTime > 0 && <p className="mt-1 text-xs ui-text-muted">Estimated time: {model.estimatedTime} minutes</p>}
    <p className="mt-2 text-sm ui-text-secondary">{taskSpec.scenario}</p>
    <p className="mt-2 text-sm ui-text"><strong>Goal:</strong> {taskSpec.goal}</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs ui-text-secondary">
      <div><strong>Constraints</strong><ul className="mt-1 list-disc pl-4">{taskSpec.constraints?.map((item) => <li key={item}>{item}</li>)}</ul></div>
      <div><strong>Deliverables</strong><ul className="mt-1 list-disc pl-4">{taskSpec.deliverables?.map((item) => <li key={item}>{item}</li>)}</ul></div>
      <div><strong>Success criteria</strong><ul className="mt-1 list-disc pl-4">{taskSpec.success_criteria?.map((item) => <li key={item}>{item}</li>)}</ul></div>
    </div>
    {taskSpec.primary_setup && <p className="mt-3 rounded-lg ui-surface ui-surface-flat p-3 text-xs ui-text-secondary"><strong>Safe setup:</strong> {taskSpec.primary_setup.description} ({taskSpec.primary_setup.kind}){taskSpec.free_fallback?.description && <><br /><strong>Fallback:</strong> {taskSpec.free_fallback.description}</>}</p>}
    <p className="build-safety-note mt-3 text-xs"><strong>Safety:</strong> {taskSpec.safety_notes?.length ? taskSpec.safety_notes.join(' ') : 'Use a local or no-software setup, and only work on systems you own or have permission to use.'}</p>
    {taskSpec.hints?.length > 0 && <div className="mt-3"><button type="button" className="text-xs ui-text-secondary underline" onClick={model.ui.showHints ? actions.closeHints : actions.openHints}>{model.ui.showHints ? 'Hide hints' : 'Show hints'}</button>{model.ui.showHints && <ul className="mt-1 list-disc pl-4 text-xs ui-text-secondary">{taskSpec.hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>}</div>}
  </section>
}

export function BuildRubric({ model, actions, className = '' }) {
  return <details open={Boolean(model.ui.showRubric)} onToggle={(event) => event.currentTarget.open ? actions.openRubric() : actions.closeRubric()} className={`build-review-disclosure ${className}`.trim()}><summary>Review rubric</summary><section className="ui-panel mt-3 p-4" aria-labelledby="artifact-rubric-title"><h3 id="artifact-rubric-title" className="text-sm font-semibold ui-text mb-2">Evaluation rubric</h3><p className="mb-3 text-xs ui-text-secondary">Score levels: <strong>0 — Missing</strong> · <strong>1 — Needs Work</strong> · <strong>2 — Strong</strong></p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{DIMENSIONS.map((dimension) => <div key={dimension} className="ui-surface ui-surface-flat rounded-lg p-3"><strong className="text-xs ui-text-secondary">{dimension}</strong><p className="mt-1 text-[11px] ui-text-muted">{dimension === 'Correctness' ? 'Does it work or is it factually correct?' : dimension === 'Completeness' ? 'Are all required parts included?' : dimension === 'Clarity' ? 'Is it easy to understand and well structured?' : 'Does it handle boundary conditions?'}</p></div>)}</div><p className="mt-3 text-[11px] ui-text-muted">Passing requires no zeros and at least 70% of total points (6 / 8).</p></section></details>
}

export function BuildResult({ model, actions }) {
  const previousContent = model.previousContent
  const previousEvidence = model.previousEvidence
  const evaluation = model.evaluation
  const passed = Boolean(evaluation?.passed)
  const status = (score) => score === 2 ? 'Strong' : score === 1 ? 'Needs Work' : 'Missing'
  const nextStep = (score, feedback) => score >= 2 ? 'Keep this approach in your next Build.' : score === 1 ? (feedback ? `Strengthen this by addressing: ${feedback}` : 'Add one specific detail to make this stronger.') : (feedback ? `Start here: ${feedback}` : 'Add a concrete example that demonstrates this skill.')
  return <section className="build-result" aria-live="polite">
    <div className={`ui-alert ${passed ? 'ui-alert-success' : 'ui-alert-warning'} mb-5`}><h3 className="text-lg font-bold ui-text">{passed ? 'Build complete' : 'Ready to revise'}</h3><p className="text-sm ui-text-secondary">Overall: <strong>{evaluation.overallScore}%</strong> (passes with no missing dimensions and a score of at least 70%)</p></div>
    {previousEvidence && <section className="ui-panel mb-5 p-4" aria-labelledby="submitted-evidence-title"><h4 id="submitted-evidence-title" className="text-sm font-semibold ui-text mb-2">Your submitted evidence</h4><dl className="grid gap-3 sm:grid-cols-2">{Object.entries(previousEvidence).map(([field, value]) => <div key={field}><dt className="text-xs font-medium ui-text-muted capitalize">{field === 'actions' ? 'Actions taken' : field === 'result' ? 'Observed result' : field}</dt><dd className="mt-1 whitespace-pre-wrap text-sm ui-text-secondary">{value}</dd></div>)}</dl></section>}
    {!previousEvidence && previousContent && <section className="ui-panel mb-5 p-4" aria-label="Your submitted work"><h4 className="text-sm font-semibold ui-text mb-2">Your submitted work</h4><pre className="whitespace-pre-wrap break-words text-sm ui-text-secondary">{previousContent}</pre></section>}
    <div className="space-y-3">{DIMENSIONS.map((dimension) => { const score = evaluation.scores?.[dimension] ?? 0; const feedback = evaluation.feedback?.[dimension] || ''; const statusCode = score === 2 ? 'success' : score === 1 ? 'warning' : 'danger'; return <section key={dimension} className="ui-panel p-4"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold ui-text">{dimension}</h4><span data-status={statusCode} className={`ui-status ui-status-${statusCode}`}>{score}/2 — {status(score)}</span></div><p className="mt-2 text-sm ui-text-secondary"><strong>Evidence:</strong> {feedback || 'This dimension was included in the evaluation.'}</p><p className="mt-2 text-sm ui-text-secondary"><strong>Next step:</strong> {nextStep(score, feedback)}</p></section>})}</div>
    {!passed && <div className="mt-5 flex justify-center"><button type="button" onClick={actions.revise} className="ui-button ui-button-primary">Revise &amp; Resubmit</button></div>}
    {passed && <p className="mt-5 text-center text-sm ui-text-secondary font-medium">{previousEvidence ? 'Your Build checkpoint is complete. Continue your Trail.' : 'Great work! Your Build has been approved.'}</p>}
  </section>
}

export function BuildEvidenceFields({ model, actions, slots }) {
  const busy = Boolean(model.busy.submitting)
  const complete = model.taskSpec ? ['setup', 'actions', 'result', 'reflection'].every((field) => model.evidence[field]?.trim()) : Boolean(model.content.trim())
  if (model.phase === 'review') return <>
    <BuildBrief taskSpec={model.taskSpec} actions={actions} model={model} />
    <section className="build-submission-review ui-panel p-4" aria-labelledby="build-submission-review-title">
      <h3 id="build-submission-review-title" className="text-base font-semibold ui-text">Review your submission</h3>
      {model.taskSpec
        ? <dl className="mt-3 grid gap-3 sm:grid-cols-2">{[['setup', 'Setup'], ['actions', 'Actions taken'], ['result', 'Observed result'], ['reflection', 'Reflection']].map(([field, label]) => <div key={field}><dt className="text-xs font-medium ui-text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm ui-text-secondary">{model.evidence[field]}</dd></div>)}</dl>
        : <pre className="mt-3 whitespace-pre-wrap break-words text-sm ui-text-secondary">{model.content}</pre>}
    </section>
    {model.error && <div className="ui-alert ui-alert-danger mb-4" role="alert">{model.error}</div>}
    <div className="mt-5 flex flex-wrap justify-center gap-3"><button type="button" onClick={() => actions.setPhase('evidence')} disabled={busy} className="ui-button ui-button-secondary">Edit evidence</button><button type="button" onClick={actions.submit} disabled={busy || !complete} className="ui-button ui-button-primary min-h-10 px-6 py-2.5 text-sm">{busy ? 'Evaluating…' : 'Submit Build'}</button><button type="button" onClick={actions.returnToTrail} disabled={busy} className="ui-button ui-button-quiet">Cancel</button></div>
  </>
  return <>
    <BuildBrief taskSpec={model.taskSpec} actions={actions} model={model} />
    <BuildRubric model={model} actions={actions} />
    {model.error && <div className="ui-alert ui-alert-danger mb-4" role="alert">{model.error}</div>}
    {model.taskSpec ? <div className="build-evidence-fields space-y-3">{[['setup', 'Setup'], ['actions', 'Actions taken'], ['result', 'Observed result'], ['reflection', 'Reflection']].map(([field, label]) => <label key={field} className="block ui-field-label">{label}<textarea aria-label={label} value={model.evidence[field]} onChange={(event) => actions.setEvidence(field, event.target.value)} rows={3} disabled={busy} className="ui-field mt-1 w-full resize-none disabled:cursor-not-allowed" /></label>)}</div> : slots.genericArtifactInput}
    <div className="mt-5 flex flex-wrap justify-center gap-3"><button type="button" onClick={actions.reviewSubmission} disabled={busy || !complete} className="ui-button ui-button-secondary min-h-10 px-5 py-2.5 text-sm">Review submission</button><button type="button" onClick={actions.submit} disabled={busy || !complete} className="ui-button ui-button-primary min-h-10 px-6 py-2.5 text-sm">{busy ? 'Evaluating…' : 'Submit Build'}</button><button type="button" onClick={actions.returnToTrail} disabled={busy} className="ui-button ui-button-quiet min-h-10 px-4 py-2.5 text-sm">Cancel</button></div>
  </>
}
