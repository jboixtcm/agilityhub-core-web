import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Browser, type BrowserContext, type Page } from "@playwright/test";

import { expect, test } from "./oauth-token-log";
import { brandingClub, expectPublicFooter } from "./public-footer";

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const idUrl = "http://127.0.0.1:4175";
const coreUrl = requiredEnvironment("CORE_URL");
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const mailboxDirectory = requiredEnvironment("E1_MAILBOX_DIRECTORY");
const evidenceDirectory =
  process.env.E1_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E1-W04");

mkdirSync(evidenceDirectory, { recursive: true });

interface MailMessage {
  html?: string;
  text?: string;
  to?: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function mobileContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { height: 812, width: 375 } });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  return context;
}

async function desktopContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { height: 800, width: 1280 } });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  return context;
}

async function login(page: Page, baseUrl: string, email: string): Promise<void> {
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(email);
  await page.getByLabel("Contrasenya").fill(corePassword);
  await submitPasswordLogin(page);
}

async function submitPasswordLogin(page: Page): Promise<void> {
  const meStatuses: number[] = [];
  page.on("response", (response) => {
    if (response.url().endsWith("/api/v1/me") && response.request().method() === "GET") {
      meStatuses.push(response.status());
    }
  });
  const tokenResponse = page.waitForResponse((response) => {
    if (!response.url().endsWith("/oauth2/token") || response.request().method() !== "POST") {
      return false;
    }
    return (
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "password"
    );
  });
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click({ noWaitAfter: true });
  expect((await tokenResponse).status()).toBe(200);
  await expect.poll(() => meStatuses.at(-1)).toBe(200);
}

function waitForRefresh(page: Page) {
  return page.waitForResponse((response) => {
    if (!response.url().endsWith("/oauth2/token") || response.request().method() !== "POST") {
      return false;
    }
    return (
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "refresh_token"
    );
  });
}

async function restoreAtRoute(page: Page, route: string): Promise<void> {
  const refreshResponse = waitForRefresh(page);
  const meResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/me") && response.request().method() === "GET",
  );
  await page.goto(`${clubsUrl}${route}`);
  const refresh = await refreshResponse;
  expect(refresh.status()).toBe(200);
  const me = await meResponse;
  expect(me.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`${route}$`, "u"));
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ fullPage: true, path: join(evidenceDirectory, name) });
}

async function refreshCookieValue(context: BrowserContext): Promise<string | undefined> {
  return (await context.cookies()).find((cookie) => cookie.name === "ah_refresh")?.value;
}

function mailboxFiles(): Set<string> {
  return new Set(readdirSync(mailboxDirectory).filter((name) => name.endsWith(".json")));
}

function deliveredLink(recipient: string, previous: ReadonlySet<string>): URL | undefined {
  for (const filename of readdirSync(mailboxDirectory)) {
    if (!filename.endsWith(".json") || previous.has(filename)) {
      continue;
    }
    const message = JSON.parse(
      readFileSync(join(mailboxDirectory, filename), "utf8"),
    ) as MailMessage;
    if (message.to?.toLowerCase() !== recipient.toLowerCase()) {
      continue;
    }
    const source = message.html ?? message.text ?? "";
    const match =
      /href=["'](https:\/\/[^"']+)["']/u.exec(source) ?? /(https:\/\/\S+)/u.exec(source);
    if (match?.[1] !== undefined) {
      return new URL(match[1].replaceAll("&amp;", "&"));
    }
  }
  return undefined;
}

