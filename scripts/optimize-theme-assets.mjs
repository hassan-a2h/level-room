import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEME_ART } from '../client/src/assets/themes/manifest.js'

const themesRoot = fileURLToPath(new URL('../client/src/assets/themes/', import.meta.url))
const themeIds = ['curiosity-engine', 'mission-workshop', 'living-atlas']
const assetKinds = ['orientation', 'trail', 'scenario', 'checkpoint', 'review', 'build']
const routeBudget = 1_500_000
const aboveFoldRasterBudget = 350_000
const mediaExtensions = new Set(['.svg', '.webp', '.png', '.jpg', '.jpeg', '.avif'])

function minifySvg(source) {
  return `${source
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/>\s+</g, '><')
    .trim()}\n`
}

async function mediaFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relative = path.join(prefix, entry.name)
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await mediaFiles(absolute, relative))
    else if (entry.isFile() && mediaExtensions.has(path.extname(entry.name).toLowerCase())) files.push(relative)
  }

  return files
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--check') || args.filter((arg) => arg === '--check').length > 1) {
    throw new Error('Usage: node scripts/optimize-theme-assets.mjs [--check]')
  }
  const checkOnly = args.includes('--check')
  const errors = []
  const expectedFiles = new Set()
  const routeBytes = new Map()
  let totalBytes = 0
  let assetCount = 0

  if (Object.keys(THEME_ART).sort().join(',') !== [...themeIds].sort().join(',')) {
    errors.push('Theme manifest must contain exactly the three supported theme packs.')
  }

  for (const themeId of themeIds) {
    const pack = THEME_ART[themeId]
    const keys = pack ? Object.keys(pack).sort() : []
    if (keys.join(',') !== [...assetKinds].sort().join(',')) {
      errors.push(`${themeId}: expected art keys ${assetKinds.join(', ')}.`)
      continue
    }

    for (const kind of assetKinds) {
      const asset = pack[kind]
      const label = `${themeId}/${kind}`
      if (!asset || !asset.src || !asset.routeFamily) {
        errors.push(`${label}: missing source or route-family metadata.`)
        continue
      }

      const sourceUrl = new URL(asset.src)
      const sourcePath = fileURLToPath(sourceUrl)
      const relativePath = path.relative(themesRoot, sourcePath)
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        errors.push(`${label}: source must remain inside the themes asset directory.`)
        continue
      }
      expectedFiles.add(relativePath)

      if (!Number.isInteger(asset.width) || asset.width <= 0
        || !Number.isInteger(asset.height) || asset.height <= 0
        || typeof asset.aspectRatio !== 'number'
        || Math.abs(asset.width / asset.height - asset.aspectRatio) > 0.001) {
        errors.push(`${label}: invalid dimensions or aspect-ratio metadata.`)
      }
      if (!asset.fallback?.background || !asset.fallback?.accent) {
        errors.push(`${label}: fallback background and accent are required.`)
      }

      let contents
      try {
        contents = await readFile(sourcePath, 'utf8')
      } catch {
        errors.push(`${label}: missing asset file ${relativePath}.`)
        continue
      }

      const extension = path.extname(sourcePath).toLowerCase()
      const optimized = extension === '.svg' ? minifySvg(contents) : contents
      const bytes = Buffer.byteLength(optimized)
      if (extension === '.svg') {
        const dimensions = optimized.match(/<svg\b[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/)
        if (!dimensions || Number(dimensions[1]) !== asset.width || Number(dimensions[2]) !== asset.height) {
          errors.push(`${label}: SVG intrinsic dimensions must match manifest metadata.`)
        }
        if (/<(?:script|foreignObject|text|image)\b|(?:href|xlink:href)="(?:https?:|data:)/i.test(optimized)) {
          errors.push(`${label}: SVG must not contain text, script, embedded rasters, or external resources.`)
        }
        if (asset.format !== 'svg') errors.push(`${label}: format metadata must match the SVG source.`)
        if (checkOnly && optimized !== contents) errors.push(`${label}: stale SVG output; run the optimizer to refresh it.`)
        if (!checkOnly && optimized !== contents) await writeFile(sourcePath, optimized)
      } else if (!['.webp', '.png', '.jpg', '.jpeg', '.avif'].includes(extension)) {
        errors.push(`${label}: unsupported asset format ${extension}.`)
      } else if (asset.format !== extension.slice(1)) {
        errors.push(`${label}: format metadata must match the raster source.`)
      }

      if (asset.aboveFold && extension !== '.svg' && bytes > aboveFoldRasterBudget) {
        errors.push(`${label}: above-fold raster is ${bytes} bytes; maximum is ${aboveFoldRasterBudget}.`)
      }
      routeBytes.set(asset.routeFamily, (routeBytes.get(asset.routeFamily) ?? 0) + bytes)
      totalBytes += bytes
      assetCount += 1
    }
  }

  for (const [routeFamily, bytes] of routeBytes) {
    if (bytes > routeBudget) errors.push(`${routeFamily}: route-family assets total ${bytes} bytes; maximum is ${routeBudget}.`)
  }

  for (const themeId of themeIds) {
    const directory = path.join(themesRoot, themeId)
    let actualFiles
    try {
      actualFiles = await mediaFiles(directory)
    } catch {
      errors.push(`${themeId}: missing theme asset directory.`)
      continue
    }
    for (const file of actualFiles) {
      const relativePath = path.join(themeId, file)
      if (!expectedFiles.has(relativePath)) errors.push(`${relativePath}: stale, unreferenced media output.`)
    }
  }

  if (errors.length) throw new Error(errors.join('\n'))
  process.stdout.write(`Theme art ${checkOnly ? 'check' : 'optimization'} passed: ${assetCount} assets, ${totalBytes} bytes.\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
