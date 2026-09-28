import { Link } from 'react-router-dom'
import styles from './SessionView.module.css'

export default function SessionView({ model, actions, slots }) {
  const progress = model.progress || {}
  const percent = Number.isFinite(progress.percent) ? progress.percent : 0
  return <main data-theme-view="SessionView" data-view-model="connected" className={styles.root}>
    <div className={styles.container}>
      <header className={styles.header}><Link to="/" className={styles.back}>← Trail</Link><div><p className={styles.kicker}>CURRENT SESSION</p><h1>{model.session?.title || 'Session'}</h1><span>{model.session?.module_title || 'Focused practice'}</span></div><strong>{progress.completed ?? 0}/{progress.total ?? model.blocks.length}</strong></header>
      {model.state === 'complete' ? <section className={styles.complete}>{slots.activity}</section> : <>
        <section className={styles.meter} aria-label="Session progress"><div className={styles.meterCopy}><span>Session progress</span><strong>{progress.completed ?? 0} of {progress.total ?? model.blocks.length}</strong></div><div className={styles.track} role="progressbar" aria-label="Session progress" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${percent}%` }} /></div></section>
        {model.reviewMode && <div className={styles.review} role="status"><span>Review mode</span><p>Saved work cannot be changed while revisiting a step.</p><button type="button" onClick={actions.returnToCurrentBlock}>Return to current step</button></div>}
        <div className={styles.stage}><section className={styles.activity} aria-label="Session activity">{slots.activity}</section><aside className={styles.guide} aria-label="Session guide">{slots.tutor}</aside></div>
      </>}
    </div>
  </main>
}
