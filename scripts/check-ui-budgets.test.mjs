import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { test } from 'node:test'
import { measureBudgets } from './check-ui-budgets.mjs'

const manifest = {
  'index.html': { file: 'assets/index.js', isEntry: true, imports: ['chunks/shared.js'], dynamicImports: ['pages/dashboard.js'] },
  'chunks/shared.js': { file: 'assets/shared.js', imports: [], dynamicImports: [] },
  'pages/dashboard.js': { file: 'assets/dashboard.js', imports: ['chunks/shared.js'], dynamicImports: ['src/theme/packs/living-atlas/views/LivingView.jsx'] },
  'src/theme/packs/living-atlas/views/LivingView.jsx': { file: 'assets/living-atlas.js', imports: ['chunks/shared.js'], dynamicImports: [] },
  'orphan.js': { file: 'assets/orphan.js', imports: [], dynamicImports: [] },
}

const files = new Map([
  ['assets/index.js', Buffer.from('entry')],
  ['assets/shared.js', Buffer.from('shared')],
  ['assets/dashboard.js', Buffer.from('dashboard')],
  ['assets/living-atlas.js', Buffer.from('theme')],
  ['assets/orphan.js', Buffer.from('orphan')],
])

test('measures deduplicated shared and route-theme closures through static and dynamic imports', () => {
  const result = measureBudgets({ manifest, files, routes: ['pages/dashboard.js'], themes: ['living-atlas'] })
  const expected = ['assets/index.js', 'assets/shared.js']
    .reduce((total, file) => total + gzipSync(files.get(file)).byteLength, 0)

  assert.equal(result.shared.files.length, 2)
  assert.equal(result.shared.gzipBytes, expected)
  assert.deepEqual(result.scenarios.map(({ name }) => name), ['pages/dashboard.js + living-atlas'])
  assert.equal(result.scenarios[0].files.length, 4)
  assert.equal(result.scenarios[0].files.filter((file) => file === 'assets/shared.js').length, 1)
})

test('reports a route-theme closure when its gzip budget is exceeded', () => {
  const result = measureBudgets({
    manifest,
    files,
    routes: ['pages/dashboard.js'],
    themes: ['living-atlas'],
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
    () => measureBudgets({ manifest: brokenManifest, files, routes: ['pages/dashboard.js'], themes: ['living-atlas'] }),
    /missing\.js/,
  )
})
