import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { tlsFixture } from './https-server.mjs';

const tls = tlsFixture();
export default defineConfig({
  testDir: '.', testMatch: 'production-functional.spec.ts', workers: 1, fullyParallel: false,
  timeout: 120_000, expect: { timeout: 20_000 }, reporter: 'line',
  outputDir: `${process.env.CORE_EVIDENCE_DIRECTORY}/test-results`,
  use: {
    ignoreHTTPSErrors: false,
    launchOptions: { args: ['--no-proxy-server',
      '--host-resolver-rules=MAP app.example.test 127.0.0.1,MAP admin.example.test 127.0.0.1,MAP id.example.test 127.0.0.1',
      `--ignore-certificate-errors-spki-list=${tls.spki}`] },
    // The exact test certificate public key is explicitly trusted only by this browser.
    // Do not retain traces: they contain real temporary bearer/refresh credentials.
    trace: 'off', screenshot: 'only-on-failure',
  },
  webServer: {
    cwd: resolve(__dirname, '../../..'),
    command: 'pnpm turbo run build --filter=clubs --filter=clubs-admin --filter=id && node roadmap/evidence/2026-10-23-functional-release/https-server.mjs --serve',
    env: { VITE_MOCK: '0' }, port: 443, reuseExistingServer: false, timeout: 240_000,
  },
});
