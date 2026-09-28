const ART_SIZE = Object.freeze({ width: 640, height: 360, aspectRatio: 16 / 9 })

function art(src, routeFamily, fallback) {
  return Object.freeze({
    src,
    ...ART_SIZE,
    format: 'svg',
    fallback: Object.freeze(fallback),
    routeFamily,
    aboveFold: true,
  })
}

export const THEME_ART = Object.freeze({
  'curiosity-engine': Object.freeze({
    orientation: art(new URL('./curiosity-engine/orientation.svg', import.meta.url).href, 'orientation', { background: '#F4F6FF', accent: '#315FDA' }),
    trail: art(new URL('./curiosity-engine/trail.svg', import.meta.url).href, 'trail', { background: '#F4F6FF', accent: '#315FDA' }),
    scenario: art(new URL('./curiosity-engine/scenario.svg', import.meta.url).href, 'session', { background: '#F4F6FF', accent: '#315FDA' }),
    checkpoint: art(new URL('./curiosity-engine/checkpoint.svg', import.meta.url).href, 'checkpoint', { background: '#F4F6FF', accent: '#315FDA' }),
    review: art(new URL('./curiosity-engine/review.svg', import.meta.url).href, 'reviews', { background: '#F4F6FF', accent: '#315FDA' }),
    build: art(new URL('./curiosity-engine/build.svg', import.meta.url).href, 'build', { background: '#F4F6FF', accent: '#315FDA' }),
  }),
  'mission-workshop': Object.freeze({
    orientation: art(new URL('./mission-workshop/orientation.svg', import.meta.url).href, 'orientation', { background: '#101820', accent: '#C8F24A' }),
    trail: art(new URL('./mission-workshop/trail.svg', import.meta.url).href, 'trail', { background: '#101820', accent: '#C8F24A' }),
    scenario: art(new URL('./mission-workshop/scenario.svg', import.meta.url).href, 'session', { background: '#101820', accent: '#C8F24A' }),
    checkpoint: art(new URL('./mission-workshop/checkpoint.svg', import.meta.url).href, 'checkpoint', { background: '#101820', accent: '#C8F24A' }),
    review: art(new URL('./mission-workshop/review.svg', import.meta.url).href, 'reviews', { background: '#101820', accent: '#C8F24A' }),
    build: art(new URL('./mission-workshop/build.svg', import.meta.url).href, 'build', { background: '#101820', accent: '#C8F24A' }),
  }),
  'living-atlas': Object.freeze({
    orientation: art(new URL('./living-atlas/orientation.svg', import.meta.url).href, 'orientation', { background: '#FAFAF8', accent: '#337C55' }),
    trail: art(new URL('./living-atlas/trail.svg', import.meta.url).href, 'trail', { background: '#FAFAF8', accent: '#337C55' }),
    scenario: art(new URL('./living-atlas/scenario.svg', import.meta.url).href, 'session', { background: '#FAFAF8', accent: '#337C55' }),
    checkpoint: art(new URL('./living-atlas/checkpoint.svg', import.meta.url).href, 'checkpoint', { background: '#FAFAF8', accent: '#337C55' }),
    review: art(new URL('./living-atlas/review.svg', import.meta.url).href, 'reviews', { background: '#FAFAF8', accent: '#337C55' }),
    build: art(new URL('./living-atlas/build.svg', import.meta.url).href, 'build', { background: '#FAFAF8', accent: '#337C55' }),
  }),
})

export const THEME_ART_IDS = Object.freeze(Object.keys(THEME_ART))

export function getThemeArt(themeId) {
  return THEME_ART[themeId]
}
