export default function LearningObjectStage({ title, eyebrow, children, className = '' }) {
  return (
    <section className={`learning-object-stage ${className}`.trim()} aria-label={title}>
      {eyebrow && <p className="learning-object-stage__eyebrow">{eyebrow}</p>}
      <h2 className="learning-object-stage__title">{title}</h2>
      <div className="learning-object-stage__content">{children}</div>
    </section>
  )
}
