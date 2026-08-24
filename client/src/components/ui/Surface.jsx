export default function Surface({ variant = 'raised', className = '', ...props }) {
  return <section data-variant={variant} className={`ui-surface ui-surface-${variant} ${className}`.trim()} {...props} />
}
