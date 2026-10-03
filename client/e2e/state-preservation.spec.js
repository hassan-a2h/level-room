import { test, expect } from './fixtures/api-fixtures.js'

test('versioned theme selection persists across a reload', async ({ page, apiMocks }) => {
  await page.addInitScript(() => localStorage.setItem('mastery-trail-theme-v2', 'forest-dusk'))
  apiMocks.useScenario('settings')
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest-dusk')
  await expect(page.getByRole('radio', { name: /Forest Dusk/ })).toBeChecked()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest-dusk')
  await expect(page.getByRole('radio', { name: /Forest Dusk/ })).toBeChecked()
})

test('legacy theme storage migrates to Living Atlas and removes the old key', async ({ page, apiMocks }) => {
  await page.addInitScript(() => localStorage.setItem('mastery-roadmap-theme', 'mission-workshop'))
  apiMocks.useScenario('emptyDashboard')
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'living-atlas')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mastery-trail-theme-v2'))).toBe('living-atlas')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mastery-roadmap-theme'))).toBeNull()
})

test('switching themes preserves an unsaved onboarding destination without another API request', async ({ page, apiMocks }) => {
  await page.goto('/onboarding')
  const destination = page.getByRole('textbox', { name: 'Your learning destination' })
  await destination.fill('A private unsaved destination')
  const requestCount = apiMocks.requests.length

  await page.getByRole('button', { name: 'Open theme switcher' }).click()
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('curiosity-engine')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'curiosity-engine')
  await expect(page.getByRole('textbox', { name: 'Your learning destination' })).toHaveValue('A private unsaved destination')
  expect(apiMocks.requests).toHaveLength(requestCount)
})
