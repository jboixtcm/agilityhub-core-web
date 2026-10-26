import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type Browser, type BrowserContext, type Page, type Response } from "@playwright/test";

import { expect, test } from "./oauth-token-log";

const clubsUrl = "http://127.0.0.1:4173";
const password = process.env.E1_CORE_PASSWORD;
const evidence = process.env.E1_EVIDENCE_DIRECTORY;
if (password === undefined || evidence === undefined) {
  throw new Error("Use the disposable e2e:core runner for this functional exploration");
}
const localPassword: string = password;
const evidenceDirectory: string = evidence;
mkdirSync(evidenceDirectory, { recursive: true });

function note(name: string, value: unknown): void {
  writeFileSync(join(evidenceDirectory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function tokenResponse(response: Response, grant: string): boolean {
  const request = response.request();
  return (
    new URL(response.url()).pathname === "/oauth2/token" &&
    request.method() === "POST" &&
    new URLSearchParams(request.postData() ?? "").get("grant_type") === grant
  );
}

function meResponse(response: Response): boolean {
  return new URL(response.url()).pathname === "/api/v1/me" && response.request().method() === "GET";
}

async function session(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  const page = await context.newPage();
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("member@example.test");
  await page.getByLabel("Contrasenya", { exact: true }).fill(localPassword);
  const granted = page.waitForResponse((response) => tokenResponse(response, "password"));
  const account = page.waitForResponse(meResponse);
  await page.getByRole("button", { name: "ENTRA", exact: true }).click();
  expect((await granted).status()).toBe(200);
  expect((await account).status()).toBe(200);
  await expect(page).toHaveURL(`${clubsUrl}/inici`);
  await expect(page.locator(".clubs-shell")).toBeVisible();
  return { context, page };
}

test("T-01-04 R-01-06 functional: three real browser tabs restore and rotate twice without revoking the family", async ({
  browser,
}) => {
  const { context } = await session(browser);
  try {
    const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
    const statuses: number[] = [];
    for (const page of pages) {
      page.on("response", (response) => {
        if (tokenResponse(response, "refresh_token")) statuses.push(response.status());
      });
    }
    for (let round = 0; round < 2; round += 1) {
      await Promise.all(
        pages.map(async (page) => {
          const restored = page.waitForResponse((response) =>
            tokenResponse(response, "refresh_token"),
          );
          const account = page.waitForResponse(meResponse);
          await page.goto(`${clubsUrl}/inici`);
          expect((await restored).status()).toBe(200);
          expect((await account).status()).toBe(200);
          await expect(page.locator(".clubs-shell")).toBeVisible();
        }),
      );
    }
    expect(statuses).toHaveLength(6);
    expect(statuses.every((status) => status === 200)).toBe(true);
    const cookies = await context.cookies();
    const refresh = cookies.find((cookie) => cookie.name === "ah_refresh");
    expect(refresh?.httpOnly).toBe(true);
    expect(refresh?.path).toBe("/oauth2/token");
    for (const page of pages) {
      const inspection = await page.evaluate(() => ({
        webLocksAvailable: Reflect.has(navigator, "locks"),
        jwtInStorage: [localStorage, sessionStorage].some((storage) =>
          Object.values(storage).some(
            (value: unknown) =>
              typeof value === "string" && /eyJ[\w-]+\.[\w-]+\.[\w-]+/u.test(value),
          ),
        ),
      }));
      expect(inspection).toEqual({ webLocksAvailable: true, jwtInStorage: false });
    }
    await pages[0].screenshot({ path: join(evidenceDirectory, "three-tabs-member-375.png") });
    note("three-tabs", { tabs: 3, rounds: 2, refreshStatuses: statuses, cookieHttpOnly: true });
  } finally {
    await context.close();
  }
});

test("T-01-04 T-01-22 functional: logout invalidates the shared family and another tab cannot restore it", async ({
  browser,
}) => {
  const { context, page } = await session(browser);
  try {
    const peer = await context.newPage();
    let peerBearer: string | undefined;
    peer.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/v1/me") {
        peerBearer = request.headers().authorization;
      }
    });
    const restored = peer.waitForResponse((response) => tokenResponse(response, "refresh_token"));
    const account = peer.waitForResponse(meResponse);
    await peer.goto(`${clubsUrl}/perfil`);
    expect((await restored).status()).toBe(200);
    expect((await account).status()).toBe(200);
    expect(peerBearer !== undefined).toBe(true);
    await page.goto(`${clubsUrl}/perfil`);
    await expect(page.getByRole("button", { name: "Tanca la sessió", exact: true })).toBeVisible();
    const revoked = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/oauth2/revoke" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Tanca la sessió", exact: true }).click();
    expect((await revoked).status()).toBe(200);
    await expect(page.getByLabel("Correu electrònic")).toBeVisible();
    const staleAccount = await context.request.get(`${clubsUrl}/api/v1/me`, {
      headers: { Authorization: peerBearer ?? "" },
    });
    // S01 R-01-10 explicitly permits an issued access token until its <=15 min expiry.
    // Logout must terminate refresh, but immediate bearer rejection is not the contract.
    expect([200, 401]).toContain(staleAccount.status());
    await peer.reload();
    await expect(peer.getByLabel("Correu electrònic")).toBeVisible();
    await expect(peer.locator(".profile-language-card")).toHaveCount(0);
    note("peer-logout", {
      revokeStatus: 200,
      oldBearerStatus: staleAccount.status(),
      acceptedAccessTokenWindow: "S01 R-01-10: up to 15 minutes",
      peerSignedOut: true,
    });
    await peer.screenshot({ path: join(evidenceDirectory, "peer-logout-375.png") });
  } finally {
    await context.close();
  }
});

test("T-01-20 functional: one transient refresh503 preserves the route and recovers without another login", async ({
  browser,
}) => {
  const { context, page } = await session(browser);
  try {
    let injected = false;
    await page.route("**/oauth2/token", async (route) => {
      const grant = new URLSearchParams(route.request().postData() ?? "").get("grant_type");
      if (!injected && grant === "refresh_token") {
        injected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "temporarily_unavailable" }),
        });
      } else {
        await route.continue();
      }
    });
    const statuses: number[] = [];
    page.on("response", (response) => {
      if (tokenResponse(response, "refresh_token")) statuses.push(response.status());
    });
    const unavailable = page.waitForResponse(
      (response) => tokenResponse(response, "refresh_token") && response.status() === 503,
    );
    const recovered = page.waitForResponse(meResponse);
    await page.goto(`${clubsUrl}/perfil`);
    await unavailable;
    await expect(page.getByLabel("Correu electrònic")).toHaveCount(0);
    expect((await recovered).status()).toBe(200);
    await expect(page.locator(".profile-language-card")).toBeVisible();
    await expect(page).toHaveURL(`${clubsUrl}/perfil`);
    expect(statuses).toEqual([503, 200]);
    note("transient-refresh", { injectedFaults: 1, refreshStatuses: statuses, route: "/perfil" });
    await page.screenshot({ path: join(evidenceDirectory, "recovered-profile-375.png") });
  } finally {
    await context.close();
  }
});
