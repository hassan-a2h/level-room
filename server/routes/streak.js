import { Router } from 'express'
import { getStreakState, recordMasteryEvent, isValidDate } from '../utils/streak-tracker.js'

const router = Router()

/**
 * GET /api/streak
 * Return current streak state. Accepts ?today=YYYY-MM-DD for testing/timezone support.
 */
router.get('/streak', (req, res) => {
  try {
    const today = req.query.today || null
    if (today && !isValidDate(today)) {
      return res.status(400).json({ error: 'Invalid today format. Expected YYYY-MM-DD.' })
    }
    const state = getStreakState(today)
    return res.json(state)
  } catch (err) {
    console.error('GET /api/streak error:', err.message)
    return res.status(500).json({ error: 'Failed to load streak state.' })
  }
})

/**
 * POST /api/streak/record
 * Record a mastery event. Body: { localDate: 'YYYY-MM-DD' }
 */
router.post('/streak/record', (req, res) => {
  try {
    const { localDate } = req.body
    if (!localDate || typeof localDate !== 'string') {
      return res.status(400).json({ error: 'localDate is required (YYYY-MM-DD).' })
    }
    if (!isValidDate(localDate)) {
      return res.status(400).json({ error: `Invalid date format: "${localDate}". Expected YYYY-MM-DD.` })
    }
    const result = recordMasteryEvent(localDate)
    return res.json(result)
  } catch (err) {
    console.error('POST /api/streak/record error:', err.message)
    return res.status(500).json({ error: 'Failed to record streak.' })
  }
})

export default router
