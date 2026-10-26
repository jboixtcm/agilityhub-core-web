import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";

import { type Browser, type Locator, type Page, type Response, type Route } from "@playwright/test";

import type { components } from "../../packages/api-client/src/generated/schema";

import { expect, test } from "./oauth-token-log";

const adminUrl = "http://127.0.0.1:4174";
const idUrl = "http://127.0.0.1:4175";
/** E10-W02: the console's product host, `clubsadmin.example.test` (S17 §2 «Entrada»). */
const productUrl = "http://127.0.0.1:4178";
/** E10-W02: the hosts of the club the «second club» script creates (`playwright.config.ts`). */
const secondClubAppUrl = "http://127.0.0.1:4179";
const secondClubAdminUrl = "http://127.0.0.1:4180";
const coreUrl = requiredEnvironment("CORE_URL");
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const mailboxDirectory = requiredEnvironment("E1_MAILBOX_DIRECTORY");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E10-W02");

const ID_HOST = "id.example.test";
const PRODUCT_HOST = "clubsadmin.example.test";
/** The seed's platform account (api E10-T03): `AGILITYHUB_ADMIN`, no club role. */
const PLATFORM_EMAIL = "platform@example.test";
/** The seeded club admin of the Cànic: the club's own tab, and the R-17-09 proof's account. */
const CLUB_ADMIN_EMAIL = "admin@example.test";
/** A seeded member of the Cànic, without the platform role: `403 PLATFORM_ONLY` on the product host. */
const MEMBER_EMAIL = "member@example.test";

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

async function desktopContext(browser: Browser, adminDeviceLocale: "ca" | "es" = "ca") {
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  await context.addInitScript(
    ({ adminOrigin, locale }) => {
      localStorage.setItem("agilityhub.locale", location.origin === adminOrigin ? locale : "ca");
    },
    { adminOrigin: adminUrl, locale: adminDeviceLocale },
  );
  return context;
}

interface CoreAnswer {
  body: string;
  status: number;
}

/**
 * A request straight to the core with the `Host` a site's ingress forwards (`node:http`, because a
 * browser or `fetch` never lets a caller set `Host`).
 */
function coreRequest(
  method: string,
  path: string,
  host: string,
  options: { body?: string; headers?: Record<string, string> } = {},
): Promise<CoreAnswer> {
  return new Promise((resolveAnswer, reject) => {
    const outgoing = httpRequest(
      new URL(path, coreUrl),
      { headers: { Accept: "application/json", Host: host, ...options.headers }, method },
      (incoming) => {
        let body = "";
        incoming.setEncoding("utf8");
        incoming.on("data", (chunk: string) => {
          body += chunk;
        });
        incoming.on("end", () => {
          resolveAnswer({ body, status: incoming.statusCode ?? 0 });
        });
      },
    );
    outgoing.on("error", reject);
    if (options.body !== undefined) outgoing.write(options.body);
    outgoing.end();
  });
}

/** T-17-03: `GET /branding` with a host in `Host`, as the host's ingress forwards it. */
function brandingFor(host: string): Promise<CoreAnswer> {
  return coreRequest("GET", "/api/v1/branding", host);
}

function errorCodeOf(body: string): unknown {
  try {
    return (JSON.parse(body) as { code?: unknown }).code;
  } catch {
    return undefined;
  }
}

function clubSlugOf(body: string): unknown {
  return (JSON.parse(body) as { club?: { slug?: unknown } }).club?.slug;
}

/**
 * The seed's platform account signs in with `id-web` on the ID host (E10-T03, organizer E125): the
 * one sign-in the core grants an account without a club. The token stays in memory.
 */
async function platformToken(): Promise<string> {
  const answer = await coreRequest("POST", "/oauth2/token", ID_HOST, {
    body: new URLSearchParams({
      client_id: "id-web",
      grant_type: "password",
      password: corePassword,
      username: PLATFORM_EMAIL,
    }).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: `https://${ID_HOST}`,
    },
  });
  expect(answer.status, String(errorCodeOf(answer.body))).toBe(200);
  return (JSON.parse(answer.body) as components["schemas"]["TokenResponse"]).access_token;
}

/**
 * R-17-09 (organizer note E125): the platform account gives the Cànic's seeded admin
 * `AGILITYHUB_ADMIN` through the api (the «Equip» tab's switch), never through the database. Since
 * E11-W08 the console runs on the product host with the seed's platform account; this grant stays
 * as the rule's own proof.
 */
async function grantPlatformRoleThroughTheApi(email: string): Promise<void> {
  const auth = { Authorization: `Bearer ${await platformToken()}` };
  const clubs = await coreRequest("GET", "/api/v1/platform/clubs?size=200", ID_HOST, {
    headers: auth,
  });
  expect(clubs.status, clubs.body).toBe(200);
  const canic = (JSON.parse(clubs.body) as components["schemas"]["PlatformClubPage"]).items.find(
    (club) => club.slug === "canic",
  );
  expect(canic).toBeDefined();
  const admins = await coreRequest(
    "GET",
    `/api/v1/platform/clubs/${canic?.id ?? ""}/admins`,
    ID_HOST,
    { headers: auth },
  );
  expect(admins.status, admins.body).toBe(200);
  const admin = (JSON.parse(admins.body) as components["schemas"]["PlatformAdmin"][]).find(
    (candidate) => candidate.email === email,
  );
  expect(admin).toBeDefined();
  const granted = await coreRequest(
    "PUT",
    `/api/v1/platform/accounts/${admin?.accountId ?? ""}/platform-roles`,
    ID_HOST,
    {
      body: JSON.stringify({ platformRoles: ["AGILITYHUB_ADMIN"] }),
      headers: { ...auth, "Content-Type": "application/json" },
    },
  );
  writeFileSync(
    join(evidenceDirectory, "e10-platform-role.json"),
    `${JSON.stringify(
      {
        account: email,
        by: `${PLATFORM_EMAIL} (id-web on ${ID_HOST})`,
        request: "PUT /api/v1/platform/accounts/{id}/platform-roles",
        response: granted.status === 200 ? (JSON.parse(granted.body) as unknown) : granted.body,
        status: granted.status,
      },
      null,
      2,
    )}\n`,
  );
  expect(granted.status, granted.body).toBe(200);
  expect(
    (JSON.parse(granted.body) as components["schemas"]["PlatformRoles"]).platformRoles,
  ).toEqual(["AGILITYHUB_ADMIN"]);
}

type StoredTheme = components["schemas"]["Theme"];

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
    ) as components["schemas"]["Colors"],
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

/** The `/oauth2/token` password grant a page sends, by its form. */
function isPasswordGrant(response: Response): boolean {
  return (
    new URL(response.url()).pathname === "/oauth2/token" &&
    new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "password"
  );
}

/** `/entrar` of a back office: the e-mail, the password revealed and typed, [ENTRA]. */
async function submitPassword(page: Page, email: string, password: string): Promise<Response> {
  await page.getByLabel("Correu electrònic").fill(email);
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel("Contrasenya").fill(password);
  const token = page.waitForResponse(isPasswordGrant);
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click({ noWaitAfter: true });
  return token;
}

/**
 * E11-W08 (S17 §2 «Entrada», ruling E157): the seed's platform account signs in to the console on
 * the product host with `client_id = clubs-admin` and lands on D19, without a club.
 */
