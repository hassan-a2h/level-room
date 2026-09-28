import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CheckpointPage from '../pages/CheckpointPage.jsx'

vi.mock('../api.js', () => ({
  getDashboard: vi.fn(),
  getLocalDate: vi.fn(() => '2026-09-28'),
  getLocalTimeZone: vi.fn(() => 'Asia/Karachi'),
}))

vi.mock('../components/ExamPanel.jsx', () => ({
  default: ({ topicId, moduleId, moduleTitle, chapterOutcomes, moduleLessons }) => (
    <div data-testid="exam-panel" data-topic-id={topicId} data-module-id={moduleId}>
      {moduleTitle} · {chapterOutcomes.length} outcomes · {moduleLessons.length} Sessions
    </div>
  ),
}))

import { getDashboard, getLocalDate, getLocalTimeZone } from '../api.js'

function renderCheckpoint(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/topic/:topicId/chapter/:moduleId/checkpoint" element={<CheckpointPage />} /></Routes>
    </MemoryRouter>,
  )
}

describe('CheckpointPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the selected Chapter with the local date and timezone and passes its checkpoint data through', async () => {
    getDashboard.mockResolvedValue({ modules: [{ id: 8, title: 'SQL joins', skill_outcomes: [{ id: 'join' }], lessons: [{ id: 12 }] }] })
    renderCheckpoint('/topic/2/chapter/8/checkpoint')

    expect(await screen.findByTestId('exam-panel')).toHaveTextContent('SQL joins · 1 outcomes · 1 Sessions')
    expect(getDashboard).toHaveBeenCalledWith(2, '2026-09-28', 'Asia/Karachi')
    expect(getLocalDate).toHaveBeenCalledOnce()
    expect(getLocalTimeZone).toHaveBeenCalledOnce()
  })

  it.each([
    '/topic/0/chapter/8/checkpoint',
    '/topic/2/chapter/0/checkpoint',
    '/topic/999999999999999999999/chapter/8/checkpoint',
  ])('shows a public not-found state for invalid IDs in %s', async (path) => {
    renderCheckpoint(path)
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(getDashboard).not.toHaveBeenCalled()
  })

  it('shows a public not-found state when the Chapter is absent from the dashboard', async () => {
    getDashboard.mockResolvedValue({ modules: [{ id: 9, title: 'Different Chapter' }] })
    renderCheckpoint('/topic/2/chapter/8/checkpoint')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
