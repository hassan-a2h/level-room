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
  })

  describe('GET /api/settings', () => {
    it('returns empty settings when none exist', async () => {
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body.provider).toBeNull()
      expect(res.body.model).toBeNull()
      expect(res.body.apiKey).toBeUndefined()
    })

    it('returns saved settings without exposing api_key', async () => {
      dbModule.run(
        'INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)',
        'openai', 'sk-secret123', 'gpt-4o'
      )
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai')
      expect(res.body.model).toBe('gpt-4o')
      expect(res.body.apiKey).toBeUndefined()
      expect(res.body.apiKeySet).toBe(true)
    })

    it('shows apiKeySet false when no key is stored', async () => {
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body.apiKeySet).toBe(false)
    })
  })

  describe('POST /api/settings', () => {
    it('saves valid settings and returns them', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai')
      expect(res.body.model).toBe('gpt-4o')
      expect(res.body.apiKey).toBeUndefined()
      expect(res.body.apiKeySet).toBe(true)

      const row = dbModule.get('SELECT provider, api_key, model FROM llm_settings LIMIT 1')
      expect(row.provider).toBe('openai')
      expect(row.api_key).toBe('sk-test')
      expect(row.model).toBe('gpt-4o')
    })

    it('rejects unsupported provider', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'unknown', apiKey: 'k', model: 'm' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/unsupported provider/i)
    })

    it('rejects missing provider', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ apiKey: 'k', model: 'm' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/provider is required/i)
    })

    it('rejects missing apiKey when no key is stored', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'openai', model: 'gpt-4o' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/api key is required/i)
    })

    it('rejects empty apiKey when no key is stored', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'openai', apiKey: '', model: 'gpt-4o' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/api key is required/i)
    })

    it('allows saving without apiKey when key already exists', async () => {
      dbModule.run(
        'INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)',
        'openai', 'sk-existing', 'gpt-4o'
      )
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('anthropic')
      expect(res.body.model).toBe('claude-3-5-sonnet-20241022')

      const row = dbModule.get('SELECT provider, api_key, model FROM llm_settings LIMIT 1')
      expect(row.provider).toBe('anthropic')
      expect(row.api_key).toBe('sk-existing')
      expect(row.model).toBe('claude-3-5-sonnet-20241022')
    })

    it('rejects missing model', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'openai', apiKey: 'k' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/model is required/i)
    })

    it('rejects malformed api key with clear error', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'openai', apiKey: 'bad-key', model: 'gpt-4o' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid/i)
    })

    it('updates existing settings (replace)', async () => {
      dbModule.run(
        'INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)',
        'openai', 'sk-old', 'gpt-4o'
      )
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'fireworks', apiKey: 'fw-new', model: 'accounts/fireworks/models/llama-v3p1-70b-instruct' })

      expect(res.status).toBe(200)
      const rows = dbModule.all('SELECT * FROM llm_settings')
      expect(rows.length).toBe(1)
      expect(rows[0].provider).toBe('fireworks')
      expect(rows[0].api_key).toBe('fw-new')
      expect(rows[0].model).toBe('accounts/fireworks/models/llama-v3p1-70b-instruct')
    })

    it('clears api key when explicitly set to empty with clear flag', async () => {
      dbModule.run(
        'INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)',
        'openai', 'sk-old', 'gpt-4o'
      )
      const res = await request(app)
        .post('/api/settings')
        .send({ provider: 'openai', apiKey: '', model: 'gpt-4o', clearKey: true })

      expect(res.status).toBe(200)
      const row = dbModule.get('SELECT api_key FROM llm_settings LIMIT 1')
      expect(row.api_key).toBe('')
    })
  })

  describe('POST /api/settings/validate', () => {
    it('returns 400 when no settings are configured', async () => {
      const res = await request(app).post('/api/settings/validate').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/no settings configured/i)
    })

    it('returns 400 when api key is missing', async () => {
      dbModule.run(
        'INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)',
        'openai', '', 'gpt-4o'
      )
      const res = await request(app).post('/api/settings/validate').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/api key missing/i)
    })
  })

  describe('DELETE /api/settings/key', () => {
    it('removes the stored api key', async () => {
      dbModule.run(
        'INSERT INTO llm_settings (provider, api_key, model) VALUES (?, ?, ?)',
        'openai', 'sk-secret', 'gpt-4o'
      )
      const res = await request(app).delete('/api/settings/key')
      expect(res.status).toBe(200)
      const row = dbModule.get('SELECT api_key FROM llm_settings LIMIT 1')
      expect(row.api_key).toBe('')
    })

    it('returns 200 even when no settings exist', async () => {
      const res = await request(app).delete('/api/settings/key')
      expect(res.status).toBe(200)
    })
  })
})
