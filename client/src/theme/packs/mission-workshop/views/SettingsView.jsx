import styles from './SettingsView.module.css'
import { SettingsCategoryContent, SettingsCategoryNav } from '../../../core/SettingsSections.jsx'

export default function SettingsView({ model, actions, slots }) {
  return <main data-theme-view="SettingsView" className={`${styles.root} settings-view settings-view--workshop`}>
    <header className={styles.hero}><p className={styles.kicker}>CONTROL / PREFERENCES</p><h1>Settings</h1><p>Configure your workspace and protect your learning record.</p></header>
    <div className={styles.workbench}>
      <aside className={styles.rail}><p className={styles.railLabel}>SYSTEM</p><SettingsCategoryNav model={model} actions={actions} /></aside>
      <div className={styles.content}><SettingsCategoryContent model={model} actions={actions} slots={slots} /></div>
    </div>
  </main>
}
