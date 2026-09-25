import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

const codexState = vi.hoisted(() => ({
  connection: { connected: false, status: 'disconnected' },
  flowStatus: { flowId: 'flow-fixture', state: 'awaiting_manual_code', mode: 'browser' },
}))
const codexMocks = vi.hoisted(() => ({
  startLogin: vi.fn(async (mode) => ({ flowId: 'flow-fixture', state: 'starting', mode })),
  getFlowStatus: vi.fn(() => codexState.flowStatus),
  submitManualCode: vi.fn(async () => ({ accepted: true })),
  cancelFlow: vi.fn(async () => ({ flowId: 'flow-fixture', state: 'cancelled' })),
  disconnect: vi.fn(async () => ({ connected: false, status: 'disconnected' })),
}))

vi.mock('../llm/codex-auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    codexAuth: {
      ...actual.codexAuth,
      ...codexMocks,
      getConnectionStatus: () => codexState.connection,
      getRuntimeSnapshot: () => ({
        ...codexState.connection,
        credentialGeneration: codexState.connection.connected ? 'internal-generation-fixture' : undefined,
      }),
    },
    codexModels: {},
  }
})

vi.mock('../llm/client.js', () => ({
  generateText: vi.fn(() => Promise.resolve({ text: 'ok' })),
  LlmClientError: class LlmClientError extends Error {
    constructor(message, { code, retryable = false } = {}) {
      super(message)
      this.name = 'LlmClientError'
      this.code = code
      this.retryable = retryable
    }
  },
}))

