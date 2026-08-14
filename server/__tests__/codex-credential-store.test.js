import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createCodexCredentialStore } from '../llm/codex-credential-store.js'

const providerId = 'openai-codex'
const credential = {
  type: 'oauth',
  access: 'access-token-fixture',
  refresh: 'refresh-token-fixture',
  expires: 1_900_000_000_000,
  accountId: 'account-id-fixture',
}

describe('Codex credential store', () => {
  const directories = new Set()

  afterEach(async () => {
    await Promise.all([...directories].map((directory) => fs.rm(directory, { recursive: true, force: true })))
    directories.clear()
  })

  async function makeStore() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmap-codex-auth-'))
    directories.add(directory)
    return { directory, store: createCodexCredentialStore({ directory }) }
  }

  async function saveViaLogin(store, value = credential) {
    const flowEpoch = await store.beginFlow()
    return store.runWithFlowEpoch(flowEpoch, () => store.modify(providerId, async () => value))
  }

  it('stores credentials while listing only provider and auth type', async () => {
    const { directory, store } = await makeStore()

    await saveViaLogin(store)

    await expect(store.read(providerId)).resolves.toEqual(credential)
    await expect(store.list()).resolves.toEqual([{ providerId, type: 'oauth' }])
    const metadata = JSON.stringify(await store.list())
    expect(metadata).not.toContain('access-token-fixture')
    expect(metadata).not.toContain('refresh-token-fixture')
    expect(metadata).not.toContain('account-id-fixture')

    if (process.platform !== 'win32') {
      const directoryMode = (await fs.stat(directory)).mode & 0o777
      const fileMode = (await fs.stat(path.join(directory, 'codex-auth.json'))).mode & 0o777
      expect(directoryMode).toBe(0o700)
      expect(fileMode).toBe(0o600)
    }
  })

  it('fails closed for malformed credential files', async () => {
    const { directory, store } = await makeStore()
    await fs.writeFile(path.join(directory, 'codex-auth.json'), '{broken', { mode: 0o600 })

    await expect(store.read(providerId)).rejects.toMatchObject({ code: 'CODEX_CREDENTIAL_STORE_CORRUPT' })
  })

  it('fails closed when a credential has no generation marker', async () => {
    const { directory, store } = await makeStore()
    await fs.writeFile(path.join(directory, 'codex-auth.json'), JSON.stringify({
      version: 1,
      credential,
      flowEpoch: 1,
      credentialGeneration: null,
    }), { mode: 0o600 })

    await expect(store.read(providerId)).rejects.toMatchObject({ code: 'CODEX_CREDENTIAL_STORE_CORRUPT' })
  })

  it('restores owner-only file permissions before returning a credential', async () => {
    const { directory, store } = await makeStore()
    await saveViaLogin(store)
    if (process.platform !== 'win32') {
      await fs.chmod(path.join(directory, 'codex-auth.json'), 0o644)
    }

    await store.read(providerId)

    if (process.platform !== 'win32') {
      expect((await fs.stat(path.join(directory, 'codex-auth.json'))).mode & 0o777).toBe(0o600)
    }
  })

  it('requires login or captured-generation context before changing credentials', async () => {
    const { store } = await makeStore()

    await expect(store.modify(providerId, async () => credential))
      .rejects.toMatchObject({ code: 'CODEX_CREDENTIAL_CONTEXT_REQUIRED' })
  })

  it('rejects stale login epochs and request generations after disconnect', async () => {
    const { store } = await makeStore()
    const oldEpoch = await store.beginFlow()
    const currentEpoch = await store.beginFlow()

    await expect(store.runWithFlowEpoch(oldEpoch, () => store.modify(providerId, async () => credential)))
      .rejects.toMatchObject({ code: 'CODEX_STALE_FLOW' })

    await store.runWithFlowEpoch(currentEpoch, () => store.modify(providerId, async () => credential))
    const generation = store.getStatusSync().credentialGeneration
    expect(generation).toEqual(expect.any(String))

    await store.runWithCredentialGeneration(generation, () => store.modify(
      providerId,
      async (current) => ({ ...current, expires: current.expires + 1 }),
    ))
    expect(store.getStatusSync().credentialGeneration).toBe(generation)

    await store.disconnect()
    expect(store.getStatusSync().credentialGeneration).not.toBe(generation)
    await expect(store.runWithCredentialGeneration(generation, () => store.read(providerId)))
      .rejects.toMatchObject({ code: 'CODEX_CREDENTIAL_CHANGED' })
  })

  it('serializes simultaneous first sign-ins across processes', async () => {
    const { directory, store } = await makeStore()
    const workerPath = fileURLToPath(new URL('./fixtures/codex-credential-store-worker.js', import.meta.url))
    const workers = [1, 2].map(() => fork(workerPath, [], {
      cwd: process.cwd(),
      env: { CODEX_STORE_DIRECTORY: directory },
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    }))
    const queues = workers.map((worker) => createMessageQueue(worker))
    const exits = workers.map((worker) => once(worker, 'exit'))
    try {
      await Promise.all(queues.map((queue) => queue.next('ready')))
      workers.forEach((worker) => worker.send({ type: 'begin' }))
      const results = await Promise.all(queues.map((queue) => queue.next('done')))
      expect(results.map((result) => result.flowEpoch).sort()).toEqual([1, 2])
      expect(store.getStatusSync()).toMatchObject({ connected: false })
    } finally {
      for (const worker of workers) {
        if (worker.connected) worker.kill()
      }
      await Promise.all(exits)
    }
  })

  it('serializes read-modify-write operations across worker processes', async () => {
    const { directory, store } = await makeStore()
    await saveViaLogin(store)

    const workerPath = fileURLToPath(new URL('./fixtures/codex-credential-store-worker.js', import.meta.url))
    const workers = [1, 2].map(() => fork(workerPath, [], {
      cwd: process.cwd(),
      env: { CODEX_STORE_DIRECTORY: directory },
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    }))
    const queues = workers.map((worker) => createMessageQueue(worker))
    const exits = workers.map((worker) => once(worker, 'exit'))
    try {
      await Promise.all(queues.map((queue) => queue.next('ready')))
      workers.forEach((worker) => worker.send({ type: 'modify' }))

      const entryPromises = queues.map(async (queue, index) => ({
        index,
        message: await queue.next('entered'),
      }))
      const first = await Promise.race(entryPromises)
      const firstEnteredIndex = first.index
      const secondIndex = firstEnteredIndex === 0 ? 1 : 0
      workers[firstEnteredIndex].send({ type: 'release' })

      const secondEntry = (await entryPromises[secondIndex]).message
      expect(secondEntry.incrementCount).toBe(1)
      workers[secondIndex].send({ type: 'release' })

      await Promise.all(queues.map((queue) => queue.next('done')))
      await Promise.all(exits)
      await expect(store.read(providerId)).resolves.toMatchObject({
        expires: credential.expires + 2,
      })
    } finally {
      for (const worker of workers) {
        if (worker.connected) worker.kill()
      }
      await Promise.all(exits)
    }
  })
})

function createMessageQueue(worker) {
  const messages = []
  const waiters = []
  worker.on('message', (message) => {
    const waiterIndex = waiters.findIndex((waiter) => waiter.type === message.type)
    if (waiterIndex >= 0) {
      waiters.splice(waiterIndex, 1)[0].resolve(message)
    } else {
      messages.push(message)
    }
  })
  worker.on('error', (error) => {
    while (waiters.length) waiters.shift().reject(error)
  })

  return {
    next(type) {
      const messageIndex = messages.findIndex((message) => message.type === type)
      if (messageIndex >= 0) return Promise.resolve(messages.splice(messageIndex, 1)[0])
      return new Promise((resolve, reject) => waiters.push({ type, resolve, reject }))
    },
  }
}
