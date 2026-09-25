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
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the app title', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Mastery Trail')).toBeInTheDocument()
    })
  })
})
