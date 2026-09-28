import { test, expect } from '../fixtures/api-fixtures.js'

const themes = ['living-atlas', 'curiosity-engine', 'mission-workshop']
const visualStates = [
  {
    name: 'empty dashboard', route: '/', scenario: 'emptyDashboard',
    assert: ({ page }) => expect(page.getByRole('heading', { name: 'Your first Trail starts here' })).toBeVisible(),
  },
  {
    name: 'populated Trail', route: '/', scenario: 'populatedDashboard',
    assert: async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Your learning Trail' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'React foundations' })).toBeVisible()
    },
  },
  {
    name: 'Settings appearance', route: '/settings', scenario: 'settings',
    assert: ({ page }) => expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible(),
  },
  {
    name: 'empty review queue', route: '/reviews', scenario: 'emptyReviews',
    assert: ({ page }) => expect(page.getByRole('heading', { name: 'No retrieval practice due today' })).toBeVisible(),
  },
  {
    name: 'checkpoint question', route: '/topic/1/chapter/42/checkpoint', scenario: 'checkpoint',
    assert: async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Show what you can do' })).toBeVisible()
      await page.getByRole('button', { name: /begin checkpoint/i }).click()
      await expect(page.getByRole('heading', { name: 'Which join keeps every left row?' })).toBeVisible()
      await expect(page.getByRole('radio', { name: 'LEFT JOIN' })).toBeVisible()
    },
  },
  {
    name: 'expired review session', route: '/review/expired-session', scenario: 'emptyReviews',
    assert: ({ page }) => expect(page.getByRole('heading', { name: 'Review session unavailable' })).toBeVisible(),
  },
]

for (const theme of themes) {
  for (const state of visualStates) {
    test(`${state.name} renders in ${theme}`, async ({ page, apiMocks }) => {
      await page.addInitScript((themeId) => localStorage.setItem('mastery-trail-theme-v2', themeId), theme)
      apiMocks.useScenario(state.scenario)
      await page.goto(state.route)
      await state.assert({ page })
      await page.evaluate(async () => { await document.fonts.ready })
      await expect(page.locator('[data-theme-view]')).toBeVisible()
    })
  }
}

for (const theme of themes) {
  test(`long Trail content stays within the viewport in ${theme} at 200% zoom`, async ({ page, apiMocks }) => {
    apiMocks.useScenario('stressTrail')
    await page.addInitScript((themeId) => localStorage.setItem('mastery-trail-theme-v2', themeId), theme)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Your learning Trail' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'A deliberately long learning Trail title for responsive layout checks' })).toBeVisible()
    await page.getByRole('button', { name: 'View full Track' }).click()
    const allChapters = page.getByRole('list', { name: 'Chapters in this Trail' }).last()
    await expect(allChapters.locator('> li')).toHaveCount(20)

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      // Browser zoom reduces the CSS layout viewport; CSS `zoom` scales the
      // whole document and creates a different overflow condition.
      await page.setViewportSize({ width: Math.floor(viewport.width / 2), height: Math.floor(viewport.height / 2) })
      const metrics = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        scrollOverflows: [...document.querySelectorAll('body *')]
          .map((element) => ({ tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }))
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .sort((a, b) => b.scrollWidth - a.scrollWidth)
          .slice(0, 5),
        titleRight: document.querySelector('.trail-track-title').getBoundingClientRect().right,
        overflow: [...document.querySelectorAll('body *')]
          .map((element) => {
            const bounds = element.getBoundingClientRect()
            return { tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', left: Math.round(bounds.left), right: Math.round(bounds.right), width: Math.round(bounds.width), minWidth: getComputedStyle(element).minWidth, scrollWidth: element.scrollWidth }
          })
          .filter((element) => element.right > document.documentElement.clientWidth || element.left < 0)
          .sort((a, b) => b.right - a.right)
          .slice(0, 5),
      }))
      expect(metrics.pageWidth, `horizontal overflow at ${viewport.width}x${viewport.height} and 200% zoom: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewportWidth)
      expect(metrics.titleRight, `long title clipped at ${viewport.width}x${viewport.height} and 200% zoom`).toBeLessThanOrEqual(metrics.viewportWidth)
    }
  })
}
