const LIGHT_STATUS = Object.freeze({
  success: '#28563A',
  successSoft: '#E7F2EA',
  successBorder: '#557D62',
  warning: '#684719',
  warningSoft: '#FFF1D8',
  warningBorder: '#96702F',
  danger: '#792F38',
  dangerSoft: '#FAE9EA',
  dangerBorder: '#A95059',
  info: '#315D86',
  infoSoft: '#E8F1FA',
  infoBorder: '#6388AE',
})

const DARK_STATUS = Object.freeze({
  success: '#C7EAD2',
  successSoft: '#263D32',
  successBorder: '#86B99A',
  warning: '#F5DFB7',
  warningSoft: '#483B29',
  warningBorder: '#D2A85F',
  danger: '#F5D0D4',
  dangerSoft: '#482D34',
  dangerBorder: '#D78B96',
  info: '#BBDCF8',
  infoSoft: '#23384A',
  infoBorder: '#78A8CF',
})

const CATALOG = Object.freeze([
  { id: 'morning-mist', name: 'Morning Mist', familyId: 'playground', familyName: 'Playground', mode: 'light', pairedThemeId: 'forest-dusk', basePackId: 'living-atlas', canvas: '#F7F8F2', panel: '#FFFFFF', ink: '#243329', primary: '#357849', secondary: '#5B7A68', accentWarm: '#A16A48', accentSun: '#987B2F' },
  { id: 'forest-dusk', name: 'Forest Dusk', familyId: 'playground', familyName: 'Playground', mode: 'dark', pairedThemeId: 'morning-mist', basePackId: 'mission-workshop', canvas: '#111A17', panel: '#19241F', ink: '#EEF4E9', primary: '#98CA78', secondary: '#B8D99C', accentWarm: '#E0A17F', accentSun: '#DCC66D' },
  { id: 'blue-harbor', name: 'Blue Harbor', familyId: 'ocean', familyName: 'Ocean', mode: 'light', pairedThemeId: 'deep-ocean', basePackId: 'curiosity-engine', canvas: '#F0F7FB', panel: '#FFFFFF', ink: '#253749', primary: '#227681', secondary: '#4C789E', accentWarm: '#AF674A', accentSun: '#92722D' },
  { id: 'deep-ocean', name: 'Deep Ocean', familyId: 'ocean', familyName: 'Ocean', mode: 'dark', pairedThemeId: 'blue-harbor', basePackId: 'mission-workshop', canvas: '#101C28', panel: '#192A38', ink: '#EDF6FB', primary: '#76CFCE', secondary: '#8CB8DA', accentWarm: '#E6A080', accentSun: '#DFC878' },
  { id: 'lavender-still', name: 'Lavender Still', familyId: 'lavender', familyName: 'Lavender', mode: 'light', pairedThemeId: 'night-lavender', basePackId: 'curiosity-engine', canvas: '#F7F4FB', panel: '#FFFFFF', ink: '#382D43', primary: '#7E5E9A', secondary: '#6D7EAA', accentWarm: '#A96E7B', accentSun: '#977936' },
  { id: 'night-lavender', name: 'Night Lavender', familyId: 'lavender', familyName: 'Lavender', mode: 'dark', pairedThemeId: 'lavender-still', basePackId: 'mission-workshop', canvas: '#1B1929', panel: '#28243B', ink: '#F2EEFB', primary: '#BCA4E4', secondary: '#9DB3E2', accentWarm: '#E1A0B0', accentSun: '#DCC574' },
  { id: 'warm-sand', name: 'Warm Sand', familyId: 'ember', familyName: 'Ember', mode: 'light', pairedThemeId: 'cocoa-evening', basePackId: 'curiosity-engine', canvas: '#FCF4EC', panel: '#FFFFFF', ink: '#443125', primary: '#9A5D32', secondary: '#8B7181', accentWarm: '#B15E43', accentSun: '#9A792D' },
  { id: 'cocoa-evening', name: 'Cocoa Evening', familyId: 'ember', familyName: 'Ember', mode: 'dark', pairedThemeId: 'warm-sand', basePackId: 'mission-workshop', canvas: '#241B18', panel: '#302521', ink: '#FFF1E4', primary: '#EDAE78', secondary: '#D0A5A0', accentWarm: '#F0A079', accentSun: '#E0C473' },
  { id: 'sage-garden', name: 'Sage Garden', familyId: 'sage', familyName: 'Sage', mode: 'light', pairedThemeId: 'moss-night', basePackId: 'living-atlas', canvas: '#F1F6EB', panel: '#FEFFF9', ink: '#2E3B27', primary: '#54713B', secondary: '#6C8061', accentWarm: '#A36A4A', accentSun: '#8D792F' },
  { id: 'moss-night', name: 'Moss Night', familyId: 'sage', familyName: 'Sage', mode: 'dark', pairedThemeId: 'sage-garden', basePackId: 'mission-workshop', canvas: '#1D241A', panel: '#293324', ink: '#F0F5E8', primary: '#B5CF85', secondary: '#A8C69D', accentWarm: '#E0A17D', accentSun: '#D9C46F' },
  { id: 'rosewater', name: 'Rosewater', familyId: 'rose', familyName: 'Rose', mode: 'light', pairedThemeId: 'plum-twilight', basePackId: 'curiosity-engine', canvas: '#FBF2F5', panel: '#FFFFFF', ink: '#432C37', primary: '#96536D', secondary: '#77658E', accentWarm: '#AE5E62', accentSun: '#977535' },
  { id: 'plum-twilight', name: 'Plum Twilight', familyId: 'rose', familyName: 'Rose', mode: 'dark', pairedThemeId: 'rosewater', basePackId: 'mission-workshop', canvas: '#281D2B', panel: '#38293E', ink: '#F9EEF7', primary: '#DFA1C6', secondary: '#B8A2DD', accentWarm: '#E7A082', accentSun: '#D8C174' },
  { id: 'quiet-linen', name: 'Quiet Linen', familyId: 'slate', familyName: 'Slate', mode: 'light', pairedThemeId: 'graphite-calm', basePackId: 'curiosity-engine', canvas: '#F4F6F9', panel: '#FFFFFF', ink: '#2C3645', primary: '#4B6888', secondary: '#697A92', accentWarm: '#A36A4B', accentSun: '#927631' },
  { id: 'graphite-calm', name: 'Graphite Calm', familyId: 'slate', familyName: 'Slate', mode: 'dark', pairedThemeId: 'quiet-linen', basePackId: 'mission-workshop', canvas: '#181F29', panel: '#253040', ink: '#F0F4FA', primary: '#A9BDD7', secondary: '#9DB8C6', accentWarm: '#E0A07E', accentSun: '#D9C171' },
  { id: 'sea-glass', name: 'Sea Glass', familyId: 'lagoon', familyName: 'Lagoon', mode: 'light', pairedThemeId: 'midnight-ink', basePackId: 'living-atlas', canvas: '#EFF9F6', panel: '#FFFFFF', ink: '#243C36', primary: '#317666', secondary: '#5B8B86', accentWarm: '#A5664C', accentSun: '#8F792E' },
  { id: 'midnight-ink', name: 'Midnight Ink', familyId: 'lagoon', familyName: 'Lagoon', mode: 'dark', pairedThemeId: 'sea-glass', basePackId: 'mission-workshop', canvas: '#112322', panel: '#1C3532', ink: '#EEF9F4', primary: '#82D5BC', secondary: '#98C6D0', accentWarm: '#E09E7E', accentSun: '#D8C471' },
].map(Object.freeze))

