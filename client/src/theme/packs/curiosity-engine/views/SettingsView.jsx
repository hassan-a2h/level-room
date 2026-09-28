export default function SettingsView({ model, children }) {
  return (
    <main data-theme-view="SettingsView" data-view-model={model ? 'connected' : 'placeholder'}>
      {children || <h1>Settings</h1>}
    </main>
  )
}
