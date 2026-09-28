import ReviewSessionSurface from '../../../core/ReviewSessionSurface.jsx'
import styles from './ReviewSessionView.module.css'

export default function ReviewSessionView({ model }) {
  return <ReviewSessionSurface model={model} variant="curiosity" className={styles.root} />
}
