import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures/api-fixtures.js'

for (const route of ['/', '/settings', '/reviews']) {
  test(`Axe reports no serious or critical violations on ${route}`, async ({ page, apiMocks }) => {
    apiMocks.useScenario(route === '/settings' ? 'settings' : route === '/reviews' ? 'emptyReviews' : 'emptyDashboard')
    await page.goto(route)
    await expect(page.locator('main')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const severe = results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact))
    expect(severe, JSON.stringify(severe, null, 2)).toEqual([])
  })
}
