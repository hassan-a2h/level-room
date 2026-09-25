const lightStatus = {
  success: '#28563A', successSoft: '#E7F2EA', successBorder: '#557D62',
  warning: '#684719', warningSoft: '#FFF1D8', warningBorder: '#96702F',
  danger: '#792F38', dangerSoft: '#FAE9EA', dangerBorder: '#A95059',
}

const darkStatus = {
  success: '#C7EAD2', successSoft: '#263D32', successBorder: '#86B99A',
  warning: '#F5DFB7', warningSoft: '#483B29', warningBorder: '#D2A85F',
  danger: '#F5D0D4', dangerSoft: '#482D34', dangerBorder: '#D78B96',
}

const lightPalettes = [
  ['morning-mist', 'Morning Mist', '#F1F5F3', '#FFFEFA', '#23312C', '#3E7163'],
  ['quiet-linen', 'Quiet Linen', '#F6F0E6', '#FFFCF5', '#352F29', '#765D88'],
  ['sage-garden', 'Sage Garden', '#EDF4E9', '#FBFFF7', '#233426', '#4E7852'],
  ['blue-harbor', 'Blue Harbor', '#EBF3F5', '#FAFEFF', '#20343A', '#39727A'],
  ['lavender-still', 'Lavender Still', '#F2EEF7', '#FCFAFF', '#332D3F', '#745F91'],
  ['warm-sand', 'Warm Sand', '#F7EEDD', '#FFFBF2', '#3C3024', '#9B5E42'],
  ['rosewater', 'Rosewater', '#F8EEEE', '#FFF9F8', '#402E33', '#96596A'],
  ['sea-glass', 'Sea Glass', '#EAF4F0', '#FAFFFC', '#1F3530', '#39786D'],
]

const darkPalettes = [
  ['midnight-ink', 'Midnight Ink', '#171D23', '#202830', '#EEF3F1', '#86B7A8'],
  ['deep-ocean', 'Deep Ocean', '#122229', '#1B3038', '#ECF5F5', '#75BCC0'],
  ['forest-dusk', 'Forest Dusk', '#18231D', '#233128', '#EEF5EC', '#91BE8E'],
  ['plum-twilight', 'Plum Twilight', '#211B27', '#302638', '#F5EFF7', '#C19BCB'],
  ['graphite-calm', 'Graphite Calm', '#1B2024', '#282E33', '#F1F3F4', '#9DB7C8'],
  ['night-lavender', 'Night Lavender', '#1B1B29', '#29283A', '#F2F0FA', '#B0A5DC'],
  ['moss-night', 'Moss Night', '#20231B', '#2D3126', '#F2F4EA', '#AFBE83'],
  ['cocoa-evening', 'Cocoa Evening', '#251E19', '#342921', '#FAF1EA', '#C99776'],
]

function mixHex(first, second, amount) {
  const channel = (color, index) => parseInt(color.slice(index, index + 2), 16)
  const channels = [1, 3, 5].map((index) => Math.round(
    channel(first, index) * (1 - amount) + channel(second, index) * amount,
  ))
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

const spacing = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [`space${index + 1}`, `${(index + 1) * 0.25}rem`]),
)

function makeTheme([id, name, canvas, surface, text, accent], mode) {
  const dark = mode === 'dark'
  const status = dark ? darkStatus : lightStatus
  const textSoft = mixHex(text, canvas, 0.14)
  const textMuted = mixHex(text, canvas, 0.25)
  const accentSoft = mixHex(surface, accent, 0.06)
  const accentHover = mixHex(accent, dark ? '#FFFFFF' : '#000000', 0.12)
  const border = dark ? '#7E8E84' : '#717E76'
  const borderStrong = dark ? '#A0AEA6' : '#58665F'

  return Object.freeze({
    id,
    name,
    mode,
    tokens: Object.freeze({
      canvas,
      canvasSubtle: mixHex(canvas, dark ? '#FFFFFF' : text, dark ? 0.06 : 0.04),
      surface,
      surfaceRaised: mixHex(surface, '#FFFFFF', dark ? 0.07 : 0.2),
      surfaceSunken: mixHex(canvas, dark ? '#000000' : text, dark ? 0.16 : 0.08),
      border,
      borderStrong,
      text,
      textSoft,
      textMuted,
      accent,
      accentHover,
      accentSoft,
      accentContrast: dark ? '#17201C' : '#FFFFFF',
      focus: accent,
      ...status,
      trailComplete: status.success,
      trailCurrent: accent,
      trailFuture: borderStrong,
      shadowColor: dark ? '#000000' : '#34433D',
      radiusSm: '0.5rem',
      radiusMd: '0.75rem',
      radiusLg: '1rem',
      radiusXl: '1.5rem',
      ...spacing,
      durationFast: '120ms',
      durationStandard: '220ms',
      durationCelebration: '500ms',
    }),
  })
}

export const THEMES = Object.freeze([
  ...lightPalettes.map((row) => makeTheme(row, 'light')),
  ...darkPalettes.map((row) => makeTheme(row, 'dark')),
])

export const THEME_IDS = Object.freeze(THEMES.map(({ id }) => id))
export const DEFAULT_THEME_ID = 'morning-mist'
const themesById = new Map(THEMES.map((theme) => [theme.id, theme]))

export function getTheme(id) {
  return themesById.get(id)
}
