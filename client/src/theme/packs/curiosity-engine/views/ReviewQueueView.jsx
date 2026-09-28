export default function ReviewQueueView({ model, children }) {
  return (
    <main data-theme-view="ReviewQueueView" data-view-model={model ? 'connected' : 'placeholder'}>
      {children || <h1>Review Queue</h1>}
    </main>
  )
}
