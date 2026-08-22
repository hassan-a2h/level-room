import { describe, expect, it } from 'vitest'
import { THEMES, THEME_IDS, getTheme } from '../theme/themes.js'

const requiredTokens = [
  'canvas', 'surface', 'surfaceAlt', 'surfaceInset', 'text', 'textSecondary', 'textMuted',
  'inverseText', 'border', 'divider', 'action', 'actionHover', 'actionText', 'focus', 'link',
  'track', 'userBubble', 'userBubbleText', 'userBubbleBorder', 'tutorBubble', 'tutorBubbleText',
  'successBg', 'successText', 'successBorder', 'progressBg', 'progressText', 'progressBorder',
  'warningBg', 'warningText', 'warningBorder', 'dangerBg', 'dangerText', 'dangerBorder',
  'neutralBg', 'neutralText', 'neutralBorder', 'shadowLight', 'shadowDark', 'shadowInset',
]

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16) / 255)
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((left, right) => right - left)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe('theme catalog', () => {
  it('contains the 16 named presets, evenly split between light and dark', () => {
    expect(THEMES).toHaveLength(16)
    expect(new Set(THEME_IDS).size).toBe(16)
    expect(THEMES.filter((theme) => theme.mode === 'light')).toHaveLength(8)
    expect(THEMES.filter((theme) => theme.mode === 'dark')).toHaveLength(8)
    expect(getTheme('morning-mist')?.name).toBe('Morning Mist')
    expect(THEMES.map((theme) => theme.name)).toEqual([
      'Morning Mist', 'Quiet Linen', 'Sage Garden', 'Blue Harbor', 'Lavender Still', 'Warm Sand',
      'Rosewater', 'Sea Glass', 'Midnight Ink', 'Deep Ocean', 'Forest Dusk', 'Plum Twilight',
      'Graphite Calm', 'Night Lavender', 'Moss Night', 'Cocoa Evening',
    ])
  })

  it('provides the complete semantic palette and accessible text and state contrast in every preset', () => {
    for (const theme of THEMES) {
      expect(Object.keys(theme.tokens)).toEqual(expect.arrayContaining(requiredTokens))
      const t = theme.tokens
      for (const surface of [t.canvas, t.surface, t.surfaceInset]) {
        expect(contrast(t.text, surface), `${theme.name}: primary text`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.textSecondary, surface), `${theme.name}: secondary text`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.textMuted, surface), `${theme.name}: muted text`).toBeGreaterThanOrEqual(4.5)
      }
      for (const surface of [t.surface, t.surfaceAlt]) {
        expect(contrast(t.border, surface), `${theme.name}: control boundary`).toBeGreaterThanOrEqual(3)
      }
      for (const [label, foreground, background, border] of [
        ['action', t.actionText, t.action, t.action],
        ['learner message', t.userBubbleText, t.userBubble, t.userBubbleBorder],
        ['tutor message', t.tutorBubbleText, t.tutorBubble, null],
        ['success', t.successText, t.successBg, t.successBorder],
        ['in progress', t.progressText, t.progressBg, t.progressBorder],
        ['warning', t.warningText, t.warningBg, t.warningBorder],
        ['danger', t.dangerText, t.dangerBg, t.dangerBorder],
        ['neutral', t.neutralText, t.neutralBg, t.neutralBorder],
      ]) {
        expect(contrast(foreground, background), `${theme.name}: ${label} text`).toBeGreaterThanOrEqual(4.5)
        if (border) expect(contrast(border, t.surface), `${theme.name}: ${label} boundary`).toBeGreaterThanOrEqual(3)
      }
      expect(contrast(t.focus, t.surface), `${theme.name}: focus ring`).toBeGreaterThanOrEqual(3)
      expect(contrast(t.link, t.surface), `${theme.name}: link`).toBeGreaterThanOrEqual(4.5)
      expect(t.shadowLight).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
