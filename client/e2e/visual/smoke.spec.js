import { test, expect } from '../fixtures/api-fixtures.js'

test('dashboard empty state renders and can be captured', async ({ page, apiMocks }, testInfo) => {
  apiMocks.useScenario('emptyDashboard')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your first Trail starts here' })).toBeVisible()
  await page.evaluate(async () => { await document.fonts.ready })
  await page.screenshot({ path: testInfo.outputPath('dashboard-empty.png'), fullPage: true })
})

test('populated Trail shell renders and can be captured', async ({ page, apiMocks }, testInfo) => {
  apiMocks.useScenario('populatedDashboard')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your learning Trail' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'React foundations' })).toBeVisible()
  await page.evaluate(async () => { await document.fonts.ready })
  await page.screenshot({ path: testInfo.outputPath('dashboard-populated.png'), fullPage: true })
})

test('Settings appearance surface renders and can be captured', async ({ page, apiMocks }, testInfo) => {
  apiMocks.useScenario('settings')
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
  await page.evaluate(async () => { await document.fonts.ready })
  await page.screenshot({ path: testInfo.outputPath('settings-appearance.png'), fullPage: true })
})

test('review queue empty state renders and can be captured', async ({ page, apiMocks }, testInfo) => {
  apiMocks.useScenario('emptyReviews')
  await page.goto('/reviews')
  await expect(page.getByRole('heading', { name: 'No retrieval practice due today' })).toBeVisible()
  await page.evaluate(async () => { await document.fonts.ready })
  await page.screenshot({ path: testInfo.outputPath('reviews-empty.png'), fullPage: true })
})

test('checkpoint route launches the themed single-question player', async ({ page, apiMocks }) => {
  apiMocks.useScenario('checkpoint')
  await page.goto('/topic/1/chapter/42/checkpoint')
  await expect(page.getByRole('heading', { name: 'Show what you can do' })).toBeVisible()
  await page.getByRole('button', { name: /begin checkpoint/i }).click()
  await expect(page.getByRole('heading', { name: 'Which join keeps every left row?' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'LEFT JOIN' })).toBeVisible()
})

test('refreshed review routes report an expired session and return to the queue', async ({ page }) => {
  await page.goto('/review/expired-session')
  await expect(page.getByRole('heading', { name: 'Review session unavailable' })).toBeVisible()
  await page.getByRole('button', { name: 'Return to Review Queue' }).click()
  await expect(page).toHaveURL(/\/reviews$/)
  await expect(page.getByRole('heading', { name: 'No retrieval practice due today' })).toBeVisible()
})

test('TODO(theme-packs): compare approved theme-pack visual baselines', async () => {
  test.skip(true, 'Theme route packs and production views are not integrated in this phase.')
})
