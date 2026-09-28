import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const configDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  outputDir: path.resolve(configDir, '../test-results/playwright'),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: 'http://127.0.0.1:3202',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
    launchOptions: {
      args: ['--disable-features=PaintHolding'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    },
  },
  projects: [
    {
      name: 'chromium-320',
      use: { viewport: { width: 320, height: 568 } },
    },
    {
      name: 'chromium-390',
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: 'chromium-tablet',
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'chromium-desktop',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-wide',
      use: { viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: 'npm run dev:client:e2e',
    cwd: path.resolve(configDir, '..'),
    url: 'http://127.0.0.1:3202',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
