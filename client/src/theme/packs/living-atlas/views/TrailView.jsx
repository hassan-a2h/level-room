export default function TrailView({ model, children }) {
  return (
    <main data-theme-view="TrailView" data-view-model={model ? 'connected' : 'placeholder'}>
      {children || <h1>Trail</h1>}
    </main>
  )
}
