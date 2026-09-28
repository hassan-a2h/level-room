import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('theme asset check succeeds without changing checked-in assets', async () => {
  const run = () => spawnSync(process.execPath, ['scripts/optimize-theme-assets.mjs', '--check'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  const themeRoot = path.join(process.cwd(), 'client/src/assets/themes')
  const snapshot = async () => {
    const files = []
    for (const theme of ['curiosity-engine', 'mission-workshop', 'living-atlas']) {
      for (const file of await readdir(path.join(themeRoot, theme))) {
        const location = path.join(theme, file)
        files.push([location, await readFile(path.join(themeRoot, location), 'utf8')])
      }
    }
    return files.sort(([first], [second]) => first.localeCompare(second))
  }

  const beforeFiles = snapshot()
  const before = run()
  assert.equal(before.status, 0, before.stderr || before.stdout)

  const after = run()
  assert.equal(after.status, 0, after.stderr || after.stdout)
  assert.equal(after.stdout, before.stdout)
  const [initial, final] = await Promise.all([beforeFiles, snapshot()])
  assert.deepEqual(final, initial)
})
