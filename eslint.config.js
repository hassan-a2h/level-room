import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'client/dist/**'],
  },
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, describe: 'readonly', expect: 'readonly', it: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    // useThemeView returns a lazy component cached by theme and view name; its
    // identity is stable even though the hook selects it from theme context.
    files: [
      'client/src/__tests__/useThemeView.test.jsx',
      'client/src/components/ReviewSession.jsx',
      'client/src/components/build/BuildExperience.jsx',
      'client/src/components/session/SessionPlayer.jsx',
      'client/src/pages/ContinuationFlow.jsx',
      'client/src/pages/Dashboard.jsx',
      'client/src/pages/OnboardingFlow.jsx',
      'client/src/pages/ReviewQueue.jsx',
      'client/src/pages/SettingsPage.jsx',
      'client/src/pages/SupportPage.jsx',
    ],
    rules: { 'react-hooks/static-components': 'off' },
  },
  {
    // These effects intentionally synchronize with browser/network state or
    // start asynchronous route loading; the immediate state marks that work.
    files: [
      'client/src/components/OfflineIndicator.jsx',
      'client/src/components/trail/ChapterCard.jsx',
      'client/src/features/reviews/controller.js',
      'client/src/features/session/controller.js',
      'client/src/features/continuation/useContinuationController.js',
      'client/src/features/onboarding/useOnboardingController.js',
      'client/src/features/trail/useTrailController.js',
      'client/src/pages/CheckpointPage.jsx',
      'client/src/pages/ContinuationFlow.jsx',
      'client/src/pages/OnboardingFlow.jsx',
      'client/src/pages/SessionPage.jsx',
    ],
    rules: { 'react-hooks/set-state-in-effect': 'off' },
  },
]
