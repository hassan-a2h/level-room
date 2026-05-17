import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  })

  it('displays legend with all 5 states', () => {
    render(<CompetenceGraph modules={modules} />)
    expect(screen.getByText('Not started')).toBeInTheDocument()
    expect(screen.getByText('Practicing')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('Skipped')).toBeInTheDocument()
    expect(screen.getByText('Tested out')).toBeInTheDocument()
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

  it('tooltip appears on hover', async () => {
    render(<CompetenceGraph modules={modules} />)
    const node = screen.getByRole('button', { name: /JSX, Passed/i })
    fireEvent.mouseEnter(node)
    // Tooltip content is in DOM
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })
})
