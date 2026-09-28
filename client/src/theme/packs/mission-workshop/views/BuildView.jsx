export default function BuildView({ model, children }) {
  return (
    <main data-theme-view="BuildView" data-view-model={model ? 'connected' : 'placeholder'}>
      {children || <h1>Build</h1>}
    </main>
  )
}
