import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

export const UI_BUDGETS = Object.freeze({
  sharedGzipBytes: 170_000,
  routeThemeGzipBytes: 230_000,
})

export const UI_ROUTES = Object.freeze([
  'src/pages/Dashboard.jsx',
  'src/pages/OnboardingFlow.jsx',
  'src/pages/ContinuationFlow.jsx',
  'src/pages/SettingsPage.jsx',
  'src/pages/SupportPage.jsx',
  'src/pages/ReviewQueue.jsx',
  'src/components/ReviewSession.jsx',
  'src/pages/SessionPage.jsx',
  'src/pages/CheckpointPage.jsx',
  'src/pages/NotFoundPage.jsx',
])

export const UI_THEMES = Object.freeze(['living-atlas', 'curiosity-engine', 'mission-workshop'])

export const UI_ROUTE_VIEWS = Object.freeze({
  'src/pages/Dashboard.jsx': 'TrailView',
  'src/pages/OnboardingFlow.jsx': 'OnboardingView',
  'src/pages/ContinuationFlow.jsx': 'ContinuationView',
  'src/pages/SettingsPage.jsx': 'SettingsView',
  'src/pages/SupportPage.jsx': 'SupportView',
  'src/pages/ReviewQueue.jsx': 'ReviewQueueView',
  'src/components/ReviewSession.jsx': 'ReviewSessionView',
  'src/pages/SessionPage.jsx': 'SessionView',
  'src/pages/CheckpointPage.jsx': 'CheckpointView',
  'src/pages/NotFoundPage.jsx': null,
})

function closure(manifest, roots, { includeDynamicImports = true, stopKeys = new Set() } = {}) {
  const visited = new Set()
  const chunks = new Set()
  const visit = (key) => {
    if (visited.has(key) || stopKeys.has(key)) return
    const chunk = manifest[key]
    if (!chunk) throw new Error(`Manifest import is missing: ${key}`)
    visited.add(key)
    chunks.add(chunk.file)
    for (const dependency of chunk.imports ?? []) visit(dependency)
    if (includeDynamicImports) {
      for (const dependency of chunk.dynamicImports ?? []) visit(dependency)
    }
  }

  for (const root of roots) visit(root)
  return chunks
}

function measureFiles(chunkFiles, files) {
  let gzipBytes = 0
  const missing = []
  for (const file of chunkFiles) {
    const content = files.get(file)
    if (!content) {
      missing.push(file)
      continue
    }
    gzipBytes += gzipSync(content).byteLength
  }
  if (missing.length) throw new Error(`Manifest output files are missing: ${missing.join(', ')}`)
  return { files: [...chunkFiles].sort(), gzipBytes }
}

export function measureBudgets({ manifest, files, routes = UI_ROUTES, themes = UI_THEMES, budgets = UI_BUDGETS, routeViews = UI_ROUTE_VIEWS }) {
  const entryKeys = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry).map(([key]) => key)
  if (entryKeys.length !== 1) throw new Error(`Expected one UI entry in manifest; found ${entryKeys.length}.`)

  const shared = measureFiles(closure(manifest, entryKeys, { includeDynamicImports: false }), files)
  const routeKeys = routes.map((route) => Object.hasOwn(manifest, route) ? route : null)
  const missingRoutes = routes.filter((_, index) => !routeKeys[index])
  if (missingRoutes.length) throw new Error(`Manifest is missing route entries: ${missingRoutes.join(', ')}`)

  const scenarios = []
  const sharedFiles = new Set(shared.files)
  for (const route of routes) {
    const viewName = routeViews[route]
    if (!Object.hasOwn(routeViews, route)) throw new Error(`No selected-theme view is configured for route ${route}.`)
    for (const theme of themes) {
      const viewKey = viewName && `src/theme/packs/${theme}/views/${viewName}.jsx`
      if (viewKey && !Object.hasOwn(manifest, viewKey)) throw new Error(`Manifest is missing theme view ${viewKey}.`)
      const scenarioFiles = new Set(sharedFiles)
      const routeClosure = closure(manifest, [route, ...(viewKey ? [viewKey] : [])], {
        stopKeys: new Set(entryKeys),
      })
      for (const file of routeClosure) scenarioFiles.add(file)
      const measured = measureFiles(scenarioFiles, files)
      scenarios.push({ name: `${route} + ${theme}`, ...measured })
    }
  }

  const failures = []
  if (shared.gzipBytes > budgets.sharedGzipBytes) {
    failures.push({ name: 'shared entry', gzipBytes: shared.gzipBytes, budgetBytes: budgets.sharedGzipBytes })
  }
  for (const scenario of scenarios) {
    if (scenario.gzipBytes > budgets.routeThemeGzipBytes) {
      failures.push({ name: scenario.name, gzipBytes: scenario.gzipBytes, budgetBytes: budgets.routeThemeGzipBytes })
    }
  }
  return { shared, scenarios, failures }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const manifestPath = path.join(root, 'dist/.vite/manifest.json')
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read ${path.relative(root, manifestPath)}; run npm run build first. ${error.message}`)
  }

  const files = new Map()
  for (const { file } of Object.values(manifest)) {
    if (!files.has(file)) files.set(file, await readFile(path.join(root, 'dist', file)))
  }
  const result = measureBudgets({ manifest, files })
  process.stdout.write(`UI gzip budgets: shared entry ${result.shared.gzipBytes}/${UI_BUDGETS.sharedGzipBytes} bytes; ${result.scenarios.length} route-theme closures checked.\n`)
  if (result.failures.length) {
    process.stderr.write(`UI gzip budget failures:\n${result.failures.map(({ name, gzipBytes, budgetBytes }) => `- ${name}: ${gzipBytes} bytes exceeds ${budgetBytes}`).join('\n')}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
