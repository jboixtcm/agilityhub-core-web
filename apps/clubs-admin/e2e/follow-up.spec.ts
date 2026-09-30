import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E6-W03");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// After every row of the D14 world (the newest note is of 19 August 2026, 19:02 club-local).
const inboxNow = new Date("2026-08-20T10:00:00+02:00");

test.use({ viewport: { height: 800, width: 1280 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page, scenario: "admin" | "followupAllRead" | "instructor") {
  await page.clock.setFixedTime(inboxNow);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page
    .getByLabel("Correu electrònic")
    .fill(`${scenario === "admin" ? "admin" : "instructor"}@example.test`);
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

async function iconsPainted(page: Page) {
  await expect
    .poll(() =>
      page
        .locator("svg.ah-icon")
        .evaluateAll((icons) =>
          icons.every(
            (icon) =>
              !(icon instanceof SVGSVGElement) ||
              icon.getClientRects().length === 0 ||
              icon.getBBox().width > 0,
          ),
        ),
    )
    .toBe(true);
}

const rows = (page: Page) => page.locator(".ah-universal-list tbody tr");

test.describe("E6-W03 T-10-30 D14 «Seguiment alumnes» against MSW", () => {
  test("an ADMIN: the menu counter, «5 pendents de llegir», the unread rows first and highlighted, the chips, and «Marcar-ho tot com a llegit»", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.getByRole("link", { name: /Seguiment alumnes\s*5/u }).click();
    await page.waitForURL("**/seguiment");
    await expect(page.getByRole("heading", { level: 1, name: "Seguiment alumnes" })).toBeVisible();
    await expect(page.getByText("5 pendents de llegir")).toBeVisible();
    await expect(rows(page)).toHaveCount(5);
    await expect(page.locator(".followup__row--unread")).toHaveCount(5);
    await expect(rows(page).nth(0)).toContainText("Laura (alumna)");
    await expect(rows(page).nth(1)).toContainText("Pau (alumne)");
    await expect(rows(page).nth(2)).toContainText("Estel (tasca)");
    await expect(rows(page).nth(4)).toContainText("02-08");
    await iconsPainted(page);
    await page.screenshot({ path: resolve(evidenceDirectory, "D14-seguiment-1280.png") });

    const tasks = page.waitForRequest((request) =>
      decodeURIComponent(request.url()).includes("filter=kind:eq:TASK"),
    );
    await page.getByRole("button", { exact: true, name: "Tasques" }).click();
    await tasks;
    await expect(rows(page)).toHaveCount(3);
    await page.getByRole("button", { exact: true, name: "Tot" }).click();
    await expect(rows(page)).toHaveCount(5);

    const readAll = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/followup/read-all"),
    );
    await page.getByRole("button", { name: "Marcar-ho tot com a llegit" }).click();
    expect((await readAll).headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(page.getByText("0 pendents de llegir")).toBeVisible();
    await expect(page.locator(".followup__row--unread")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Seguiment alumnes", exact: true })).toBeVisible();
  });

  test("an INSTRUCTOR reaches D14 from «Persones»; a row click reads it, drops the counter and opens D13", async ({
    page,
  }) => {
    await signIn(page, "instructor");
    await page.getByRole("link", { name: /Seguiment alumnes\s*3/u }).click();
    await page.waitForURL("**/seguiment");
    await expect(page.getByText("3 pendents de llegir")).toBeVisible();
    await expect(page.locator(".followup__row--unread")).toHaveCount(3);
    const read = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().endsWith("/followup/f-note-duna/read"),
    );
    await rows(page).nth(0).getByRole("link").first().click();
    await read;
    await page.waitForURL("**/alumnes/dog-duna");
    await expect(page.getByRole("heading", { level: 1, name: "Laura + Duna" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Seguiment alumnes\s*2/u })).toBeVisible();
  });

  test("everything read (followupAllRead): no counter, «0 pendents de llegir», no highlighted row", async ({
    page,
  }) => {
    await signIn(page, "followupAllRead");
    await page.goto(`${baseUrl}/seguiment`);
    await expect(page.getByText("0 pendents de llegir")).toBeVisible();
    await expect(rows(page)).toHaveCount(5);
    await expect(page.locator(".followup__row--unread")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Seguiment alumnes", exact: true })).toBeVisible();
    await iconsPainted(page);
    await page.screenshot({ path: resolve(evidenceDirectory, "D14-tot-llegit-1280.png") });
  });
});
