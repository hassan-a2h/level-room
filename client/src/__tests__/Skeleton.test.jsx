import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  SkeletonText,
  SkeletonCard,
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
