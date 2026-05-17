import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import db, { initSchema } from './db.js'
import settingsRouter from './routes/settings.js'
import dashboardRouter from './routes/dashboard.js'
import curriculumRouter from './routes/curriculum.js'
import lessonsRouter from './routes/lessons.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

initSchema()

const app = express()
app.use(express.json())

// Allow CORS from the dev frontend
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.use('/api/settings', settingsRouter)
app.use('/api', dashboardRouter)
app.use('/api', curriculumRouter)
app.use('/api', lessonsRouter)

const PORT = process.env.PORT || 3200
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
