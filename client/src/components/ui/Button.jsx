const variants = {
  primary: 'ui-button ui-button-primary',
  secondary: 'ui-button ui-button-secondary',
  quiet: 'ui-button ui-button-quiet',
  destructive: 'ui-button ui-button-destructive',
}

export default function Button({ variant = 'primary', type = 'button', className = '', ...props }) {
  return <button type={type} className={`${variants[variant] || variants.primary} ${className}`.trim()} {...props} />
}
