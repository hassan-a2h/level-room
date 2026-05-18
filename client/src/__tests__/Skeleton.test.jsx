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
  it('renders the specified number of lines', () => {
    render(<SkeletonText lines={3} />)
    const lines = document.querySelectorAll('.h-4')
    expect(lines.length).toBe(3)
  })

  it('has animate-pulse class', () => {
    render(<SkeletonText lines={1} />)
    const line = document.querySelector('.animate-pulse')
    expect(line).toBeInTheDocument()
  })
})

describe('SkeletonCard', () => {
  it('renders the specified number of cards', () => {
    render(<SkeletonCard count={2} />)
    const cards = document.querySelectorAll('.rounded-xl')
    expect(cards.length).toBe(2)
  })
})

describe('SkeletonGraph', () => {
  it('renders graph placeholder with multiple nodes', () => {
    render(<SkeletonGraph />)
    const nodes = document.querySelectorAll('.h-12')
    expect(nodes.length).toBe(8)
  })

  it('has animate-pulse on nodes', () => {
    render(<SkeletonGraph />)
    const node = document.querySelector('.h-12')
    expect(node.className.includes('animate-pulse')).toBe(true)
  })
})

describe('SkeletonLesson', () => {
  it('renders lesson chat placeholder', () => {
    render(<SkeletonLesson />)
    expect(document.querySelector('.min-h-screen')).toBeInTheDocument()
  })
})

describe('SkeletonQuiz', () => {
  it('renders quiz placeholder with question cards', () => {
    render(<SkeletonQuiz />)
    const questions = document.querySelectorAll('.rounded-xl')
    expect(questions.length).toBe(3)
  })
})

describe('SkeletonOnboarding', () => {
  it('renders onboarding placeholder', () => {
    render(<SkeletonOnboarding />)
    expect(document.querySelector('.min-h-screen')).toBeInTheDocument()
  })
})

describe('SkeletonSettings', () => {
  it('renders settings placeholder', () => {
    render(<SkeletonSettings />)
    expect(document.querySelector('.min-h-screen')).toBeInTheDocument()
  })
})
