import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { test } from 'node:test'
import { measureBudgets, UI_BUDGETS } from './check-ui-budgets.mjs'

const manifest = {
  'index.html': { file: 'assets/index.js', isEntry: true, imports: ['chunks/shared.js'], dynamicImports: ['pages/dashboard.js'] },
  'chunks/shared.js': { file: 'assets/shared.js', imports: [], dynamicImports: [] },
  'pages/dashboard.js': { file: 'assets/dashboard.js', imports: ['chunks/shared.js'], dynamicImports: [] },
  'pages/onboarding.js': { file: 'assets/onboarding.js', imports: ['chunks/shared.js'], dynamicImports: [] },
  'src/theme/packs/living-atlas/views/TrailView.jsx': { file: 'assets/living-atlas.js', imports: ['chunks/shared.js'], dynamicImports: ['lazy-child.js'] },
  'src/theme/packs/curiosity-engine/views/TrailView.jsx': { file: 'assets/curiosity-view.js', imports: ['chunks/shared.js'], dynamicImports: [] },
  'lazy-child.js': { file: 'assets/lazy-child.js', imports: [], dynamicImports: [] },
  'orphan.js': { file: 'assets/orphan.js', imports: [], dynamicImports: [] },
}

const files = new Map([
  ['assets/index.js', Buffer.from('entry')],
  ['assets/shared.js', Buffer.from('shared')],
  ['assets/dashboard.js', Buffer.from('dashboard')],
  ['assets/onboarding.js', Buffer.from('onboarding')],
  ['assets/living-atlas.js', Buffer.from('theme')],
  ['assets/curiosity-view.js', Buffer.from('other-theme')],
  ['assets/lazy-child.js', Buffer.from('lazy child')],
  ['assets/orphan.js', Buffer.from('orphan')],
])

test('measures deduplicated shared and route-theme closures through static and dynamic imports', () => {
  const result = measureBudgets({ manifest, files, routes: ['pages/dashboard.js'], themes: ['living-atlas'], routeViews: { 'pages/dashboard.js': 'TrailView' } })
  const expected = ['assets/index.js', 'assets/shared.js']
    .reduce((total, file) => total + gzipSync(files.get(file)).byteLength, 0)

  assert.equal(result.shared.files.length, 2)
  assert.equal(result.shared.gzipBytes, expected)
  assert.deepEqual(result.scenarios.map(({ name }) => name), ['pages/dashboard.js + living-atlas'])
  assert.equal(result.scenarios[0].files.length, 5)
  assert.equal(result.scenarios[0].files.includes('assets/lazy-child.js'), true)
  assert.equal(result.scenarios[0].files.filter((file) => file === 'assets/shared.js').length, 1)
})

test('reports a route-theme closure when its gzip budget is exceeded', () => {
  const result = measureBudgets({
    manifest,
    files,
    routes: ['pages/dashboard.js'],
    themes: ['living-atlas'],
    routeViews: { 'pages/dashboard.js': 'TrailView' },
    budgets: { sharedGzipBytes: Infinity, routeThemeGzipBytes: 1 },
  })

  assert.deepEqual(result.failures.map(({ name }) => name), ['pages/dashboard.js + living-atlas'])
})

test('reports missing imports instead of silently undercounting a closure', () => {
  const brokenManifest = {
    ...manifest,
    'pages/dashboard.js': { ...manifest['pages/dashboard.js'], imports: ['missing.js'] },
  }

  assert.throws(
    () => measureBudgets({ manifest: brokenManifest, files, routes: ['pages/dashboard.js'], themes: ['living-atlas'], routeViews: { 'pages/dashboard.js': 'TrailView' } }),
    /missing\.js/,
  )
})

test('uses the selected route and its single selected theme view instead of all pack views', () => {
  const result = measureBudgets({ manifest, files, routes: ['pages/dashboard.js'], themes: ['living-atlas', 'curiosity-engine'], routeViews: { 'pages/dashboard.js': 'TrailView' } })
  const atlas = result.scenarios.find(({ name }) => name.endsWith('living-atlas'))
  const curiosity = result.scenarios.find(({ name }) => name.endsWith('curiosity-engine'))

  assert.equal(atlas.files.includes('assets/living-atlas.js'), true)
  assert.equal(atlas.files.includes('assets/curiosity-view.js'), false)
  assert.equal(curiosity.files.includes('assets/curiosity-view.js'), true)
  assert.equal(curiosity.files.includes('assets/living-atlas.js'), false)
})

test('requires an explicit selected-theme view entry for each route', () => {
  assert.throws(() => measureBudgets({ manifest, files, routes: ['pages/onboarding.js'], themes: ['living-atlas'], routeViews: { 'pages/onboarding.js': 'OnboardingView' } }), /manifest is missing theme view/i)
})

test('enforces the planned 170KB shared and 230KB route-theme limits', () => {
  assert.deepEqual(UI_BUDGETS, { sharedGzipBytes: 170_000, routeThemeGzipBytes: 230_000 })
})
