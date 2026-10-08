import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Browser, BrowserContext, Locator, Page, Response } from "@playwright/test";

import type { components } from "../../packages/api-client/src/generated/schema";

import { expect, test } from "./oauth-token-log";

// E8-W04 · the E8 gate against the published core and its E8-T06 demo seeds. Values asserted in
// the UI come from the same run's API answers; receipt totals/numbers are never copied from a
// fixture. The second FIFO pass is selected by the wrapper only after FakePaymentProvider's
// application command has delivered payment_intent.succeeded.

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const fifoClubsUrl = "http://127.0.0.1:4176";
const fifoAdminUrl = "http://127.0.0.1:4177";
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const weekStart = requiredEnvironment("E8_WEEK_START");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E8-W04");
const settlementOnly = process.env.E8_CARD_SETTLEMENT_ONLY === "1";
const desktop = { height: 900, width: 1280 };
const mobile = { height: 844, width: 375 };

const ADMIN = "admin@example.test";
const INSTRUCTOR = "instructor@example.test";
const FIFO_ADMIN = "fifo.admin@example.test";

type Schemas = components["schemas"];
type ApiProblem = Partial<Pick<Schemas["ApiError"], "code" | "details">>;
type BillingPeriod = Schemas["BillingPeriod"];
type BillingSimulation = Schemas["BillingSimulation"];
type BillingRunResult = Schemas["BillingRunResult"];
type Invoice = Schemas["Invoice"];
type InvoicePage = Schemas["InvoicePage"];
type RemittanceFile = Schemas["RemittanceFile"];
type MemberPage = Schemas["ListPageMemberListItem"];
type InactivityPage = Schemas["InactivityPeriodPage"];
type InactivityPeriod = Schemas["InactivityPeriod"];
type LeavePage = Schemas["LeaveRequestPage"];
type LeaveRequest = Schemas["LeaveRequest"];
type Pack = Schemas["PackBalanceDetail"];
type Impersonation = Schemas["ImpersonationTokenResponse"];
type CardCharges = Schemas["CardChargesResult"];

interface Session {
  bearer: () => string | undefined;
  context: BrowserContext;
  page: Page;
}

interface CoreAnswer<Body> {
  body: Body;
  status: number;
}

interface GateRecord {
  billing?: {
    firstNumbers: string[];
    incidents: Record<string, number>;
    receiptCount: number;
    remittanceCount: number;
    remittanceTotalMinor: number;
    secondNumbers: string[];
    totalMinor: number;
  };
  card?: { paid: boolean; submitted: number };
  inactivity?: { cancelledBookings: number; fromMonth: string; memberId: string };
  leave?: { effectiveDate: string; memberId: string };
  pack?: { after: number; before: number; memberId: string };
  performance?: Record<string, { max: number; median: number }>;
}

const record: GateRecord = {};

mkdirSync(evidenceDirectory, { recursive: true });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

