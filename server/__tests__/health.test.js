import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'

const app = express()
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

describe('GET /health', () => {
  it('returns 200 and status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.time).toBeDefined()
  })
})
