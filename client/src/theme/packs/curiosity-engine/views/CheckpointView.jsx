import CheckpointSurface from '../../../core/CheckpointSurface.jsx'
import styles from './CheckpointView.module.css'

export default function CheckpointView({ model }) {
  return <CheckpointSurface model={model} variant="curiosity" className={styles.root} />
}
