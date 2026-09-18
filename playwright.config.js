import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100/pruebas/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 860 } } },
    // Safari de iPhone (WebKit) para lo que depende del motor: desbordes.
    { name: 'iphone', use: { ...devices['iPhone 13'] }, grep: /desborda/ },
  ],
  webServer: {
    command: 'PORT=3100 node tests/e2e/server.mjs',
    url: 'http://localhost:3100/pruebas/',
    reuseExistingServer: true,
  },
});
