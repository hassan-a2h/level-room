import { randomUUID } from 'node:crypto'

let dataRevision = randomUUID()

export function getDataRevision() {
  return dataRevision
}

export function rotateDataRevision() {
  dataRevision = randomUUID()
  return dataRevision
}

export function assertDataRevision(expectedRevision) {
  if (expectedRevision && expectedRevision !== dataRevision) {
    const error = new Error('Learning data changed while this request was in progress. Reload before retrying.')
    error.status = 409
    error.code = 'DATA_CHANGED'
    error.retryable = false
    throw error
  }
  return dataRevision
}

export function dataRevisionMiddleware(req, res, next) {
  res.setHeader('X-Learning-Data-Revision', dataRevision)
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || req.path === '/api/data/import') return next()
  const supplied = req.get('X-Learning-Data-Revision')
  if (supplied && supplied !== dataRevision) {
    return res.status(409).json({
      error: 'The learning data changed in another tab. Reload before saving this change.',
      code: 'DATA_CHANGED',
      retryable: false,
    })
  }
  return next()
}
