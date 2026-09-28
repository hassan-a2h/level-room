import { useEffect } from 'react'

export default function Dialog({ open = false, title, onClose, children, className = '' }) {
  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="ui-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <section className={`ui-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title || 'Dialog'}>
        {title && <h2 className="ui-dialog__title">{title}</h2>}
        {children}
      </section>
    </div>
  )
}
