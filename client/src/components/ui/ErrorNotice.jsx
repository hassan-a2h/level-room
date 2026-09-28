export default function ErrorNotice({ title = 'Something went wrong', children, action, className = '' }) {
  return (
    <section className={`ui-error-notice ${className}`.trim()} role="alert">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </section>
  )
}
