import { test, expect } from './fixtures/api-fixtures.js'

test('selected theme survives a page reload', async ({ page, apiMocks }) => {
  apiMocks.useScenario('settings')
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
  await page.getByRole('radio', { name: /Midnight Ink/ }).evaluate((radio) => radio.click())

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight-ink')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mastery-roadmap-theme'))).toBe('midnight-ink')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight-ink')
  await expect(page.getByRole('radio', { name: /Midnight Ink/ })).toBeChecked()
})
