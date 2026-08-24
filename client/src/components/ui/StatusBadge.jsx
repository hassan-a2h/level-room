const allowed = new Set(['success', 'progress', 'warning', 'danger', 'neutral'])

export default function StatusBadge({ status = 'neutral', className = '', ...props }) {
  const safeStatus = allowed.has(status) ? status : 'neutral'
  return <span data-status={safeStatus} className={`ui-status ui-status-${safeStatus} ${className}`.trim()} {...props} />
}
