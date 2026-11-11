import { defineConfig } from '@playwright/test'

/**
 * Visual QA: every page at desktop and phone width, in light and dark mode.
 * Runs against a running dev server (BASE_URL, default :3000):
 *
 *   pnpm dev   # in another terminal
 *   pnpm test:e2e
 */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  timeout: 120_000,
  // One at a time: every run logs into the demo, which is rate-limited per
  // IP, and parallel cold starts on a dev server make logins slow.
  workers: 1,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' },
  projects: [
    { name: 'desktop-light', use: { viewport: { width: 1280, height: 800 }, colorScheme: 'light' } },
    { name: 'desktop-dark', use: { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' } },
    { name: 'phone-light', use: { viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true } },
    { name: 'phone-dark', use: { viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true } },
  ],
})
