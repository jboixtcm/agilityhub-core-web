import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence/2026-11-01-app-profile-access",
);
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

test.beforeAll(() => mkdirSync(evidenceDirectory, { recursive: true }));

for (const width of [375, 1280]) {
  test(`2026-11-01: app profiles and ADMIN-only explanation at ${String(width)}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((cachedBranding) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "multiProfile");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const response = await originalFetch(input, init);
        const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
        if (
          url.pathname === "/api/v1/me" &&
          (init?.method ?? "GET") === "GET" &&
          localStorage.getItem("profile-test-admin-only") === "1"
        ) {
          const body = (await response.json()) as { membership: Record<string, unknown> };
          return new Response(
            JSON.stringify({
              ...body,
              membership: {
                ...body.membership,
                roles: ["ADMIN"],
                profiles: ["ADMIN"],
                activeProfile: "ADMIN",
                defaultProfile: "ADMIN",
                rememberProfile: true,
              },
            }),
            { status: response.status, headers: response.headers },
          );
        }
        return response;
      };
    }, branding);
    const handoffs: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/auth/handoff")) handoffs.push(request.url());
    });
    await page.goto(`${baseUrl}/entrar`);
    await page.getByLabel("Correu electrònic").fill("estel.rius@example.test");
    await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
    await page.getByRole("button", { name: "ENTRA", exact: true }).click();
    await page.waitForURL("**/perfil-acces");
    await expect(page.getByRole("button", { name: /Com a alumna/u })).toBeVisible();
    await expect(page.getByRole("button", { name: /Com a instructora/u })).toBeVisible();
    await expect(page.getByRole("button", { name: /Com a administradora/u })).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: resolve(
        evidenceDirectory,
        `app-profile-chooser-${testInfo.project.name}-${String(width)}.png`,
      ),
    });
    await page.evaluate(() => {
      localStorage.setItem("profile-test-admin-only", "1");
    });
    await page.goto(`${baseUrl}/instructor/dia`);
    await page.waitForURL("**/perfil-acces");
    await expect(page.getByRole("heading", { name: "Accés d’alumne o professor" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tanca la sessió" })).toBeVisible();
    await expect(page.locator(".profile-choice__card")).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: resolve(
        evidenceDirectory,
        `app-admin-only-${testInfo.project.name}-${String(width)}.png`,
      ),
    });
    expect(new URL(page.url()).origin).toBe(baseUrl);
    expect(handoffs).toEqual([]);
    await page.getByRole("button", { name: "Tanca la sessió" }).click();
    await page.waitForURL("**/entrar");
  });
}
