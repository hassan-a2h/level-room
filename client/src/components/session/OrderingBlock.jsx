import { useState } from 'react'
import ActivityFeedback from './ActivityFeedback.jsx'

export default function OrderingBlock({ block, persistedBlockState = {}, busy = false, onSubmit, readOnly = false }) {
  const [order, setOrder] = useState(() => {
    const response = persistedBlockState.response
    return Array.isArray(response) && response.length === block.items.length ? response : block.items.map((item) => item.id)
  })
  const disabled = busy || readOnly || persistedBlockState.status === 'passed'
  const move = (index, offset) => setOrder((current) => {
    const target = index + offset
    if (target < 0 || target >= current.length) return current
    const next = [...current]
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })
  const itemById = new Map(block.items.map((item) => [item.id, item]))
  return (
    <div className="session-block-body">
      <p className="session-prompt">{block.prompt}</p>
      <ol className="session-order-list" aria-label="Items to put in order">
        {order.map((id, index) => <li key={id}>
          <span className="session-order-index" aria-label={`Position ${index + 1}`}>{index + 1}</span>
          <span className="session-order-label">{itemById.get(id)?.label}</span>
          {!disabled && <div className="session-order-controls">
            <button type="button" aria-label={`Move ${itemById.get(id)?.label} up`} disabled={index === 0 || busy} onClick={() => move(index, -1)}>Move up</button>
            <button type="button" aria-label={`Move ${itemById.get(id)?.label} down`} disabled={index === order.length - 1 || busy} onClick={() => move(index, 1)}>Move down</button>
          </div>}
        </li>)}
      </ol>
      <ActivityFeedback>{persistedBlockState.feedback}</ActivityFeedback>
      {persistedBlockState.status === 'passed' || readOnly
        ? <p className="session-complete-label" role="status">Order saved</p>
        : <button type="button" className="ui-button ui-button-primary" disabled={busy} onClick={() => onSubmit?.(order)}>{busy ? 'Checking…' : persistedBlockState.status === 'needs_retry' ? 'Try again' : 'Check order'}</button>}
    </div>
  )
}
