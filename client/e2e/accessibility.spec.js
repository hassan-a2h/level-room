import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures/api-fixtures.js'

const themes = [
  'morning-mist', 'forest-dusk', 'blue-harbor', 'deep-ocean',
  'lavender-still', 'night-lavender', 'warm-sand', 'cocoa-evening',
  'sage-garden', 'moss-night', 'rosewater', 'plum-twilight',
  'quiet-linen', 'graphite-calm', 'sea-glass', 'midnight-ink',
]
const routes = [
  { route: '/', scenario: 'emptyDashboard', state: 'empty dashboard' },
  { route: '/', scenario: 'populatedDashboard', state: 'populated Trail' },
  { route: '/settings', scenario: 'settings', state: 'Settings appearance' },
  { route: '/reviews', scenario: 'emptyReviews', state: 'empty review queue' },
  { route: '/topic/1/chapter/42/checkpoint', scenario: 'checkpoint', state: 'checkpoint intro' },
  { route: '/review/expired-session', scenario: 'emptyReviews', state: 'expired review session' },
]

for (const theme of themes) {
  for (const { route, scenario, state } of routes) {
    test(`Axe reports no serious or critical violations for ${state} in ${theme}`, async ({ page, apiMocks }) => {
      await page.addInitScript((themeId) => localStorage.setItem('mastery-trail-theme-v2', themeId), theme)
      apiMocks.useScenario(scenario)
      await page.goto(route)
      await expect(page.locator('main')).toBeVisible()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      const severe = results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact))
      expect(severe, `${state} (${theme})\n${JSON.stringify(severe, null, 2)}`).toEqual([])
    })
  }
}

test('theme cards work by keyboard and retain a visible focus indicator in forced colors', async ({ page, apiMocks }) => {
  apiMocks.useScenario('settings')
  await page.goto('/settings')
  const morningMist = page.getByRole('radio', { name: /Morning Mist/ })
  await morningMist.focus()
  await page.emulateMedia({ forcedColors: 'active' })
  await expect.poll(() => morningMist.evaluate((radio) => getComputedStyle(radio).outlineStyle)).not.toBe('none')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: /Forest Dusk/ })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest-dusk')
})

test('reduced-motion mode disables celebratory and spatial animations', async ({ page, apiMocks }) => {
  apiMocks.useScenario('emptyDashboard')
  await page.goto('/')
  const motion = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'confetti-fall node-transition'
    document.body.append(probe)
    const styles = getComputedStyle(probe)
    const result = { animationName: styles.animationName, animationDuration: styles.animationDuration, transitionDuration: styles.transitionDuration }
    probe.remove()
    return result
  })
  expect(motion.animationName).toBe('none')
  expect(motion.animationDuration.split(',').every((duration) => Number.parseFloat(duration) <= 0.01)).toBe(true)
  expect(motion.transitionDuration.split(',').every((duration) => Number.parseFloat(duration) <= 0.01)).toBe(true)
})
