// Drives the demo pages, which Vite serves from src/. The streams are real test assets, so these need network access.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
