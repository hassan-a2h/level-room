import ReviewQueueSurface from '../../../core/ReviewQueueSurface.jsx'
import styles from './ReviewQueueView.module.css'

export default function ReviewQueueView({ model }) {
  return <ReviewQueueSurface model={model} variant="workshop" className={styles.root} />
}