function tempDbPath() {
  return path.join(os.tmpdir(), `test-settings-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('Settings API', () => {
  let dbPath
  let dbModule
  let app

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.FIREWORKS_API_KEY
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_MODEL
    delete process.env.LLM_REASONING_EFFORT
    codexState.connection = { connected: false, status: 'disconnected' }
    codexState.flowStatus = { flowId: 'flow-fixture', state: 'awaiting_manual_code', mode: 'browser' }
    vi.clearAllMocks()
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()

    // Import and mount the settings router on a fresh express app
    const { default: settingsRouter } = await import('../routes/settings.js')
    app = express()
    app.use('/api/settings/codex', express.json({ limit: '16kb' }))
    app.use(express.json())
    app.use('/api/settings', settingsRouter)
  })

  afterEach(() => {
    if (dbModule && dbModule.default) {
      try { dbModule.default.close() } catch {}
    }
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.FIREWORKS_API_KEY
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_MODEL
    delete process.env.LLM_REASONING_EFFORT
  })

  describe('GET /api/settings', () => {
    it('returns default settings when none exist and no env vars', async () => {
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai-codex')
      expect(res.body.model).toBe('gpt-5.6-luna')
      expect(res.body.reasoningEffort).toBe('xhigh')
      expect(res.body.authStatus).toBe('disconnected')
      expect(res.body.apiKeySet).toBe(false)
      expect(res.body.envStatus).toBeDefined()
      expect(res.body.envStatus).toHaveLength(3)
    })

    it('returns saved settings with env status', async () => {
      dbModule.run(
        'INSERT INTO llm_settings (provider, model) VALUES (?, ?)',
        'openai', 'gpt-4o'
      )
      process.env.OPENAI_API_KEY = 'sk-test'
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai')
      expect(res.body.model).toBe('gpt-4o')
      expect(res.body.reasoningEffort).toBe('none')
      expect(res.body.apiKey).toBeUndefined()
      expect(res.body.apiKeySet).toBe(true)
      expect(res.body.envStatus).toBeDefined()
    })

    it('shows apiKeySet false when env key is missing', async () => {
      dbModule.run(
        'INSERT INTO llm_settings (provider, model) VALUES (?, ?)',
        'openai', 'gpt-4o'
      )
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body.apiKeySet).toBe(false)
    })
  })

  describe('provider catalog and Codex subscription endpoints', () => {
    const localRequest = (method, url) => request(app)[method](url)
      .set('Host', 'localhost:3200')
      .set('Origin', 'http://localhost:3201')

    it('returns the canonical provider/model catalog with per-model reasoning choices', async () => {
      const res = await request(app).get('/api/settings/catalog')
      expect(res.status).toBe(200)
      expect(res.body.providers.map(({ id }) => id)).toEqual(['openai', 'anthropic', 'fireworks', 'openai-codex'])
      expect(res.body.providers.find(({ id }) => id === 'openai-codex').defaultModel).toBe('gpt-5.6-luna')
      expect(res.body.providers.find(({ id }) => id === 'openai-codex').models)
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ id: 'gpt-5.4', reasoningEfforts: ['minimal', 'xhigh'] }),
          expect.objectContaining({ id: 'gpt-5.6-luna', reasoningEfforts: expect.arrayContaining(['minimal', 'xhigh', 'max']) }),
        ]))
    })

    it('allows saving a Codex model and effort before subscription sign-in', async () => {
      const res = await request(app).post('/api/settings')
        .send({ provider: 'openai-codex', model: 'gpt-5.4', reasoningEffort: 'xhigh' })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ provider: 'openai-codex', model: 'gpt-5.4', apiKeySet: false, ready: false })
      expect(dbModule.get('SELECT provider, model, reasoning_effort FROM llm_settings LIMIT 1')).toEqual({
        provider: 'openai-codex', model: 'gpt-5.4', reasoning_effort: 'xhigh',
      })
    })

    it('rejects unsupported effort and any credential-shaped settings field', async () => {
      const unsupported = await request(app).post('/api/settings')
        .send({ provider: 'openai-codex', model: 'gpt-5.4', reasoningEffort: 'medium' })
      expect(unsupported.status).toBe(400)

      const credential = await request(app).post('/api/settings')
        .send({ provider: 'openai-codex', model: 'gpt-5.4', access: 'secret-fixture' })
      expect(credential.status).toBe(400)
      expect(credential.text).not.toContain('secret-fixture')
    })

    it('restricts OAuth routes to the configured local app origin and API host', async () => {
      const blocked = await request(app).post('/api/settings/codex/login').send({ mode: 'browser' })
      expect(blocked.status).toBe(403)
      expect(codexMocks.startLogin).not.toHaveBeenCalled()

      const allowed = await localRequest('post', '/api/settings/codex/login').send({ mode: 'browser' })
      expect(allowed.status).toBe(202)
      expect(allowed.body.flowId).toBe('flow-fixture')
      expect(codexMocks.startLogin).toHaveBeenCalledWith('browser')

      const hostileHost = await request(app).post('/api/settings/codex/login')
        .set('Host', '192.168.1.5:3200')
        .set('Origin', 'http://localhost:3201')
        .send({ mode: 'device_code' })
      expect(hostileHost.status).toBe(403)
    })

    it('limits repeated sign-in starts from one local client', async () => {
      const responses = []
      for (let index = 0; index < 6; index += 1) {
        responses.push(await localRequest('post', '/api/settings/codex/login').send({ mode: 'browser' }))
      }
      expect(responses.slice(0, 5).every((response) => response.status === 202)).toBe(true)
      expect(responses[5].status).toBe(429)
      expect(codexMocks.startLogin).toHaveBeenCalledTimes(5)
    })

    it('limits repeated manual authorization submissions', async () => {
      const responses = []
      for (let index = 0; index < 11; index += 1) {
        responses.push(await localRequest('post', '/api/settings/codex/flow/flow-fixture/code').send({ code: `code-${index}` }))
      }
      expect(responses.slice(0, 10).every((response) => response.status === 200)).toBe(true)
      expect(responses[10].status).toBe(429)
      expect(codexMocks.submitManualCode).toHaveBeenCalledTimes(10)
    })

    it('rejects oversized OAuth request bodies before invoking auth operations', async () => {
      const response = await localRequest('post', '/api/settings/codex/flow/flow-fixture/code')
        .send({ code: 'x'.repeat(20_000) })
      expect(response.status).toBe(413)
      expect(codexMocks.submitManualCode).not.toHaveBeenCalled()
    })

    it('returns a sanitized connection state and forwards manual authorization codes without echoing them', async () => {
      codexState.connection = { connected: true, status: 'connected' }
      const status = await localRequest('get', '/api/settings/codex/connection')
      expect(status.status).toBe(200)
      expect(status.body).toEqual({ connected: true, status: 'connected' })
      expect(status.text).not.toContain('internal-generation-fixture')

      const manual = await localRequest('post', '/api/settings/codex/flow/flow-fixture/code')
        .send({ code: 'one-time-secret-fixture' })
      expect(manual.status).toBe(200)
      expect(manual.body).toEqual({ accepted: true })
      expect(manual.text).not.toContain('one-time-secret-fixture')
      expect(codexMocks.submitManualCode).toHaveBeenCalledWith('flow-fixture', 'one-time-secret-fixture')
    })
  })

  describe('POST /api/settings', () => {
    it('saves valid settings when env key is configured', async () => {
      process.env.OPENAI_API_KEY = 'sk-test'
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'openai', model: 'gpt-4o' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai')
      expect(res.body.model).toBe('gpt-4o')
      expect(res.body.apiKey).toBeUndefined()
      expect(res.body.apiKeySet).toBe(true)

      const row = dbModule.get('SELECT provider, model FROM llm_settings LIMIT 1')
      expect(row.provider).toBe('openai')
      expect(row.model).toBe('gpt-4o')
    })

    it('rejects unsupported provider', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'unknown', model: 'm' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/unsupported provider/i)
    })

    it('rejects missing provider', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ model: 'm' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/provider is required/i)
    })

    it('rejects saving when env key is not configured', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'openai', model: 'gpt-4o' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/OPENAI_API_KEY/i)
    })

    it('rejects old apiKey field in request body', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/\.env file/i)
    })

    it('rejects missing model', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'openai' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/model is required/i)
    })

    it('updates existing settings (replace)', async () => {
      process.env.FIREWORKS_API_KEY = 'fw-test'
      dbModule.run(
        'INSERT INTO llm_settings (provider, model) VALUES (?, ?)',
        'openai', 'gpt-4o'
      )
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'fireworks', model: 'accounts/fireworks/routers/kimi-k2p6-turbo' })

      expect(res.status).toBe(200)
      const rows = dbModule.all('SELECT * FROM llm_settings')
      expect(rows.length).toBe(1)
      expect(rows[0].provider).toBe('fireworks')
      expect(rows[0].model).toBe('accounts/fireworks/routers/kimi-k2p6-turbo')
    })
  })

  describe('POST /api/settings/validate', () => {
    it('returns 400 when no env key is configured', async () => {
      process.env.LLM_PROVIDER = 'fireworks'
      const res = await request(app).post('/api/settings/validate').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/FIREWORKS_API_KEY/i)
    })

    it('returns ok when env key is present', async () => {
      process.env.LLM_PROVIDER = 'fireworks'
      process.env.FIREWORKS_API_KEY = 'fw-test'
      const res = await request(app).post('/api/settings/validate').send({})
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })
})
