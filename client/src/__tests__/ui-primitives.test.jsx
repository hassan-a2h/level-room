import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Button from '../components/ui/Button.jsx'
import Surface from '../components/ui/Surface.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import ProgressBar from '../components/ui/ProgressBar.jsx'

describe('shared UI primitives', () => {
  it('renders named native buttons with explicit type, variant, and disabled semantics', () => {
    render(<Button variant="secondary" disabled>Continue</Button>)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('renders surfaces with their requested semantic treatment', () => {
    render(<Surface variant="inset" aria-label="Answer panel">Answer</Surface>)
    expect(screen.getByLabelText('Answer panel')).toHaveAttribute('data-variant', 'inset')
  })

  it('keeps status meaning in text and exposes progress values accessibly', () => {
    render(<><StatusBadge status="success">Passed</StatusBadge><ProgressBar value={2} max={4} label="Lessons complete" /></>)
    expect(screen.getByText('Passed')).toHaveAttribute('data-status', 'success')
    expect(screen.getByRole('progressbar', { name: 'Lessons complete' })).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByText('2 of 4')).toBeInTheDocument()
  })
})
