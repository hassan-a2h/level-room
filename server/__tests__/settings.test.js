import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'

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
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()

    // Import and mount the settings router on a fresh express app
    const { default: settingsRouter } = await import('../routes/settings.js')
    app = express()
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
  })

  describe('GET /api/settings', () => {
    it('returns default settings when none exist and no env vars', async () => {
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('fireworks')
      expect(res.body.model).toBe('accounts/fireworks/routers/kimi-k2p6-turbo')
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
      const res = await request(app).post('/api/settings/validate').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/FIREWORKS_API_KEY/i)
    })

    it('returns ok when env key is present', async () => {
      process.env.FIREWORKS_API_KEY = 'fw-test'
      const res = await request(app).post('/api/settings/validate').send({})
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })
})
