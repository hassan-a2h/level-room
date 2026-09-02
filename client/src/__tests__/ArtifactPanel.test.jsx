import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ArtifactPanel from '../components/ArtifactPanel.jsx'

vi.mock('../api.js', () => ({
  submitArtifact: vi.fn(),
  getArtifact: vi.fn(),
  getLocalDate: vi.fn(() => '2024-06-01'),
}))

import { submitArtifact, getArtifact } from '../api.js'

describe('ArtifactPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the artifact submission form', async () => {
    getArtifact.mockRejectedValue(new Error('No artifact'))

    render(
      <ArtifactPanel
        topicId={1}
        lessonId={1}
        lesson={{ artifact_type: 'code', artifact_required: true }}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Artifact/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('textbox', { name: /artifact submission/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Paste your code/i)).toBeInTheDocument()
    expect(screen.getByText(/Evaluation Rubric/i)).toBeInTheDocument()
  })

  it('shows artifact type badge', async () => {
    getArtifact.mockRejectedValue(new Error('No artifact'))

    render(
      <ArtifactPanel
        topicId={1}
        lessonId={1}
        lesson={{ artifact_type: 'design', artifact_required: true }}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/design/i)).toBeInTheDocument()
    })
  })

  it('renders structured task evidence with safety context and hidden hints', async () => {
    getArtifact.mockRejectedValue(new Error('No artifact'))
    render(
      <ArtifactPanel
        topicId={1}
        lessonId={1}
        lesson={{
          artifact_type: 'task_evidence',
          artifact_required: true,
          task_spec: {
            title: 'Build a local setup',
            scenario: 'Prepare a safe local environment.',
            goal: 'Create and verify the setup.',
            constraints: ['Use test data only'],
            deliverables: ['Commands', 'Observed output'],
            success_criteria: ['The behavior is observable', 'The result is repeatable'],
            primary_setup: { kind: 'local', description: 'Use a local installation.', requires_account: false },
            free_fallback: { kind: 'no_software', description: 'Explain the expected result.', requires_account: false },
            hints: ['Start with the smallest setup.'],
            safety_notes: ['Use only systems you own.'],
          },
        }}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => expect(screen.getByRole('heading', { name: /Build a local setup/i })).toBeInTheDocument())
    expect(screen.getByText(/Prepare a safe local environment/i)).toBeInTheDocument()
    expect(screen.getByText(/Free fallback/i)).toBeInTheDocument()
    expect(screen.getByText(/Use only systems you own/i)).toBeInTheDocument()
    expect(screen.queryByText(/Start with the smallest setup/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Show hints/i }))
    expect(screen.getByText(/Start with the smallest setup/i)).toBeInTheDocument()
  })

  it('disables submit button when content is empty', async () => {
    getArtifact.mockRejectedValue(new Error('No artifact'))

    render(
      <ArtifactPanel
        topicId={1}
        lessonId={1}
        lesson={{ artifact_type: 'code', artifact_required: true }}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Artifact/i })).toBeInTheDocument()
    })

    const btn = screen.getByRole('button', { name: /Submit Artifact/i })
    expect(btn).toBeDisabled()
  })

  it('submits artifact and shows evaluation result', async () => {
    getArtifact.mockRejectedValue(new Error('No artifact'))
    submitArtifact.mockResolvedValue({
      evaluation: {
        overallScore: 75,
        passed: true,
        scores: { Correctness: 2, Completeness: 2, Clarity: 1, 'Edge Cases': 1 },
        feedback: {
          Correctness: 'Good',
          Completeness: 'Good',
          Clarity: 'OK',
          'Edge Cases': 'OK',
        },
      },
    })

    render(
      <ArtifactPanel
        topicId={1}
        lessonId={1}
        lesson={{ artifact_type: 'code', artifact_required: true }}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Paste your code/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/Paste your code/i)
    fireEvent.change(textarea, { target: { value: 'function add(a, b) { return a + b; }' } })
    fireEvent.click(screen.getByRole('button', { name: /Submit Artifact/i }))

    await waitFor(() => {
      expect(screen.getByText(/Artifact Approved/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Correctness/i)).toBeInTheDocument()
    expect(screen.getByText(/Completeness/i)).toBeInTheDocument()
    expect(screen.getByText(/Clarity/i)).toBeInTheDocument()
    expect(screen.getByText(/Edge Cases/i)).toBeInTheDocument()
    expect(screen.getAllByText(/2\/2 — Strong/i)).toHaveLength(2)
    expect(screen.getAllByText(/2\/2 — Strong/i).every((badge) => badge.dataset.status === 'success')).toBe(true)
  })

  it('shows failure state with revise option', async () => {
    getArtifact.mockRejectedValue(new Error('No artifact'))
    submitArtifact.mockResolvedValue({
      evaluation: {
        overallScore: 50,
        passed: false,
        scores: { Correctness: 0, Completeness: 1, Clarity: 1, 'Edge Cases': 0 },
        feedback: {
          Correctness: 'Bug found',
          Completeness: 'Missing parts',
          Clarity: 'Readable',
          'Edge Cases': 'Not handled',
        },
      },
    })

    render(
      <ArtifactPanel
        topicId={1}
        lessonId={1}
        lesson={{ artifact_type: 'code', artifact_required: true }}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Paste your code/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/Paste your code/i), {
      target: { value: 'bad code' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit Artifact/i }))

    await waitFor(() => {
      expect(screen.getByText(/Needs Revision/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Revise & Resubmit/i })).toBeInTheDocument()
  })

  it('loads prior artifact on mount and shows result', async () => {
    getArtifact.mockResolvedValue({
      content: 'function add(a, b) { return a + b; }',
      passed: true,
      evaluation: {
        overallScore: 75,
        scores: { Correctness: 2, Completeness: 2, Clarity: 1, 'Edge Cases': 1 },
        feedback: {
          Correctness: 'Good',
          Completeness: 'Good',
          Clarity: 'OK',
          'Edge Cases': 'OK',
        },
      },
    })

    render(
      <ArtifactPanel
        topicId={1}
        lessonId={1}
        lesson={{ artifact_type: 'code', artifact_required: true }}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Artifact Approved/i)).toBeInTheDocument()
    })
  })

  it('pre-populates previous submission when revising', async () => {
    getArtifact.mockResolvedValue({
      content: 'function add(a, b) { return a + b; }',
      passed: false,
      evaluation: {
        overallScore: 50,
        scores: { Correctness: 0, Completeness: 1, Clarity: 1, 'Edge Cases': 0 },
        feedback: {
          Correctness: 'Bug found',
          Completeness: 'Missing parts',
          Clarity: 'Readable',
          'Edge Cases': 'Not handled',
        },
      },
    })

    render(
      <ArtifactPanel
        topicId={1}
        lessonId={1}
        lesson={{ artifact_type: 'code', artifact_required: true }}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Revise & Resubmit/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Revise & Resubmit/i }))

    await waitFor(() => {
      expect(screen.getByDisplayValue(/function add/i)).toBeInTheDocument()
    })
  })

  it('shows file upload for design artifacts', async () => {
    getArtifact.mockRejectedValue(new Error('No artifact'))

    render(
      <ArtifactPanel
        topicId={1}
        lessonId={1}
        lesson={{ artifact_type: 'design', artifact_required: true }}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Upload File/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Max 5MB/i)).toBeInTheDocument()
  })
})
