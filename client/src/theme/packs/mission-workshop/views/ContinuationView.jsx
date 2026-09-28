import ContinuationSurface from '../../../core/ContinuationSurface.jsx'
import styles from './ContinuationView.module.css'

export default function ContinuationView({ model }) {
  return <ContinuationSurface model={model} variant="mission-workshop" className={styles.root} />
}
