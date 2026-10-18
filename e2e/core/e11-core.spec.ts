import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Browser, type Page, type Response } from "@playwright/test";

import { expect, test } from "./oauth-token-log";

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E11-W01");

mkdirSync(evidenceDirectory, { recursive: true });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

function isResponse(method: string, path: RegExp) {
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
  await expect(page).toHaveURL(new RegExp(`${path}$`, "u"));
}

interface Session {
  bearer: string;
  page: Page;
}

async function login(
  browser: Browser,
  appUrl: string,
  email: string,
  landing: RegExp,
  viewport: { height: number; width: number },
): Promise<Session> {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  const page = await context.newPage();
  let bearer: string | undefined;
  page.on("request", (request) => {
    const authorization = request.headers().authorization;
    if (authorization !== undefined && new URL(request.url()).pathname.startsWith("/api/v1/")) {
      bearer = authorization;
    }
  });
  await page.goto(`${appUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(email);
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel("Contrasenya", { exact: true }).fill(corePassword);
  const me = page.waitForResponse(isResponse("GET", /\/api\/v1\/me$/u));
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click({ noWaitAfter: true });
  expect((await me).status()).toBe(200);
  await page.waitForURL(landing);
  await expect.poll(() => bearer).toMatch(/^Bearer /u);
  if (bearer === undefined) throw new Error("The page sent no bearer");
  return { bearer, page };
}

interface ApiAnswer {
  body: unknown;
  status: number;
}

async function api(
  page: Page,
  bearer: string,
  method: "DELETE" | "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<ApiAnswer> {
  return page.evaluate(
    async ({ authorization, call, payload }) => {
      const response = await fetch(`/api/v1${call.path}`, {
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        headers: {
          Authorization: authorization,
          ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
        },
        method: call.method,
      });
      const text = await response.text();
      return { body: text === "" ? null : (JSON.parse(text) as unknown), status: response.status };
    },
    { authorization: bearer, call: { method, path }, payload: body },
  );
}

function objectValue(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

test("E11-W01 · T-14-17: screen 12 follows and downloads the member's ZIP; impersonation is refused", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const member = await login(
    browser,
    clubsUrl,
    "member@example.test",
    /\/(?:inici|perfil-acces)$/u,
    { height: 812, width: 375 },
  );
  if (new URL(member.page.url()).pathname === "/perfil-acces") {
    await member.page
      .locator("button.profile-choice__card")
      .filter({ hasText: /Com a alumn/u })
      .click();
    await member.page.waitForURL("**/inici");
  }
  const me = await api(member.page, member.bearer, "GET", "/me");
  expect(me.status).toBe(200);
  const membership = objectValue(me.body, "membership");
  const memberId = objectValue(membership, "memberId");
  expect(memberId).toEqual(expect.any(String));

  await navigateSpa(member.page, "/perfil");
  const queuedResponse = member.page.waitForResponse(
    isResponse("POST", /\/api\/v1\/me\/data-export$/u),
  );
  await member.page.getByRole("button", { name: "Descarrega les meves dades" }).click();
  const queued = await queuedResponse;
  expect(queued.status()).toBe(202);
  const queuedBody = (await queued.json()) as { jobId: string };
  await expect(member.page.getByText("Preparant el paquet…", { exact: true })).toBeVisible();

  const downloadButton = member.page.getByRole("button", { name: "Descarrega el paquet" });
  await expect(downloadButton).toBeVisible({ timeout: 150_000 });
  await screenshot(member.page, "12-dades-personals-ready-core-375.png");
  const downloadResponse = member.page.waitForResponse(
    isResponse("GET", new RegExp(`/api/v1/exports/${queuedBody.jobId}/download$`, "u")),
  );
  await downloadButton.click();
  const download = await downloadResponse;
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("application/zip");

  const repeated = await api(member.page, member.bearer, "POST", "/me/data-export");
  expect(repeated.status).toBe(422);
  expect(objectValue(repeated.body, "code")).toBe("DATA_EXPORT_TOO_SOON");

  const admin = await login(browser, adminUrl, "admin@example.test", /\/tauler$/u, {
    height: 900,
    width: 1280,
  });
  const grant = await api(
    admin.page,
    admin.bearer,
    "POST",
    `/members/${String(memberId)}/impersonation-token`,
    {
      reason: "Comprovació automatitzada",
    },
  );
  expect(grant.status).toBe(201);
  const impersonationToken = objectValue(grant.body, "token");
  expect(impersonationToken).toEqual(expect.any(String));
  const refused = await api(
    member.page,
    `Bearer ${String(impersonationToken)}`,
    "POST",
    "/me/data-export",
  );
  expect(refused.status).toBe(403);
  expect(objectValue(refused.body, "code")).toBe("IMPERSONATION_DENIED");
  await admin.page.context().close();
  await member.page.context().close();
});

test("E11-W01 · T-14-18/T-14-30: D10 schedules and cancels erasure and renders consent history", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = await login(browser, adminUrl, "admin@example.test", /\/tauler$/u, {
    height: 900,
    width: 1280,
  });
  const list = await api(
    admin.page,
    admin.bearer,
    "GET",
    "/members?page=0&size=200&filter=status%3Aeq%3ALEFT&fields=fullName,memberNumber,displayStatus",
  );
  expect(list.status).toBe(200);
  const items = objectValue(list.body, "items");
  if (!Array.isArray(items)) throw new Error("The LEFT-member page has no items");

  let chosen: { fullName: string; id: string } | undefined;
  for (const item of items) {
    const id = objectValue(item, "id");
    const fullName = objectValue(item, "fullName");
    if (typeof id !== "string" || typeof fullName !== "string") continue;
    const created = await api(admin.page, admin.bearer, "POST", `/members/${id}/erasure`, {});
    if (created.status !== 201) continue;
    expect((await api(admin.page, admin.bearer, "DELETE", `/members/${id}/erasure`)).status).toBe(
      204,
    );
    chosen = { fullName, id };
    break;
  }
  if (chosen === undefined) throw new Error("No clean LEFT member accepted an erasure request");

  await navigateSpa(admin.page, `/abonats/${chosen.id}`);
  await expect(admin.page.getByRole("heading", { name: chosen.fullName })).toBeVisible();
  await expect(
    admin.page.getByRole("heading", { name: "Historial de consentiments" }),
  ).toBeVisible();
  await expect(admin.page.locator(".member-privacy__consents li").first()).toBeVisible();

  await admin.page.getByRole("button", { name: "Suprimeix les dades (RGPD)" }).click();
  const dialog = admin.page.getByRole("dialog", { name: "Suprimeix les dades (RGPD)" });
  await expect(dialog.getByText(/ha d'estar de baixa/u)).toBeVisible();
  const request = admin.page.waitForResponse(
    isResponse("POST", new RegExp(`/api/v1/members/${chosen.id}/erasure$`, "u")),
  );
  await dialog.getByRole("button", { name: "PROGRAMA LA SUPRESSIÓ" }).click();
  expect((await request).status()).toBe(201);
  await expect(admin.page.getByText(/Supressió programada per al/u)).toBeVisible();
  await screenshot(admin.page, "D10-supressio-programada-core-1280.png");

  await admin.page.getByRole("button", { name: "Anul·la la supressió" }).click();
  const cancelDialog = admin.page.getByRole("dialog", { name: "Anul·la la supressió" });
  const cancellation = admin.page.waitForResponse(
    isResponse("DELETE", new RegExp(`/api/v1/members/${chosen.id}/erasure$`, "u")),
  );
  await cancelDialog.getByRole("button", { name: "ANUL·LA LA SUPRESSIÓ" }).click();
  expect((await cancellation).status()).toBe(204);
  await expect(admin.page.getByText("La sol·licitud s'ha anul·lat.")).toBeVisible();
  await admin.page.context().close();
});
