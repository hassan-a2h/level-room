import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { validateViewModelFixture } from '../../theme/core/packContract.js'
import CuriosityContinuation from '../../theme/packs/curiosity-engine/views/ContinuationView.jsx'
import WorkshopContinuation from '../../theme/packs/mission-workshop/views/ContinuationView.jsx'
import AtlasContinuation from '../../theme/packs/living-atlas/views/ContinuationView.jsx'

const views = [CuriosityContinuation, WorkshopContinuation, AtlasContinuation]

function makeModel(overrides = {}) {
  return validateViewModelFixture('Continuation', {
    phase: 'preview', parentTrack: { title: 'React Foundations' }, readiness: {}, level: 'Intermediate',
    timeCommitment: '30 min/day', profileStale: false,
    preview: { title: 'Advanced React', modules: [
      { id: 'chapter-1', title: 'Composition', summary: 'Reusable structures', skill_outcomes: [{ id: 'o1', title: 'Compose interfaces', role: 'core' }], lessons: [{ id: 'lesson-1', title: 'Components', estimated_time: 20 }] },
      { id: 'chapter-2', title: 'State systems', summary: 'Manage complexity', skill_outcomes: [{ id: 'o2', title: 'Choose state boundaries', role: 'core' }], lessons: [{ id: 'lesson-2', title: 'State', estimated_time: 25 }] },
    ] },
    selectedChapterId: 'chapter-1', adjustmentDraft: '', adjustmentOpen: false, busy: {}, error: null,
    actions: { selectChapter() {}, setLevel() {}, setTimeCommitment() {}, confirm() {}, toggleAdjustment() {}, setAdjustmentDraft() {}, applyAdjustment() {}, defer() {} },
    ...overrides,
  })
}

describe('continuation pack parity', () => {
  it('shows the selected Chapter with stable actions and puts other details behind disclosure', () => {
    for (const View of views) {
      const { unmount } = render(<View model={makeModel()} />)
      expect(screen.getByRole('heading', { name: 'Advanced React' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Chapter 1 · Composition' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Chapter 2 · State systems' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add to my Trail' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Adjust plan' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument()
      const details = screen.getByRole('button', { name: 'Show other Chapters' })
      expect(details).toHaveAttribute('aria-expanded', 'false')
      unmount()
    }
  })
})
