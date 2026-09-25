import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import db, { initSchema } from './db.js'
import settingsRouter from './routes/settings.js'
import dashboardRouter from './routes/dashboard.js'
import curriculumRouter from './routes/curriculum.js'
import continuationRouter from './routes/continuations.js'
import lessonsRouter from './routes/lessons.js'
import activitiesRouter from './routes/activities.js'
import examsRouter from './routes/exams.js'
import reviewsRouter from './routes/reviews.js'
import streakRouter from './routes/streak.js'
import dataRouter from './routes/data.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

initSchema()

const app = express()

// Allow CORS from the dev frontend
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

app.use('/api/settings/codex', express.json({ limit: '16kb' }))
app.use('/api/data/import', express.json({ limit: '50mb' }))
app.use('/api/topics/:id/lessons/:lid/artifact', express.json({ limit: '32mb' }))
app.use(express.json({ limit: '6mb' }))

// Global error handler for malformed JSON and other errors
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON.' })
  }
  next(err)
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.use('/api/settings', settingsRouter)
app.use('/api', dashboardRouter)
app.use('/api', curriculumRouter)
app.use('/api', continuationRouter)
app.use('/api', activitiesRouter)
app.use('/api', lessonsRouter)
app.use('/api', examsRouter)
app.use('/api', reviewsRouter)
app.use('/api', streakRouter)
app.use('/api/data', dataRouter)

const PORT = process.env.PORT || 3200
const HOST = process.env.HOST || '127.0.0.1'
app.listen(PORT, HOST, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
