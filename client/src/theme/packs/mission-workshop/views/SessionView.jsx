import { Link } from 'react-router-dom'
import styles from './SessionView.module.css'

export default function SessionView({ model, actions, slots }) {
  const progress = model.progress || {}
  const percent = Number.isFinite(progress.percent) ? progress.percent : 0
  return <main data-theme-view="SessionView" data-view-model="connected" className={styles.root}>
    <div className={styles.layout}>
      <header className={styles.header}><Link to="/" className={styles.back}>← RETURN / TRAIL</Link><div><p className={styles.kicker}>SESSION / ACTIVE</p><h1>{model.session?.title || 'Session'}</h1><span>{model.session?.module_title || 'Learning sequence'}</span></div><strong>{String(progress.completed ?? 0).padStart(2, '0')} / {String(progress.total ?? model.blocks.length).padStart(2, '0')}</strong></header>
      <section className={styles.work} aria-label="Session activity">
        {model.state === 'complete' ? slots.activity : <>
          <div className={styles.progress}><div><span>LEARNING SEQUENCE</span><strong>{percent}%</strong></div><div className={styles.track} role="progressbar" aria-label="Session progress" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${percent}%` }} /></div></div>
          {model.reviewMode && <div className={styles.review} role="status"><span>REVIEW / LOCKED RESPONSE</span><button type="button" onClick={actions.returnToCurrentBlock}>Return to current step</button></div>}
          {slots.activity}
        </>}
      </section>
      {model.state !== 'complete' && <aside className={styles.guide} aria-label="Session guide">{slots.tutor}</aside>}
    </div>
  </main>
}
