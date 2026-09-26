import { useEffect, useRef } from 'react'

export default function ActivityFeedback({ children }) {
  const region = useRef(null)
  useEffect(() => {
    if (children) region.current?.focus()
  }, [children])
  if (!children) return null
  return <div ref={region} className="session-feedback" role="region" aria-label="Activity feedback" aria-live="polite" tabIndex={-1}>{children}</div>
}
