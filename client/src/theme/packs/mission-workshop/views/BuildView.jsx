import { BuildEvidenceFields, BuildResult, BuildStageIndicator } from '../../../core/BuildSections.jsx'
import styles from './BuildView.module.css'

export default function BuildView({ model, actions, slots }) {
  const active = model.evaluation ? 'Result' : model.busy.submitting ? 'Evaluating' : model.phase === 'review' ? 'Review' : model.taskSpec ? 'Evidence' : 'Brief'
  return <section data-theme-view="BuildView" data-view-model="connected" className={styles.root}>
    <header className={styles.heading}><p className={styles.kicker}>WORKBENCH / BUILD 01</p><h2>Build</h2><span>{model.taskSpec ? 'FIELD TASK' : (model.artifactType || 'ARTIFACT').toUpperCase()}</span></header>
    <BuildStageIndicator active={active} busy={model.busy.submitting} className={styles.stages} />
    <div className={styles.workspace}>
      <aside className={styles.readout}><strong>SESSION STATUS</strong><span>{model.evaluation?.passed ? 'CHECKPOINT COMPLETE' : model.busy.submitting ? 'EVALUATING' : 'READY FOR EVIDENCE'}</span></aside>
      <div className={styles.work}>{model.evaluation ? <><BuildResult model={model} actions={actions} />{model.evaluation.passed && <div className={styles.finish}><button type="button" className="ui-button ui-button-primary" onClick={actions.returnToTrail}>{model.previousEvidence ? 'Continue Trail' : 'Back to Session'}</button></div>}</> : <BuildEvidenceFields model={model} actions={actions} slots={slots} />}</div>
    </div>
  </section>
}
