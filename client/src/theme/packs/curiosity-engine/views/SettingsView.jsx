import styles from './SettingsView.module.css'

export default function SettingsView({ children }) {
  return <main data-theme-view="SettingsView" className={styles.root}>{children}</main>
}
