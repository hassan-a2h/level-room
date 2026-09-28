import OnboardingSurface from '../../../core/OnboardingSurface.jsx'
import styles from './OnboardingView.module.css'

export default function OnboardingView({ model }) {
  return <OnboardingSurface model={model} variant="mission-workshop" className={styles.root} />
}
