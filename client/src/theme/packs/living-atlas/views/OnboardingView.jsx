import OnboardingSurface from '../../../core/OnboardingSurface.jsx'
import styles from './OnboardingView.module.css'

export default function OnboardingView({ model }) {
  return <OnboardingSurface model={model} variant="living-atlas" className={styles.root} />
}
