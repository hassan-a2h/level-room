export default function SupportView({ model, children }) {
  return (
    <main data-theme-view="SupportView" data-view-model={model ? 'connected' : 'placeholder'}>
      {children || <h1>Support</h1>}
    </main>
  )
}
