import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppShell, { AppShellHeader } from '../components/layout/AppShell.jsx'

describe('AppShell', () => {
  it('provides one accessible navigation set that adapts to mobile with a Trail switcher', () => {
    render(
      <MemoryRouter initialEntries={['/reviews']}>
        <AppShell><AppShellHeader dueCount={3} /></AppShell>
      </MemoryRouter>,
    )

    const nav = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(nav.getByRole('link', { name: 'Trail' })).toHaveAttribute('href', '/')
    expect(nav.getByRole('link', { name: 'Reviews, 3 due' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(nav.getByRole('link', { name: 'New Trail' })).toHaveAttribute('href', '/onboarding')
    expect(nav.getAllByRole('link')).toHaveLength(4)
    expect(nav.getByRole('button', { name: 'Open Trail switcher' })).toBeInTheDocument()
  })

  it('opens the accessible Trail switcher and restores focus when Escape closes it', () => {
    render(
      <MemoryRouter>
        <AppShell><AppShellHeader /></AppShell>
      </MemoryRouter>,
    )

    const trigger = screen.getByRole('button', { name: 'Open Trail switcher' })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group', { name: 'Trail switcher options' })).toHaveTextContent('New Trail')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(trigger)
  })

  it('does not show a due badge when the count is unavailable or zero', () => {
    const { rerender } = render(
      <MemoryRouter><AppShell><AppShellHeader /></AppShell></MemoryRouter>,
    )
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Reviews' })).toHaveLength(1)

    for (const dueCount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '3']) {
      rerender(<MemoryRouter><AppShell><AppShellHeader dueCount={dueCount} /></AppShell></MemoryRouter>)
      expect(screen.queryByText(String(dueCount))).not.toBeInTheDocument()
      expect(screen.getAllByRole('link', { name: 'Reviews' })).toHaveLength(1)
    }
  })

  it('defines the semantic token contract and reduced-motion behavior without Tailwind color bridging', () => {
    const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
    const motionCss = readFileSync(resolve(process.cwd(), 'src/styles/motion.css'), 'utf8')
    const componentsCss = readFileSync(resolve(process.cwd(), 'src/styles/components.css'), 'utf8')
    const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const required = [
      'canvas', 'canvas-subtle', 'surface', 'surface-raised', 'surface-sunken', 'border', 'border-strong',
      'text', 'text-soft', 'text-muted', 'accent', 'accent-hover', 'accent-soft', 'accent-contrast', 'focus',
      'success', 'success-soft', 'warning', 'warning-soft', 'danger', 'danger-soft',
      'trail-complete', 'trail-current', 'trail-future', 'shadow-color',
      ...Array.from({ length: 12 }, (_, index) => `space-${index + 1}`),
      'radius-sm', 'radius-md', 'radius-lg', 'radius-xl',
      'duration-fast', 'duration-standard', 'duration-celebration',
    ]

    for (const name of required) expect(tokensCss).toContain(`--${name}`)
    expect(motionCss).toMatch(/prefers-reduced-motion:\s*reduce/)
    expect(motionCss).toMatch(/scroll-behavior:\s*auto/)
    expect(componentsCss).toMatch(/\.app-shell-new-trail\s*\{\s*display:\s*none;/)
    expect(componentsCss).toMatch(/\.app-shell-primary-nav\s*\{\s*position:\s*fixed;[^}]*grid-template-columns:\s*repeat\(3,/)
    expect(indexCss).toContain('@import "tailwindcss";')
    for (const layer of ['tokens', 'base', 'components', 'motion']) {
      expect(indexCss).toContain(`./styles/${layer}.css`)
    }
    expect(indexCss).not.toMatch(/\.(?:bg|text|border)-(?:white|gray|indigo|blue|green|red|amber|yellow|orange)(?:-|:|\s|,|\{)/)
  })
})