async function loginPlatformAdmin(page: Page): Promise<void> {
  await page.goto(`${productUrl}/entrar`);
  const token = await submitPassword(page, PLATFORM_EMAIL, corePassword);
  expect(token.status(), await token.text()).toBe(200);
  expect(new URLSearchParams(token.request().postData() ?? "").get("client_id")).toBe(
    "clubs-admin",
  );
  await page.waitForURL(`${productUrl}/consola/clubs`);
  await expect(page.getByRole("link", { name: "Consola" })).toHaveAttribute("aria-current", "page");
}

/** The Cànic's seeded admin on the club's own back office (its D1). */
async function loginClubAdmin(page: Page): Promise<void> {
  await page.goto(`${adminUrl}/entrar`);
  const token = await submitPassword(page, CLUB_ADMIN_EMAIL, corePassword);
  expect(token.status()).toBe(200);
  await page.waitForURL("**/tauler");
}

test("R-17-09 · the platform account gives a club admin AGILITYHUB_ADMIN through the api (PUT /platform/accounts/{id}/platform-roles)", async () => {
  await grantPlatformRoleThroughTheApi(CLUB_ADMIN_EMAIL);
});

test.afterAll(() => {
  writeFileSync(
    join(evidenceDirectory, "e10-core-platform-calls.log"),
    `${platformCalls.join("\n")}\n`,
  );
});

type ProductBranding = components["schemas"]["BrandingResponse"];

function verificationOf(domain: components["schemas"]["PlatformDomain"]) {
  const challenge = domain.verification;
  expect(challenge, "a pending domain must provide its DNS instructions").toBeTruthy();
  if (challenge == null) throw new Error("Missing domain verification instructions");
  return challenge;
}

test("E10-W02 · the console's entry: the product host's branding and boot, the platform account signed in on the ID host, its card and its token on the product host (S17 §2, R-01-17, T-17-12)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const notes: Record<string, unknown> = {};

  // (a) `GET /branding` on the product host answers the product's branding (E10-T04): no club.
  const branding = await brandingFor(PRODUCT_HOST);
  expect(branding.status, branding.body).toBe(200);
  const product = JSON.parse(branding.body) as ProductBranding;
  expect(product.club).toMatchObject({ name: "AgilityHub", slug: null });
  expect(product.modules).toEqual([]);
  expect(product.locales).toEqual(["ca", "es", "en"]);
  expect(product.signup.enabled).toBe(false);
  expect(product.status).toBe("ACTIVE");
  const unknown = await brandingFor("unknown.example.test");
  expect(unknown.status).toBe(404);
  expect(errorCodeOf(unknown.body)).toBe("UNKNOWN_HOST");
  notes.productBranding = {
    club: product.club,
    locales: product.locales,
    modules: product.modules,
    primary: product.theme.colors.primary,
    status: product.status,
  };
  notes.unknownHost = { code: errorCodeOf(unknown.body), status: unknown.status };

  // (a) The console on the product host boots from that branding: an anonymous visit to D19
  // lands on the back office's sign-in, in the product's theme.
  const consoleContext = await desktopContext(browser);
  const productPage = await consoleContext.newPage();
  const booted = productPage.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/v1/branding",
  );
  await productPage.goto(`${productUrl}/consola/clubs`);
  expect((await booted).status()).toBe(200);
  // E11-W06 W1 (S11 R-11-11): the sign-in keeps the address it was asked for.
  await productPage.waitForURL(`${productUrl}/entrar?next=%2Fconsola%2Fclubs`);
  await expect(productPage.getByRole("heading", { name: "Accés al backoffice" })).toBeVisible();
  expect((await hostPrimary(productPage)).toLowerCase()).toBe(
    product.theme.colors.primary.toLowerCase(),
  );
  await screenshot(productPage, "core-D19-producte-entrar-1280.png");

  // (b) The platform account without a club role signs in with `id-web` on the ID host.
  const idContext = await desktopContext(browser);
  const idPage = await idContext.newPage();
  await idPage.goto(`${idUrl}/login`);
  await idPage.getByLabel("Correu electrònic").fill(PLATFORM_EMAIL);
  await idPage.getByLabel("Contrasenya").fill(corePassword);
  // The password grant's answer, read as it arrives: the ID app reloads into /account right after.
  const issued = new Promise<{ body: string; status: number }>((resolveIssued) => {
    idPage.on("response", (response) => {
      if (
        new URL(response.url()).pathname !== "/oauth2/token" ||
        new URLSearchParams(response.request().postData() ?? "").get("grant_type") !== "password"
      ) {
        return;
      }
      void response.text().then(
        (body) => {
          resolveIssued({ body, status: response.status() });
        },
        () => {
          resolveIssued({ body: "", status: response.status() });
        },
      );
    });
  });
  await idPage.getByRole("button", { exact: true, name: "ENTRA" }).click();
  const issuedAnswer = await issued;
  expect(issuedAnswer.status).toBe(200);
  const idToken = (JSON.parse(issuedAnswer.body) as components["schemas"]["TokenResponse"])
    .access_token;
  await idPage.waitForURL("**/account");
  // R-01-17: the account's own token, without a club (the ID host's `/me`).
  const bearer = { Authorization: `Bearer ${idToken}` };
  const idMe = await coreRequest("GET", "/api/v1/me", ID_HOST, { headers: bearer });
  expect(idMe.status, idMe.body).toBe(200);
  const me = JSON.parse(idMe.body) as components["schemas"]["Me"];
  expect(me.account.platformRoles).toEqual(["AGILITYHUB_ADMIN"]);
  expect(me.membership ?? null).toBeNull();
  await idPage.goto(`${idUrl}/products`);
  const card = idPage.locator(".id-product-card").filter({
    has: idPage.getByRole("heading", { name: "Consola de clubs" }),
  });
  const open = card.getByRole("link", { name: /OBRE LA CONSOLA/u });
  await expect(open).toHaveAttribute("href", `${productUrl}/consola/clubs`);
  await screenshot(idPage, "core-id-productes-consola-1280.png");

  // The token `id-web` issued is the platform's on the product host: `/me` without a membership,
  // and the console's own read.
  const productMe = await coreRequest("GET", "/api/v1/me", PRODUCT_HOST, { headers: bearer });
  expect(productMe.status, productMe.body).toBe(200);
  const productMeBody = JSON.parse(productMe.body) as components["schemas"]["Me"];
  expect(productMeBody.account.platformRoles).toEqual(["AGILITYHUB_ADMIN"]);
  expect(productMeBody.membership ?? null).toBeNull();
  const productClubs = await coreRequest("GET", "/api/v1/platform/clubs", PRODUCT_HOST, {
    headers: bearer,
  });
  expect(productClubs.status, productClubs.body).toBe(200);
  notes.platformTokenOnProductHost = {
    me: { membership: productMeBody.membership ?? null, status: productMe.status },
    platformClubs: productClubs.status,
  };

  // The card leads to the console on the product host, which has no session of its own there.
  // Every local server is 127.0.0.1, and a cookie ignores the port: the ID's refresh cookie would
  // reach the console's server, which `id.*` and `clubsadmin.*` never share. The jar goes first.
  await idContext.clearCookies();
  await open.click();
  await expect(idPage).toHaveURL(`${productUrl}/entrar?next=%2Fconsola%2Fclubs`, {
    timeout: 30_000,
  });
  await expect(idPage.getByRole("heading", { name: "Accés al backoffice" })).toBeVisible();

  writeFileSync(
    join(evidenceDirectory, "e10w02-core-entry-notes.json"),
    `${JSON.stringify(notes, null, 2)}\n`,
  );
  await idContext.close();
  await consoleContext.close();
});

