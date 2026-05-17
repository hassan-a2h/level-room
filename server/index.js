import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import db, { initSchema } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

initSchema()

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

const PORT = process.env.PORT || 3200
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
