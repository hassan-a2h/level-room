import { test as base, expect } from '@playwright/test'
import { installRouteMocks } from './route-mocks.js'

const test = base.extend({
  apiMocks: async ({ context }, use) => {
    const mocks = await installRouteMocks(context)
    await use(mocks)
  },
  page: async ({ page }, use) => {
    const consoleErrors = []
    await page.addInitScript(() => {
      const addMotionOverride = () => {
        const root = document.documentElement
        if (!root || root.querySelector('[data-playwright-no-motion]')) return Boolean(root)
        const style = document.createElement('style')
        style.dataset.playwrightNoMotion = 'true'
        style.textContent = `
          *, *::before, *::after {
            animation-delay: 0s !important;
            animation-duration: 0s !important;
            scroll-behavior: auto !important;
            transition-duration: 0s !important;
          }
        `
        root.append(style)
        return true
      }

      if (!addMotionOverride()) {
        const observer = new MutationObserver(() => {
          if (addMotionOverride()) observer.disconnect()
        })
        observer.observe(document, { childList: true, subtree: true })
      }
    })
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    await use(page)
    expect(consoleErrors, 'browser console and uncaught page errors').toEqual([])
  },
})

export { test, expect }
