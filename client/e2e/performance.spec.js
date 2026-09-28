import { test, expect } from './fixtures/api-fixtures.js'

test('dashboard navigation timing is available within the smoke budget', async ({ page, apiMocks }) => {
  apiMocks.useScenario('emptyDashboard')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your first Trail starts here' })).toBeVisible()

  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0]
    return entry ? {
      domContentLoaded: entry.domContentLoadedEventEnd,
      load: entry.loadEventEnd,
      transferSize: entry.transferSize,
    } : null
  })

  expect(navigation).not.toBeNull()
  expect(navigation.domContentLoaded).toBeGreaterThan(0)
  expect(navigation.domContentLoaded).toBeLessThan(10_000)
  await test.info().attach('navigation-timing.json', {
    body: JSON.stringify(navigation, null, 2),
    contentType: 'application/json',
  })
})
