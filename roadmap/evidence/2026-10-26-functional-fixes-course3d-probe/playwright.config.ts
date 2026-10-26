import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'settled-course3d.spec.ts',
  outputDir: '/evidence/2026-10-26-functional-fixes-course3d-probe/test-results',
  workers: 1,
  use: {
    viewport: { width: 1280, height: 900 },
    trace: 'off',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'pnpm --filter @agilityhub/course-ui harness --host 0.0.0.0 --port 4177 --strictPort',
    cwd: '/work',
    url: 'http://127.0.0.1:4177',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