test("E11-W08 · the platform account signs in to the console on the product host (password and magic link) and lands on D19; an account without the platform role gets 403 PLATFORM_ONLY (S17 §2 «Entrada», S01 R-01-02, ruling E157)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await desktopContext(browser);
  const page = await context.newPage();
  await page.goto(`${productUrl}/entrar`);
  // Round 2 #1: the sign-in reloads the page into D19 right after its first `/me`, and a browser
  // drops a response body once its page has navigated away. The first `/me` passes through a route
  // that keeps its body, and it is answered only after the token's body has been read. The route
  // stays for the page's life (every later `/me` falls through): removing it while the first one
  // is paused would release that request before it is fulfilled.
  let tokenRead: () => void = () => undefined;
  const tokenBodyRead = new Promise<void>((resolveRead) => {
    tokenRead = resolveRead;
  });
  let meBody: (body: string) => void = () => undefined;
  const meAnswer = new Promise<string>((resolveMe) => {
    meBody = resolveMe;
  });
  let firstMeKept = false;
  await page.route("**/api/v1/me", async (route: Route) => {
    if (route.request().method() !== "GET" || firstMeKept) {
      await route.fallback();
      return;
    }
    firstMeKept = true;
    const answer = await route.fetch();
    meBody(await answer.text());
    await tokenBodyRead;
    await route.fulfill({ response: answer });
  });
  const token = await submitPassword(page, PLATFORM_EMAIL, corePassword);
  const tokenBody = (await token.json()) as Record<string, unknown>;
  tokenRead();
  const me = JSON.parse(await meAnswer) as components["schemas"]["Me"];
  // The token answer without its secrets: its shape, never a token.
  const notes: Record<string, unknown> = {
    password: {
      clientId: new URLSearchParams(token.request().postData() ?? "").get("client_id"),
      fields: Object.keys(tokenBody).sort(),
      host: PRODUCT_HOST,
      me: { membership: me.membership ?? null, platformRoles: me.account.platformRoles },
      refreshCookie: (await token.headerValue("set-cookie"))?.split("=")[0] ?? null,
      status: token.status(),
      tokenType: tokenBody.token_type,
    },
  };
  expect(token.status()).toBe(200);
  expect(tokenBody.refresh_token).toBeUndefined();
  expect(me.account.platformRoles).toEqual(["AGILITYHUB_ADMIN"]);
  expect(me.membership ?? null).toBeNull();
  await page.waitForURL(`${productUrl}/consola/clubs`);
  await expect(page.getByRole("heading", { level: 1, name: "Consola de clubs" })).toBeVisible();
  // A token without a club: no club menu, no D1.
  await expect(page.getByRole("link", { name: "Consola" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Tauler" })).toHaveCount(0);
  await screenshot(page, "core-E11W08-consola-host-producte-1280.png");
  // A reload keeps the session: the refresh cookie of the product host renews it.
  const refreshed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/oauth2/token" &&
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") ===
        "refresh_token",
  );
  await page.reload();
  expect((await refreshed).status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Consola de clubs" })).toBeVisible();
  await context.close();

  // The magic link on the product host: `https://{product host}/activacio?t=…`, into D19.
  const linkContext = await desktopContext(browser);
  const linkPage = await linkContext.newPage();
  const mailboxBefore = mailboxFiles();
  await linkPage.goto(`${productUrl}/entrar`);
  await linkPage.getByLabel("Correu electrònic").fill(PLATFORM_EMAIL);
  await linkPage.getByRole("button", { name: "Envia'm l'enllaç" }).click();
  await expect(linkPage.getByRole("status")).toBeVisible();
  let link: URL | undefined;
  await expect
    .poll(
      () => {
        link = messagesFor(PLATFORM_EMAIL, mailboxBefore)
          .flatMap(linksOf)
          .find((candidate) => candidate.pathname === "/activacio");
        return link !== undefined;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  notes.magicLink = link === undefined ? null : describeLink(link);
  expect(link?.host).toBe(PRODUCT_HOST);
  const exchanged = linkPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/oauth2/token" &&
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") ===
        "urn:agilityhub:grant:magic-link",
  );
  await linkPage.goto(`${productUrl}${link?.pathname ?? ""}${link?.search ?? ""}`);
  expect((await exchanged).status()).toBe(200);
  await linkPage.waitForURL(`${productUrl}/consola/clubs`);
  await expect(linkPage.getByRole("heading", { level: 1, name: "Consola de clubs" })).toBeVisible();
  await linkContext.close();

  // An account without the platform role: 403 PLATFORM_ONLY, told on the sign-in page.
  const refusedContext = await desktopContext(browser);
  const refusedPage = await refusedContext.newPage();
  await refusedPage.goto(`${productUrl}/entrar`);
  const refused = await submitPassword(refusedPage, MEMBER_EMAIL, corePassword);
  notes.refused = { code: errorCodeOf(await refused.text()), status: refused.status() };
  writeFileSync(
    join(evidenceDirectory, "e11w08-core-product-host-sign-in.json"),
    `${JSON.stringify(notes, null, 2)}\n`,
  );
  expect(refused.status()).toBe(403);
  expect(errorCodeOf(await refused.text())).toBe("PLATFORM_ONLY");
  await expect(refusedPage.getByRole("alert")).toHaveText(
    "Aquest accés és només per a l'equip AgilityHub.",
  );
  await expect(refusedPage).toHaveURL(`${productUrl}/entrar`);
  await screenshot(refusedPage, "core-E11W08-platform-only-1280.png");
  await refusedContext.close();
});

test("E10-W01 · D19 against the core: the list, the Identitat tab and the «Nou club» wizard (T-17-12)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const context = await desktopContext(browser);
  const page = await context.newPage();
  recordPlatformCalls(page);

  // Step 1: the platform account lands on D19's list on the product host (E11-W08).
  const list = page.waitForResponse(isPlatform("GET", /\/api\/v1\/platform\/clubs$/u));
  await loginPlatformAdmin(page);
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

  // E10-W01 round 2 #2: the new club gets the product's theme (the `--ah-product-light-*` tokens of
  // packages/ui). Since E11-W08 the console runs on the product host, whose branding is the product
  // preset itself (E157), so the host's primary equals the new club's. This test picks no colour of
  // its own; a club that does is the «second club» script below (its wizard's «Tema», then its
  // hosts' primary in steps 8 and 11).
  const product = productLightTheme();
  const sent = createdResponse.request().postDataJSON() as components["schemas"]["ClubDefinition"];
  expect(sent.theme).toEqual(product);
  const stored = ((await (await createdRecord).json()) as components["schemas"]["PlatformClub"])
    .theme;
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
  expect((await hostPrimary(page)).toLowerCase()).toBe(product.colors.primary.toLowerCase());
  expect(stored.colors.primary.toLowerCase()).toBe((await hostPrimary(page)).toLowerCase());
  await screenshot(page, "core-D19-fitxa-checklist-1280.png");
  await context.close();
});

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

/** `GET /me` from the club's back-office tab with an explicit bearer (never the cookie). */
async function meStatusWith(page: Page, token: string): Promise<number> {
  return page.evaluate(async (bearer) => {
    const response = await fetch("/api/v1/me", {
      credentials: "omit",
      headers: { Authorization: `Bearer ${bearer}` },
    });
    return response.status;
  }, token);
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

test("E10-W03 · «Dominis» (positive and negative fake DNS, the primary choice, /branding before and after), allowed host and support access against the core (T-17-03, T-17-12, T-17-09)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // Only the support popup's origin starts in es; its actor and the console remain ca.
  const context = await desktopContext(browser, "es");
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
  const domain = (await addedResponse.json()) as components["schemas"]["PlatformDomain"];
  notes.added = { status: domain.status, verification: Object.keys(verificationOf(domain)).sort() };
  expect(domain.status).toBe("PENDING");
  // T-17-03: until it is verified, the host opens no club.
  const brandingBefore = await brandingFor(host);
  notes.brandingBefore = { code: errorCodeOf(brandingBefore.body), status: brandingBefore.status };
  expect(brandingBefore.status, brandingBefore.body).toBe(404);
  expect(errorCodeOf(brandingBefore.body)).toBe("UNKNOWN_HOST");
  const records = page.locator(".console-card").filter({
    has: page.getByRole("heading", { name: `Registres DNS de ${host}` }),
  });
  await expect(
    records.getByText(verificationOf(domain).cnameTarget, { exact: true }),
  ).toBeVisible();
  await expect(records.getByText(verificationOf(domain).recordName, { exact: true })).toBeVisible();
  await expect(
    records.getByText(verificationOf(domain).recordValue, { exact: true }),
  ).toBeVisible();
  await screenshot(page, "core-D19-dominis-afegit-1280.png");
  await publishFakeCname(page, host, verificationOf(domain).cnameTarget);
  const verified = page.waitForResponse(isPlatform("POST", /\/verification$/u));
  await page.getByRole("button", { name: `Verifica ${host}` }).click();
  const verification = await verified;
  notes.verification = {
    status: verification.status(),
    body: (await verification.json()) as unknown,
  };
  const row = page.getByRole("row").filter({ hasText: host });
  expect(verification.status()).toBe(200);
  const verifiedDomain = (await verification.json()) as components["schemas"]["DomainVerification"];
  expect(verifiedDomain).toMatchObject({ method: "CNAME", status: "VERIFIED" });
  await expect(
    page.getByText(new RegExp(`S'ha verificat ${host.replace(/\./gu, "\\.")}`, "u")),
  ).toBeVisible();
  await expect(row.getByText("verificat", { exact: true })).toBeVisible();
  // The primary choice (R-17-03, round 3 #1). The «club mínim» already has a primary verified
  // domain for the members' app (`minim.example.test`, its seed), so the new one is verified but
  // not primary: [Fes-lo principal] moves the badge to it (`PUT …/primary` → 200), and back.
  const seededHost = "minim.example.test";
  const seededRow = page.getByRole("row").filter({ hasText: seededHost });
  const badge = (target: Locator) => target.getByText("principal", { exact: true });
  const makePrimary = (target: Locator, name: string) =>
    target.getByRole("button", { exact: true, name: `Fes-lo principal: ${name}` });
  const choosePrimary = async (target: Locator, name: string): Promise<string[]> => {
    const chosen = page.waitForResponse(isPlatform("PUT", /\/domains\/[^/]+\/primary$/u));
    await makePrimary(target, name).click();
    const response = await chosen;
    expect(response.status()).toBe(200);
    const domains = (await response.json()) as components["schemas"]["PlatformDomain"][];
    return domains
      .filter((candidate) => candidate.app === "clubs" && candidate.primary)
      .map((candidate) => candidate.host);
  };
  await expect(badge(seededRow)).toBeVisible();
  await expect(badge(row)).toHaveCount(0);
  await expect(makePrimary(seededRow, seededHost)).toHaveCount(0);
  const primaryAfterChoice = await choosePrimary(row, host);
  expect(primaryAfterChoice).toEqual([host]);
  await expect(badge(row)).toBeVisible();
  await expect(makePrimary(row, host)).toHaveCount(0);
  await expect(badge(seededRow)).toHaveCount(0);
  await expect(makePrimary(seededRow, seededHost)).toBeVisible();
  await screenshot(page, "core-D19-dominis-principal-1280.png");
  const primaryAfterRestore = await choosePrimary(seededRow, seededHost);
  expect(primaryAfterRestore).toEqual([seededHost]);
  await expect(badge(seededRow)).toBeVisible();
  await expect(badge(row)).toHaveCount(0);
  notes.primary = { afterChoice: primaryAfterChoice, afterRestore: primaryAfterRestore };
  // T-17-03: once verified, the host opens its club.
  const brandingAfter = await brandingFor(host);
  notes.brandingAfter = {
    slug: brandingAfter.status === 200 ? clubSlugOf(brandingAfter.body) : null,
    status: brandingAfter.status,
  };
  expect(brandingAfter.status, brandingAfter.body).toBe(200);
  expect(clubSlugOf(brandingAfter.body)).toBe("minim");
  // The Caddy ask endpoint deliberately lives outside /api/v1 and accepts only loopback/RFC1918
  // peers. Playwright's container calls the core directly on the private compose network.
  const allowedResponse = await page.request.get(
    `${coreUrl}/internal/domains/allowed?host=${encodeURIComponent(host)}`,
  );
  const allowed = { body: await allowedResponse.text(), status: allowedResponse.status() };
  notes.allowed = allowed;
  expect(allowed.status, allowed.body).toBe(200);
  await screenshot(page, "core-D19-dominis-verifica-1280.png");

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
  const missingDomain =
    (await missingAddedResponse.json()) as components["schemas"]["PlatformDomain"];
  expect(missingDomain.status).toBe("PENDING");
  const missingRow = page.getByRole("row").filter({ hasText: missingHost });
  await expect(missingRow.getByText("pendent")).toBeVisible();
  const missingVerificationResponse = page.waitForResponse(isPlatform("POST", /\/verification$/u));
  await missingRow.getByRole("button", { name: `Verifica ${missingHost}` }).click();
  const missingVerification = await missingVerificationResponse;
  const missingError = (await missingVerification.json()) as components["schemas"]["ApiError"];
  notes.missingVerification = {
    body: missingError,
    status: missingVerification.status(),
  };
  expect(missingVerification.status()).toBe(422);
  expect(missingError).toMatchObject({
    code: "HOST_NOT_VERIFIED",
    details: {
      cnameTarget: verificationOf(missingDomain).cnameTarget,
      host: missingHost,
      recordName: verificationOf(missingDomain).recordName,
      recordValue: verificationOf(missingDomain).recordValue,
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
  ) as components["schemas"]["Me"] | undefined;
  notes.supportMe =
    withSupport === undefined
      ? null
      : {
          roles: withSupport.membership?.roles ?? null,
          support: Object.keys(withSupport.support ?? {}).sort(),
        };
  expect(withSupport).toBeDefined();
  // INC-96: support uses its actor account locale, as its JWT and /me do, without
  // persisting another device preference or offering a PATCH that support cannot perform.
  expect(withSupport?.account.locale).toBe("ca");
  await expect(support.locator("html")).toHaveAttribute("lang", withSupport?.account.locale ?? "");
  expect(await support.evaluate(() => localStorage.getItem("agilityhub.locale"))).toBe("es");
  await support.locator(".admin-user-menu > button").click();
  await expect(support.locator(".admin-user-menu select")).toBeDisabled();
  await expect(support.locator(".admin-user-menu select")).toHaveValue(
    withSupport?.account.locale ?? "",
  );
  await support.locator(".admin-user-menu > button").click();
  notes.supportLocale = {
    account: withSupport?.account.locale,
    devicePreference: "es",
    devicePreferencePreserved: true,
    selectorDisabled: true,
  };
  await expect(support.getByRole("link", { name: "Consola" })).toHaveCount(0);
  await screenshot(support, "core-D19-suport-backoffice-1280.png");

  // Step 3: the club's ADMIN, on its own back office (its own browser: every local server is
  // 127.0.0.1, and a cookie ignores the port), ends it from «Auditoria».
  const clubContext = await desktopContext(browser);
  const clubPage = await clubContext.newPage();
  await loginClubAdmin(clubPage);
  await navigateSpa(clubPage, "/auditoria");
  const accessCard = clubPage.getByRole("region", { name: "Accessos de suport en curs" });
  const item = accessCard.getByRole("listitem").filter({ hasText: reason });
  await expect(item).toHaveCount(1);
  await screenshot(clubPage, "core-D19-auditoria-acces-suport-1280.png");
  const ended = clubPage.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      response.url().includes("/api/v1/support-accesses/"),
  );
  await item.getByRole("button", { name: "Acaba l'accés" }).click();
  expect((await ended).status()).toBe(204);
  await expect(accessCard.getByText(/S'ha acabat l'accés de suport de/u)).toBeVisible();
  await clubContext.close();
  // The support tab's token answers 401 from its next request: the tab says the access ended.
  await support.reload();
  await expect(support.locator("html")).toHaveAttribute("lang", "es");
  expect(await support.evaluate(() => localStorage.getItem("agilityhub.locale"))).toBe("es");
  await expect(
    support.getByText(
      /El acceso de soporte ha terminado: ha caducado o el administrador del club lo ha terminado/u,
    ),
  ).toBeVisible();
  await screenshot(support, "core-D19-suport-acabat-1280.png");

  // Step 4: a second access, left with «Surt» (POST /oauth2/revoke with the support token).
  await openSeededRecord(page, "canic", "Estat");
  await page.getByLabel("Motiu de l'accés").fill(`${reason} · surt`);
  const second = context.waitForEvent("page");
  await page.getByRole("button", { name: "Entra com a administrador del club" }).click();
  const leaving = await second;
  await leaving.waitForURL("**/tauler", { timeout: 60_000 });
  await expect(leaving.locator("html")).toHaveAttribute("lang", "ca");
  expect(await leaving.evaluate(() => localStorage.getItem("agilityhub.locale"))).toBe("es");
  // The tab's support bearer (its session storage), used below and never written anywhere.
  const supportToken = await leaving.evaluate(() => {
    const stored = JSON.parse(sessionStorage.getItem("agilityhub.impersonation") ?? "{}") as {
      token?: string;
    };
    return stored.token ?? "";
  });
  expect(supportToken).not.toBe("");
  // Exercise the restricted routes with the real support token; never retain its value.
  const supportHeaders = {
    Authorization: `Bearer ${supportToken}`,
    "Content-Type": "application/json",
  };
  const membersForSupport = await coreRequest(
    "GET",
    "/api/v1/members?size=20",
    "admin.example.test",
    { headers: supportHeaders },
  );
  expect(membersForSupport.status).toBe(200);
  const memberForSupport = (JSON.parse(membersForSupport.body) as { items: { id: string }[] })
    .items[0];
  expect(memberForSupport).toBeDefined();
  const restricted: { method: string; path: string; status: number; code: unknown }[] = [];
  for (const [method, path] of [
    ["GET", "/api/v1/exports"],
    ["POST", `/api/v1/members/${memberForSupport?.id ?? ""}/data-export`],
    ["POST", `/api/v1/members/${memberForSupport?.id ?? ""}/erasure`],
    ["DELETE", `/api/v1/members/${memberForSupport?.id ?? ""}/erasure`],
  ] as const) {
    const result = await coreRequest(method, path, "admin.example.test", {
      headers: supportHeaders,
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    expect(result.status).toBe(403);
    expect(errorCodeOf(result.body)).toBe("SUPPORT_RESTRICTED");
    restricted.push({
      method,
      path: path.replace(memberForSupport?.id ?? "", "{memberId}"),
      status: result.status,
      code: errorCodeOf(result.body),
    });
  }
  notes.supportRestrictedRoutes = restricted;
  const meBeforeExit = await meStatusWith(leaving, supportToken);
  expect(meBeforeExit).toBe(200);
  const revoked = leaving.waitForResponse((response) => response.url().endsWith("/oauth2/revoke"));
  await leaving
    .getByRole("region", { name: "Accés de suport" })
    .getByRole("button", { name: "Surt" })
    .click();
  const revokeResponse = await revoked;
  expect(revokeResponse.ok()).toBe(true);
  expect(revokeResponse.request().headers().authorization).toBe(`Bearer ${supportToken}`);
  await expect(leaving).toHaveURL(/\/suport\?sortit=1$/u);
  await expect(leaving.locator("html")).toHaveAttribute("lang", "es");
  expect(await leaving.evaluate(() => localStorage.getItem("agilityhub.locale"))).toBe("es");
  await expect(
    leaving.getByText("Has salido del acceso de soporte. Ya puedes cerrar esta pestaña."),
  ).toBeVisible();
  await screenshot(leaving, "core-D19-suport-sortit-es-1280.png");
  // R-17-10 (round 3 #3): the grant is dead, not only forgotten by the tab.
  const meAfterExit = await meStatusWith(leaving, supportToken);
  notes.revoke = {
    meAfterExit,
    meBeforeExit,
    restoredDeviceLocale: "es",
    revoke: revokeResponse.status(),
  };
  expect(meAfterExit).toBe(401);

  writeFileSync(
    join(evidenceDirectory, "e10w03-core-notes.json"),
    `${JSON.stringify(notes, null, 2)}\n`,
  );
  await context.close();
});

// --- E10-W02 step 2: «a second club in under an hour» (T-17-12), the manual script's run. ---

type Rgb = readonly [number, number, number];

/** `#rrggbb` of a colour (the console's colour inputs speak hex). */
function hexOf(rgb: Rgb): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** The fictional club's primary colour (dark teal, 7:1 under white text) and that text. */
const SECOND_CLUB_PRIMARY: Rgb = [15, 92, 122];
const WHITE: Rgb = [255, 255, 255];

/** The fictional club the script creates (`docs/playbooks/segon-club-en-menys-d-una-hora.md`). */
const SECOND_CLUB = {
  adminEmail: "marta.riublau@example.test",
  adminName: "Marta Serra Exemple",
  appHost: "app.riublau.example.test",
  backOfficeHost: "admin.riublau.example.test",
  contactEmail: "hola@riublau.example.test",
  // A fictional association tax id (G + 7 digits + control) and its SEPA creditor identifier.
  creditorId: "ES37ZZZG12345674",
  displayCity: "Riu Blau",
  iban: "ES9121000418450200051332",
  name: "Club Agility Riu Blau",
  primary: hexOf(SECOND_CLUB_PRIMARY),
  privacyPolicyUrl: "https://riublau.example.test/privacitat",
  slug: "club-agility-riu-blau",
};

interface MailMessage {
  html?: string;
  subject?: string;
  text?: string;
  to?: string | string[];
}

function mailboxFiles(): Set<string> {
  return new Set(readdirSync(mailboxDirectory).filter((name) => name.endsWith(".json")));
}

/** The messages delivered to `recipient` since `previous` (the core's local mailbox files). */
function messagesFor(recipient: string, previous: ReadonlySet<string>): MailMessage[] {
  return readdirSync(mailboxDirectory)
    .filter((name) => name.endsWith(".json") && !previous.has(name))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(mailboxDirectory, name), "utf8")) as MailMessage)
    .filter((message) =>
      (Array.isArray(message.to) ? message.to : [message.to]).some(
        (value) => value?.toLowerCase() === recipient.toLowerCase(),
      ),
    );
}

function linksOf(message: MailMessage): URL[] {
  const source = `${message.html ?? ""} ${message.text ?? ""}`;
  return [...source.matchAll(/https:\/\/[^\s"'<>]+/gu)].map(
    ([link]) => new URL(link.replaceAll("&amp;", "&")),
  );
}

/** A message's link for the evidence: host, path and the names of its query (never a value). */
function describeLink(link: URL): string {
  return `${link.host}${link.pathname}?${[...new Set(link.searchParams.keys())].join("&")}`;
}

/** A plain one-colour PNG: the fictional club's logo for the «Tema» upload. */
function solidPng(width: number, height: number, rgb: Rgb): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
  const crc = (data: Buffer) => {
    let value = 0xffffffff;
    for (const byte of data) value = (crcTable[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc(typed));
    return Buffer.concat([length, typed, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.from([0, ...Array.from({ length: width }, () => rgb).flat()]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

interface StepTime {
  seconds: number;
  startedAt: string;
  step: string;
}

/** A tab of the club's record (the back office's menu has «Paràmetres» and «Auditoria» too). */
async function recordTab(page: Page, name: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Seccions de la fitxa del club" })
    .getByRole("link", { exact: true, name })
    .click();
}

/** The first administrator's password, chosen on AgilityHub ID during the run (never written). */
const firstAdminPassword = `Rb-${randomBytes(12).toString("hex")}`;

test("E10-W02 · a second club in under an hour: the manual script, step by step against the core, with its times (T-17-12)", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const times: StepTime[] = [];
  const notes: Record<string, unknown> = {};
  const started = Date.now();
  const timed = async <T>(step: string, run: () => Promise<T>): Promise<T> => {
    const begin = Date.now();
    try {
      return await run();
    } finally {
      times.push({
        seconds: Math.round((Date.now() - begin) / 100) / 10,
        startedAt: new Date(begin).toISOString(),
        step,
      });
      writeFileSync(
        join(evidenceDirectory, "e10w02-segon-club-temps.json"),
        `${JSON.stringify(
          { notes, steps: times, totalSeconds: Math.round((Date.now() - started) / 1000) },
          null,
          2,
        )}\n`,
      );
    }
  };
  const mailboxAtStart = mailboxFiles();
  const context = await desktopContext(browser);
  const page = await context.newPage();
  // A step that cannot find its control fails in seconds, not at the test's timeout.
  page.setDefaultTimeout(30_000);
  recordPlatformCalls(page);
  const failedPlatformCalls: string[] = [];
  // The one refusal the script provokes on purpose (step 7's second clone), asserted there.
  let refusalExpected: ((url: URL, status: number) => boolean) | undefined;
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.pathname.includes("/api/v1/platform/") &&
      response.status() >= 400 &&
      refusalExpected?.(url, response.status()) !== true
    ) {
      failedPlatformCalls.push(
        `${response.request().method()} ${url.pathname} → ${String(response.status())}`,
      );
    }
  });

  // 1. Into the console.
  await timed("1 · Entra a la consola", async () => {
    await loginPlatformAdmin(page);
    await expect(page.getByRole("heading", { level: 1, name: "Consola de clubs" })).toBeVisible();
  });

  // 2. The «Nou club» wizard: eight steps and the club's colours. Its catalogues stay empty: step 7
  // clones them once from the template (a second clone answers 409 CATALOG_NOT_EMPTY, R-17-08).
  let clubId = "";
  await timed("2 · Assistent «Nou club»", async () => {
    await page.getByRole("button", { name: "Nou club" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Nou club" })).toBeVisible();
    await page.getByLabel("Nom", { exact: true }).fill(SECOND_CLUB.name);
    await expect(page.getByLabel("Slug")).toHaveValue(SECOND_CLUB.slug);
    await page.getByLabel("Nom legal").fill(SECOND_CLUB.name);
    await page.getByLabel("Població que es mostra").fill(SECOND_CLUB.displayCity);
    await page.getByLabel("Correu de contacte").fill(SECOND_CLUB.contactEmail);
    await screenshot(page, "core-W02-01-assistent-identitat-1280.png");
    const next = page.getByRole("button", { name: "SEGÜENT" });
    await next.click();
    await expect(page.getByRole("heading", { level: 2, name: /Localització/u })).toBeVisible();
    await next.click();
    await expect(page.getByRole("heading", { level: 2, name: /Mòduls/u })).toBeVisible();
    await page.getByRole("radio", { name: "Complet" }).check();
    await next.click();
    await expect(page.getByRole("heading", { level: 2, name: /Pagaments/u })).toBeVisible();
    await next.click();
    await expect(page.getByRole("heading", { level: 2, name: /Tema/u })).toBeVisible();
    await page.getByRole("radio", { name: "Colors del club" }).check();
    await page.getByLabel("Principal", { exact: true }).fill(SECOND_CLUB.primary);
    await page.getByLabel("Text sobre el principal").fill(hexOf(WHITE));
    await screenshot(page, "core-W02-02-assistent-tema-1280.png");
    await next.click();
    await expect(page.getByRole("heading", { level: 2, name: /Catàlegs base/u })).toBeVisible();
    const template = page.getByLabel("Club plantilla");
    const templateOptions = await template.locator("option").allTextContents();
    notes.templates = templateOptions;
    expect(templateOptions.length).toBeGreaterThan(1);
    await template.selectOption({ label: "Cap: catàlegs buits" });
    await next.click();
    await expect(
      page.getByRole("heading", { level: 2, name: /Primer administrador/u }),
    ).toBeVisible();
    await page.getByLabel("Correu electrònic").fill(SECOND_CLUB.adminEmail);
    await page.getByLabel("Nom", { exact: true }).fill(SECOND_CLUB.adminName);
    await next.click();
    await expect(page.getByLabel("Fitxer club-as-code")).toContainText(`slug: ${SECOND_CLUB.slug}`);
    await screenshot(page, "core-W02-03-assistent-revisio-1280.png");
    const created = page.waitForResponse(isPlatform("POST", /\/api\/v1\/platform\/clubs$/u));
    await page.getByRole("button", { name: "CREA EL CLUB" }).click();
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    // No `catalogs.fromTemplate`: «Catàlegs base» (step 7) is the script's only clone.
    expect(
      (createdResponse.request().postDataJSON() as components["schemas"]["ClubDefinition"])
        .catalogs,
    ).toBeUndefined();
    const createdBody =
      (await createdResponse.json()) as components["schemas"]["PlatformClubCreated"];
    clubId = createdBody.club.id;
    notes.created = { checklist: createdBody.checklist, keys: Object.keys(createdBody) };
    await page.waitForURL("**/identitat?creat=1");
    await expect(page.getByRole("heading", { level: 1, name: SECOND_CLUB.name })).toBeVisible();
    await expect(page.getByRole("region", { name: "Checklist d'onboarding" })).toBeVisible();
    await screenshot(page, "core-W02-04-fitxa-creada-1280.png");
  });
  expect(clubId).not.toBe("");

  // 3. «Dominis»: the members' app and the back office, their DNS records, [Verifica].
  await timed("3 · Dominis: afegeix i verifica", async () => {
    await recordTab(page, "Dominis");
    await expect(page.getByRole("heading", { level: 2, name: "Dominis" })).toBeVisible();
    for (const [host, app] of [
      [SECOND_CLUB.appHost, "App dels abonats"],
      [SECOND_CLUB.backOfficeHost, "Backoffice"],
    ] as const) {
      await page.getByLabel("Host").fill(host);
      await page.getByLabel("App", { exact: true }).selectOption({ label: app });
      const added = page.waitForResponse(
        isPlatform("POST", /\/api\/v1\/platform\/clubs\/[^/]+\/domains$/u),
      );
      await page.getByRole("button", { name: "Afegeix domini" }).click();
      const addedResponse = await added;
      expect(addedResponse.status()).toBe(201);
      const domain = (await addedResponse.json()) as components["schemas"]["PlatformDomain"];
      // The operator creates the CNAME at the club's DNS provider: here, the core's fake DNS.
      await publishFakeCname(page, host, verificationOf(domain).cnameTarget);
      const verified = page.waitForResponse(isPlatform("POST", /\/verification$/u));
      await page.getByRole("button", { name: `Verifica ${host}` }).click();
      const verification = await verified;
      expect(verification.status()).toBe(200);
      expect(await verification.json()).toMatchObject({ status: "VERIFIED" });
      const row = page.getByRole("row").filter({ hasText: host });
      await expect(row.getByText("verificat", { exact: true })).toBeVisible();
      await expect(row.getByText("principal", { exact: true })).toBeVisible();
    }
    const appBranding = await brandingFor(SECOND_CLUB.appHost);
    expect(appBranding.status, appBranding.body).toBe(200);
    expect(clubSlugOf(appBranding.body)).toBe(SECOND_CLUB.slug);
    await screenshot(page, "core-W02-05-dominis-verificats-1280.png");
  });

  // 4. «Tema»: the club's logo (the colours came with the wizard).
  await timed("4 · Tema: logo", async () => {
    await recordTab(page, "Tema");
    await page.locator("#console-theme-logo").setInputFiles({
      buffer: solidPng(240, 80, SECOND_CLUB_PRIMARY),
      mimeType: "image/png",
      name: "riublau-logo.png",
    });
    await expect(page.getByText("riublau-logo.png es publicarà en desar.")).toBeVisible();
    const saved = page.waitForResponse(isPlatform("PUT", /\/theme$/u));
    await page.getByRole("button", { exact: true, name: "DESA" }).click();
    const savedResponse = await saved;
    expect(savedResponse.status(), await savedResponse.text()).toBe(200);
    await expect(page.getByText("Canvis desats.")).toBeVisible();
    await screenshot(page, "core-W02-06-tema-1280.png");
  });

  // 5. «Pagaments»: SEPA direct debit (creditor and IBAN, write-only).
  await timed("5 · Pagaments: SEPA", async () => {
    await recordTab(page, "Pagaments");
    const sepa = page
      .locator(".console-card")
      .filter({ has: page.getByRole("heading", { name: "Domiciliació SEPA" }) });
    await sepa.getByLabel("Nom del creditor").fill(SECOND_CLUB.name);
    await sepa.getByLabel("Identificador de creditor").fill(SECOND_CLUB.creditorId);
    await sepa.getByLabel("Sufix").fill("000");
    await sepa.getByLabel("IBAN").fill(SECOND_CLUB.iban);
    const saved = page.waitForResponse(isPlatform("PUT", /\/payment-providers\/SEPA_XML$/u));
    await sepa.getByRole("button", { exact: true, name: "DESA" }).click();
    const savedResponse = await saved;
    expect(savedResponse.status(), await savedResponse.text()).toBe(200);
    await expect(sepa.getByText("configurat", { exact: true })).toBeVisible();
    await screenshot(page, "core-W02-07-pagaments-1280.png");
  });

  // 6. «Legal»: the club's privacy policy and its image-consent text in its default language.
  await timed("6 · Legal: privacitat i consentiment d'imatge", async () => {
    await recordTab(page, "Legal");
    await page.getByLabel("URL de la política de privacitat").fill(SECOND_CLUB.privacyPolicyUrl);
    await page
      .getByLabel("Text de consentiment d'imatge (Català)")
      .fill("Autoritzo que el club publiqui fotos del meu gos a les seves xarxes.");
    const saved = page.waitForResponse(isPlatform("PATCH", /\/api\/v1\/platform\/clubs\/[^/]+$/u));
    await page.getByRole("button", { exact: true, name: "DESA" }).click();
    const savedResponse = await saved;
    expect(savedResponse.status(), await savedResponse.text()).toBe(200);
    await expect(page.getByText("Canvis desats.")).toBeVisible();
    await screenshot(page, "core-W02-08-legal-1280.png");
  });

  // 7. «Catàlegs base»: levels, rings, plans, FAQ and message templates from the template club,
  // the script's only clone (the wizard chose «Cap: catàlegs buits»).
  await timed("7 · Catàlegs base: clona de la plantilla", async () => {
    await recordTab(page, "Catàlegs base");
    const clone = page.getByRole("button", { name: "Clona d'un club plantilla" });
    const cloned = page.waitForResponse(isPlatform("POST", /\/catalog-clone$/u));
    await clone.click();
    const clonedResponse = await cloned;
    const clonedBody = (await clonedResponse.json()) as components["schemas"]["CatalogCloneResult"];
    // What it copies is the template club's content (`club-template-default.yaml` in the
    // evidence): the run records the counts, it does not decide them.
    notes.catalogClone = {
      body: clonedBody,
      request: clonedResponse.request().postDataJSON() as unknown,
      status: clonedResponse.status(),
    };
    expect(clonedResponse.status()).toBe(200);
    expect(Object.keys(clonedBody.copied).sort()).toEqual([
      "FAQ",
      "LEVELS",
      "MESSAGE_TEMPLATES",
      "PLANS",
      "RINGS",
    ]);
    await expect(page.getByText(/^S'ha copiat:/u)).toBeVisible();
    await screenshot(page, "core-W02-09-catalegs-1280.png");
    // The same parts once more (R-17-08): a part the first clone filled is no longer empty. While
    // the template club is empty (every count 0) nothing was filled, and nothing is asserted.
    const copiedTotal = Object.values(clonedBody.copied).reduce((sum, count) => sum + count, 0);
    if (copiedTotal === 0) {
      notes.secondClone = "skipped: the template club copied nothing";
      return;
    }
    refusalExpected = (url, status) => url.pathname.endsWith("/catalog-clone") && status === 409;
    try {
      const again = page.waitForResponse(isPlatform("POST", /\/catalog-clone$/u));
      await clone.click();
      const againResponse = await again;
      const againBody = (await againResponse.json()) as components["schemas"]["ApiError"];
      notes.secondClone = { body: againBody, status: againResponse.status() };
      expect(againResponse.status()).toBe(409);
      expect(againBody.code).toBe("CATALOG_NOT_EMPTY");
      await expect(
        page.getByText(/el club ja en té\. Només es copien les parts buides\./u),
      ).toBeVisible();
    } finally {
      refusalExpected = undefined;
    }
  });

  // 8. The first administrator: the wizard's invitation (N-53) opens AgilityHub ID, where an
  // account without a password sets one, and with it the club's own back office.
  await timed("8 · Primer administrador: invitació i primer accés", async () => {
    await recordTab(page, "Equip");
    const adminRow = page.getByRole("row").filter({ hasText: SECOND_CLUB.adminEmail });
    await expect(adminRow).toBeVisible();
    await screenshot(page, "core-W02-10-equip-1280.png");
    let invitation: MailMessage | undefined;
    await expect
      .poll(
        () => {
          invitation = messagesFor(SECOND_CLUB.adminEmail, mailboxAtStart)[0];
          return invitation !== undefined;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    const link = invitation === undefined ? undefined : linksOf(invitation)[0];
    notes.invitation = {
      link: link === undefined ? null : describeLink(link),
      subject: invitation?.subject ?? null,
    };
    expect(link?.host).toBe(ID_HOST);
    const idContext = await desktopContext(browser);
    const idTab = await idContext.newPage();
    await idTab.goto(`${idUrl}${link?.pathname ?? ""}${link?.search ?? ""}`);
    await idTab.waitForURL("**/account");
    await idTab.getByRole("link", { name: "Canvia la contrasenya" }).click();
    await idTab.getByLabel("Contrasenya nova", { exact: true }).fill(firstAdminPassword);
    await idTab.getByLabel("Repeteix la contrasenya nova").fill(firstAdminPassword);
    await idTab.getByRole("button", { name: "DESA LA CONTRASENYA" }).click();
    await expect(idTab.getByText("La contrasenya s'ha desat.")).toBeVisible();
    await screenshot(idTab, "core-W02-11-primer-admin-contrasenya-1280.png");
    await idContext.close();
    // A fresh browser for the club's host: the ID's cookie stays on the ID's host.
    const officeContext = await desktopContext(browser);
    const office = await officeContext.newPage();
    await office.goto(`${secondClubAdminUrl}/entrar`);
    await office.getByLabel("Correu electrònic").fill(SECOND_CLUB.adminEmail);
    await office.getByRole("button", { name: "Tinc contrasenya" }).click();
    await office.getByLabel("Contrasenya").fill(firstAdminPassword);
    const signedIn = office.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/oauth2/token" &&
        new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "password",
    );
    await office.getByRole("button", { exact: true, name: "ENTRA" }).click({ noWaitAfter: true });
    const signedInResponse = await signedIn;
    notes.firstAdminSignIn = {
      code: signedInResponse.ok() ? null : errorCodeOf(await signedInResponse.text()),
      status: signedInResponse.status(),
    };
    expect(signedInResponse.status()).toBe(200);
    await office.waitForURL("**/tauler");
    await expect(office.getByRole("heading", { name: "Tauler" })).toBeVisible();
    expect((await hostPrimary(office)).toLowerCase()).toBe(SECOND_CLUB.primary);
    await screenshot(office, "core-W02-12-primer-admin-tauler-1280.png");
    await officeContext.close();
  });

  // 9. The record's other tabs, as the platform reads them (no write). The section is rendered
  // whatever its content, so each tab waits for what only its loaded state shows, then nothing in
  // it may be an error or still loading, and no platform call of the run may have failed.
  await timed("9 · Revisió de la fitxa", async () => {
    // In the record's (and the script's) order.
    const loaded: [string, (region: Locator) => Locator][] = [
      ["Identitat", (region) => region.getByLabel("Nom", { exact: true })],
      ["Localització", (region) => region.getByLabel("Fus horari")],
      ["Mòduls", (region) => region.getByRole("switch").first()],
      [
        "Paràmetres",
        (region) => region.getByRole("note").filter({ hasText: "Els valors del club" }),
      ],
      ["Processos", (region) => region.getByRole("table", { name: "Processos" })],
      ["Auditoria", (region) => region.getByRole("table", { name: "Auditoria" })],
      ["Ús", (region) => region.locator(".console-kpis").getByText("Abonats actius")],
    ];
    for (const [tab, marker] of loaded) {
      await recordTab(page, tab);
      const region = page.getByRole("region", { name: tab });
      await expect(marker(region), tab).toBeVisible();
      await page.waitForLoadState("networkidle");
      // A table is drawn while it loads (its skeleton is a row): first nothing may still load,
      // then the settled tab may show no error.
      await expect(region.getByRole("status", { name: /^Carregant/u }), tab).toHaveCount(0);
      await expect(region.getByText(/^Carregant/u), tab).toHaveCount(0);
      await expect(region.getByRole("alert"), tab).toHaveCount(0);
    }
    notes.failedPlatformCalls = [...failedPlatformCalls];
    expect(failedPlatformCalls).toEqual([]);
  });

  // 10. The checklist and the manual activation (R-17-06). The five items the steps above complete
  // are asserted; `templates` and `faq` follow the template club's content (step 7), so the club is
  // activated at 5/7 while the template is empty (allowed: activation is manual).
  await timed("10 · Checklist i activació", async () => {
    const record = page.waitForResponse(isPlatform("GET", /\/api\/v1\/platform\/clubs\/[^/]+$/u));
    await page.reload();
    const recordBody = (await (await record).json()) as components["schemas"]["PlatformClub"];
    notes.checklistBeforeActivation = recordBody.onboardingChecklist;
    expect(recordBody.onboardingChecklist).toMatchObject({
      branding: true,
      dns: true,
      firstAdmin: true,
      legal: true,
      sepa: true,
    });
    await screenshot(page, "core-W02-13-checklist-1280.png");
    await recordTab(page, "Estat");
    const changed = page.waitForResponse(isPlatform("PUT", /\/status$/u));
    await page.getByRole("button", { name: "Activa el club" }).click();
    const changedResponse = await changed;
    expect(changedResponse.status(), await changedResponse.text()).toBe(200);
    await expect(page.getByText("S'ha canviat l'estat del club.")).toBeVisible();
    await screenshot(page, "core-W02-14-estat-actiu-1280.png");
  });

  // 11. The members' app on the club's own host, in its theme and with its logo.
  await timed("11 · L'app dels abonats al domini del club", async () => {
    const memberContext = await browser.newContext({ viewport: { height: 844, width: 375 } });
    await memberContext.addInitScript(() => {
      localStorage.setItem("agilityhub.locale", "ca");
    });
    const memberPage = await memberContext.newPage();
    const boot = memberPage.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/v1/branding",
    );
    await memberPage.goto(`${secondClubAppUrl}/entrar`);
    expect((await boot).status()).toBe(200);
    await expect(memberPage.getByPlaceholder("correu@exemple.cat")).toBeVisible();
    expect((await hostPrimary(memberPage)).toLowerCase()).toBe(SECOND_CLUB.primary);
    await screenshot(memberPage, "core-W02-15-app-abonats-entrar-375.png");
    await memberContext.close();
  });

  notes.failedPlatformCalls = failedPlatformCalls;
  notes.totalMinutes = Math.round((Date.now() - started) / 600) / 100;
  writeFileSync(
    join(evidenceDirectory, "e10w02-segon-club-temps.json"),
    `${JSON.stringify(
      { notes, steps: times, totalSeconds: Math.round((Date.now() - started) / 1000) },
      null,
      2,
    )}\n`,
  );
  // Step 10 included (step 11 is the members' app, in its own context): no platform call failed.
  expect(failedPlatformCalls).toEqual([]);
  await context.close();
});
