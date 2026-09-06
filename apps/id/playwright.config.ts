import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: "../../test-results/id",
  testDir: "./e2e",
  use: {
    trace: "retain-on-failure",
    viewport: { height: 800, width: 1280 },
  },
  webServer: {
    command: "VITE_MOCK=1 pnpm dev --host 0.0.0.0 --port 4175",
    reuseExistingServer: true,
    timeout: 120_000,
    url: "http://127.0.0.1:4175",
  },
});
