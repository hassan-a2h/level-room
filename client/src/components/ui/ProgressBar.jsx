export default function ProgressBar({ value, max = 100, label, className = '' }) {
  const safeMax = Number.isFinite(Number(max)) && Number(max) > 0 ? Number(max) : 100
  const safeValue = Number.isFinite(Number(value)) ? Math.min(safeMax, Math.max(0, Number(value))) : 0
  const percent = (safeValue / safeMax) * 100
  return (
    <div className={`ui-progress ${className}`.trim()}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        className="ui-progress-track"
      >
        <div className="ui-progress-value" style={{ width: `${percent}%` }} />
      </div>
      <span className="ui-progress-label">{safeValue} of {safeMax}</span>
    </div>
  )
}
