const lightStatus = {
  successBg: '#e7f2ea', successText: '#28563a', successBorder: '#557d62',
  progressBg: '#e8eef8', progressText: '#304a70', progressBorder: '#536f99',
  warningBg: '#fff1d8', warningText: '#684719', warningBorder: '#96702f',
  dangerBg: '#fae9ea', dangerText: '#792f38', dangerBorder: '#a95059',
  neutralBg: '#e9eef2', neutralText: '#394b5a', neutralBorder: '#687988',
}

const darkStatus = {
  successBg: '#263d32', successText: '#c7ead2', successBorder: '#86b99a',
  progressBg: '#28364b', progressText: '#d1def5', progressBorder: '#91a9d1',
  warningBg: '#483b29', warningText: '#f5dfb7', warningBorder: '#d2a85f',
  dangerBg: '#482d34', dangerText: '#f5d0d4', dangerBorder: '#d78b96',
  neutralBg: '#303b46', neutralText: '#d8e0e8', neutralBorder: '#a3b0bc',
}

const lightPalettes = [
  ['morning-mist', 'Morning Mist', '#f1f4f6', '#f8fafb', '#e8edf1', '#e3e9ed', '#355b78', '#294b65', '#355b78', '#ffffff', '#d1d9df'],
  ['quiet-linen', 'Quiet Linen', '#f5f1eb', '#fbf8f3', '#eee8df', '#e8e1d7', '#604d70', '#4d3c5d', '#604d70', '#fffdf8', '#d8cec1'],
  ['sage-garden', 'Sage Garden', '#edf2ec', '#f7faf5', '#e3ebe1', '#dce6d9', '#365b47', '#284735', '#365b47', '#fbfffa', '#cbd7ca'],
  ['blue-harbor', 'Blue Harbor', '#edf3f7', '#f7fafc', '#e1ebf1', '#dce7ee', '#2d5574', '#20445f', '#2d5574', '#fbfdff', '#cbd8e0'],
  ['lavender-still', 'Lavender Still', '#f1eff6', '#faf9fc', '#e9e6f0', '#e2deeb', '#574d79', '#443a65', '#574d79', '#fefcff', '#d3cfe0'],
  ['warm-sand', 'Warm Sand', '#f5f0e9', '#fbf8f2', '#eee6da', '#e8dece', '#684b38', '#523a2b', '#684b38', '#fffdf9', '#d8cbbb'],
  ['rosewater', 'Rosewater', '#f5eff0', '#fcf8f8', '#efe5e7', '#eadde0', '#704654', '#583642', '#704654', '#fffdfd', '#dacbd0'],
  ['sea-glass', 'Sea Glass', '#edf3f1', '#f7fbfa', '#e0ebe8', '#d9e7e3', '#285c59', '#1d4846', '#285c59', '#fbfffd', '#c8d8d4'],
]

const darkPalettes = [
  ['midnight-ink', 'Midnight Ink', '#171d25', '#202833', '#29323e', '#141a21', '#91b7cf', '#a7c8dc', '#a7c8dc', '#ffffff', '#0f141a'],
  ['deep-ocean', 'Deep Ocean', '#142129', '#1d2b34', '#263943', '#111d24', '#84bec7', '#9ad1d9', '#9ad1d9', '#ffffff', '#0c161c'],
  ['forest-dusk', 'Forest Dusk', '#19221e', '#242f29', '#303c34', '#151d19', '#a2c59f', '#bad9b5', '#bad9b5', '#ffffff', '#111914'],
  ['plum-twilight', 'Plum Twilight', '#211d28', '#2c2635', '#393142', '#1b1721', '#c5a8ce', '#d5bde0', '#d5bde0', '#ffffff', '#17131c'],
  ['graphite-calm', 'Graphite Calm', '#1b2025', '#262c32', '#333a41', '#161b20', '#aabac7', '#c1ced8', '#c1ced8', '#ffffff', '#12161a'],
  ['night-lavender', 'Night Lavender', '#1c1c2a', '#28283a', '#35354a', '#171724', '#b7ade0', '#cbc2ee', '#cbc2ee', '#ffffff', '#13131e'],
  ['moss-night', 'Moss Night', '#20231d', '#2d3027', '#3a3e32', '#1a1d18', '#b7c58d', '#cbd89f', '#cbd89f', '#ffffff', '#151711'],
  ['cocoa-evening', 'Cocoa Evening', '#251f1b', '#322923', '#40352d', '#1e1916', '#d0aa8d', '#dfbea5', '#dfbea5', '#ffffff', '#181310'],
]

function makeTheme(row, mode) {
  const [id, name, canvas, surface, surfaceAlt, surfaceInset, action, actionHover, focus, shadowLight, shadowDark] = row
  const dark = mode === 'dark'
  const status = dark ? darkStatus : lightStatus
  return {
    id, name, mode,
    tokens: {
      canvas, surface, surfaceAlt, surfaceInset,
      text: dark ? '#edf1f5' : '#202a35',
      textSecondary: dark ? '#c5ced7' : '#354555',
      textMuted: dark ? '#a8b4c0' : '#536372',
      inverseText: dark ? '#182129' : '#ffffff',
      border: dark ? '#7d8b98' : '#71808c',
      divider: dark ? '#46515c' : '#c4cdd4',
      action, actionHover,
      actionText: dark ? '#19232b' : '#ffffff',
      focus, link: row[8], track: dark ? '#39434e' : '#dbe2e7',
      userBubble: dark ? '#314251' : '#e5edf4',
      userBubbleText: dark ? '#f0f4f7' : '#202a35',
      userBubbleBorder: dark ? '#879bab' : '#738391',
      tutorBubble: surface,
      tutorBubbleText: dark ? '#edf1f5' : '#202a35',
      ...status,
      shadowLight, shadowDark,
      shadowInset: dark ? '#11161b' : '#c9d1d8',
    },
  }
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
