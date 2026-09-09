import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: "../../test-results/clubs",
  testDir: "./e2e",
  use: {
    trace: "retain-on-failure",
    viewport: { height: 812, width: 375 },
  },
  webServer: [
    {
      command: "VITE_MOCK=1 pnpm dev --host 0.0.0.0 --port 4173",
      reuseExistingServer: true,
      timeout: 120_000,
      url: "http://127.0.0.1:4173",
    },
    {
      command: "VITE_MOCK=1 pnpm --filter clubs-admin dev --host 0.0.0.0 --port 4174",
      cwd: "../..",
      reuseExistingServer: true,
      timeout: 120_000,
      url: "http://127.0.0.1:4174",
    },
  ],
});
