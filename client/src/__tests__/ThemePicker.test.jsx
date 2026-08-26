import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '../theme/ThemeProvider.jsx'
import ThemePicker from '../components/ThemePicker.jsx'

afterEach(() => { cleanup(); window.localStorage.clear() })

describe('ThemePicker', () => {
  it('groups all 16 presets by mode and exposes selection accessibly', () => {
    render(<ThemeProvider><ThemePicker /></ThemeProvider>)
    expect(screen.getByRole('group', { name: 'Light themes' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Dark themes' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(16)
    expect(screen.getByRole('radio', { name: /Morning Mist/ })).toBeChecked()
    expect(screen.getByText(/applies immediately and is saved in this browser when you choose it/i)).toBeInTheDocument()
  })

  it('applies a selected theme immediately and can reset to Morning Mist', () => {
    render(<ThemeProvider><ThemePicker /></ThemeProvider>)
    fireEvent.click(screen.getByRole('radio', { name: /Cocoa Evening/ }))
    expect(screen.getByRole('radio', { name: /Cocoa Evening/ })).toBeChecked()
    expect(document.documentElement).toHaveAttribute('data-theme', 'cocoa-evening')
    fireEvent.click(screen.getByRole('button', { name: 'Use Morning Mist' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'morning-mist')
    expect(screen.getByRole('radio', { name: /Morning Mist/ })).toBeChecked()
  })
})
