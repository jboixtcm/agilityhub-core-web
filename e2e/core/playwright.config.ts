import { defineConfig } from "@playwright/test";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

const coreUrl = requiredEnvironment("CORE_URL");

/**
 * E10-W03 (S17 R-17-10): the console runs on the Cànic's admin server (4174), and a support access
 * opens a club's back-office host at its local server, never `https://{host}`.
 */
const SUPPORT_ENVIRONMENT = {
  VITE_CLUB_ADMIN_ORIGINS: JSON.stringify({
    "admin.example.test": "http://127.0.0.1:4174",
    "fifo.example.test": "http://127.0.0.1:4177",
  }),
  VITE_CONSOLE_ORIGIN: "http://127.0.0.1:4174",
};

function webServer(
  app: "clubs" | "clubs-admin" | "id",
  port: number,
  host: string,
  origin: string,
) {
  const portValue = String(port);
  return {
    command: `pnpm --filter ${app} dev --host 0.0.0.0 --port ${portValue}`,
    env: {
      VITE_CORE_URL: coreUrl,
      VITE_ID_URL: coreUrl,
      VITE_PROXY_HOST: host,
      VITE_PROXY_ORIGIN: origin,
      ...(app === "clubs-admin" ? SUPPORT_ENVIRONMENT : {}),
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${portValue}`,
  };
}

export default defineConfig({
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // INC-07: frames every stage's `oauth-token-calls.log` (the calls come from `oauth-token-log.ts`).
  globalSetup: "./oauth-token-stage.ts",
  outputDir: `../../test-results/${process.env.CORE_EVIDENCE_SUBDIRECTORY ?? "core-e1"}`,
  reporter: "line",
  testDir: ".",
  timeout: 90_000,
  use: { trace: "retain-on-failure" },
  webServer: [
    webServer("clubs", 4173, "app.example.test", "http://app.example.test"),
    webServer("clubs-admin", 4174, "admin.example.test", "http://admin.example.test"),
    webServer("id", 4175, "id.example.test", "https://id.example.test"),
    webServer("clubs", 4176, "fifo.example.test", "http://fifo.example.test"),
    webServer("clubs-admin", 4177, "fifo.example.test", "http://fifo.example.test"),
  ],
  workers: 1,
});
