import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    // Use a pre-installed Chromium when PW_CHROMIUM is set (e.g. CI images).
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    // The tests read English text: the browser language is pinned (language.spec.ts covers French).
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 }, locale: 'en-US' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], locale: 'en-US' } },
  ],
});
