export default function ContinuationView({ model, children }) {
  return (
    <main data-theme-view="ContinuationView" data-view-model={model ? 'connected' : 'placeholder'}>
      {children || <h1>Continuation</h1>}
    </main>
  )
}
