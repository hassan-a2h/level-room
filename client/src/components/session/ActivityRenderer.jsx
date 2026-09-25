import ChoiceBlock from './ChoiceBlock.jsx'
import OrderingBlock from './OrderingBlock.jsx'
import ReadBlock from './ReadBlock.jsx'
import ReflectionBlock from './ReflectionBlock.jsx'
import ShortAnswerBlock from './ShortAnswerBlock.jsx'
import WorkedExampleBlock from './WorkedExampleBlock.jsx'

export default function ActivityRenderer({ block, persistedBlockState = {}, busy = false, error = '', onComplete, onSubmit, readOnly = false }) {
  if (!block || typeof block.type !== 'string') return <div className="session-unknown-block" role="alert">This activity cannot be opened. Return to your Trail and try again.</div>
  const props = { block, persistedBlockState, busy, onComplete, onSubmit, readOnly }
  switch (block.type) {
    case 'read': return <ReadBlock {...props} />
    case 'worked_example': return <WorkedExampleBlock {...props} />
    case 'choice': return <ChoiceBlock {...props} />
    case 'ordering': return <OrderingBlock {...props} />
    case 'short_answer': return <ShortAnswerBlock {...props} />
    case 'reflection': return <ReflectionBlock {...props} />
    default: return <div className="session-unknown-block" role="alert"><h3>Unsupported activity</h3><p>This step can’t be completed safely. Your saved progress is still here; return to your Trail for help.</p></div>
  }
}
