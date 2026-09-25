import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import App from '../App'

vi.mock('../api.js', () => ({
  getTopics: vi.fn(() => Promise.resolve({ topics: [] })),
  getDefaultTopic: vi.fn(() => Promise.reject(new Error('No topics'))),
  getDashboard: vi.fn(),
  createTopic: vi.fn(),
  deleteTopic: vi.fn(),
  selectTopic: vi.fn(),
  getLesson: vi.fn(),
  ensureActivities: vi.fn(),
}))

import { ensureActivities, getLesson } from '../api.js'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/')
  })

  it('renders the app title', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Mastery Trail')).toBeInTheDocument()
    })
  })

  it('routes the existing Session URL to the structured Session player', async () => {
    window.history.pushState({}, '', '/topic/2/lesson/8')
    getLesson.mockResolvedValue({
      lesson: { id: 8, title: 'Joins', module_title: 'SQL', outcomes: [] },
      progress: { state: 'practicing' },
      activityDocument: { schemaVersion: 1, blocks: [{ id: 'read-start', type: 'read', title: 'Start', content: 'Read this.', required: true, outcomeIds: ['joins'] }] },
      activityState: { currentBlockId: 'read-start', blocks: { 'read-start': { status: 'active', attempts: 0 } } },
      activityProgress: { completed: 0, total: 1, percent: 0, currentBlockId: 'read-start' },
    })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument()
    expect(getLesson).toHaveBeenCalledWith('2', '8')
    expect(ensureActivities).not.toHaveBeenCalled()
  })
})
