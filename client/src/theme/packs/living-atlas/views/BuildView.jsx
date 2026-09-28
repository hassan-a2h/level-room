export default function BuildView({ model, children }) {
  return <div className="learning-surface learning-surface--atlas" data-theme-view="BuildView" data-view-model={model ? 'connected' : 'placeholder'}>{children}</div>
}
