import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CurriculumConfirmation from '../pages/CurriculumConfirmation.jsx'
import OnboardingFlow from '../pages/OnboardingFlow.jsx'

vi.mock('../api.js', () => ({
  getSettings: vi.fn(() => Promise.resolve({ ready: true })),
  createTopic: vi.fn(),
  getSetupQuestions: vi.fn(),
  saveProfile: vi.fn(),
  generateCurriculum: vi.fn(),
  regenerateCurriculum: vi.fn(),
  confirmCurriculum: vi.fn(),
  getCurriculumRecovery: vi.fn(),
  tweakCurriculum: vi.fn(),
  startPlacementAssessment: vi.fn(),
  submitPlacementAssessment: vi.fn(),
  waitForCurriculumGeneration: vi.fn(),
}))

import {
  getSettings,
  createTopic,
  getSetupQuestions,
  saveProfile,
  generateCurriculum,
  regenerateCurriculum,
  confirmCurriculum,
  getCurriculumRecovery,
  tweakCurriculum,
  startPlacementAssessment,
  submitPlacementAssessment,
  waitForCurriculumGeneration,
} from '../api.js'

function setupQuestions({ levels = ['Beginner', 'Intermediate', 'Advanced'], times = ['15 min/day', '30 min/day', '1 hour/day'] } = {}) {
  return { questions: [
    { id: 'level', text: 'Level?', options: levels },
    { id: 'timeCommitment', text: 'Time?', options: times },
  ] }
}

function makeCurriculum(chapterTitle = 'Basics') {
  const outcomes = [
    { id: 'react-components-know', title: 'Explain component boundaries', kind: 'knowledge', role: 'core', evidence: ['activity', 'checkpoint'] },
    { id: 'react-components-build', title: 'Build a reusable component', kind: 'skill', role: 'core', evidence: ['activity', 'artifact'] },
    { id: 'react-ecosystem-breadth', title: 'Recognize the wider React ecosystem', kind: 'knowledge', role: 'breadth', evidence: ['activity'] },
  ]
  return {
    modules: [{
      title: chapterTitle,
      skill_outcomes: outcomes,
      lessons: [
        { id: 1, title: 'Intro', estimated_time: 10, outcomes: [outcomes[0]], prerequisites: [] },
        { id: 2, title: 'Components', estimated_time: 15, artifact_required: true, task_spec: { title: 'Build a profile card' }, outcomes: outcomes.slice(1), prerequisites: [{ lessonId: 1, title: 'Intro' }] },
      ],
    }],
  }
}

function curriculumResponse(curriculum) {
  const encoded = new TextEncoder().encode(`data: ${JSON.stringify(JSON.stringify(curriculum))}\n\ndata: ${JSON.stringify('[DONE]')}\n\n`)
  let read = false
  return {
    ok: true,
    body: { getReader: () => ({ async read() { if (read) return { done: true }; read = true; return { done: false, value: encoded } } }) },
  }
}

