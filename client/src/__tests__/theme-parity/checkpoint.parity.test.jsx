import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { validateViewModelFixture } from '../../theme/core/packContract.js'
import AtlasCheckpoint from '../../theme/packs/living-atlas/views/CheckpointView.jsx'
import CuriosityCheckpoint from '../../theme/packs/curiosity-engine/views/CheckpointView.jsx'
import WorkshopCheckpoint from '../../theme/packs/mission-workshop/views/CheckpointView.jsx'

const views = [AtlasCheckpoint, CuriosityCheckpoint, WorkshopCheckpoint]

function makeModel(overrides = {}) {
  return validateViewModelFixture('Checkpoint', {
    phase: 'intro', module: { title: 'Joins' },
    outcomes: [{ id: 'core-join', title: 'Choose the right join', role: 'core' }],
    questions: [], currentQuestion: null, currentIndex: 0, answers: {}, answeredCount: 0,
    saveState: 'idle', evaluation: null, isPartialRetest: false, ready: true, lessonsRemaining: 0,
    busy: { loading: false }, error: null,
    actions: { start: vi.fn(), answer: vi.fn(), previous: vi.fn(), next: vi.fn(), review: vi.fn(), submit: vi.fn(), retake: vi.fn(), partialRetest: vi.fn(), back: vi.fn(), reviewLesson: vi.fn() },
    ...overrides,
  })
}

describe('checkpoint theme parity', () => {
  it('keeps the checkpoint introduction and readiness action consistent', () => {
    for (const View of views) {
      const start = vi.fn()
      const { unmount } = render(<View model={makeModel({ actions: { ...makeModel().actions, start } })} />)
      expect(screen.getByRole('heading', { name: 'Show what you can do' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /begin checkpoint/i }))
      expect(start).toHaveBeenCalledOnce()
      unmount()
    }
  })

  it('shows one question, offers an answer review step, and keeps confidence controls absent', () => {
    const answer = vi.fn()
    const review = vi.fn()
    const question = { id: 'q1', text: 'Which join keeps every left row?', type: 'choice', options: [{ id: 'left', label: 'LEFT JOIN' }, { id: 'inner', label: 'INNER JOIN' }] }
    for (const View of views) {
      const { unmount } = render(<View model={makeModel({
        phase: 'player', questions: [question, { ...question, id: 'q2', text: 'Why does it keep the row?' }],
        currentQuestion: { ...question, id: 'q2', text: 'Why does it keep the row?' }, currentIndex: 1, answers: { q1: 'left', q2: 'It preserves left-side rows.' }, answeredCount: 2,
        actions: { ...makeModel().actions, answer, review },
      })} />)
      expect(screen.getByText('Why does it keep the row?')).toBeInTheDocument()
      expect(screen.queryByText(question.text)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /review answers/i })).toBeInTheDocument()
      expect(screen.queryByText(/confidence|how sure/i)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /review answers/i }))
      expect(review).toHaveBeenCalled()
      unmount()
    }
  })

  it('shows the learner’s answers before the one submit action', () => {
    const submit = vi.fn()
    const model = makeModel({
      phase: 'answer-review',
      questions: [{ id: 'q1', text: 'Which join keeps every left row?', type: 'written' }],
      answers: { q1: 'LEFT JOIN keeps unmatched left rows.' }, answeredCount: 1,
      actions: { ...makeModel().actions, submit },
    })
    for (const View of views) {
      const { unmount } = render(<View model={model} />)
      expect(screen.getByText('LEFT JOIN keeps unmatched left rows.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /submit checkpoint/i })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /submit checkpoint/i }))
      expect(submit).toHaveBeenCalled()
      unmount()
    }
  })

  it('keeps checkpoint results and the earned-pass action consistent', () => {
    for (const View of views) {
      const back = vi.fn()
      const { unmount } = render(<View model={makeModel({
        phase: 'results', evaluation: { overallScore: 91, passed: true, failedOutcomeIds: [], perOutcomeEvidence: {} },
        actions: { ...makeModel().actions, back },
      })} />)
      expect(screen.getByRole('heading', { name: 'Chapter checkpoint cleared' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /continue your trail/i }))
      expect(back).toHaveBeenCalledOnce()
      unmount()
    }
  })
})
