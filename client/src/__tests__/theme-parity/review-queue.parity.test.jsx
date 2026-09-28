import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { validateViewModelFixture } from '../../theme/core/packContract.js'
import AtlasQueue from '../../theme/packs/living-atlas/views/ReviewQueueView.jsx'
import CuriosityQueue from '../../theme/packs/curiosity-engine/views/ReviewQueueView.jsx'
import WorkshopQueue from '../../theme/packs/mission-workshop/views/ReviewQueueView.jsx'

const views = [AtlasQueue, CuriosityQueue, WorkshopQueue]

function makeModel(overrides = {}) {
  return validateViewModelFixture('Review', {
    phase: 'queue', counts: { totalDue: 1, overdue: 1 },
    dueItems: [{ id: 1, topicTitle: 'React', moduleTitle: 'Foundations', lessonTitle: 'JSX', dueDate: '2026-09-28', isOverdue: true, reviewType: 'lesson' }],
    sessionId: null, questions: [], currentQuestion: null, currentIndex: 0, totalQuestions: 0, remainingCount: 0,
    answers: {}, feedbackByQuestionId: {}, feedbackIndex: 0, result: null, ui: {},
    busy: { loading: false, starting: false }, error: null,
    actions: { start: vi.fn(), retry: vi.fn(), returnToTrail: vi.fn() },
    ...overrides,
  })
}

describe('review queue theme parity', () => {
  it('shows due items, their shared actions, and overdue status in all packs', () => {
    for (const View of views) {
      const start = vi.fn()
      const { unmount } = render(<View model={makeModel({ actions: { ...makeModel().actions, start } })} />)
      expect(screen.getByRole('heading', { name: 'Retrieval practice' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'JSX' })).toBeInTheDocument()
      expect(screen.getByText('Overdue')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /start retrieval practice/i }))
      expect(start).toHaveBeenCalledOnce()
      unmount()
    }
  })

  it('keeps empty and retry states actionable', () => {
    for (const View of views) {
      const returnToTrail = vi.fn()
      const empty = makeModel({ dueItems: [], counts: { totalDue: 0 }, actions: { ...makeModel().actions, returnToTrail } })
      const { unmount } = render(<View model={empty} />)
      expect(screen.getByRole('heading', { name: /no retrieval practice due today/i })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /continue trail/i }))
      expect(returnToTrail).toHaveBeenCalledOnce()
      unmount()

      const retry = vi.fn()
      const { unmount: unmountError } = render(<View model={makeModel({ dueItems: [], error: { message: 'Could not load retrieval practice.' }, actions: { ...makeModel().actions, retry } })} />)
      fireEvent.click(screen.getByRole('button', { name: /try again/i }))
      expect(retry).toHaveBeenCalledOnce()
      unmountError()
    }
  })
})
