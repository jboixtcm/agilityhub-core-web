import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Page, type Response } from "@playwright/test";

import { expect, test } from "./oauth-token-log";

const adminUrl = "http://127.0.0.1:4174";
const coreUrl = requiredEnvironment("CORE_URL");
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

/** E10-W03's evidence folder (the stage writes E10-W01's by default). */
const w03Directory = resolve(evidenceDirectory, "..", "E10-W03");
mkdirSync(w03Directory, { recursive: true });

async function w03Screenshot(page: Page, name: string): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({ fullPage: true, path: join(w03Directory, name) });
}

/** Publishes a deterministic record through the core's local/test-only FakeDomainDns hook. */
async function publishFakeCname(page: Page, host: string, target: string): Promise<void> {
  const response = await page.evaluate(
    async ({ name, value }) => {
      const result = await fetch("/api/v1/test/dns", {
        body: JSON.stringify({ name, type: "CNAME", values: [value] }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      return { body: await result.text(), status: result.status };
    },
    { name: host, value: target },
  );
  expect(response.status, response.body).toBeLessThan(300);
}

/** Opens a seeded club's record tab from D19's list (its id is the api's). */
async function openSeededRecord(page: Page, slug: string, tab: string): Promise<void> {
  await navigateSpa(page, "/consola/clubs");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { exact: true, name: slug }) });
  const record = page.waitForResponse(isPlatform("GET", /\/api\/v1\/platform\/clubs\/[^/]+$/u));
  await row.getByRole("link").first().click();
  expect((await record).status()).toBe(200);
  await page.waitForURL("**/identitat");
  await page.getByRole("link", { exact: true, name: tab }).click();
}

