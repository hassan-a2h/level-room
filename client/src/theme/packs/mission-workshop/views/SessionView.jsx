export default function SessionView({ model, children }) {
  return <div className="learning-surface learning-surface--workshop" data-theme-view="SessionView" data-view-model={model ? 'connected' : 'placeholder'}>{children}</div>
}
