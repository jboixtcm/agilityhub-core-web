import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'mobile-menu.spec.ts',
  outputDir: '/evidence/2026-10-26-functional-fixes-mobile-menu-probe/test-results',
  workers: 1,
  use: { viewport: { width: 375, height: 900 }, trace: 'off' },
  webServer: {
    command: 'VITE_MOCK=1 pnpm --filter clubs-admin dev --host 0.0.0.0 --port 4174',
    cwd: '/work',
    url: 'http://127.0.0.1:4174',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
