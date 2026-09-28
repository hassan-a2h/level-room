export default function SessionView({ model, children }) {
  return (
    <main data-theme-view="SessionView" data-view-model={model ? 'connected' : 'placeholder'}>
      {children || <h1>Session</h1>}
    </main>
  )
}