async function waitForDeliveredLink(
  recipient: string,
  previous: ReadonlySet<string>,
): Promise<URL> {
  let result: URL | undefined;
  await expect
    .poll(
      () => {
        result = deliveredLink(recipient, previous);
        return result !== undefined;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  if (result === undefined) {
    throw new Error("The local mailbox did not contain the expected message");
  }
  return result;
}

test.describe.configure({ mode: "serial" });

test("T-01-18 password login reaches the seeded account", async ({ browser }) => {
  const context = await mobileContext(browser);
  const page = await context.newPage();

  await page.goto(`${clubsUrl}/entrar`);
  await expect(page.getByPlaceholder("correu@exemple.cat")).toBeVisible();
  await screenshot(page, "01-entrar-core-375.png");
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByLabel("Contrasenya").fill(corePassword);
  await submitPasswordLogin(page);
  await expect(page).toHaveURL(/\/inici$/u);
  await expect(page.locator(".clubs-shell")).toBeVisible();

  await context.close();
});

test("T-01-21 seeded administrator opens the real backoffice", async ({ browser }) => {
  const context = await desktopContext(browser);
  const page = await context.newPage();
  await page.goto(`${adminUrl}/entrar`);
  await expect(page.getByRole("heading", { name: "Accés al backoffice" })).toBeVisible();
  await screenshot(page, "admin-entrar-core-1280.png");
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill(corePassword);
  await submitPasswordLogin(page);
  await expect(page).toHaveURL(/\/tauler$/u);
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
  await screenshot(page, "admin-password-core-1280.png");
  await context.close();
});

test("T-01-20 club session is restored by the core", async ({ browser }) => {
  const context = await mobileContext(browser);
  const page = await context.newPage();
  await login(page, clubsUrl, "member@example.test");
  await page.waitForURL("**/inici");
  expect(await refreshCookieValue(context)).toBeDefined();
  await expect(page.locator(".clubs-shell")).toBeVisible();
  await screenshot(page, "04-inici-core-375.png");
  await restoreAtRoute(page, "/perfil");
  await expect(page.locator(".clubs-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "El meu perfil" })).toBeVisible();
  await screenshot(page, "12-perfil-core-375.png");
  await context.close();

  const rememberedContext = await mobileContext(browser);
  const rememberedPage = await rememberedContext.newPage();
  await login(rememberedPage, clubsUrl, "member@example.test");
  await rememberedPage.waitForURL("**/inici");
  await expect(rememberedPage.locator(".clubs-shell")).toBeVisible();
  await expect(rememberedPage).toHaveURL(/\/inici$/u);
  await rememberedContext.close();
});

test("T-01-19 magic link is delivered and exchanged end to end", async ({ browser }) => {
  const context = await mobileContext(browser);
  const page = await context.newPage();
  const previous = mailboxFiles();
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("member.3@example.test");
  await page
    .getByRole("button", { name: "Envia'm un enllaç per entrar sense contrasenya" })
    .click();
  await expect(page.getByRole("status")).toContainText("hi rebràs l'enllaç");

  const delivered = await waitForDeliveredLink("member.3@example.test", previous);
  expect(delivered.hostname).toBe("app.example.test");
  await page.goto(`${clubsUrl}${delivered.pathname}${delivered.search}`);
  await expect(page.getByRole("heading", { name: /Bruna/u })).toBeVisible();
  await screenshot(page, "02-activacio-core-375.png");
  await page.getByRole("button", { name: "CONTINUAR" }).click();
  await page.waitForURL("**/inici");
  await expect(page.locator(".clubs-shell")).toBeVisible();
  await context.close();
});

test("T-01-26 published seed enters without pending onboarding", async ({ browser }) => {
  const context = await mobileContext(browser);
  const page = await context.newPage();
  await login(page, clubsUrl, "member.2@example.test");
  await page.waitForURL("**/inici");
  await expect(page.locator(".clubs-shell")).toBeVisible();
  await screenshot(page, "member-2-core-375.png");
  await context.close();
});

test("T-01-22 apps/id resumes a real authorize flow through oauth2/session", async ({
  browser,
}) => {
  const accountContext = await desktopContext(browser);
  const accountPage = await accountContext.newPage();
  await accountPage.goto(`${idUrl}/login`);
  await expect(accountPage.locator("body")).toContainText("Entra a AgilityHub");
  await expect(accountPage.getByRole("heading", { name: "Entra a AgilityHub" })).toBeVisible();
  await screenshot(accountPage, "id-login-core-1280.png");
  await accountPage.getByLabel("Correu electrònic").fill("admin@example.test");
  await accountPage.getByLabel("Contrasenya").fill(corePassword);
  await accountPage.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await accountPage.waitForURL("**/account");
  await expect(accountPage.getByRole("heading", { name: "El teu compte" })).toBeVisible();
  await screenshot(accountPage, "id-account-core-1280.png");
  await accountPage.goto(`${idUrl}/products`);
  await expect(accountPage.getByRole("heading", { name: "Els teus productes" })).toBeVisible();
  await screenshot(accountPage, "id-products-core-1280.png");
  await accountContext.close();

  const context = await desktopContext(browser);
  const page = await context.newPage();
  const verifier = "e1-w04-verifier-that-is-long-enough-for-pkce-0123456789";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorization = new URL(`${idUrl}/oauth2/authorize`);
  authorization.search = new URLSearchParams({
    client_id: "id-web",
    code_challenge: challenge,
    code_challenge_method: "S256",
    login_hint: "admin@example.test",
    redirect_uri: "https://id.example.test/oidc/callback",
    response_type: "code",
    scope: "openid profile email memberships offline_access",
    state: "e1-w04-state",
    ui_locales: "ca",
  }).toString();
  const authorizeResponse = await context.request.get(authorization.href, { maxRedirects: 0 });
  expect(authorizeResponse.status()).toBe(302);
  const location = authorizeResponse.headers().location;
  const setCookie = authorizeResponse
    .headersArray()
    .find((header) => header.name.toLowerCase() === "set-cookie")?.value;
  const flow = location === undefined ? null : new URL(location).searchParams.get("flow");
  expect(flow !== null && flow !== "" && setCookie !== undefined).toBe(true);
  const flowCookie = setCookie?.split(";", 1)[0] ?? "";

  let sessionRequestFlow: string | undefined;
  await page.route("**/oauth2/session", async (route) => {
    const request = route.request();
    const requestBody = request.postData() ?? "{}";
    sessionRequestFlow = (JSON.parse(requestBody) as { flow?: string }).flow;
    const response = await context.request.post(`${coreUrl}/oauth2/session`, {
      data: requestBody,
      failOnStatusCode: false,
      headers: {
        Authorization: request.headers().authorization ?? "",
        Cookie: flowCookie,
        "Content-Type": "application/json",
        Host: "id.example.test",
        Origin: "https://id.example.test",
      },
    });
    await route.fulfill({
      body: await response.body(),
      contentType: response.headers()["content-type"] ?? "application/json",
      status: response.status(),
    });
  });

  let callbackUrl: string | undefined;
  await page.route("https://id.example.test/oidc/callback**", async (route) => {
    callbackUrl = route.request().url();
    await route.fulfill({ body: "OIDC callback received", status: 200 });
  });
  await page.goto(
    `${idUrl}/login?flow=${encodeURIComponent(flow ?? "")}&login_hint=admin%40example.test&ui_locales=ca`,
  );
  await expect(page.getByRole("heading", { name: "Entra a AgilityHub" })).toBeVisible();
  await screenshot(page, "id-oidc-login-core-1280.png");
  await page.getByLabel("Contrasenya").fill(corePassword);
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await expect.poll(() => callbackUrl !== undefined).toBe(true);
  expect(sessionRequestFlow).toBe(flow);
  const callback = new URL(callbackUrl ?? "https://id.example.test/oidc/callback");
  expect(callback.searchParams.get("state")).toBe("e1-w04-state");
  expect(Boolean(callback.searchParams.get("code"))).toBe(true);
  await context.close();
});

// Last, so that a core older than api E3-T16 fails only this test (the file runs in series).
test("E3-W12 step 5 · the public footer of 01 shows /branding's identity and registered office (S02 R-02-02)", async ({
  browser,
}) => {
  const context = await mobileContext(browser);
  const page = await context.newPage();
  await page.goto(`${clubsUrl}/entrar`);
  await expect(page.getByPlaceholder("correu@exemple.cat")).toBeVisible();
  const club = await brandingClub(page);
  writeFileSync(join(evidenceDirectory, "branding-club-core.json"), `${JSON.stringify(club, null, 2)}\n`);
  await expectPublicFooter(page.locator(".auth-footer"), club);
  await screenshot(page, "01-footer-core-375.png");
  await context.close();
});
