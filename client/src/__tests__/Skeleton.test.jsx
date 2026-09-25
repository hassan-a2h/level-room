import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  SkeletonText,
  SkeletonCard,
  SkeletonGraph,
  SkeletonLesson,
  SkeletonQuiz,
  SkeletonOnboarding,
  SkeletonSettings,
} from '../components/Skeleton.jsx'

describe('SkeletonText', () => {
  it('announces loading text and renders the requested number of neutral lines', () => {
    render(<SkeletonText lines={3} />)
    expect(screen.getByRole('status', { name: 'Loading text' })).toBeInTheDocument()
    const lines = document.querySelectorAll('[data-skeleton="text-line"]')
    expect(lines.length).toBe(3)
  })

  it('does not use distracting pulse animation', () => {
    render(<SkeletonText lines={1} />)
    expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument()
  })
})

describe('SkeletonCard', () => {
  it('renders the specified number of cards', () => {
    render(<SkeletonCard count={2} />)
    const cards = document.querySelectorAll('[data-skeleton="card"]')
    expect(cards.length).toBe(2)
  })
})

describe('SkeletonGraph', () => {
  it('renders graph placeholder with multiple nodes', () => {
    render(<SkeletonGraph />)
    const nodes = document.querySelectorAll('[data-skeleton="graph-node"]')
    expect(nodes.length).toBe(8)
  })

  it('uses a quiet, non-animated placeholder for nodes', () => {
    render(<SkeletonGraph />)
    const node = document.querySelector('[data-skeleton="graph-node"]')
    expect(node).toHaveClass('ui-skeleton')
    expect(node).not.toHaveClass('animate-pulse')
  })
})

describe('SkeletonLesson', () => {
  it('renders lesson chat placeholder', () => {
    render(<SkeletonLesson />)
    expect(screen.getByRole('status', { name: 'Loading lesson' })).toBeInTheDocument()
  })
})

describe('SkeletonQuiz', () => {
  it('renders quiz placeholder with question cards', () => {
    render(<SkeletonQuiz />)
    const questions = document.querySelectorAll('[data-skeleton="question"]')
    expect(questions.length).toBe(3)
  })
})

describe('SkeletonOnboarding', () => {
  it('renders onboarding placeholder', () => {
    render(<SkeletonOnboarding />)
    expect(screen.getByRole('status', { name: 'Loading onboarding' })).toBeInTheDocument()
  })
})

describe('SkeletonSettings', () => {
  it('renders settings placeholder', () => {
    render(<SkeletonSettings />)
    expect(screen.getByRole('status', { name: 'Loading settings' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-skeleton-section]')).toHaveLength(5)
    expect(document.querySelectorAll('[data-skeleton-section="appearance"]')).toHaveLength(1)
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(0)
  })
})
