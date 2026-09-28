import ContinuationSurface from '../../../core/ContinuationSurface.jsx'
import styles from './ContinuationView.module.css'

export default function ContinuationView({ model }) {
  return <ContinuationSurface model={model} variant="living-atlas" className={styles.root} />
}
