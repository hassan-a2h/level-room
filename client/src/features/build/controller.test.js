import { describe, expect, it } from 'vitest'
import { buildBuildViewModel, createBuildState, validateBuildImport } from './controller.js'

function textFile(name, text, size = new TextEncoder().encode(text).byteLength) {
  const bytes = new TextEncoder().encode(text)
  return { name, size, arrayBuffer: async () => bytes.buffer }
}

describe('Build controller model', () => {
  it('keeps an absent task spec distinct from an empty task spec', () => {
    expect(buildBuildViewModel().taskSpec).toBeNull()
  })

  it('retains evidence drafts and disclosure state', () => {
    const model = buildBuildViewModel(createBuildState({
      phase: 'evidence', taskSpec: { title: 'Inspect a dataset' },
      evidence: { setup: 'loaded sample', actions: 'filtered rows', result: 'fewer rows', reflection: 'repeatable' },
      currentEvidenceStep: 'result', showHints: true,
    }))

    expect(model).toMatchObject({
      phase: 'evidence', currentEvidenceStep: 'result',
      evidence: { setup: 'loaded sample', actions: 'filtered rows', result: 'fewer rows', reflection: 'repeatable' },
      ui: { showHints: true },
    })
  })

  it('accepts only bounded UTF-8 text files using supported extensions', async () => {
    await expect(validateBuildImport(textFile('notes.MD', 'A short note'))).resolves.toEqual({ fileName: 'notes.MD', content: 'A short note' })
    await expect(validateBuildImport(textFile('data.csv', 'a,b\n1,2', 256 * 1024))).resolves.toMatchObject({ fileName: 'data.csv' })
    await expect(validateBuildImport(textFile('image.png', 'no'))).rejects.toThrow(/\.txt, \.md, \.json, or \.csv/)
    await expect(validateBuildImport(textFile('big.txt', 'x', 256 * 1024 + 1))).rejects.toThrow(/256 KiB/)
    const invalidUtf8 = { name: 'broken.txt', size: 1, arrayBuffer: async () => Uint8Array.from([0xff]).buffer }
    await expect(validateBuildImport(invalidUtf8)).rejects.toThrow(/valid UTF-8/)
  })
})
