import { expect, test, type Page } from '@playwright/test'

/**
 * Walks the app the way a demo visitor does and checks each page renders
 * without horizontal scrolling, saving a screenshot per page and project.
 */

async function noHorizontalScroll(page: Page, name: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `${name}: page scrolls horizontally`).toBeLessThanOrEqual(1)

  // A page can avoid scrolling yet still CLIP content inside a scroll
  // container (e.g. a panel). Note a vertically scrolling panel also gets
  // overflow-x:auto, so "is it a scroller?" isn't enough: flag every
  // container whose content is wider than it, unless it exists to scroll a
  // table sideways (the one place horizontal scrolling is intended).
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const style = getComputedStyle(el)
        const clipsOrScrolls = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)
        // Ellipsis truncation is clipping on purpose.
        const truncates = style.textOverflow === 'ellipsis'
        return clipsOrScrolls && !truncates && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && !el.querySelector(':scope > table, :scope > * > table')
      })
      .slice(0, 5)
      .map(el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className).split(' ').slice(0, 4).join('.')} (+${el.scrollWidth - el.clientWidth}px)`),
  )
  expect(overflowing, `${name}: content wider than its container: ${overflowing.join(', ')}`).toEqual([])
}

async function snap(page: Page, name: string, projectName: string) {
  // Not 'networkidle': the dev server's live-reload socket can keep the
  // network busy forever. Each step already waits for its own content.
  await page.waitForLoadState('load')
  await page.evaluate(() => document.fonts.ready)
  // Screenshot first, so a failing page still leaves a picture to look at.
  await page.screenshot({ path: `test-results/screens/${projectName}/${name}.png`, fullPage: true })
  await noHorizontalScroll(page, name)
}

test('demo visitor tour', async ({ page }, info) => {
  const project = info.project.name

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Integrations that don't fall over/ })).toBeVisible()
  await snap(page, '01-landing', project)

  // A click before hydration hits a server-rendered button with no handler
  // yet and does nothing; retry until the click actually navigates.
  await expect(async () => {
    await page.getByRole('button', { name: 'Try the demo' }).click()
    // Generous: on a cold dev server the first login compiles routes on demand.
    await page.waitForURL('**/dashboard', { timeout: 20_000 })
  }).toPass({ timeout: 60_000 })
  await expect(page.getByText('Live event feed')).toBeVisible()
  await snap(page, '02-dashboard', project)

  await page.goto('/orders')
  await expect(page.getByText('Ava Silva')).toBeVisible()
  await snap(page, '03-orders', project)

  await page.getByText('Ben Okafor').click()
  await page.waitForURL('**/orders/**')
  await expect(page.getByText('Status history')).toBeVisible()
  await snap(page, '04-order', project)

  await page.goto('/events')
  await snap(page, '05-events', project)

  await page.goto('/connections')
  await expect(page.getByText('pre-connected')).toBeVisible()
  await snap(page, '06-connections', project)

  await page.goto('/settings')
  await snap(page, '07-settings', project)

  await page.goto('/login')
  await snap(page, '08-login', project)
})
