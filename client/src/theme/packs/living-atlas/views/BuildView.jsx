import { BuildEvidenceFields, BuildResult, BuildStageIndicator } from '../../../core/BuildSections.jsx'
import styles from './BuildView.module.css'

export default function BuildView({ model, actions, slots }) {
  const active = model.evaluation ? 'Result' : model.busy.submitting ? 'Evaluating' : model.phase === 'review' ? 'Review' : model.taskSpec ? 'Evidence' : 'Brief'
  return <section data-theme-view="BuildView" data-view-model="connected" className={styles.root}>
    <header className={styles.heading}><div><p className={styles.kicker}>PRACTICE INTO THE WORLD</p><h2>Build</h2></div><span>{model.taskSpec ? 'Field project' : model.artifactType || 'Artifact'}</span></header>
    <BuildStageIndicator active={active} busy={model.busy.submitting} className={styles.stages} />
    {model.evaluation ? <><BuildResult model={model} actions={actions} />{model.evaluation.passed && <div className={styles.finish}><button type="button" className="ui-button ui-button-primary" onClick={actions.returnToTrail}>{model.previousEvidence ? 'Continue Trail' : 'Back to Session'}</button></div>}</> : <BuildEvidenceFields model={model} actions={actions} slots={slots} />}
  </section>
}
