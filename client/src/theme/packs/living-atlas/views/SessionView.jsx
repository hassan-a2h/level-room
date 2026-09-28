import { Link } from 'react-router-dom'
import styles from './SessionView.module.css'

export default function SessionView({ model, actions, slots }) {
  const progress = model.progress || {}
  const percent = Number.isFinite(progress.percent) ? progress.percent : 0
  return <main data-theme-view="SessionView" data-view-model="connected" data-session-theme-surface className={styles.root}>
    <div className={styles.layout}>
      <header className={styles.header}><Link to="/" className={styles.back}>← Back to Trail</Link><div><p className={styles.kicker}>SESSION / {model.session?.module_title || 'LEARNING'}</p><h1>{model.session?.title || 'Session'}</h1></div><strong>{progress.completed ?? 0} of {progress.total ?? model.blocks.length} steps</strong></header>
      <section className={styles.work} aria-label="Session activity">
        {model.state === 'complete' ? slots.activity : <>
          <header className={styles.progress}><div><span className={styles.kicker}>FIELD NOTES</span><strong>{progress.completed ?? 0} / {progress.total ?? model.blocks.length} steps</strong></div><div className={styles.track} role="progressbar" aria-label="Session progress" aria-valuetext={progress.textual} aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${percent}%` }} /></div></header>
          {model.reviewMode && <div className={styles.review}><span>Reviewing a completed step. Your saved response cannot be changed.</span><button type="button" onClick={actions.returnToCurrentBlock}>Return to current step</button></div>}
          {slots.activity}
        </>}
      </section>
      {model.state !== 'complete' && <aside className={styles.guide} aria-label="Session guide">{slots.tutor}</aside>}
    </div>
  </main>
}