describe('OnboardingFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSettings.mockResolvedValue({ ready: true })
  })

  it('starts at Destination and names the four onboarding steps', async () => {
    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: /what do you want to be able to do/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Your learning destination' })).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: 'Learning path setup' })
    expect(navigation).toHaveTextContent('Destination')
    expect(navigation).toHaveTextContent('Starting point')
    expect(navigation).toHaveTextContent('Learning rhythm')
    expect(navigation).toHaveTextContent('Track preview')
    expect(screen.getByRole('listitem', { name: 'Destination' })).toHaveAttribute('aria-current', 'step')
  })

  it('persists a self-reported level and time after the learner skips placement', async () => {
    createTopic.mockResolvedValue({ topic: { id: 21, title: 'React' } })
    getSetupQuestions.mockResolvedValue(setupQuestions())
    saveProfile.mockResolvedValue({ ok: true })
    generateCurriculum.mockImplementation(() => new Promise(() => {}))

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your learning destination' }), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set my destination' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Intermediate' }))
    expect(screen.getByRole('button', { name: 'Intermediate' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Skip placement check' }))

    expect(await screen.findByRole('heading', { name: 'Set your learning rhythm' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '1 hour/day' }))
    fireEvent.click(screen.getByRole('button', { name: /steady pace/i }))
    expect(screen.getByRole('button', { name: /steady pace/i })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Build my Track' }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(21, expect.objectContaining({
      level: 'Intermediate',
      selfReportedLevel: 'Intermediate',
      timeCommitment: '1 hour/day',
    })))
    expect(await screen.findByRole('heading', { name: /designing your track/i })).toBeInTheDocument()
  })

  it('waits for a durable generation job before showing the Track preview', async () => {
    const generation = { id: 'job-21', state: 'queued', attempt: 0, maxAttempts: 3 }
    createTopic.mockResolvedValue({ topic: { id: 21, title: 'React' } })
    getSetupQuestions.mockResolvedValue(setupQuestions())
    saveProfile.mockResolvedValue({ ok: true })
    generateCurriculum.mockResolvedValue({ generation })
    waitForCurriculumGeneration.mockResolvedValue(makeCurriculum('Generated Chapter'))

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your learning destination' }), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set my destination' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Beginner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip placement check' }))
    fireEvent.click(await screen.findByRole('button', { name: '30 min/day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Build my Track' }))

    expect(await screen.findByRole('heading', { name: /Generated Chapter/ })).toBeInTheDocument()
    expect(waitForCurriculumGeneration).toHaveBeenCalledWith(21, generation, expect.any(Function), expect.objectContaining({ signal: expect.anything() }))
  })

  it('takes the existing placement check only when selected and saves its result', async () => {
    createTopic.mockResolvedValue({ topic: { id: 22, title: 'React' } })
    getSetupQuestions.mockResolvedValue(setupQuestions({ levels: ['Beginner', 'Intermediate'], times: ['30 min/day'] }))
    startPlacementAssessment.mockResolvedValue({ assessmentId: 4, questions: [{ id: 'q1', text: 'Explain components.' }] })
    submitPlacementAssessment.mockResolvedValue({ assessmentId: 4, requestedLevel: 'Intermediate', recommendedLevel: 'Beginner', gaps: [], feedback: [] })
    saveProfile.mockResolvedValue({ ok: true })
    generateCurriculum.mockImplementation(() => new Promise(() => {}))

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your learning destination' }), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set my destination' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Intermediate' }))

    expect(startPlacementAssessment).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Take a placement check' }))
    expect(await screen.findByRole('textbox', { name: 'Explain components.' })).toBeInTheDocument()
    expect(startPlacementAssessment).toHaveBeenCalledWith(22, 'Intermediate')
    fireEvent.change(screen.getByRole('textbox', { name: 'Explain components.' }), { target: { value: 'Components describe a view.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check my starting point' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Beginner' }))
    expect(await screen.findByRole('heading', { name: 'Set your learning rhythm' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '30 min/day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Build my Track' }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(22, expect.objectContaining({
      level: 'Beginner',
      selfReportedLevel: 'Intermediate',
      placementAssessmentId: 4,
      timeCommitment: '30 min/day',
    })))
  })

  it('retries setup choices and hides raw database errors', async () => {
    createTopic.mockResolvedValue({ topic: { id: 23, title: 'React' } })
    getSetupQuestions.mockRejectedValueOnce(new Error('SQLITE_ERROR: no such table: topics')).mockResolvedValueOnce(setupQuestions())

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your learning destination' }), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set my destination' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your starting choices.')
    expect(screen.queryByText(/sqlite|table: topics/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry choices' }))
    expect(await screen.findByText('What is your starting point?')).toBeInTheDocument()
    expect(getSetupQuestions).toHaveBeenCalledTimes(2)
  })

  it('recovers a failed generation and opens a saved structured Track preview', async () => {
    getCurriculumRecovery.mockResolvedValue({
      topic: { id: 24, title: 'React', level: 'Beginner', timeCommitment: '30 min/day' },
      curriculumState: 'failed',
      curriculumError: 'The provider connection was lost.',
      curriculum: null,
      resumeAvailable: true,
    })
    generateCurriculum.mockResolvedValue(curriculumResponse(makeCurriculum('Recovered Chapter')))

    render(<MemoryRouter initialEntries={['/onboarding?topicId=24']}><OnboardingFlow /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Your Track is ready to resume' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('The provider connection was lost.')
    expect(generateCurriculum).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Resume Track generation' }))

    expect(await screen.findByRole('heading', { name: /Recovered Chapter/ })).toBeInTheDocument()
    expect(generateCurriculum).toHaveBeenCalledWith(24)
    expect(screen.getByRole('button', { name: 'Add to my Trail' })).toBeInTheDocument()
  })

  it('keeps the onboarding layout stable while restoring a generation job', () => {
    getCurriculumRecovery.mockImplementation(() => new Promise(() => {}))
    render(<MemoryRouter initialEntries={['/onboarding?topicId=26']}><OnboardingFlow /></MemoryRouter>)

    expect(screen.getByRole('status', { name: 'Loading onboarding' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /what do you want to be able to do/i })).not.toBeInTheDocument()
  })

  it('loads an already-saved Track preview without regenerating it', async () => {
    getCurriculumRecovery.mockResolvedValue({
      topic: { id: 25, title: 'React', level: 'Intermediate', timeCommitment: '1 hour/day' },
      curriculumState: 'draft_ready',
      curriculumError: null,
      curriculum: makeCurriculum('Saved Chapter'),
      resumeAvailable: true,
    })

    render(<MemoryRouter initialEntries={['/onboarding?topicId=25']}><OnboardingFlow /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /Saved Chapter/ })).toBeInTheDocument()
    expect(generateCurriculum).not.toHaveBeenCalled()
  })
})

describe('CurriculumConfirmation', () => {
  const curriculum = makeCurriculum()

  beforeEach(() => vi.clearAllMocks())

  it('previews a finite Track with outcome summaries, Chapters, and Build markers', () => {
    render(<CurriculumConfirmation curriculum={curriculum} isTrackSetup topicName="React" timeCommitment="30 min/day" pace="Steady pace" />)

    expect(screen.getByRole('heading', { name: 'React Track preview' })).toBeInTheDocument()
    expect(screen.getByText(/3 outcomes · 2 core · 1 breadth/i)).toBeInTheDocument()
    expect(screen.getByText('Chapter 1 · Basics')).toBeInTheDocument()
    expect(screen.getByText('Intro')).toBeInTheDocument()
    expect(screen.getByText('Components')).toBeInTheDocument()
    expect(screen.getByText('Build')).toBeInTheDocument()
    expect(screen.getByText('30 min/day · Steady pace')).toBeInTheDocument()
    expect(screen.getByText(/each chapter ends with a checkpoint/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /test out/i })).not.toBeInTheDocument()
  })

  it('reveals structured outcomes and Session prerequisites on demand', () => {
    render(<CurriculumConfirmation curriculum={curriculum} />)
    const expand = screen.getAllByRole('button', { name: 'Expand Session details' })[1]
    fireEvent.click(expand)
    expect(expand).toHaveAttribute('aria-expanded', 'true')
    const details = screen.getByRole('region', { name: 'Components details' })
    expect(within(details).getByText('Build a reusable component')).toBeInTheDocument()
    expect(within(details).getByText(/Session prerequisites/i)).toBeInTheDocument()
    expect(within(details).getByText('Intro')).toBeInTheDocument()
  })

  it('confirms the Track when Add to my Trail is selected', async () => {
    const onConfirm = vi.fn()
    render(<CurriculumConfirmation curriculum={curriculum} isTrackSetup onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to my Trail' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce())
  })

  it('applies requested plan adjustments', async () => {
    const onTweak = vi.fn()
    render(<CurriculumConfirmation curriculum={curriculum} isTrackSetup onTweak={onTweak} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adjust plan' }))
    fireEvent.change(screen.getByLabelText('What would you like to adjust?'), { target: { value: 'Add a chapter on testing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply adjustments' }))
    await waitFor(() => expect(onTweak).toHaveBeenCalledWith('Add a chapter on testing'))
  })

  it('allows refreshing the preview from adjustment options', async () => {
    const onRegenerate = vi.fn()
    render(<CurriculumConfirmation curriculum={curriculum} isTrackSetup onRegenerate={onRegenerate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adjust plan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' }))
    await waitFor(() => expect(onRegenerate).toHaveBeenCalledOnce())
  })
})