test("E10-W03 · «Dominis» (positive and negative fake DNS), allowed host and support access against the core (T-17-03, T-17-12, T-17-09)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  const page = await context.newPage();
  recordPlatformCalls(page);
  await loginPlatformAdmin(page);
  const notes: Record<string, unknown> = {};

  // Step 1: a domain on the «club mínim», its DNS records as the api answers them, [Verifica].
  await openSeededRecord(page, "minim", "Dominis");
  await expect(page.getByRole("heading", { level: 2, name: "Dominis" })).toBeVisible();
  const host = `e10w03-${String(Date.now() % 100_000)}.example.test`;
  await page.getByLabel("Host").fill(host);
  const added = page.waitForResponse(
    isPlatform("POST", /\/api\/v1\/platform\/clubs\/[^/]+\/domains$/u),
  );
  await page.getByRole("button", { name: "Afegeix domini" }).click();
  const addedResponse = await added;
  expect(addedResponse.status()).toBe(201);
  expect(addedResponse.request().headers()["idempotency-key"]).toMatch(/[0-9a-f-]{36}/u);
  const domain = (await addedResponse.json()) as {
    status: string;
    verification: { cnameTarget: string; recordName: string; recordValue: string };
  };
  notes.added = { status: domain.status, verification: Object.keys(domain.verification).sort() };
  expect(domain.status).toBe("PENDING");
  const records = page.locator(".console-card").filter({
    has: page.getByRole("heading", { name: `Registres DNS de ${host}` }),
  });
  await expect(records.getByText(domain.verification.cnameTarget, { exact: true })).toBeVisible();
  await expect(records.getByText(domain.verification.recordName, { exact: true })).toBeVisible();
  await expect(records.getByText(domain.verification.recordValue, { exact: true })).toBeVisible();
  await w03Screenshot(page, "core-D19-dominis-afegit-1280.png");
  await publishFakeCname(page, host, domain.verification.cnameTarget);
  const verified = page.waitForResponse(isPlatform("POST", /\/verification$/u));
  await page.getByRole("button", { name: `Verifica ${host}` }).click();
  const verification = await verified;
  notes.verification = {
    status: verification.status(),
    body: (await verification.json()) as unknown,
  };
  const row = page.getByRole("row").filter({ hasText: host });
  expect(verification.status()).toBe(200);
  const verifiedDomain = (await verification.json()) as { method: string; status: string };
  expect(verifiedDomain).toMatchObject({ method: "CNAME", status: "VERIFIED" });
  await expect(
    page.getByText(new RegExp(`S'ha verificat ${host.replace(/\./gu, "\\.")}`, "u")),
  ).toBeVisible();
  await expect(row.getByText("verificat")).toBeVisible();
  // The verification response is DomainVerification; the reloaded PlatformDomain row proves the
  // first verified domain for this app became primary.
  await expect(row.getByText("principal")).toBeVisible();
  // The Caddy ask endpoint deliberately lives outside /api/v1 and accepts only loopback/RFC1918
  // peers. Playwright's container calls the core directly on the private compose network.
  const allowedResponse = await page.request.get(
    `${coreUrl}/internal/domains/allowed?host=${encodeURIComponent(host)}`,
  );
  const allowed = { body: await allowedResponse.text(), status: allowedResponse.status() };
  notes.allowed = allowed;
  expect(allowed.status, allowed.body).toBe(200);
  await w03Screenshot(page, "core-D19-dominis-verifica-1280.png");

  // The negative control has no fake-DNS record: the api returns the catalogued 422 details and
  // leaves it pending. It is not primary, so E123 permits removing it afterwards.
  const missingHost = `e10w03-missing-${String(Date.now() % 100_000)}.example.test`;
  await page.getByLabel("Host").fill(missingHost);
  const missingAdded = page.waitForResponse(
    isPlatform("POST", /\/api\/v1\/platform\/clubs\/[^/]+\/domains$/u),
  );
  await page.getByRole("button", { name: "Afegeix domini" }).click();
  const missingAddedResponse = await missingAdded;
  expect(missingAddedResponse.status()).toBe(201);
  const missingDomain = (await missingAddedResponse.json()) as {
    status: string;
    verification: { cnameTarget: string; recordName: string; recordValue: string };
  };
  expect(missingDomain.status).toBe("PENDING");
  const missingRow = page.getByRole("row").filter({ hasText: missingHost });
  await expect(missingRow.getByText("pendent")).toBeVisible();
  const missingVerificationResponse = page.waitForResponse(isPlatform("POST", /\/verification$/u));
  await missingRow.getByRole("button", { name: `Verifica ${missingHost}` }).click();
  const missingVerification = await missingVerificationResponse;
  const missingError = (await missingVerification.json()) as {
    code: string;
    details: Record<string, unknown>;
  };
  notes.missingVerification = {
    body: missingError,
    status: missingVerification.status(),
  };
  expect(missingVerification.status()).toBe(422);
  expect(missingError).toMatchObject({
    code: "HOST_NOT_VERIFIED",
    details: {
      cnameTarget: missingDomain.verification.cnameTarget,
      host: missingHost,
      recordName: missingDomain.verification.recordName,
      recordValue: missingDomain.verification.recordValue,
    },
  });
  await expect(
    page.getByText(
      `No s'ha trobat cap dels dos registres DNS de ${missingHost}. Comprova'ls i torna-ho a provar d'aquí a uns minuts.`,
    ),
  ).toBeVisible();
  await expect(missingRow.getByText("pendent")).toBeVisible();
  await missingRow.getByRole("button", { name: `Elimina ${missingHost}` }).click();
  const removed = page.waitForResponse(isPlatform("DELETE", /\/domains\/[^/]+$/u));
  await page.getByRole("dialog").getByRole("button", { name: "ELIMINA" }).click();
  expect((await removed).status()).toBe(204);
  await expect(page.getByText(`S'ha eliminat ${missingHost}.`)).toBeVisible();
  notes.removedNegativeControl = true;

  // Step 2: «Entra com a administrador del club» on the Cànic: a new tab on its back office.
  await openSeededRecord(page, "canic", "Estat");
  await expect(page.getByRole("heading", { level: 2, name: "Accés de suport" })).toBeVisible();
  const reason = `Prova E10-W03 ${String(Date.now() % 100_000)}`;
  await page.getByLabel("Motiu de l'accés").fill(reason);
  const popup = context.waitForEvent("page");
  const granted = page.waitForResponse(isPlatform("POST", /\/support-access$/u));
  await page.getByRole("button", { name: "Entra com a administrador del club" }).click();
  const grantedResponse = await granted;
  expect(grantedResponse.status()).toBe(201);
  const support = await popup;
  // Every `/me` of the tab: the cookie's own session may answer first; the support one follows.
  const supportMes: unknown[] = [];
  support.on("response", (response) => {
    if (response.url().endsWith("/api/v1/me") && response.request().method() === "GET") {
      void response.json().then(
        (body: unknown) => supportMes.push(body),
        () => undefined,
      );
    }
  });
  await support.waitForURL("**/tauler", { timeout: 60_000 });
  const banner = support.getByRole("region", { name: "Accés de suport" });
  await expect(banner).toContainText("Accés de suport de l'equip AgilityHub ·");
  const withSupport = supportMes.find(
    (body) => typeof body === "object" && body !== null && "support" in body,
  ) as { membership?: { roles?: string[] }; support: Record<string, unknown> } | undefined;
  notes.supportMe =
    withSupport === undefined
      ? null
      : {
          roles: withSupport.membership?.roles ?? null,
          support: Object.keys(withSupport.support).sort(),
        };
  expect(withSupport).toBeDefined();
  await expect(support.getByRole("link", { name: "Consola" })).toHaveCount(0);
  await w03Screenshot(support, "core-D19-suport-backoffice-1280.png");

  // Step 3: the club's ADMIN (the same seeded admin, in its own tab) ends it from «Auditoria».
  await navigateSpa(page, "/auditoria");
  const card = page.getByRole("region", { name: "Accessos de suport en curs" });
  const item = card.getByRole("listitem").filter({ hasText: reason });
  await expect(item).toHaveCount(1);
  await w03Screenshot(page, "core-D19-auditoria-acces-suport-1280.png");
  const ended = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      response.url().includes("/api/v1/support-accesses/"),
  );
  await item.getByRole("button", { name: "Acaba l'accés" }).click();
  expect((await ended).status()).toBe(204);
  await expect(card.getByText(/S'ha acabat l'accés de suport de/u)).toBeVisible();
  // The support tab's token answers 401 from its next request: the tab says the access ended.
  await support.reload();
  await expect(
    support.getByText(
      /L'accés de suport ha acabat: ha caducat o l'administrador del club l'ha acabat/u,
    ),
  ).toBeVisible();
  await w03Screenshot(support, "core-D19-suport-acabat-1280.png");

  // Step 4: a second access, left with «Surt» (POST /oauth2/revoke with the support token).
  await openSeededRecord(page, "canic", "Estat");
  await page.getByLabel("Motiu de l'accés").fill(`${reason} · surt`);
  const second = context.waitForEvent("page");
  await page.getByRole("button", { name: "Entra com a administrador del club" }).click();
  const leaving = await second;
  await leaving.waitForURL("**/tauler", { timeout: 60_000 });
  const revoked = leaving.waitForResponse((response) => response.url().endsWith("/oauth2/revoke"));
  await leaving
    .getByRole("region", { name: "Accés de suport" })
    .getByRole("button", { name: "Surt" })
    .click();
  const revokeResponse = await revoked;
  notes.revoke = revokeResponse.status();
  expect(revokeResponse.ok()).toBe(true);
  await expect(leaving).toHaveURL(/\/suport\?sortit=1$/u);
  await expect(
    leaving.getByText("Has sortit de l'accés de suport. Ja pots tancar aquesta pestanya."),
  ).toBeVisible();

  writeFileSync(
    join(w03Directory, "e10w03-core-notes.json"),
    `${JSON.stringify(notes, null, 2)}\n`,
  );
  await context.close();
});
