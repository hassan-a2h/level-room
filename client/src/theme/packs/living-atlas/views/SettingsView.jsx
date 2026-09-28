import styles from './SettingsView.module.css'
import { SettingsCategoryContent, SettingsCategoryNav } from '../../../core/SettingsSections.jsx'

export default function SettingsView({ model, actions, slots }) {
  return <main data-theme-view="SettingsView" className={`${styles.root} settings-view settings-view--atlas`}>
    <div className={styles.container}>
      <header className={styles.hero}><p className={styles.kicker}>Your learning field guide</p><h1>Settings</h1><p>Shape the space around your learning and keep your work in your hands.</p></header>
      <SettingsCategoryNav model={model} actions={actions} />
      <SettingsCategoryContent model={model} actions={actions} slots={slots} />
    </div>
  </main>
}
