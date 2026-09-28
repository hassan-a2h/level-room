import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures/api-fixtures.js'

const themes = ['living-atlas', 'curiosity-engine', 'mission-workshop']
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
