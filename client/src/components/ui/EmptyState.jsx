export default function EmptyState({ title, children, action, className = '' }) {
  return (
    <section className={`ui-empty-state ${className}`.trim()} aria-label={title}>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </section>
  )
}
