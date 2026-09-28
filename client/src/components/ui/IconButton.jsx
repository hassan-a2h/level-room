export default function IconButton({ label, children, type = 'button', className = '', ...props }) {
  return <button {...props} type={type} aria-label={label} className={`ui-icon-button ${className}`.trim()}>{children}</button>
}
