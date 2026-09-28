import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { validateViewModelFixture } from '../../theme/core/packContract.js'
import CuriosityOnboarding from '../../theme/packs/curiosity-engine/views/OnboardingView.jsx'
import WorkshopOnboarding from '../../theme/packs/mission-workshop/views/OnboardingView.jsx'
import AtlasOnboarding from '../../theme/packs/living-atlas/views/OnboardingView.jsx'

const views = [CuriosityOnboarding, WorkshopOnboarding, AtlasOnboarding]

function makeModel(overrides = {}) {
  return validateViewModelFixture('Onboarding', {
    stage: 'starting_point', stageIndex: 1, stageCount: 4, substep: null, destination: 'React',
    levelOptions: [{ value: 'Beginner', label: 'Beginner' }, { value: 'Intermediate', label: 'Intermediate' }],
    selectedLevel: 'Beginner', placement: { questions: [], answers: {}, loading: false, result: null },
    timeOptions: [], selectedTime: null, paceOptions: [], selectedPace: 'steady',
    generation: {}, preview: {}, error: null, busy: {}, providerReady: true,
    actions: { chooseLevel() {}, takePlacement() {}, skipPlacement() {} },
    ...overrides,
  })
}

describe('onboarding pack parity', () => {
  it('keeps the starting point choices and actions stable in every pack', () => {
    for (const View of views) {
      const { unmount } = render(<View model={makeModel()} />)
      expect(screen.getByRole('heading', { name: 'Choose your starting point' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Beginner' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
      unmount()
    }
  })

  it('shows one placement question at a time and retains the answer when changed', () => {
    const answers = { q1: 'a' }
    const onAnswer = vi.fn()
    const model = makeModel({
      stage: 'starting_point', substep: 'placement',
      placement: {
        questions: [
          { id: 'q1', text: 'What does a component do?', type: 'multiple_choice', options: [{ value: 'a', label: 'Encapsulates UI' }, { value: 'b', label: 'Stores data' }] },
          { id: 'q2', text: 'How would you explain props?', type: 'text' },
        ],
        answers, questionIndex: 0, loading: false, result: null,
      },
      actions: { answerPlacement: onAnswer, nextPlacementQuestion() {}, submitPlacement() {}, skipPlacement() {} },
    })
    const { unmount } = render(<AtlasOnboarding model={model} />)
    expect(screen.getByText('What does a component do?')).toBeInTheDocument()
    expect(screen.queryByText('How would you explain props?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stores data' }))
    expect(onAnswer).toHaveBeenCalledWith('q1', 'b')
    unmount()
  })

  it('keeps one Chapter visible and discloses the remaining Chapter details', () => {
    const model = makeModel({
      stage: 'preview', stageIndex: 3, substep: 'preview',
      preview: { curriculum: { title: 'React Track', modules: [
        { id: 'one', title: 'Components', skill_outcomes: [{ id: 'o1', title: 'Build components', role: 'core' }], lessons: [{ id: 'l1', title: 'Reusable UI', artifact_required: true }] },
        { id: 'two', title: 'State', skill_outcomes: [{ id: 'o2', title: 'Manage state', role: 'breadth' }], lessons: [{ id: 'l2', title: 'Local state' }] },
      ] }, selectedChapterId: 'one' },
    })
    for (const View of views) {
      const { unmount } = render(<View model={model} />)
      expect(screen.getByRole('heading', { name: 'Chapter 1 · Components' })).toBeInTheDocument()
      expect(screen.getByText('Other Chapters').closest('details')).not.toHaveAttribute('open')
      expect(screen.getByText(/2 outcomes · 1 core · 1 breadth/i)).toBeInTheDocument()
      expect(screen.getByText('Build')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Other Chapters'))
      expect(screen.getByRole('heading', { name: 'Chapter 2 · State' })).toBeInTheDocument()
      unmount()
    }
  })
})