export const THEME_CATALOG = CATALOG

export const THEME_FAMILIES = Object.freeze(
  CATALOG.filter(({ mode }) => mode === 'light').map(({ familyId, familyName, id: lightId, pairedThemeId: darkId }) => Object.freeze({
    id: familyId,
    name: familyName,
    lightId,
    darkId,
  })),
)

function channel(hex, offset) {
  return Number.parseInt(hex.slice(offset, offset + 2), 16)
}

export function mixHex(first, second, amount) {
  const channels = [1, 3, 5].map((offset) => Math.round(channel(first, offset) * (1 - amount) + channel(second, offset) * amount))
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

export function createThemeTokens(entry) {
  const dark = entry.mode === 'dark'
  const status = dark ? DARK_STATUS : LIGHT_STATUS
  const canvasSubtle = mixHex(entry.canvas, dark ? '#FFFFFF' : entry.ink, dark ? 0.06 : 0.04)
  const elevated = mixHex(entry.panel, '#FFFFFF', dark ? 0.07 : 0.2)
  const inset = mixHex(entry.canvas, dark ? '#000000' : entry.ink, dark ? 0.12 : 0.04)
  const border = mixHex(entry.panel, entry.ink, dark ? 0.45 : 0.55)
  const borderStrong = mixHex(entry.panel, entry.ink, dark ? 0.65 : 0.72)
  const inkSoft = mixHex(entry.ink, entry.canvas, 0.14)
  const inkMuted = mixHex(entry.ink, entry.canvas, 0.25)
  const primaryHover = mixHex(entry.primary, dark ? '#FFFFFF' : '#000000', dark ? 0.12 : 0.12)
  const primarySoft = mixHex(entry.panel, entry.primary, 0.12)
  const primaryContrast = dark ? mixHex(entry.ink, '#000000', 0.78) : '#FFFFFF'

  return Object.freeze({
    canvas: entry.canvas,
    canvasSubtle,
    panel: entry.panel,
    surface: entry.panel,
    elevated,
    surfaceRaised: elevated,
    inset,
    surfaceSunken: inset,
    border,
    borderStrong,
    decorativeBorder: mixHex(entry.panel, entry.ink, 0.12),
    ink: entry.ink,
    text: entry.ink,
    inkSoft,
    textSoft: inkSoft,
    inkMuted,
    textMuted: inkMuted,
    primary: entry.primary,
    primaryHover,
    primaryContrast,
    primarySoft,
    secondary: entry.secondary,
    accentWarm: entry.accentWarm,
    accentSun: entry.accentSun,
    success: status.success,
    successSoft: status.successSoft,
    successBorder: status.successBorder,
    warning: status.warning,
    warningSoft: status.warningSoft,
    warningBorder: status.warningBorder,
    danger: status.danger,
    dangerSoft: status.dangerSoft,
    dangerBorder: status.dangerBorder,
    info: status.info,
    infoSoft: status.infoSoft,
    infoBorder: status.infoBorder,
    mastery: status.success,
    masterySoft: status.successSoft,
    roadmapScenery: mixHex(entry.canvas, entry.secondary, dark ? 0.16 : 0.1),
    roadmapConnector: mixHex(entry.panel, entry.secondary, dark ? 0.58 : 0.38),
    nodeMastered: status.success,
    nodeCurrent: entry.primary,
    nodeAvailable: entry.secondary,
    nodeLocked: borderStrong,
    buttonShadow: mixHex(entry.ink, dark ? '#000000' : entry.canvas, dark ? 0.25 : 0.12),
    panelShadow: mixHex(entry.ink, dark ? '#000000' : entry.canvas, dark ? 0.4 : 0.18),
    shadowColor: dark ? '#000000' : mixHex(entry.ink, entry.canvas, 0.45),
    fontDisplay: 'ui-rounded, "Avenir Next", "Nunito Sans", "Segoe UI", sans-serif',
    fontBody: 'Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif',
    fontLabel: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    radiusControl: '0.625rem',
    radiusPanel: '1.125rem',
    radiusHero: '1.5rem',
    motionFast: '120ms',
    motionStandard: '220ms',
    motionSpatial: '500ms',
  })
}

export const THEME_ALIASES = Object.freeze({
  'living-atlas': 'morning-mist',
  'curiosity-engine': 'blue-harbor',
  'mission-workshop': 'forest-dusk',
})
