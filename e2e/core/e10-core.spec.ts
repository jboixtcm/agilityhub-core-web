import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Page, type Response } from "@playwright/test";

import { expect, test } from "./oauth-token-log";

const adminUrl = "http://127.0.0.1:4174";
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E10-W01");

mkdirSync(evidenceDirectory, { recursive: true });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

/** Every `/platform/*` exchange of the run: method, path, status (no bodies, no tokens). */
const platformCalls: string[] = [];

function recordPlatformCalls(page: Page) {
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.includes("/api/v1/platform/")) return;
    platformCalls.push(
      `${response.request().method()} ${url.pathname}${url.search} → ${String(response.status())}`,
    );
  });
}

function isPlatform(method: string, path: RegExp) {
  return (response: Response) =>
    response.request().method() === method && path.test(new URL(response.url()).pathname);
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({ fullPage: true, path: join(evidenceDirectory, name) });
}

async function navigateSpa(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState(null, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

interface StoredTheme {
  colors: Record<string, string>;
  fontFamily: string;
  mode: string;
  radius: string;
  ringPalette: string[];
}

const colorByToken: Record<string, string> = {
  background: "background",
  border: "border",
  danger: "danger",
  info: "info",
  "on-primary": "onPrimary",
  primary: "primary",
  success: "success",
  surface: "surface",
  "surface-alt": "surfaceAlt",
  text: "text",
  "text-muted": "textMuted",
  warning: "warning",
};

/** «Preset AgilityHub» light, from the `--ah-product-*` tokens the console reads. */
function productLightTheme(): StoredTheme {
  const tokens = new Map(
    [
      ...readFileSync(resolve(process.cwd(), "packages/ui/src/tokens.css"), "utf8").matchAll(
        /--ah-product-([a-z-]+):\s*([^;]+);/gu,
      ),
    ].map(([, name = "", value = ""]) => [name, value.trim()]),
  );
  const read = (name: string) => tokens.get(name) ?? "";
  return {
    colors: Object.fromEntries(
      Object.entries(colorByToken).map(([token, key]) => [key, read(`light-${token}`)]),
    ),
    fontFamily: read("font-family"),
    mode: "light",
    radius: read("radius"),
    ringPalette: [],
  };
}

function lowerColors(colors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [key, value.toLowerCase()]),
  );
}

/** The host's own primary colour (its branding, applied to the page's root). */
async function hostPrimary(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--ah-color-primary").trim(),
  );
}

