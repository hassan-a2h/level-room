import { BuildEvidenceFields, BuildResult, BuildStageIndicator } from '../../../core/BuildSections.jsx'
import styles from './BuildView.module.css'

export default function BuildView({ model, actions, slots }) {
  const active = model.evaluation ? 'Result' : model.busy.submitting ? 'Evaluating' : model.taskSpec ? 'Evidence' : 'Brief'
  return <section data-theme-view="BuildView" data-view-model="connected" className={styles.root}>
    <header className={styles.heading}><div><span className={styles.spark} aria-hidden="true">✦</span><div><p className={styles.kicker}>MAKE SOMETHING REAL</p><h2>Build</h2></div></div><span className={styles.kind}>{model.taskSpec ? 'Project' : model.artifactType || 'Artifact'}</span></header>
    <BuildStageIndicator active={active} busy={model.busy.submitting} className={styles.stages} />
    <div className={styles.card}>
      {model.evaluation ? <><BuildResult model={model} actions={actions} />{model.evaluation.passed && <div className={styles.finish}><button type="button" className="ui-button ui-button-primary" onClick={actions.returnToTrail}>{model.previousEvidence ? 'Continue Trail' : 'Back to Session'}</button></div>}</> : <BuildEvidenceFields model={model} actions={actions} slots={slots} />}
    </div>
  </section>
}
