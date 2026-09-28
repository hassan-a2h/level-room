export default function OnboardingView({ model, children }) {
  return (
    <main data-theme-view="OnboardingView" data-view-model={model ? 'connected' : 'placeholder'}>
      {children || <h1>Onboarding</h1>}
    </main>
  )
}
