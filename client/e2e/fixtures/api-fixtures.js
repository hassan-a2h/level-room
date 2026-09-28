import { test as base, expect } from '@playwright/test'
import { installRouteMocks } from './route-mocks.js'

const test = base.extend({
  apiMocks: async ({ context }, use) => {
    const mocks = await installRouteMocks(context)
    await use(mocks)
  },
  page: async ({ page }, use) => {
    const consoleErrors = []
    const resource404s = []
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
      if (message.type() === 'error') {
        const location = message.location()
        const expectedMissingExam = message.text().includes('404')
          && /^http:\/\/localhost:3200\/api\/topics\/\d+\/modules\/\d+\/exam$/.test(location.url)
        if (!expectedMissingExam) consoleErrors.push(`${message.text()} (${location.url}:${location.lineNumber})`)
      }
    })
    page.on('pageerror', (error) => consoleErrors.push(`${error.message}\n${error.stack || ''}`))
    page.on('response', (response) => {
      const url = response.url()
      if (response.status() === 404) {
        const request = response.request()
        const expectedMissingExam = request.method() === 'GET'
          && /^http:\/\/localhost:3200\/api\/topics\/\d+\/modules\/\d+\/exam$/.test(url)
        if (!expectedMissingExam) resource404s.push(`${response.status()} ${request.method()} ${url}`)
      }
    })
    await use(page)
    expect(resource404s, 'browser resource 404 responses').toEqual([])
    expect(consoleErrors, 'browser console and uncaught page errors').toEqual([])
  },
})

export { test, expect }
