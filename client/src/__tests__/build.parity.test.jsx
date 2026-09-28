import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ArtifactPanel from '../components/ArtifactPanel.jsx'
import { ThemeProvider, THEME_STORAGE_KEY, useTheme } from '../theme/ThemeProvider.jsx'

vi.mock('../api.js', () => ({ submitArtifact: vi.fn(), getArtifact: vi.fn(), getLocalDate: () => '2026-09-26' }))
import { getArtifact, submitArtifact } from '../api.js'

function ThemeSwitch() {
  const { selectTheme } = useTheme()
  return <button type="button" onClick={() => selectTheme('living-atlas')}>Swap theme</button>
}

describe('Build parity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps safety visible, hints disclosed on request, and evidence available through evaluation', async () => {
    getArtifact.mockRejectedValue(new Error('No prior artifact'))
    let resolveEvaluation
    submitArtifact.mockReturnValueOnce(new Promise((resolve) => { resolveEvaluation = resolve }))
    const lesson = { artifact_type: 'task_evidence', task_spec: {
      title: 'Safe task', scenario: 'Practice locally', goal: 'Observe behavior',
      safety_notes: ['Use a local sandbox.'], hints: ['Start small.'],
    } }
    window.localStorage.setItem(THEME_STORAGE_KEY, 'curiosity-engine')
    render(<ThemeProvider><ThemeSwitch /><ArtifactPanel topicId="2" lessonId="8" lesson={lesson} onBack={vi.fn()} /></ThemeProvider>)
    expect(await screen.findByText('Use a local sandbox.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Build stages' })).toHaveTextContent('Brief')
    expect(screen.getByRole('list', { name: 'Build stages' })).toHaveTextContent('Evidence')
    expect(screen.queryByText('Start small.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /show hints/i }))
    expect(screen.getByText('Start small.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Review rubric'))
    expect(screen.getByText('Evaluation Rubric')).toBeInTheDocument()
    for (const label of ['Setup', 'Actions taken', 'Observed result', 'Reflection']) {
      fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value: `${label} evidence` } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Swap theme' }))
    await waitFor(() => expect(document.querySelector('.learning-surface--atlas')).toBeInTheDocument())
    for (const label of ['Setup', 'Actions taken', 'Observed result', 'Reflection']) {
      expect(screen.getByRole('textbox', { name: label })).toHaveValue(`${label} evidence`)
    }
    fireEvent.click(screen.getByRole('button', { name: /submit build/i }))
    await waitFor(() => expect(screen.getByRole('list', { name: 'Build stages' }).querySelector('[aria-current="step"]')).toHaveTextContent('Evaluating'))
    resolveEvaluation({ evaluation: { overallScore: 75, passed: true, scores: {}, feedback: {} } })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Result' })).toBeInTheDocument())
    expect(screen.getByText('Setup evidence')).toBeInTheDocument()
  })
})
