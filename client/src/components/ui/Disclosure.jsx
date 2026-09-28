export default function Disclosure({ title, children, open, onToggle, className = '' }) {
  return (
    <details className={`ui-disclosure ${className}`.trim()} open={open} onToggle={onToggle}>
      <summary>{title}</summary>
      <div className="ui-disclosure__content">{children}</div>
    </details>
  )
}
