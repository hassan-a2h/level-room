import styles from './SettingsView.module.css'
import { SettingsCategoryContent, SettingsCategoryNav } from '../../../core/SettingsSections.jsx'

export default function SettingsView({ model, actions, slots }) {
  return <main data-theme-view="SettingsView" className={`${styles.root} settings-view settings-view--curiosity`}>
    <div className={styles.container}>
      <header className={styles.hero}><span className={styles.mark} aria-hidden="true">✦</span><div><p className={styles.kicker}>Make it yours</p><h1>Settings</h1><p>Pick up the pace, choose a look, and tune your learning tools.</p></div></header>
      <SettingsCategoryNav model={model} actions={actions} />
      <div className={styles.content}><SettingsCategoryContent model={model} actions={actions} slots={slots} /></div>
    </div>
  </main>
}
