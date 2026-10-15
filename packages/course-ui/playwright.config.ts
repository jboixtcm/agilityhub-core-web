import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: "../../test-results/course-ui",
  testDir: "./e2e",
  use: {
    // Headless Chromium draws WebGL with SwiftShader (no GPU in CI or in the Docker image).
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
    trace: "retain-on-failure",
    viewport: { height: 900, width: 1280 },
  },
  webServer: {
    command: "pnpm harness --host 0.0.0.0 --port 4177 --strictPort",
    reuseExistingServer: true,
    timeout: 120_000,
    url: "http://127.0.0.1:4177",
  },
});
