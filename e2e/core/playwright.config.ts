import { defineConfig } from "@playwright/test";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

const coreUrl = requiredEnvironment("CORE_URL");

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
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${portValue}`,
  };
}

export default defineConfig({
  expect: { timeout: 15_000 },
  fullyParallel: false,
  outputDir: "../../test-results/core-e1",
  reporter: "line",
  testDir: ".",
  timeout: 90_000,
  use: { trace: "retain-on-failure" },
  webServer: [
    webServer("clubs", 4173, "app.example.test", "http://app.example.test"),
    webServer("clubs-admin", 4174, "admin.example.test", "http://admin.example.test"),
    webServer("id", 4175, "id.example.test", "https://id.example.test"),
  ],
  workers: 1,
});
