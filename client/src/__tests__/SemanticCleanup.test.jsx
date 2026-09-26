import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

function collectJsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : collectJsxFiles(path)
    return entry.isFile() && entry.name.endsWith('.jsx') ? [path] : []
  })
}

describe('semantic UI cleanup', () => {
  it('keeps all JSX screens free of fixed palette utilities', () => {
    const fixedPalette = /\b(?:bg|text|border|ring)-(?:white|gray|indigo|green|red|amber|yellow|orange)(?:-\d{2,3})?\b/
    const sourceRoot = join(process.cwd(), 'src')
    const offenders = collectJsxFiles(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return fixedPalette.test(source) ? [relative(sourceRoot, path)] : []
    })

    expect(offenders).toEqual([])
  })
})
