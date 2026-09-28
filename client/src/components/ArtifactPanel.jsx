import { useBuildController } from '../features/build/controller.js'
import BuildExperience from './build/BuildExperience.jsx'

export default function ArtifactPanel({ topicId, lessonId, lesson, onBack, onPassed }) {
  const controller = useBuildController({ topicId, lessonId, lesson, onPassed })
  return <BuildExperience controller={controller} lesson={lesson} onBack={onBack} />
}
