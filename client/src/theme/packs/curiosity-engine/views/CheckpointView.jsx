export default function CheckpointView({ model, children }) {
  return (
    <main data-theme-view="CheckpointView" data-view-model={model ? 'connected' : 'placeholder'}>
      {children || <h1>Checkpoint</h1>}
    </main>
  )
}