function nextMonth(date: string): string {
  const [yearText, monthText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
  return `${String(next.year)}-${String(next.month).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

const period = nextMonth(weekStart);
const today = weekStart;
const realClubToday = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Madrid",
  year: "numeric",
}).format(new Date());

function bearerOf(page: Page): () => string | undefined {
  let bearer: string | undefined;
  page.on("request", (request) => {
    const authorization = request.headers().authorization;
    if (
      bearer === undefined &&
      authorization?.startsWith("Bearer ") === true &&
      request.url().includes("/api/v1/")
    ) {
      bearer = authorization;
    }
  });
  return () => bearer;
}

async function contextFor(
  browser: Browser,
  viewport: { height: number; width: number },
  locale = "ca",
): Promise<BrowserContext> {
  const context = await browser.newContext({ acceptDownloads: true, viewport });
  await context.addInitScript((value) => {
    localStorage.setItem("agilityhub.locale", value);
  }, locale);
  return context;
}

async function submitPasswordLogin(page: Page): Promise<void> {
  const token = page.waitForResponse(
    (response) =>
      response.url().endsWith("/oauth2/token") &&
      response.request().method() === "POST" &&
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "password",
  );
  await page.getByRole("button", { name: /^(ENTRA|ENTRAR)$/u }).click({ noWaitAfter: true });
  expect((await token).status()).toBe(200);
}

async function login(
  browser: Browser,
  baseUrl: string,
  email: string,
  viewport = desktop,
): Promise<Session> {
  const context = await contextFor(browser, viewport);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const bearer = bearerOf(page);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel(/Correu electrònic|Correo electrónico|Email/u).fill(email);
  const reveal = page.getByRole("button", { name: /Tinc contrasenya|Tengo contraseña/u });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel(/Contrasenya|Contraseña|Password/u, { exact: true }).fill(corePassword);
  await submitPasswordLogin(page);
  await page.waitForURL((url) => url.pathname === "/tauler" || url.pathname === "/inici");
  await expect.poll(bearer).toBeDefined();
  return { bearer, context, page };
}

async function call<Body = ApiProblem>(
  session: Session,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<CoreAnswer<Body>> {
  const authorization = session.bearer();
  return session.page.evaluate(
    async ({ auth, callBody, callMethod, callPath }) => {
      const headers: Record<string, string> = { Authorization: auth ?? "" };
      if (callBody !== undefined) headers["Content-Type"] = "application/json";
      if (callMethod !== "GET") headers["Idempotency-Key"] = crypto.randomUUID();
      const response = await fetch(`/api/v1${callPath}`, {
        headers,
        method: callMethod,
        ...(callBody === undefined ? {} : { body: JSON.stringify(callBody) }),
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text === "" ? null : JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { body: parsed, status: response.status };
    },
    { auth: authorization, callBody: body, callMethod: method, callPath: path },
  ) as Promise<CoreAnswer<Body>>;
}

async function callWithToken<Body = ApiProblem>(
  page: Page,
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<CoreAnswer<Body>> {
  return page.evaluate(
    async ({ auth, callBody, callMethod, callPath }) => {
      const headers: Record<string, string> = { Authorization: `Bearer ${auth}` };
      if (callBody !== undefined) headers["Content-Type"] = "application/json";
      if (callMethod !== "GET") headers["Idempotency-Key"] = crypto.randomUUID();
      const response = await fetch(`/api/v1${callPath}`, {
        headers,
        method: callMethod,
        ...(callBody === undefined ? {} : { body: JSON.stringify(callBody) }),
      });
      const text = await response.text();
      return {
        body: text === "" ? null : (JSON.parse(text) as unknown),
        status: response.status,
      };
    },
    { auth: token, callBody: body, callMethod: method, callPath: path },
  ) as Promise<CoreAnswer<Body>>;
}

async function impersonate(
  browser: Browser,
  admin: Session,
  memberId: string,
  baseUrl = clubsUrl,
  locale = "ca",
): Promise<Session> {
  const created = await call<Impersonation>(
    admin,
    `/members/${memberId}/impersonation-token`,
    "POST",
    { reason: "E8-W04 published-core verification" },
  );
  expect(created.status).toBe(201);
  const launch = new URL(created.body.launchUrl ?? "");
  const handoff = launch.searchParams.get("handoff");
  expect(handoff).toBeTruthy();
  const context = await contextFor(browser, mobile, locale);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const bearer = bearerOf(page);
  await page.goto(`${baseUrl}/entrar?handoff=${encodeURIComponent(handoff ?? "")}`);
  await page.waitForURL((url) => url.pathname === "/inici");
  await expect.poll(bearer).toBeDefined();
  return { bearer, context, page };
}

async function iconsPainted(scope: Locator | Page): Promise<void> {
  await expect
    .poll(() =>
      scope
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

async function shot(page: Page, name: string): Promise<void> {
  await iconsPainted(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({ fullPage: true, path: join(evidenceDirectory, name) });
}

function responseIs(method: string, pattern: RegExp) {
  return (response: Response) =>
    response.request().method() === method && pattern.test(new URL(response.url()).pathname);
}

async function invoicePage(admin: Session, filter: string[]): Promise<InvoicePage> {
  const query = new URLSearchParams({
    fields: "displayNumber,member,concept,total,paymentMethodType,status,runId,period,rolledBack",
    page: "0",
    size: "200",
  });
  filter.forEach((value) => query.append("filter", value));
  const answer = await call<InvoicePage>(admin, `/invoices?${query.toString()}`);
  expect(answer.status).toBe(200);
  return answer.body;
}

async function setClock(browser: Browser): Promise<void> {
  const context = await contextFor(browser, desktop);
  const page = await context.newPage();
  await page.goto(`${adminUrl}/entrar`);
  const response = await page.evaluate(async (instant) => {
    const answer = await fetch("/api/v1/test/clock", {
      body: JSON.stringify({ instant }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      method: "POST",
    });
    return answer.status;
  }, `${weekStart}T07:00:00+02:00`);
  if (response === 401 || response === 403) {
    await context.close();
    const admin = await login(browser, adminUrl, ADMIN);
    const authenticated = await call(admin, "/test/clock", "POST", {
      instant: `${weekStart}T07:00:00+02:00`,
    });
    // A published image can expose the contract while its runtime profile/host refuses the test
    // controller. That is an unavailable clock, not a failure of the E8 flow (same handling as E7).
    expect([200, 403, 404]).toContain(authenticated.status);
    await admin.context.close();
    return;
  }
  expect([200, 404]).toContain(response);
  await context.close();
}

async function findPackCase(
  admin: Session,
): Promise<{ bookingId: string; memberId: string; pack: Pack }> {
  const members = await call<MemberPage>(
    admin,
    "/members?page=0&size=200&fields=fullName,memberNumber,plan,dogs&sort=memberNumber,asc",
  );
  expect(members.status).toBe(200);
  const adminMembers = members.body.items as Schemas["MemberListItem"][];
  const likely = adminMembers.filter((member) => /pack|sess/i.test(member.plan?.name ?? ""));
  for (const member of likely.length === 0 ? adminMembers : likely) {
    const balances = await call<Pack[]>(admin, `/pack-balances?memberId=${member.id}`);
    if (balances.status !== 200) continue;
    const pack = balances.body.find((candidate) =>
      candidate.movements.some(
        (movement) => movement.type === "CONSUME" && movement.bookingId != null,
      ),
    );
    const bookingId = pack?.movements.find(
      (movement) => movement.type === "CONSUME" && movement.bookingId != null,
    )?.bookingId;
    if (pack !== undefined && bookingId != null) return { bookingId, memberId: member.id, pack };
  }
  throw new Error("E8 demo seed has no pack booking with a CONSUME movement");
}

async function performanceLoads(
  page: Page,
  suffix: string,
): Promise<{ max: number; median: number }> {
  const durations = await page.evaluate(async (value) => {
    performance.clearResourceTimings();
    for (let index = 0; index < 5; index += 1) {
      const separator = value.includes("?") ? "&" : "?";
      await fetch(`/api/v1/invoices${value}${separator}probe=${String(index)}`);
    }
    return performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/api/v1/invoices"))
      .slice(-5)
      .map((entry) => entry.duration);
  }, suffix);
  expect(durations).toHaveLength(5);
  const sorted = [...durations].sort((left, right) => left - right);
  return {
    max: Math.round(Math.max(...durations) * 100) / 100,
    median: Math.round((sorted[2] ?? 0) * 100) / 100,
  };
}

test.describe.configure({ mode: "serial" });

test("E8-W04 T-12-27/T-13-32: Cànic remittance, lifecycle, pack and permissions", async ({
  browser,
}) => {
  test.skip(settlementOnly, "normal E8 pass already ran before the fake provider delivery");
  test.setTimeout(360_000);
  await setClock(browser);
  const admin = await login(browser, adminUrl, ADMIN);
  const { page } = admin;

  // The seeded pending inactivity is reviewed in the real list and approved through D10.
  const inactivityRead = await call<InactivityPage>(admin, "/inactivity-periods?page=0&size=200");
  expect(inactivityRead.status).toBe(200);
  const pending = inactivityRead.body.items.find((item) => item.state === "REQUESTED");
  if (pending?.member === undefined) throw new Error("E8 pending inactivity seed is absent");
  await page.goto(`${adminUrl}/inactivitats`);
  await expect(page.getByRole("heading", { name: "Inactivitats i baixes" })).toBeVisible();
  await shot(page, "inactivitats-i-baixes-core-1280.png");
  await page
    .getByRole("link", { name: `Obre la fitxa de ${pending.member.fullName}` })
    .last()
    .click();
  const inactivityDrawer = page.getByRole("dialog", { name: "Inactivitat" });
  await expect(inactivityDrawer.getByRole("button", { name: "Aprova" })).toBeVisible();
  await shot(page, "D10-calaix-inactivitat-core-1280.png");
  const approvedResponse = page.waitForResponse(
    responseIs("POST", new RegExp(`/api/v1/inactivity-periods/${pending.id}/decision$`, "u")),
  );
  await inactivityDrawer.getByRole("button", { name: "Aprova" }).click();
  const approveModal = page.getByRole("dialog", { name: "Aprova el període" });
  await approveModal.getByRole("button", { name: "Aprova" }).click();
  expect((await approvedResponse).status()).toBe(200);
  const approved = await call<InactivityPeriod>(admin, `/inactivity-periods/${pending.id}`);
  expect(approved.status).toBe(200);
  expect(["APPROVED", "ACTIVE"]).toContain(approved.body.state);
  record.inactivity = {
    cancelledBookings: approved.body.cancelledBookings.length,
    fromMonth: approved.body.fromMonth,
    memberId: approved.body.member.id,
  };

  // A real seeded CONSUME movement is returned exactly once by an in-time cancellation.
  const packCase = await findPackCase(admin);
  const packGrant = await call<Impersonation>(
    admin,
    `/members/${packCase.memberId}/impersonation-token`,
    "POST",
    { reason: "E8-W04 in-time pack cancellation" },
  );
  expect(packGrant.status).toBe(201);
  const cancelled = await callWithToken(
    page,
    packGrant.body.token,
    `/bookings/${packCase.bookingId}/cancellation`,
    "POST",
    {},
  );
  expect(cancelled.status).toBe(200);
  const packAfterRead = await call<Pack[]>(admin, `/pack-balances?memberId=${packCase.memberId}`);
  expect(packAfterRead.status).toBe(200);
  const packAfter = packAfterRead.body.find((item) => item.id === packCase.pack.id);
  if (packAfter === undefined) throw new Error("Pack disappeared after its cancellation");
  expect(packAfter.remaining).toBe(packCase.pack.remaining + 1);
  expect(
    packAfter.movements.filter(
      (movement) => movement.type === "REFUND" && movement.bookingId === packCase.bookingId,
    ),
  ).toHaveLength(1);
  record.pack = {
    after: packAfter.remaining,
    before: packCase.pack.remaining,
    memberId: packCase.memberId,
  };

  // D6 simulation: every number asserted below is the real answer that this same page caused.
  await page.goto(`${adminUrl}/facturacio?mes=${period}`);
  await expect(page.getByRole("button", { name: "1 · SIMULA EL MES" })).toBeVisible();
  const simulatedResponse = page.waitForResponse(
    responseIs("POST", /\/api\/v1\/billing\/simulations$/u),
  );
  await page.getByRole("button", { name: "1 · SIMULA EL MES" }).first().click();
  const simulatedHttp = await simulatedResponse;
  expect(simulatedHttp.status()).toBe(201);
  const simulation = (await simulatedHttp.json()) as BillingSimulation;
  await expect(page.getByText("Mes simulat.")).toBeVisible();
  for (const incident of simulation.incidents) {
    await expect(page.getByText(incident.memberName, { exact: true }).first()).toBeVisible();
  }
  for (const cash of simulation.cashMembers) {
    await expect(page.getByText(cash.memberName, { exact: true }).first()).toBeVisible();
  }
  expect(
    simulation.invoicesPreview.some(
      (preview) =>
        preview.memberId === pending.member?.id &&
        preview.lines.some((line) => line.origin === "INACTIVITY_FEE"),
    ),
  ).toBe(true);
  await shot(page, "D6-facturacio-core-1280.png");

  const generate = page.getByRole("button", { name: /2 · GENERA/u });
  await expect(generate).toBeEnabled();
  await generate.click();
  const generateModal = page.getByRole("dialog", { name: /Genera els rebuts/u });
  await expect(generateModal).toContainText(String(simulation.kpis.count));
  const generatedResponse = page.waitForResponse(responseIs("POST", /\/api\/v1\/billing\/runs$/u));
  await generateModal.getByRole("button", { exact: true, name: "Genera" }).click();
  const generatedHttp = await generatedResponse;
  expect(generatedHttp.status()).toBe(201);
  const firstRun = (await generatedHttp.json()) as BillingRunResult;
  const firstInvoices = await invoicePage(admin, [
    `period:eq:${period}`,
    `runId:eq:${firstRun.run.id}`,
  ]);
  const firstNumbers = firstInvoices.items.flatMap((item) =>
    item.displayNumber === undefined ? [] : [item.displayNumber],
  );
  expect(firstNumbers).toHaveLength(firstRun.run.invoiceIds.length);
  await shot(page, "D6-generat-core-1280.png");

  const remittance = firstRun.remittance;
  if (remittance == null) throw new Error("E8 Cànic run has no SEPA remittance");
  await page.goto(`${adminUrl}/facturacio/remeses?mes=${period}`);
  const remittanceRow = page.locator(`tr[data-remittance-status="${remittance.status}"]`).filter({
    hasText: String(remittance.count),
  });
  await expect(remittanceRow).toBeVisible();
  await shot(page, "remeses-core-1280.png");
  const fileAnswer = await call<RemittanceFile>(admin, `/remittances/${remittance.id}/file`);
  expect(fileAnswer.status).toBe(200);
  expect(fileAnswer.body.fileName).toMatch(/\.xml$/u);
  const signedFile = new URL(fileAnswer.body.downloadUrl, adminUrl);
  const fileResponse = await page.request.get(
    `${adminUrl}${signedFile.pathname}${signedFile.search}`,
  );
  expect(fileResponse.status()).toBe(200);
  expect(fileResponse.headers()["content-type"]).toContain("xml");
  expect(fileResponse.headers()["content-disposition"]).toContain(fileAnswer.body.fileName);

  // One returned direct debit, then the strong rollback through the UI.
  const returnedRow = firstInvoices.items.find((item) => item.paymentMethodType === "SEPA_DD");
  if (returnedRow === undefined) throw new Error("The generated run has no direct-debit receipt");
  const returnedDetail = await call<Invoice>(admin, `/invoices/${returnedRow.id}`);
  expect(returnedDetail.status).toBe(200);
  const failed = await call<Invoice>(admin, `/invoices/${returnedRow.id}/failure`, "POST", {
    at: realClubToday,
    reason: "Devolució bancària fictícia E8-W04",
    version: returnedDetail.body.version,
  });
  expect(failed.status).toBe(200);
  expect(failed.body.status).toBe("FAILED");
  await page.goto(`${adminUrl}/facturacio?mes=${period}`);
  await page.getByRole("button", { name: "Retrocedeix la remesa" }).click();
  const rollbackModal = page.getByRole("dialog", { name: /Retrocedeix la remesa/u });
  await rollbackModal.getByLabel("Escriu RETROCEDIR per confirmar-ho").fill("RETROCEDIR");
  await rollbackModal.getByLabel("Motiu").fill("Assaig publicat E8-W04");
  const rollbackResponse = page.waitForResponse(responseIs("POST", /\/rollback$/u));
  await rollbackModal.getByRole("button", { exact: true, name: "Retrocedeix" }).click();
  expect((await rollbackResponse).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Tots (0)" })).toBeVisible();
  const cancelledInvoices = await invoicePage(admin, [
    `period:eq:${period}`,
    "status:eq:CANCELLED",
  ]);
  expect(cancelledInvoices.items).toHaveLength(firstNumbers.length);
  expect(cancelledInvoices.items.every((item) => item.rolledBack === true)).toBe(true);
  await shot(page, "D6-retroces-core-1280.png");

  // Regeneration reuses the returned sequence. Cash is marked paid in the drawer and CSV is asked
  // through the UI; the task intentionally does not inspect either exported file.
  const secondSimulationResponse = page.waitForResponse(
    responseIs("POST", /\/api\/v1\/billing\/simulations$/u),
  );
  await page.getByRole("button", { name: "1 · SIMULA EL MES" }).first().click();
  const secondSimulation = (await (await secondSimulationResponse).json()) as BillingSimulation;
  await page.getByRole("button", { name: /2 · GENERA/u }).click();
  const secondGenerateModal = page.getByRole("dialog", { name: /Genera els rebuts/u });
  const secondRunResponse = page.waitForResponse(responseIs("POST", /\/api\/v1\/billing\/runs$/u));
  await secondGenerateModal.getByRole("button", { exact: true, name: "Genera" }).click();
  const secondRun = (await (await secondRunResponse).json()) as BillingRunResult;
  const secondInvoices = await invoicePage(admin, [
    `period:eq:${period}`,
    `runId:eq:${secondRun.run.id}`,
  ]);
  const secondNumbers = secondInvoices.items.flatMap((item) =>
    item.displayNumber === undefined ? [] : [item.displayNumber],
  );
  expect(secondNumbers).toEqual(firstNumbers);
  const cash = secondInvoices.items.find((item) => item.paymentMethodType === "MANUAL");
  if (cash?.displayNumber === undefined) throw new Error("The regenerated run has no cash receipt");
  const secondPeriod = await call<BillingPeriod>(admin, `/billing/periods/${period}`);
  expect(secondPeriod.status).toBe(200);
  await page
    .getByRole("group", { name: "Estat dels rebuts" })
    .getByRole("button", { name: `Pendents (${String(secondPeriod.body.counts.pending)})` })
    .click();
  const cashDetail = await call<Invoice>(admin, `/invoices/${cash.id}`);
  expect(cashDetail.status).toBe(200);
  expect(cashDetail.body.lines.length).toBeGreaterThanOrEqual(1);
  const pendingTable = page.getByRole("table", { name: /Rebuts ·/u });
  await pendingTable.locator("tbody input[type=checkbox]:not([disabled])").first().click();
  await page.getByRole("button", { name: "Marcar cobrat (selecció)" }).click();
  const payModal = page.getByRole("dialog", { name: "Marca cobrat" });
  const paidResponse = page.waitForResponse(responseIs("POST", /\/api\/v1\/invoices\/payments$/u));
  await payModal.getByRole("button", { name: "Marca cobrat" }).click();
  expect((await paidResponse).status()).toBe(200);

  const exportRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname.endsWith("/api/v1/billing/exports"),
  );
  await page.getByRole("button", { name: "Exporta per a comptabilitat" }).click();
  const exportModal = page.getByRole("dialog", { name: "Exporta per a comptabilitat" });
  await expect(exportModal.getByRole("radio", { name: "CSV" })).toBeChecked();
  await exportModal.getByRole("button", { name: "Exporta" }).click();
  const exported = await exportRequest;
  const exportUrl = new URL(exported.url());
  expect(exportUrl.searchParams.get("period")).toBe(period);
  expect(exportUrl.searchParams.get("format")).toBe("csv");
  expect([200, 202]).toContain(exported.status());

  const incidentCounts = Object.fromEntries(
    [...new Set(simulation.incidents.map((item) => item.code))].map((code) => [
      code,
      simulation.incidents.filter((item) => item.code === code).length,
    ]),
  );
  record.billing = {
    firstNumbers,
    incidents: incidentCounts,
    receiptCount: firstNumbers.length,
    remittanceCount: remittance.count,
    remittanceTotalMinor: remittance.total.amountMinor,
    secondNumbers,
    totalMinor: simulation.kpis.total.amountMinor,
  };

  // D10 billing and the member-facing screens use the same real invoices and lifecycle state.
  const memberWithInvoice = secondInvoices.items.find((item) => item.member !== undefined)?.member;
  if (memberWithInvoice === undefined) throw new Error("No invoice carries its member projection");
  await page.goto(`${adminUrl}/abonats/${memberWithInvoice.id}`);
  await expect(page.getByRole("heading", { name: memberWithInvoice.fullName })).toBeVisible();
  await shot(page, "D10-bloc-facturacio-core-1280.png");

  const inactivityMember = await impersonate(browser, admin, pending.member.id);
  await inactivityMember.page.goto(`${clubsUrl}/inactivitat`);
  await expect(inactivityMember.page.getByRole("heading", { name: "Inactivitat" })).toBeVisible();
  await shot(inactivityMember.page, "14-inactivitat-core-375.png");
  const ownInvoices = await call<InvoicePage>(
    inactivityMember,
    `/me/invoices?page=0&size=50&filter=period:eq:${period}`,
  );
  expect(ownInvoices.status).toBe(200);
  expect(
    ownInvoices.body.items.some((item) => item.concept?.includes("inactivitat") === true),
  ).toBe(true);
  const otherInvoice = secondInvoices.items.find((item) => item.member?.id !== pending.member?.id);
  if (otherInvoice !== undefined) {
    const refused = await call<ApiProblem>(inactivityMember, `/me/invoices/${otherInvoice.id}`);
    expect(refused.status).toBe(404);
  }

  const packMember = await impersonate(browser, admin, packCase.memberId);
  await packMember.page.goto(`${clubsUrl}/gossos`);
  await shot(packMember.page, "13-pack-core-375.png");
  const ownPacks = await call<Pack[]>(packMember, "/me/pack-balances");
  expect(ownPacks.status).toBe(200);
  expect(ownPacks.body.find((item) => item.id === packCase.pack.id)?.remaining).toBe(
    packAfter.remaining,
  );

  const expiredMember = (
    await call<MemberPage>(
      admin,
      "/members?page=0&size=200&filter=leaveSource:eq:PACK_EXPIRED&fields=fullName,memberNumber,leaveDate,leaveSource",
    )
  ).body.items[0];
  if (expiredMember !== undefined) {
    const expiredPacks = await call<Pack[]>(admin, `/pack-balances?memberId=${expiredMember.id}`);
    expect(expiredPacks.status).toBe(200);
    expect(expiredPacks.body.some((item) => item.state === "EXPIRED" && item.remaining > 0)).toBe(
      true,
    );
  }

  await inactivityMember.page.goto(`${clubsUrl}/rebuts`);
  await shot(inactivityMember.page, "rebuts-core-375.png");
  expect(await inactivityMember.page.locator("body").innerText()).not.toMatch(
    /\bIBAN\b|sk_(?:test|live)_/u,
  );

  // Spanish member request, then the real admin decision and D5 planned-leave view.
  const leaveDate = addDays(today, 12);
  const leaveMember = await impersonate(browser, admin, pending.member.id, clubsUrl, "es");
  await leaveMember.page.goto(`${clubsUrl}/baixa`);
  await expect(leaveMember.page.getByRole("heading", { name: /Baja/u })).toBeVisible();
  await shot(leaveMember.page, "15-baixa-core-375.png");
  const leaveContext = await call<Schemas["MeLeaveContext"]>(leaveMember, "/me/leave-requests");
  expect(leaveContext.status).toBe(200);
  const reason = leaveContext.body.reasons[0];
  if (reason === undefined) throw new Error("The leave reason catalog is empty");
  const requestedLeave = await callWithToken<LeaveRequest>(
    leaveMember.page,
    leaveMember.bearer()?.slice("Bearer ".length) ?? "",
    "/me/leave-requests",
    "POST",
    { nps: 8, reasonKey: reason.key, requestedDate: leaveDate },
  );
  expect(requestedLeave.status).toBe(201);
  const approvedLeave = await call<LeaveRequest>(
    admin,
    `/leave-requests/${requestedLeave.body.id}/decision`,
    "POST",
    { decision: "APPROVED", effectiveDate: leaveDate },
  );
  expect(approvedLeave.status).toBe(200);
  record.leave = { effectiveDate: leaveDate, memberId: pending.member.id };
  await page.goto(`${adminUrl}/abonats/${pending.member.id}?calaix=baixa`);
  await expect(page.getByRole("dialog", { name: "Baixa (amb data)" })).toBeVisible();
  await shot(page, "D10-calaix-baixa-core-1280.png");
  await page.goto(`${adminUrl}/abonats`);
  const views = page.locator("details").filter({ hasText: "Vistes" }).first();
  if (await views.isVisible()) {
    await views.locator("summary").click();
    const planned = page.getByRole("button", { name: /Baixes previstes/u });
    if (await planned.isVisible()) await planned.click();
  }
  await expect(page.getByText(pending.member.fullName, { exact: true }).first()).toBeVisible();
  await shot(page, "D5-baixes-previstes-core-1280.png");

  // Five full-month and two-filter reads, measured as browser resources (milliseconds).
  record.performance = {
    failed: await performanceLoads(
      page,
      `?page=0&size=200&filter=period:eq:${period}&filter=status:eq:FAILED`,
    ),
    full: await performanceLoads(page, `?page=0&size=200&filter=period:eq:${period}`),
    paid: await performanceLoads(
      page,
      `?page=0&size=200&filter=period:eq:${period}&filter=status:eq:PAID`,
    ),
  };

  // Instructor gates and direct routes; no financial secret is ever rendered.
  const instructor = await login(browser, adminUrl, INSTRUCTOR);
  await expect(instructor.page.getByText("Facturació", { exact: true })).toHaveCount(0);
  await expect(instructor.page.getByText("Inactivitats i baixes", { exact: true })).toHaveCount(0);
  for (const route of ["/facturacio", "/inactivitats"]) {
    await instructor.page.goto(`${adminUrl}${route}`);
    await expect(instructor.page.locator("main")).not.toContainText(
      /Pas 1 — Simulació|Inactivitats i baixes/u,
    );
  }
  expect(await page.locator("body").innerText()).not.toMatch(/\bIBAN\b|sk_(?:test|live)_/u);

  writeFileSync(
    join(evidenceDirectory, "e8-gate-record.json"),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  await Promise.all([
    admin.context.close(),
    inactivityMember.context.close(),
    packMember.context.close(),
    leaveMember.context.close(),
    instructor.context.close(),
  ]);
});

test("E8-W04 card leg: FIFO submits through UI to FakePaymentProvider", async ({ browser }) => {
  test.skip(settlementOnly, "submission pass already completed");
  test.setTimeout(180_000);
  const admin = await login(browser, fifoAdminUrl, FIFO_ADMIN);
  const { page } = admin;
  await page.goto(`${fifoAdminUrl}/facturacio?mes=${period}`);
  const initial = await call<BillingPeriod>(admin, `/billing/periods/${period}`);
  expect(initial.status).toBe(200);
  if (initial.body.simulation == null) {
    const response = page.waitForResponse(responseIs("POST", /\/api\/v1\/billing\/simulations$/u));
    await page.getByRole("button", { name: "1 · SIMULA EL MES" }).first().click();
    expect((await response).status()).toBe(201);
  }
  if (initial.body.run == null) {
    await page.getByRole("button", { name: /2 · GENERA/u }).click();
    const dialog = page.getByRole("dialog", { name: /Genera els rebuts/u });
    const response = page.waitForResponse(responseIs("POST", /\/api\/v1\/billing\/runs$/u));
    await dialog.getByRole("button", { exact: true, name: "Genera" }).click();
    expect((await response).status()).toBe(201);
  }
  await expect(page.getByRole("button", { name: "COBRA LES TARGETES" })).toBeVisible();
  await page.getByRole("button", { name: "COBRA LES TARGETES" }).click();
  const chargeModal = page.getByRole("dialog", { name: "Cobra les targetes" });
  const chargeResponse = page.waitForResponse(responseIs("POST", /\/card-charges$/u));
  await chargeModal.getByRole("button", { exact: true, name: "Cobra" }).click();
  const chargedHttp = await chargeResponse;
  expect(chargedHttp.status()).toBe(202);
  const charged = (await chargedHttp.json()) as CardCharges;
  expect(charged.submitted).toBeGreaterThan(0);
  await expect(page.getByText("Cobrant les targetes…")).toBeVisible();
  record.card = { paid: false, submitted: charged.submitted };
  writeFileSync(
    join(evidenceDirectory, "e8-card-submitted.json"),
    `${JSON.stringify(record.card)}\n`,
  );
  await admin.context.close();
});

test("E8-W04 card leg: FIFO UI observes PAID after the fake webhook", async ({ browser }) => {
  test.skip(!settlementOnly, "the wrapper runs this only after the fake provider delivery");
  test.setTimeout(120_000);
  const admin = await login(browser, fifoAdminUrl, FIFO_ADMIN);
  const { page } = admin;
  await page.goto(`${fifoAdminUrl}/facturacio?mes=${period}`);
  const current = await call<BillingPeriod>(admin, `/billing/periods/${period}`);
  expect(current.status).toBe(200);
  const run = current.body.run;
  expect(run?.status).toBe("COMPLETED");
  if (run == null) throw new Error("FIFO billing run is absent after settlement");
  expect(current.body.counts.paid).toBeGreaterThan(0);
  await expect(page.getByText("Cobrant les targetes…")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: new RegExp(`Cobrats \\(${String(current.body.counts.paid)}\\)`, "u"),
    }),
  ).toBeVisible();
  writeFileSync(
    join(evidenceDirectory, "e8-card-paid.json"),
    `${JSON.stringify({ paid: current.body.counts.paid, runStatus: run.status })}\n`,
  );
  await admin.context.close();
});
