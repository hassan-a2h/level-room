export default function SessionView({ model, children }) {
  return <div className="learning-surface learning-surface--curiosity" data-theme-view="SessionView" data-view-model={model ? 'connected' : 'placeholder'}>{children}</div>
}
