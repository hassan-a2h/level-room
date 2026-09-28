export default function ReviewSessionView({ model, children }) {
  return (
    <main data-theme-view="ReviewSessionView" data-view-model={model ? 'connected' : 'placeholder'}>
      {children || <h1>Review Session</h1>}
    </main>
  )
}