/** The seeded club admin, given `AGILITYHUB_ADMIN` by `e2e-core.sh` (grant_platform_admin). */
async function loginPlatformAdmin(page: Page): Promise<void> {
  await page.goto(`${adminUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel("Contrasenya").fill(corePassword);
  const me = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/me") && response.request().method() === "GET",
  );
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click({ noWaitAfter: true });
  expect((await me).status()).toBe(200);
  // A club role lands on D1; the platform role adds «Plataforma › Consola» to its menu.
  await page.waitForURL("**/tauler");
  await expect(page.getByRole("link", { name: "Consola" })).toHaveAttribute(
    "href",
    "/consola/clubs",
  );
}

test.afterAll(() => {
  writeFileSync(
    join(evidenceDirectory, "e10-core-platform-calls.log"),
    `${platformCalls.join("\n")}\n`,
  );
});

test("E10-W01 · D19 against the core: the list, the Identitat tab and the «Nou club» wizard (T-17-12)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  const page = await context.newPage();
  recordPlatformCalls(page);
  await loginPlatformAdmin(page);

  // Step 1: the global role adds «Plataforma › Consola» to the club admin's menu.
  const list = page.waitForResponse(isPlatform("GET", /\/api\/v1\/platform\/clubs$/u));
  await page.getByRole("link", { name: "Consola" }).click();
  expect((await list).status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Consola de clubs" })).toBeVisible();

  // Step 2: the seeded clubs (club-as-code: canic, fifo, minim) as the api lists them.
  for (const slug of ["canic", "fifo", "minim"]) {
    await expect(page.getByRole("cell", { exact: true, name: slug })).toBeVisible();
  }
  await expect(page.getByText(/\d\/7/u).first()).toBeVisible();
  await screenshot(page, "core-D19-llista-1280.png");

  // Step 3: a record tab (Identitat) read and written through the api with its version.
  const minimRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { exact: true, name: "minim" }) });
  const record = page.waitForResponse(isPlatform("GET", /\/api\/v1\/platform\/clubs\/[^/]+$/u));
  await minimRow.getByRole("link").first().click();
  expect((await record).status()).toBe(200);
  await page.waitForURL("**/identitat");
  const town = `Vilassar ${String(Date.now() % 10_000)}`;
  await page.getByLabel("Població que es mostra").fill(town);
  const patch = page.waitForResponse(isPlatform("PATCH", /\/api\/v1\/platform\/clubs\/[^/]+$/u));
  await page.getByRole("button", { name: "DESA" }).click();
  const patchResponse = await patch;
  const patchBody = patchResponse.request().postDataJSON() as Record<string, unknown>;
  expect(Object.keys(patchBody).sort()).toEqual(["displayCity", "version"]);
  expect(patchResponse.status()).toBe(200);
  await expect(page.getByText("Canvis desats.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Població que es mostra")).toHaveValue(town);
  await screenshot(page, "core-D19-fitxa-identitat-1280.png");

  // Step 4: the wizard creates a club (POST /platform/clubs) and opens it with its checklist.
  await navigateSpa(page, "/consola/clubs/nou");
  await expect(page.getByRole("heading", { level: 1, name: "Nou club" })).toBeVisible();
  const suffix = String(Date.now() % 100_000);
  await page.getByLabel("Nom", { exact: true }).fill(`Club Agility Prova ${suffix}`);
  await expect(page.getByLabel("Slug")).toHaveValue(`club-agility-prova-${suffix}`);
  const next = page.getByRole("button", { name: "SEGÜENT" });
  for (const step of [
    "Localització",
    "Mòduls",
    "Pagaments",
    "Tema",
    "Catàlegs base",
    "Primer administrador",
  ]) {
    await next.click();
    await expect(
      page.getByRole("heading", { level: 2, name: new RegExp(step, "u") }),
    ).toBeVisible();
  }
  await page.getByLabel("Correu electrònic").fill(`prova.${suffix}@example.test`);
  await page.getByLabel("Nom", { exact: true }).fill("Admin de prova");
  await next.click();
  await expect(page.getByLabel("Fitxer club-as-code")).toContainText(
    `slug: club-agility-prova-${suffix}`,
  );
  const created = page.waitForResponse(isPlatform("POST", /\/api\/v1\/platform\/clubs$/u));
  const createdRecord = page.waitForResponse(
    isPlatform("GET", /\/api\/v1\/platform\/clubs\/[^/]+$/u),
  );
  await page.getByRole("button", { name: "CREA EL CLUB" }).click();
  const createdResponse = await created;
  expect(createdResponse.request().headers()["idempotency-key"]).toMatch(/[0-9a-f-]{36}/u);
  expect(createdResponse.status()).toBe(201);
  await page.waitForURL("**/identitat?creat=1");
  await expect(
    page.getByRole("heading", { level: 1, name: `Club Agility Prova ${suffix}` }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Checklist d'onboarding" })).toBeVisible();

  // Round 2 #2: run on the Cànic's admin host, the new club gets the product's theme (the
  // `--ah-product-light-*` tokens of packages/ui), never the host's branding.
  const product = productLightTheme();
  const sent = createdResponse.request().postDataJSON() as { theme: StoredTheme };
  expect(sent.theme).toEqual(product);
  const stored = ((await (await createdRecord).json()) as { theme: StoredTheme }).theme;
  writeFileSync(
    join(evidenceDirectory, "e10-core-created-theme.json"),
    `${JSON.stringify({ hostPrimary: await hostPrimary(page), product, stored }, null, 2)}\n`,
  );
  expect(lowerColors(stored.colors)).toEqual(lowerColors(product.colors));
  expect({ fontFamily: stored.fontFamily, mode: stored.mode, radius: stored.radius }).toEqual({
    fontFamily: product.fontFamily,
    mode: product.mode,
    radius: product.radius,
  });
  expect((await hostPrimary(page)).toLowerCase()).not.toBe(
    (product.colors.primary ?? "").toLowerCase(),
  );
  await screenshot(page, "core-D19-fitxa-checklist-1280.png");
  await context.close();
});
