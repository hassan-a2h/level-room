import { once } from 'node:events'
import { createCodexCredentialStore } from '../../llm/codex-credential-store.js'

const store = createCodexCredentialStore({ directory: process.env.CODEX_STORE_DIRECTORY })
process.send({ type: 'ready' })

process.on('message', async (message) => {
  if (message.type === 'begin') {
    const flowEpoch = await store.beginFlow()
    process.send({ type: 'done', flowEpoch })
    process.disconnect()
    return
  }
  if (message.type !== 'modify') return

  const generation = store.getStatusSync().credentialGeneration
  await store.runWithCredentialGeneration(generation, () => store.modify('openai-codex', async (current) => {
    const incrementCount = (current?.expires ?? 1_900_000_000_000) - 1_900_000_000_000
    process.send({ type: 'entered', incrementCount })
    await once(process, 'message').then(([incoming]) => {
      if (incoming.type !== 'release') throw new Error('Unexpected coordination message.')
    })
    return { ...current, expires: (current?.expires ?? 1_900_000_000_000) + 1 }
  }))

  process.send({ type: 'done' })
  process.disconnect()
})
