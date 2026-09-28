import SupportSurface from '../../../core/SupportSurface.jsx'
import styles from './SupportView.module.css'

export default function SupportView({ model, actions }) {
  return <main data-theme-view="SupportView" className={styles.root}><SupportSurface model={model} actions={actions} /></main>
}
