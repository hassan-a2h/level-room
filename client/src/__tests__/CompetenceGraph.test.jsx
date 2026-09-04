import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import CompetenceGraph from '../components/CompetenceGraph'

describe('CompetenceGraph', () => {
  const modules = [
    {
      id: 1,
      title: 'Basics',
      lessons: [
        { id: 1, title: 'JSX', state: 'passed', depth: 'Beginner', estimated_time: 10, prerequisites: [], locked: false },
        { id: 2, title: 'Components', state: 'practicing', depth: 'Beginner', estimated_time: 15, prerequisites: [{ lessonId: 1, title: 'JSX' }], locked: false },
        { id: 3, title: 'Props', state: 'not_started', depth: 'Beginner', estimated_time: 12, prerequisites: [{ lessonId: 2, title: 'Components' }], locked: true },
        { id: 4, title: 'State', state: 'skipped', depth: 'Intermediate', estimated_time: 20, prerequisites: [{ lessonId: 2, title: 'Components' }], locked: true },
        { id: 5, title: 'Hooks', state: 'tested_out', depth: 'Advanced', estimated_time: 25, prerequisites: [{ lessonId: 3, title: 'Props' }, { lessonId: 4, title: 'State' }], locked: true },
        { id: 6, title: 'Quiz Pending', state: 'quiz_pending', depth: 'Advanced', estimated_time: 20, prerequisites: [], locked: false },
        { id: 7, title: 'Remediation', state: 'remediating', depth: 'Advanced', estimated_time: 20, prerequisites: [], locked: false },
      ],
    },
  ]

  it('renders as a region with aria label', () => {
    render(<CompetenceGraph modules={modules} />)
    expect(screen.getByRole('region', { name: /competence graph/i })).toBeInTheDocument()
  })

  it('renders all lesson nodes', () => {
    render(<CompetenceGraph modules={modules} />)
    expect(screen.getByRole('button', { name: /JSX, Passed/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Components, Practicing/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Props, Not started/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /State, Skipped/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hooks, Tested out/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Quiz Pending, Quiz pending/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remediation, Remediating/i })).toBeInTheDocument()
  })

  it('shows each lesson state as visible text inside its graph node', () => {
    render(<CompetenceGraph modules={modules} />)
    const nodeStates = [
      ['JSX, Passed', 'Passed'],
      ['Components, Practicing', 'Practicing'],
      ['Props, Not started', 'Not started'],
      ['State, Skipped', 'Skipped'],
      ['Hooks, Tested out', 'Tested out'],
      ['Quiz Pending, Quiz pending', 'Quiz pending'],
      ['Remediation, Remediating', 'Remediating'],
    ]

    for (const [nodeName, stateLabel] of nodeStates) {
      expect(screen.getByRole('button', { name: new RegExp(nodeName, 'i') })).toHaveTextContent(stateLabel)
    }
  })

  it('displays a text legend with every lesson state', () => {
    render(<CompetenceGraph modules={modules} />)
    const legend = within(screen.getByRole('list', { name: /lesson status legend/i }))
    for (const label of ['Not started', 'Practicing', 'Quiz pending', 'Remediating', 'Passed', 'Skipped', 'Tested out']) {
      expect(legend.getByText(label)).toBeInTheDocument()
    }
  })

  it('clicking unlocked node triggers onNodeClick', () => {
    const onClick = vi.fn()
    render(<CompetenceGraph modules={modules} onNodeClick={onClick} />)

    const node = screen.getByRole('button', { name: /Components, Practicing/i })
    fireEvent.click(node)

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, title: 'Components', state: 'practicing' })
    )
  })

  it('clicking locked node does not trigger onNodeClick', () => {
    const onClick = vi.fn()
    render(<CompetenceGraph modules={modules} onNodeClick={onClick} />)

    // Props is locked
    const node = screen.getByRole('button', { name: /Props, Not started/i })
    fireEvent.click(node)

    // Locked clicks are swallowed
    expect(onClick).not.toHaveBeenCalled()
  })

  it('nodes are focusable for keyboard navigation', () => {
    render(<CompetenceGraph modules={modules} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(5)
    buttons.forEach((btn) => {
      expect(btn).toHaveAttribute('tabindex', '0')
      expect(btn).toHaveAttribute('aria-label')
    })
  })

  it('announces extended tooltip details when a lesson node receives keyboard focus', () => {
    render(<CompetenceGraph modules={modules} />)
    const node = screen.getByRole('button', { name: /Components, Practicing/i })
    fireEvent.focus(node)

    const tooltipId = node.getAttribute('aria-describedby')
    expect(tooltipId).toBeTruthy()
    const tooltip = document.getElementById(tooltipId)
    expect(tooltip).toHaveAttribute('role', 'tooltip')
    expect(tooltip).toHaveTextContent('~15 min')
  })

  it('activates unlocked nodes with Enter and Space', () => {
    const onClick = vi.fn()
    render(<CompetenceGraph modules={modules} onNodeClick={onClick} />)
    const node = screen.getByRole('button', { name: /Components, Practicing/i })

    fireEvent.keyDown(node, { key: 'Enter' })
    fireEvent.keyDown(node, { key: ' ' })

    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('keeps the full graph at a readable width in a keyboard-scrollable region', () => {
    render(<CompetenceGraph modules={modules} />)
    const scrollRegion = screen.getByRole('group', { name: /scroll horizontally to explore lessons/i })

    expect(scrollRegion).toHaveAttribute('tabindex', '0')
    expect(scrollRegion).toHaveClass('overflow-x-auto')
    expect(screen.getByRole('application')).toHaveStyle({ width: '400px' })
  })

  it('uses theme status tokens for lesson state styling', () => {
    render(<CompetenceGraph modules={modules} />)
    const practicingNode = screen.getByRole('button', { name: /Components, Practicing/i })

    expect(practicingNode.querySelector('rect')).toHaveAttribute('fill', 'var(--ui-warning-bg)')
  })

  it('tooltip appears on hover', async () => {
    render(<CompetenceGraph modules={modules} />)
    const node = screen.getByRole('button', { name: /JSX, Passed/i })
    fireEvent.mouseEnter(node)
    // Tooltip content is in DOM
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })
})
