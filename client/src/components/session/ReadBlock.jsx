import MarkdownContent from '../MarkdownContent.jsx'

export default function ReadBlock({ block, persistedBlockState = {}, busy = false, onComplete, readOnly = false }) {
  return (
    <div className="session-block-body">
      <MarkdownContent content={block.content} />
      {persistedBlockState.status === 'completed' || readOnly
        ? <p className="session-complete-label" role="status">Read and saved</p>
        : <button type="button" className="ui-button ui-button-primary" disabled={busy} onClick={() => onComplete?.({ action: 'continue' })}>Continue</button>}
    </div>
  )
}
