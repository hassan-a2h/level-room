import { AsyncLocalStorage } from 'node:async_hooks'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import lockfile from 'proper-lockfile'

export const CODEX_PROVIDER_ID = 'openai-codex'
const FILE_NAME = 'codex-auth.json'
const FILE_VERSION = 1
const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700
const LOCK_STALE_MS = 15_000

export class CodexCredentialStoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'CodexCredentialStoreError'
    this.code = code
  }
}

export function getCodexDataDirectory({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (platform === 'win32') {
    return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'roadmap-learning')
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'roadmap-learning')
  }
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'roadmap-learning')
}

export function createCodexCredentialStore({
  directory = getCodexDataDirectory(),
  staleMs = LOCK_STALE_MS,
  lockRetries = 20,
} = {}) {
  const resolvedDirectory = path.resolve(directory)
  const filePath = path.join(resolvedDirectory, FILE_NAME)
  const contexts = new AsyncLocalStorage()

  function emptyDocument() {
    return {
      version: FILE_VERSION,
      credential: null,
      flowEpoch: 0,
      credentialGeneration: null,
    }
  }

  function parseDocument(text) {
    let document
    try {
      document = JSON.parse(text)
    } catch {
      throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_CORRUPT', 'Codex connection data is unreadable.')
    }

    if (
      !document || typeof document !== 'object' || Array.isArray(document) ||
      document.version !== FILE_VERSION ||
      !Number.isSafeInteger(document.flowEpoch) || document.flowEpoch < 0 ||
      !(document.credentialGeneration === null || typeof document.credentialGeneration === 'string') ||
      (document.credential !== null && (typeof document.credentialGeneration !== 'string' || !document.credentialGeneration)) ||
      !(document.credential === null || isOAuthCredential(document.credential))
    ) {
      throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_CORRUPT', 'Codex connection data is unreadable.')
    }

    return {
      version: FILE_VERSION,
      credential: document.credential ? normalizeCredential(document.credential) : null,
      flowEpoch: document.flowEpoch,
      credentialGeneration: document.credentialGeneration,
    }
  }

  function readDocumentSync() {
    let stat
    try {
      stat = fsSync.lstatSync(filePath)
    } catch (error) {
      if (error.code === 'ENOENT') return emptyDocument()
      throw storageError(error)
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_UNSAFE_PATH', 'Codex connection data is unavailable at this path.')
    }
    try {
      return parseDocument(fsSync.readFileSync(filePath, 'utf8'))
    } catch (error) {
      if (error instanceof CodexCredentialStoreError) throw error
      throw storageError(error)
    }
  }

  async function readDocument() {
    try {
      const stat = await fs.lstat(filePath)
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_UNSAFE_PATH', 'Codex connection data is unavailable at this path.')
      }
      return parseDocument(await fs.readFile(filePath, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return emptyDocument()
      if (error instanceof CodexCredentialStoreError) throw error
      throw storageError(error)
    }
  }

  async function installInitialFile() {
    const tempPath = path.join(resolvedDirectory, `${FILE_NAME}.${process.pid}.${randomUUID()}.init`)
    let fileHandle
    try {
      fileHandle = await fs.open(tempPath, 'wx', FILE_MODE)
      await fileHandle.writeFile(JSON.stringify(emptyDocument()), 'utf8')
      await fileHandle.sync()
      await fileHandle.close()
      fileHandle = undefined
      try {
        await fs.link(tempPath, filePath)
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
    } finally {
      await fileHandle?.close().catch(() => {})
      await fs.rm(tempPath, { force: true }).catch(() => {})
    }
  }

  async function ensureStorage() {
    try {
      await fs.mkdir(resolvedDirectory, { recursive: true, mode: DIRECTORY_MODE })
      const directoryStat = await fs.lstat(resolvedDirectory)
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
        throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_UNSAFE_PATH', 'Codex connection storage is unavailable at this path.')
      }
      if (process.platform !== 'win32') await fs.chmod(resolvedDirectory, DIRECTORY_MODE)
      await installInitialFile()

      const fileStat = await fs.lstat(filePath)
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_UNSAFE_PATH', 'Codex connection data is unavailable at this path.')
      }
      if (process.platform !== 'win32') await fs.chmod(filePath, FILE_MODE)
    } catch (error) {
      if (error instanceof CodexCredentialStoreError) throw error
      throw storageError(error)
    }
  }

  function ensureStorageSync() {
    try {
      fsSync.mkdirSync(resolvedDirectory, { recursive: true, mode: DIRECTORY_MODE })
      const directoryStat = fsSync.lstatSync(resolvedDirectory)
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
        throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_UNSAFE_PATH', 'Codex connection storage is unavailable at this path.')
      }
      if (process.platform !== 'win32') fsSync.chmodSync(resolvedDirectory, DIRECTORY_MODE)

      const tempPath = path.join(resolvedDirectory, `${FILE_NAME}.${process.pid}.${randomUUID()}.init`)
      let descriptor
      try {
        descriptor = fsSync.openSync(tempPath, 'wx', FILE_MODE)
        fsSync.writeFileSync(descriptor, JSON.stringify(emptyDocument()), 'utf8')
        fsSync.fsyncSync(descriptor)
        fsSync.closeSync(descriptor)
        descriptor = undefined
        try {
          fsSync.linkSync(tempPath, filePath)
        } catch (error) {
          if (error.code !== 'EEXIST') throw error
        }
      } finally {
        if (descriptor !== undefined) fsSync.closeSync(descriptor)
        try { fsSync.unlinkSync(tempPath) } catch {}
      }

      const fileStat = fsSync.lstatSync(filePath)
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_UNSAFE_PATH', 'Codex connection data is unavailable at this path.')
      }
      if (process.platform !== 'win32') fsSync.chmodSync(filePath, FILE_MODE)
    } catch (error) {
      if (error instanceof CodexCredentialStoreError) throw error
      throw storageError(error)
    }
  }

  async function writeDocument(document, ensureLock) {
    ensureLock()
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
    let fileHandle
    try {
      fileHandle = await fs.open(tempPath, 'wx', FILE_MODE)
      await fileHandle.writeFile(JSON.stringify(document), 'utf8')
      await fileHandle.sync()
      await fileHandle.close()
      fileHandle = undefined
      ensureLock()
      await fs.rename(tempPath, filePath)
      if (process.platform !== 'win32') await fs.chmod(filePath, FILE_MODE)
      try {
        const directoryHandle = await fs.open(resolvedDirectory, 'r')
        await directoryHandle.sync()
        await directoryHandle.close()
      } catch {
        // Directory fsync is not available on every supported filesystem.
      }
    } catch (error) {
      throw error instanceof CodexCredentialStoreError ? error : storageError(error)
    } finally {
      await fileHandle?.close().catch(() => {})
      await fs.rm(tempPath, { force: true }).catch(() => {})
    }
  }

  async function withLock(operation) {
    await ensureStorage()
    let compromisedError
    let release
    try {
      release = await lockfile.lock(filePath, {
        stale: staleMs,
        update: Math.floor(staleMs / 3),
        retries: { retries: lockRetries, factor: 1.2, minTimeout: 20, maxTimeout: 100, randomize: true },
        onCompromised(error) { compromisedError = error },
      })
      const ensureLock = () => {
        if (compromisedError) {
          throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_LOCK_LOST', 'Codex connection storage lost its lock.')
        }
      }
      const result = await operation(ensureLock)
      ensureLock()
      return result
    } catch (error) {
      if (error instanceof CodexCredentialStoreError) throw error
      if (error.code === 'ELOCKED' || error.code === 'ECOMPROMISED') {
        throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_BUSY', 'Codex connection storage is busy. Please try again.')
      }
      throw storageError(error)
    } finally {
      if (release) {
        try { await release() } catch {}
      }
    }
  }

  async function disconnect(options = {}) {
    options.signal?.throwIfAborted()
    await withLock(async (ensureLock) => {
      const document = await readDocument()
      if (document.flowEpoch >= Number.MAX_SAFE_INTEGER) {
        throw new CodexCredentialStoreError('CODEX_FLOW_EPOCH_EXHAUSTED', 'Codex sign-in cannot start because connection state is invalid.')
      }
      await writeDocument({
        ...document,
        credential: null,
        flowEpoch: document.flowEpoch + 1,
        credentialGeneration: randomUUID(),
      }, ensureLock)
    })
  }

  function assertProvider(providerId) {
    if (providerId !== CODEX_PROVIDER_ID) {
      throw new CodexCredentialStoreError('CODEX_PROVIDER_UNSUPPORTED', 'This credential store only supports the Codex provider.')
    }
  }

  function assertContext(document) {
    const context = contexts.getStore()
    if (context?.flowEpoch !== undefined && context.flowEpoch !== document.flowEpoch) {
      throw new CodexCredentialStoreError('CODEX_STALE_FLOW', 'This Codex sign-in was superseded. Start a new connection attempt.')
    }
    if (context?.credentialGeneration !== undefined && (
      !context.credentialGeneration || context.credentialGeneration !== document.credentialGeneration || !document.credential
    )) {
      throw new CodexCredentialStoreError('CODEX_CREDENTIAL_CHANGED', 'The Codex account changed during this request. Start a new request.')
    }
  }

  return {
    filePath,
    async read(providerId, options = {}) {
      assertProvider(providerId)
      options.signal?.throwIfAborted()
      await ensureStorage()
      const document = await readDocument()
      assertContext(document)
      return document.credential || undefined
    },
    async list(options = {}) {
      options.signal?.throwIfAborted()
      await ensureStorage()
      const document = await readDocument()
      return document.credential ? [{ providerId: CODEX_PROVIDER_ID, type: 'oauth' }] : []
    },
    async modify(providerId, fn, options = {}) {
      assertProvider(providerId)
      if (typeof fn !== 'function') {
        throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_INVALID_WRITE', 'Codex connection update is invalid.')
      }
      options.signal?.throwIfAborted()
      const requestContext = contexts.getStore()
      if (requestContext?.flowEpoch === undefined && requestContext?.credentialGeneration === undefined) {
        throw new CodexCredentialStoreError('CODEX_CREDENTIAL_CONTEXT_REQUIRED', 'Codex credential updates require an active sign-in or request context.')
      }
      return withLock(async (ensureLock) => {
        const currentDocument = await readDocument()
        assertContext(currentDocument)
        const next = await fn(currentDocument.credential || undefined)
        options.signal?.throwIfAborted()
        ensureLock()
        if (next === undefined) return currentDocument.credential || undefined
        if (!isOAuthCredential(next)) {
          throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_INVALID_WRITE', 'Codex connection data is invalid.')
        }

        const nextDocument = {
          ...currentDocument,
          credential: normalizeCredential(next),
          credentialGeneration: requestContext.flowEpoch !== undefined
            ? randomUUID()
            : currentDocument.credentialGeneration || randomUUID(),
        }
        if (requestContext.flowEpoch !== undefined && requestContext.flowEpoch !== currentDocument.flowEpoch) {
          throw new CodexCredentialStoreError('CODEX_STALE_FLOW', 'This Codex sign-in was superseded. Start a new connection attempt.')
        }
        await writeDocument(nextDocument, ensureLock)
        return nextDocument.credential
      })
    },
    async delete(providerId, options = {}) {
      assertProvider(providerId)
      await disconnect(options)
    },
    async beginFlow() {
      return withLock(async (ensureLock) => {
        const document = await readDocument()
        if (document.flowEpoch >= Number.MAX_SAFE_INTEGER) {
          throw new CodexCredentialStoreError('CODEX_FLOW_EPOCH_EXHAUSTED', 'Codex sign-in cannot start because connection state is invalid.')
        }
        const flowEpoch = document.flowEpoch + 1
        await writeDocument({ ...document, flowEpoch }, ensureLock)
        return flowEpoch
      })
    },
    async disconnect() {
      return disconnect()
    },
    runWithFlowEpoch(flowEpoch, callback) {
      const current = contexts.getStore() || {}
      return contexts.run({ ...current, flowEpoch }, callback)
    },
    runWithCredentialGeneration(credentialGeneration, callback) {
      const current = contexts.getStore() || {}
      return contexts.run({ ...current, credentialGeneration }, callback)
    },
    getStatusSync() {
      ensureStorageSync()
      const document = readDocumentSync()
      return {
        connected: Boolean(document.credential),
        credentialGeneration: document.credentialGeneration,
        flowEpoch: document.flowEpoch,
      }
    },
  }
}

function isOAuthCredential(value) {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value) &&
    value.type === 'oauth' && typeof value.access === 'string' && value.access.length > 0 &&
    typeof value.refresh === 'string' && value.refresh.length > 0 &&
    Number.isFinite(value.expires) && typeof value.accountId === 'string' && value.accountId.length > 0
  )
}

function normalizeCredential(credential) {
  if (!isOAuthCredential(credential)) {
    throw new CodexCredentialStoreError('CODEX_CREDENTIAL_STORE_CORRUPT', 'Codex connection data is unreadable.')
  }
  return {
    type: 'oauth',
    access: credential.access,
    refresh: credential.refresh,
    expires: credential.expires,
    accountId: credential.accountId,
  }
}

function storageError(error) {
  const code = error?.code === 'ELOCKED'
    ? 'CODEX_CREDENTIAL_STORE_BUSY'
    : 'CODEX_CREDENTIAL_STORE_UNAVAILABLE'
  const message = code === 'CODEX_CREDENTIAL_STORE_BUSY'
    ? 'Codex connection storage is busy. Please try again.'
    : 'Codex connection storage is unavailable. Check local disk permissions and try again.'
  return new CodexCredentialStoreError(code, message)
}
