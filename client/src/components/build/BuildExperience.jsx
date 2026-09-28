import { useState } from 'react'
import { Suspense } from 'react'
import { useThemeView } from '../../theme/ThemeProvider.jsx'

function BuildThemeSurface({ model, actions, slots }) {
  const View = useThemeView('BuildView')
  return <Suspense fallback={<div className="session-loading-card" role="status">Preparing your Build…</div>}><View model={model} actions={actions} slots={slots} /></Suspense>
}

export default function BuildExperience({ controller, lesson, onBack }) {
  const { model: controllerModel } = controller
  const [phase, setPhase] = useState(controllerModel.taskSpec ? 'evidence' : 'brief')
  const [currentEvidenceStep, setCurrentEvidenceStep] = useState('setup')
  const [rubricOpen, setRubricOpen] = useState(false)
  const model = {
    ...controllerModel,
    estimatedTime: lesson?.estimated_time,
    phase,
    currentEvidenceStep,
    ui: { ...controllerModel.ui, showRubric: rubricOpen },
    previousContent: controller.previousContent,
    previousEvidence: controller.previousEvidence,
  }
  const actions = {
    begin: () => setPhase('evidence'),
    setPhase,
    setEvidence: controller.setEvidenceField,
    setContent: controller.setContent,
    selectFile: controller.importFile,
    nextEvidence: () => setCurrentEvidenceStep((step) => step === 'setup' ? 'actions' : step === 'actions' ? 'result' : step === 'result' ? 'reflection' : step),
    previousEvidence: () => setCurrentEvidenceStep((step) => step === 'reflection' ? 'result' : step === 'result' ? 'actions' : step === 'actions' ? 'setup' : step),
    openHints: () => { if (!controllerModel.ui.showHints) controller.toggleHints() },
    closeHints: () => { if (controllerModel.ui.showHints) controller.toggleHints() },
    openRubric: () => setRubricOpen(true),
    closeRubric: () => setRubricOpen(false),
    reviewSubmission: () => setPhase('review'),
    submit: controller.submit,
    revise: controller.revise,
    returnToTrail: onBack,
  }
  const isDesign = model.artifactType === 'design'
  const placeholder = isDesign
    ? 'Describe your design or upload a text file…'
    : model.artifactType === 'math'
      ? 'Type your math solution here…'
      : 'Paste your code or text solution here…'
  const slots = {
    genericArtifactInput: model.taskSpec ? null : <div className="build-evidence-fields space-y-3 mb-4">
      <label htmlFor="artifact-submission" className="ui-field-label">Your Build submission</label>
      <textarea id="artifact-submission" value={model.content} onChange={(event) => actions.setContent(event.target.value)} placeholder={placeholder} rows={isDesign ? 4 : 10} disabled={model.busy.submitting} className="ui-field w-full resize-none font-mono disabled:cursor-not-allowed" />
      {isDesign && <div className="flex flex-wrap items-center gap-3"><label className="ui-button ui-button-secondary min-h-10 cursor-pointer px-3 py-2 text-sm"><input type="file" accept=".txt,.md,.json,.csv,text/plain,text/markdown,application/json,text/csv" onChange={(event) => { actions.selectFile(event.target.files?.[0]); event.target.value = '' }} disabled={model.busy.submitting} className="hidden" />Upload File</label>{model.fileName && <span className="text-sm ui-text-secondary">{model.fileName}</span>}<span className="text-xs ui-text-muted">UTF-8 text only · Max 256 KiB (.txt, .md, .json, .csv)</span></div>}
    </div>,
  }
  return <BuildThemeSurface model={model} actions={actions} slots={slots} />
}
