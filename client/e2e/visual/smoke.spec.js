import { test, expect } from '../fixtures/api-fixtures.js'
import { assertCompleteVisualBaselineManifest, getVisualBaselineManifest } from './visual-baseline-manifest.js'

const manifest = getVisualBaselineManifest()

async function setOnboardingState(page, state) {
  await page.getByRole('textbox', { name: 'Your learning destination' }).fill('Data skills')
  await page.getByRole('button', { name: 'Set my destination' }).click()
  if (state === 'destination') return

  await expect(page.getByRole('heading', { name: 'Choose your starting point' })).toBeVisible()
  await page.getByRole('button', { name: 'Beginner' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  if (state === 'placement') {
    await page.getByRole('button', { name: 'Take a placement check' }).click()
    await expect(page.getByText('Which structure stores related records?')).toBeVisible()
    return
  }

  await page.getByRole('button', { name: 'Skip placement check' }).click()
  await expect(page.getByRole('heading', { name: 'Set your learning rhythm' })).toBeVisible()
  if (state === 'rhythm') return

  await page.getByRole('button', { name: '30 min/day' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Build my Track' }).click()
  if (state === 'generating') {
    await expect(page.getByRole('heading', { name: 'Designing your Track…' })).toBeVisible()
    return
  }
  await expect(page.getByRole('heading', { name: 'Data skills foundations' })).toBeVisible()
}

async function assertVisualState(page, baseline) {
  if (baseline.route === 'dashboard') {
    await expect(page.getByRole('heading', { name: 'Your learning Trail' })).toBeVisible()
    if (baseline.state === 'empty') await expect(page.getByRole('heading', { name: 'Your first Trail starts here' })).toBeVisible()
    if (baseline.state === 'active') await expect(page.getByRole('heading', { name: 'React foundations' })).toBeVisible()
    if (baseline.state === 'setup-resume') await expect(page.getByRole('heading', { name: 'Finish setting up your Track' })).toBeVisible()
    if (baseline.state === 'complete') await expect(page.getByRole('heading', { name: 'You’ve reached the end of this Trail.' })).toBeVisible()
  } else if (baseline.route === 'settings') {
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
  } else if (baseline.route === 'reviews') {
    if (baseline.state === 'queue') {
      await expect(page.getByRole('heading', { name: 'Retrieval practice' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Left and right joins' })).toBeVisible()
    } else {
      await page.getByRole('button', { name: 'Start retrieval practice' }).click()
      await expect(page.getByRole('heading', { name: 'What does a LEFT JOIN preserve?' })).toBeVisible()
      if (baseline.state !== 'question') {
        await page.getByRole('textbox', { name: 'Your answer' }).fill('It keeps every row from the left table.')
        await page.getByRole('button', { name: 'Review answers' }).click()
        await page.getByRole('button', { name: 'Submit all answers' }).click()
        await expect(page.getByText('A LEFT JOIN preserves each row from the left table.')).toBeVisible()
        if (baseline.state === 'summary') {
          await page.getByRole('button', { name: 'Next' }).click()
          await expect(page.getByRole('heading', { name: 'Ready to continue' })).toBeVisible()
        }
      }
    }
  } else if (baseline.route === 'checkpoint') {
    await expect(page.getByRole('heading', { name: 'Show what you can do' })).toBeVisible()
    if (baseline.state === 'intro') return
    await page.getByRole('button', { name: /begin checkpoint/i }).click()
    await expect(page.getByRole('heading', { name: 'Which join keeps every left row?' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'LEFT JOIN' })).toBeVisible()
    if (baseline.state !== 'question') {
      await page.getByRole('radio', { name: 'LEFT JOIN' }).check()
      await page.getByRole('button', { name: /review answers/i }).click()
      await page.getByRole('button', { name: 'Submit checkpoint' }).click()
      const result = baseline.state === 'passed' ? 'Chapter checkpoint cleared' : 'You’re close — let’s strengthen a few ideas'
      await expect(page.getByRole('heading', { name: result })).toBeVisible()
    }
  } else if (baseline.route === 'onboarding') {
    await setOnboardingState(page, baseline.state)
  } else if (baseline.route === 'session') {
    if (baseline.state === 'choice') await expect(page.getByRole('heading', { name: 'Choose a join' })).toBeVisible()
    if (baseline.state === 'ordering') await expect(page.getByRole('heading', { name: 'Order the query steps' })).toBeVisible()
    if (baseline.state === 'written') await expect(page.getByRole('heading', { name: 'Explain the relationship' })).toBeVisible()
    if (baseline.state === 'tutor-open') {
      await page.getByRole('button', { name: 'Ask your guide' }).click()
      await expect(page.getByRole('dialog', { name: 'Ask your guide' })).toBeVisible()
    }
    if (baseline.state === 'complete') await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
  } else if (baseline.route === 'build') {
    await expect(page.getByRole('heading', { name: 'Build', exact: true })).toBeVisible()
    if (baseline.state === 'brief') {
      await expect(page.getByRole('textbox', { name: 'Your Build submission' })).toBeVisible()
      return
    }
    await expect(page.getByRole('heading', { name: 'Explain a data relationship' })).toBeVisible()
    if (baseline.state === 'evidence') return
    const evidence = {
      Setup: 'A small in-memory table with sample rows.',
      'Actions taken': 'Compared a LEFT JOIN with the sample tables.',
      'Observed result': 'Every row from the left table remained.',
      Reflection: 'Unmatched right rows become empty values.',
    }
    for (const [label, value] of Object.entries(evidence)) await page.getByRole('textbox', { name: label }).fill(value)
    if (baseline.state === 'review') {
      await page.getByText('Review rubric').click()
      await expect(page.getByRole('heading', { name: 'Evaluation Rubric' })).toBeVisible()
      return
    }
    await page.getByRole('button', { name: 'Submit Build' }).click()
    const result = baseline.state === 'passed-result' ? 'Build complete' : 'Ready to revise'
    await expect(page.getByRole('heading', { name: result })).toBeVisible()
  } else if (baseline.route === 'continuation') {
    await expect(page.getByRole('heading', { name: 'Practical SQL patterns' })).toBeVisible()
  } else if (baseline.route === 'support') {
    if (baseline.state === 'offline') {
      await expect(page.getByTestId('offline-banner')).toBeVisible()
    } else {
      await expect(page.getByRole('heading', { name: 'Learning service needs a moment' })).toBeVisible()
    }
  } else if (baseline.route === 'not-found') {
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  }
}

test('visual baseline manifest covers every declared theme, route state, and target viewport', async ({}, testInfo) => {
  expect(assertCompleteVisualBaselineManifest(manifest)).toHaveLength(192)
  await testInfo.attach('visual-baseline-manifest.json', { body: JSON.stringify(manifest, null, 2), contentType: 'application/json' })
})

for (const baseline of manifest) {
  test(`${baseline.screenshot.slice(0, -4)} baseline`, async ({ page, apiMocks }, testInfo) => {
    const projectViewport = testInfo.project.use.viewport
    test.skip(projectViewport.width !== baseline.viewport.width || projectViewport.height !== baseline.viewport.height)
    await page.addInitScript((theme) => localStorage.setItem('mastery-trail-theme-v2', theme), baseline.theme)
    if (baseline.state === 'offline') {
      await page.addInitScript(() => {
        const originalFetch = window.fetch.bind(window)
        window.fetch = (input, init) => String(input).endsWith('/health')
          ? Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 503, headers: { 'content-type': 'application/json' } }))
          : originalFetch(input, init)
      })
    }
    if (baseline.state === 'generating') {
      await page.route('http://localhost:3200/api/topics/1/curriculum/generate', () => new Promise(() => {}))
    }
    apiMocks.useScenario(baseline.scenario)
    await page.goto(baseline.path)
    await assertVisualState(page, baseline)
    await page.evaluate(async () => { await document.fonts.ready })
    const screenshotTarget = baseline.route === 'not-found'
      ? page.locator('main.ui-page')
      : baseline.route === 'build'
        ? page.locator('[data-theme-view="BuildView"]')
        : page.locator('[data-theme-view]').first()
    await expect(screenshotTarget).toBeVisible()
    await expect(screenshotTarget).toHaveScreenshot(baseline.screenshot, { animations: 'disabled', caret: 'hide' })
  })
}

for (const theme of ['living-atlas', 'curiosity-engine', 'mission-workshop']) {
  test(`100-character Trail and Chapter titles stay within the viewport in ${theme} at 200% zoom`, async ({ page, apiMocks }) => {
    apiMocks.useScenario('stressTrail')
    await page.addInitScript((themeId) => localStorage.setItem('mastery-trail-theme-v2', themeId), theme)
    await page.goto('/')
    const longTrailTitle = 'A deliberately long learning Trail title for responsive layout checks, narrow screens, zoom, and keyboard navigation'.slice(0, 100)
    const longChapterTitle = 'Chapter 01: review long titles and responsive content across narrow screens with keyboard navigation'
    await expect(page.getByRole('heading', { name: 'Your learning Trail' })).toBeVisible()
    await expect(page.getByRole('heading', { name: longTrailTitle })).toBeVisible()
    await page.getByRole('button', { name: 'View full Track' }).click()
    const allChapters = page.getByRole('list', { name: 'Chapters in this Trail' }).last()
    await expect(allChapters.locator('> li')).toHaveCount(20)
    await expect(allChapters.getByText(longChapterTitle, { exact: true })).toBeVisible()

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize({ width: Math.floor(viewport.width / 2), height: Math.floor(viewport.height / 2) })
      const metrics = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        titleRight: document.querySelector('.trail-track-title').getBoundingClientRect().right,
      }))
      expect(metrics.pageWidth, `horizontal overflow at ${viewport.width}x${viewport.height} and 200% zoom`).toBeLessThanOrEqual(metrics.viewportWidth)
      expect(metrics.titleRight, `long title clipped at ${viewport.width}x${viewport.height} and 200% zoom`).toBeLessThanOrEqual(metrics.viewportWidth)
    }
  })
}
