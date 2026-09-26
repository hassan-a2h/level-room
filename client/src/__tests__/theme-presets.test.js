import { describe, expect, it } from 'vitest'
import { THEMES, THEME_IDS, getTheme } from '../theme/themes.js'

const requiredTokens = [
  'canvas', 'canvasSubtle', 'surface', 'surfaceRaised', 'surfaceSunken', 'border', 'borderStrong',
  'text', 'textSoft', 'textMuted', 'accent', 'accentHover', 'accentSoft', 'accentContrast', 'focus',
  'success', 'successSoft', 'warning', 'warningSoft', 'danger', 'dangerSoft',
  'successBorder', 'warningBorder', 'dangerBorder',
  'trailComplete', 'trailCurrent', 'trailFuture', 'shadowColor',
  'radiusSm', 'radiusMd', 'radiusLg', 'radiusXl',
  ...Array.from({ length: 12 }, (_, index) => `space${index + 1}`),
  'durationFast', 'durationStandard', 'durationCelebration',
]

const anchors = {
  'morning-mist': ['#F1F5F3', '#FFFEFA', '#23312C', '#3E7163'],
  'quiet-linen': ['#F6F0E6', '#FFFCF5', '#352F29', '#765D88'],
  'sage-garden': ['#EDF4E9', '#FBFFF7', '#233426', '#4E7852'],
  'blue-harbor': ['#EBF3F5', '#FAFEFF', '#20343A', '#39727A'],
  'lavender-still': ['#F2EEF7', '#FCFAFF', '#332D3F', '#745F91'],
  'warm-sand': ['#F7EEDD', '#FFFBF2', '#3C3024', '#9B5E42'],
  rosewater: ['#F8EEEE', '#FFF9F8', '#402E33', '#96596A'],
  'sea-glass': ['#EAF4F0', '#FAFFFC', '#1F3530', '#39786D'],
  'midnight-ink': ['#171D23', '#202830', '#EEF3F1', '#86B7A8'],
  'deep-ocean': ['#122229', '#1B3038', '#ECF5F5', '#75BCC0'],
  'forest-dusk': ['#18231D', '#233128', '#EEF5EC', '#91BE8E'],
  'plum-twilight': ['#211B27', '#302638', '#F5EFF7', '#C19BCB'],
  'graphite-calm': ['#1B2024', '#282E33', '#F1F3F4', '#9DB7C8'],
  'night-lavender': ['#1B1B29', '#29283A', '#F2F0FA', '#B0A5DC'],
  'moss-night': ['#20231B', '#2D3126', '#F2F4EA', '#AFBE83'],
  'cocoa-evening': ['#251E19', '#342921', '#FAF1EA', '#C99776'],
}

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

  it('preserves each published palette anchor', () => {
    for (const theme of THEMES) {
      const [canvas, surface, text, accent] = anchors[theme.id]
      expect(theme.tokens.canvas.toUpperCase(), `${theme.name}: canvas`).toBe(canvas)
      expect(theme.tokens.surface.toUpperCase(), `${theme.name}: surface`).toBe(surface)
      expect(theme.tokens.text.toUpperCase(), `${theme.name}: text`).toBe(text)
      expect(theme.tokens.accent.toUpperCase(), `${theme.name}: accent`).toBe(accent)
    }
  })

  it('provides the complete semantic palette and accessible contrast in every preset', () => {
    for (const theme of THEMES) {
      expect(Object.keys(theme.tokens)).toEqual(expect.arrayContaining(requiredTokens))
      const t = theme.tokens
      for (const surface of [t.canvas, t.surface, t.surfaceRaised, t.surfaceSunken]) {
        expect(contrast(t.text, surface), `${theme.name}: primary text`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.textSoft, surface), `${theme.name}: soft text`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.textMuted, surface), `${theme.name}: muted text`).toBeGreaterThanOrEqual(4.5)
      }
      for (const surface of [t.canvas, t.surface, t.surfaceRaised, t.surfaceSunken]) {
        expect(contrast(t.border, surface), `${theme.name}: control boundary`).toBeGreaterThanOrEqual(3)
        expect(contrast(t.borderStrong, surface), `${theme.name}: strong boundary`).toBeGreaterThanOrEqual(3)
      }
      expect(contrast(t.accent, t.surface), `${theme.name}: accent link`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.accent, t.accentSoft), `${theme.name}: accent on soft`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.accentContrast, t.accent), `${theme.name}: accent label`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.accentContrast, t.accentHover), `${theme.name}: hovered accent label`).toBeGreaterThanOrEqual(4.5)
      expect(t.danger.toLowerCase(), `${theme.name}: danger remains distinct from accent`).not.toBe(t.accent.toLowerCase())
      for (const [label, foreground, background, border] of [
        ['success', t.success, t.successSoft, t.successBorder],
        ['warning', t.warning, t.warningSoft, t.warningBorder],
        ['danger', t.danger, t.dangerSoft, t.dangerBorder],
      ]) {
        expect(contrast(foreground, background), `${theme.name}: ${label} text`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(border, t.surface), `${theme.name}: ${label} boundary`).toBeGreaterThanOrEqual(3)
      }
      expect(contrast(t.focus, t.surface), `${theme.name}: focus ring`).toBeGreaterThanOrEqual(3)
      expect(contrast(t.focus, t.canvas), `${theme.name}: focus on canvas`).toBeGreaterThanOrEqual(3)
      expect(contrast(t.trailComplete, t.surface), `${theme.name}: completed trail`).toBeGreaterThanOrEqual(3)
      expect(contrast(t.trailCurrent, t.surface), `${theme.name}: current trail`).toBeGreaterThanOrEqual(3)
      expect(contrast(t.trailFuture, t.surface), `${theme.name}: future trail`).toBeGreaterThanOrEqual(3)
      expect(t.shadowColor).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
