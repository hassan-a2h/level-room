import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Button from '../components/ui/Button.jsx'
import Surface from '../components/ui/Surface.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import ProgressBar from '../components/ui/ProgressBar.jsx'
import Dialog from '../components/ui/Dialog.jsx'
import Sheet from '../components/ui/Sheet.jsx'
import Disclosure from '../components/ui/Disclosure.jsx'
import IconButton from '../components/ui/IconButton.jsx'
import LearningObjectStage from '../components/ui/LearningObjectStage.jsx'
import ErrorNotice from '../components/ui/ErrorNotice.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'

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

  it('renders the shared interaction, learning, error, and empty-state primitives accessibly', () => {
    render(
      <>
        <Dialog open title="Confirm action">Confirm?</Dialog>
        <Sheet open title="More options">Options</Sheet>
        <Disclosure open title="Details">Extra detail</Disclosure>
        <IconButton label="Close panel">×</IconButton>
        <LearningObjectStage title="Worked example">Example content</LearningObjectStage>
        <ErrorNotice title="Save failed">Try again.</ErrorNotice>
        <EmptyState title="No lessons yet">Start by building a Track.</EmptyState>
      </>,
    )
    expect(screen.getByRole('dialog', { name: 'Confirm action' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('dialog', { name: 'More options' })).toBeInTheDocument()
    expect(screen.getByText('Extra detail')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close panel' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('region', { name: 'Worked example' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Try again.')
    expect(screen.getByRole('region', { name: 'No lessons yet' })).toBeInTheDocument()
  })
})
