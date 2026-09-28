export function tokenName(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

export const compatibilityTokens = Object.freeze({
  'canvas-subtle': 'inset', surface: 'panel', 'surface-raised': 'elevated', 'surface-sunken': 'inset',
  'border-strong': 'borderStrong', text: 'ink', 'text-soft': 'inkSoft', 'text-muted': 'inkMuted',
  accent: 'primary', 'accent-hover': 'primaryHover', 'accent-soft': 'primarySoft', 'accent-contrast': 'primaryContrast', focus: 'primary',
  'success-soft': 'successSoft', 'warning-soft': 'warningSoft', 'danger-soft': 'dangerSoft', 'success-border': 'successBorder',
  'warning-border': 'warningBorder', 'danger-border': 'dangerBorder', 'trail-complete': 'success', 'trail-current': 'primary',
  'trail-future': 'borderStrong', 'shadow-color': 'ink', 'radius-sm': 'radiusControl', 'radius-md': 'radiusControl',
  'radius-lg': 'radiusPanel', 'radius-xl': 'radiusHero', 'duration-fast': 'motionFast',
  'duration-standard': 'motionStandard', 'duration-celebration': 'motionSpatial',
})
