export default function SceneSkeleton({ label = 'Loading view…' }) {
  return (
    <div className="scene-skeleton" role="status" aria-label={label}>
      <span className="scene-skeleton__line scene-skeleton__line--wide" />
      <span className="scene-skeleton__line" />
      <span className="scene-skeleton__panel" />
    </div>
  )
}
