import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Browser, type BrowserContext, type Page } from "@playwright/test";

import { expect, test } from "./oauth-token-log";

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const mailboxDirectory = requiredEnvironment("E1_MAILBOX_DIRECTORY");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E3-W03");

const acceptedEmail = "nora.e3@example.test";
const acceptedName = "Nora Integració E3";
const acceptedDog = "Flaix E3";
const rejectedEmail = "pau.e3@example.test";
const rejectedName = "Pau Rebuig E3";
const rejectedDog = "Brisa E3";
const additionalDog = "Neret E3";
const passportEmail = "joana.e3@example.test";
const passportDog = "Nit E3";
let adminSession: { context: BrowserContext; page: Page } | undefined;
let rejectionMessage: MailMessage | undefined;
let additionalDogValidated = false;
let signupDisabled = false;

mkdirSync(evidenceDirectory, { recursive: true });

interface MailMessage {
  html?: string;
  subject?: string;
  text?: string;
  to?: string | string[];
}

interface Money {
  amountMinor: number;
  currency: string;
}

/** The part of `GET /signup` the «Pagament inicial» card reads (api E3-T08 `planQuotes`). */
interface SignupQuoteConfig {
  member?: { planId?: string };
  plans?: { id: string; name: string }[];
  upfront?: {
    planQuotes: {
      lines: { amount: Money; concept: string }[];
      options: { amountDue: Money; option: string; portion: string; startDate: string; totalDue: Money }[];
      planId: string;
      totalDue: Money;
    }[];
    today: string;
  };
}

/** `formatMoney` in ca for the amounts of the seed (below 1 000 €). */
function euros(amount: Money): string {
  return `${(amount.amountMinor / 100).toFixed(2).replace(".", ",")} €`;
}

/**
 * R-04-14/15 on the real core: 19 renders the selected plan's quote from `GET /signup`, with the
 * labels of each option's `option`/`portion` and the total of the default (first) option.
 */
async function expectQuoteCard(page: Page, config: SignupQuoteConfig, planName: string | undefined) {
  // Add-dog mode quotes the member's own plan (preselected on 17).
  const addDog = config.member !== undefined;
  const planId = addDog
    ? config.member?.planId
    : (planName === undefined ? config.plans?.[0] : config.plans?.find((item) => item.name === planName))?.id;
  const quote = config.upfront?.planQuotes.find((item) => item.planId === planId);
  if (quote === undefined) throw new Error(`No quote for ${planName ?? "the first plan"}: ${JSON.stringify(config.upfront)}`);
  const card = page.locator(".signup-upfront");
  await expect(card.getByRole("radio")).toHaveCount(quote.options.length);
  for (const [index, option] of quote.options.entries()) {
    const label = addDog
      ? option.option === "TODAY" ? /^Alta avui, .+ \(quota addicional d'aquest mes\)/u : /^Alta l’1 .+ \(ara només l'entrada\)/u
      : option.option === "TODAY"
        ? option.portion === "HALF" ? /^Alta avui, .+ \(mig mes\)/u : /^Alta avui, .+ \(mes complet\)/u
        : option.portion === "HALF" ? /^Alta el dia .+ \(mig mes\)/u : /^Alta l’1 .+ \(mes complet\)/u;
    const text = (await card.locator("fieldset label").nth(index).textContent()) ?? "";
    expect(text).toMatch(label);
    expect(text).toContain(euros(option.amountDue));
  }
  for (const line of quote.lines.filter((item) => item.amount.amountMinor > 0)) {
    await expect(card.locator(".signup-upfront__line").filter({ hasText: euros(line.amount) })).toHaveCount(1);
  }
  await expect(card.locator(".signup-upfront__total")).toContainText(euros(quote.options[0]?.totalDue ?? quote.totalDue));
}

/** A club parameter set through the api with the admin's bearer (S02 §6: versioned, audited). */
async function setParameter(
  page: Page,
  api: { authorization: string; base: string },
  key: string,
  value: unknown,
): Promise<number> {
  return page.evaluate(
    async ({ authorization, base, parameter, next }) => {
      const current = await fetch(`${base}/parameters/${parameter}`, { headers: { Authorization: authorization } });
      const { version } = (await current.json()) as { version: number };
      const response = await fetch(`${base}/parameters/${parameter}`, {
        body: JSON.stringify({ reason: "E3-W08 e2e", value: next, version }),
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        method: "PUT",
      });
      return response.status;
    },
    { authorization: api.authorization, base: api.base, next: value, parameter: key },
  );
}

/** The admin's bearer and the api base, read from the request D11 makes when it mounts. */
async function adminApi(page: Page): Promise<{ authorization: string; base: string }> {
  const request = page.waitForRequest(
    (candidate) => candidate.url().endsWith("/api/v1/parameters") && candidate.method() === "GET",
  );
  await navigateSpa(page, "/parametres");
  const parameters = await request;
  const authorization = (await parameters.allHeaders()).authorization;
  if (authorization === undefined) throw new Error("The admin request carried no bearer");
  return { authorization, base: parameters.url().replace(/\/parameters$/u, "") };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

async function localizedContext(
  browser: Browser,
  viewport: { height: number; width: number },
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  return context;
}

async function screenshot(page: Page, name: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(async () => document.fonts.ready);
      await page.screenshot({ fullPage: true, path: join(evidenceDirectory, name) });
      return;
    } catch (cause) {
      if (
        attempt === 2 ||
        !(cause instanceof Error) ||
        !/navigation|Execution context was destroyed/iu.test(cause.message)
      ) {
        throw cause;
      }
    }
  }
}

async function submitPasswordLogin(page: Page): Promise<void> {
  const tokenResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/oauth2/token") &&
      response.request().method() === "POST" &&
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "password",
  );
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click({ noWaitAfter: true });
  expect((await tokenResponse).status()).toBe(200);
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto(`${adminUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel("Contrasenya").fill(corePassword);
  await submitPasswordLogin(page);
  await page.waitForURL("**/tauler");
  await expect(page.locator(".admin-shell")).toBeVisible();
  await expect(page.getByRole("link", { name: "Tauler", exact: true })).toBeVisible();
}

async function openAdmin(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  if (adminSession !== undefined) {
    if (adminSession.page.url() !== `${adminUrl}/tauler`) {
      await navigateSpa(adminSession.page, "/tauler");
    }
    await expect(adminSession.page.locator(".admin-shell")).toBeVisible();
    await adminSession.page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });
    return adminSession;
  }
  const context = await localizedContext(browser, { height: 900, width: 1280 });
  const page = await context.newPage();
  await loginAdmin(page);
  adminSession = { context, page };
  return adminSession;
}

async function navigateSpa(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState(null, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u"));
}

function mailboxFiles(): Set<string> {
  return new Set(readdirSync(mailboxDirectory).filter((name) => name.endsWith(".json")));
}

function newMessageFor(
  recipient: string,
  previous: ReadonlySet<string>,
  predicate: (message: MailMessage) => boolean,
): MailMessage | undefined {
  for (const filename of readdirSync(mailboxDirectory)) {
    if (!filename.endsWith(".json") || previous.has(filename)) continue;
    const message = JSON.parse(readFileSync(join(mailboxDirectory, filename), "utf8")) as MailMessage;
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    if (
      recipients.some((value) => value?.toLowerCase() === recipient.toLowerCase()) &&
      predicate(message)
    ) {
      return message;
    }
  }
  return undefined;
}

async function waitForMessage(
  recipient: string,
  previous: ReadonlySet<string>,
  predicate: (message: MailMessage) => boolean,
): Promise<MailMessage> {
  let message: MailMessage | undefined;
  await expect
    .poll(() => {
      message = newMessageFor(recipient, previous, predicate);
      return message !== undefined;
    })
    .toBe(true);
  if (message === undefined) throw new Error(`No message was delivered to ${recipient}`);
  return message;
}

function messageLink(message: MailMessage): URL {
  const source = message.html ?? message.text ?? "";
  const match = /href=["'](https:\/\/[^"']+)["']/u.exec(source) ?? /(https:\/\/\S+)/u.exec(source);
  if (match?.[1] === undefined) throw new Error("The delivered message did not contain a link");
  return new URL(match[1].replaceAll("&amp;", "&"));
}

async function fillPerson(
  page: Page,
  values: {
    document: string;
    email: string;
    firstName: string;
    lastName: string;
    passport?: string;
    phone: string;
  },
): Promise<void> {
  await page.getByLabel("DNI / NIE").fill(values.document);
  // The passport is enabled only while DNI / NIE is empty (R-04-01).
  if (values.passport !== undefined) {
    await page.getByLabel("Passaport — si no tens DNI/NIE").fill(values.passport);
  }
  await page.getByLabel("Nom", { exact: true }).fill(values.firstName);
  await page.getByLabel("Cognom 1").fill(values.lastName);
  await page.getByLabel("Data de naixement").fill("05/04/1992");
  await page.getByRole("button", { name: "Femení" }).click();
  await page.getByLabel("Email", { exact: true }).fill(values.email);
  await page.getByLabel("Telèfon", { exact: true }).fill(values.phone);
  await page.getByLabel("Descripció", { exact: true }).first().fill("Mòbil");
  await page.getByLabel("Carrer i número").fill("Carrer de la Integració, 3");
  const postalCode = page.getByLabel("CP", { exact: true });
  await postalCode.fill("08349");
  await postalCode.blur();
  await expect(page.getByLabel("Població (proposada pel CP)")).not.toHaveValue("");
}

async function fillDog(page: Page, name: string, chip: string): Promise<void> {
  await page.getByLabel("Nom del gos").fill(name);
  await page.getByRole("button", { name: "Mascle" }).click();
  await page.getByLabel("Raça").fill("Mestís");
  await page.getByLabel("Naix.").fill("03/2022");
  await page.getByLabel("Núm. de xip").fill(chip);
}

async function completePublicSignup({
  chip,
  document,
  documentRequired = false,
  dog,
  email,
  expectedDocument,
  family,
  firstName,
  lastName,
  page,
  passport,
  paymentScreenshot,
  phone,
  plan,
  screenshots,
}: {
  chip: string;
  document: string;
  /** `signup.requireDogDocumentAtSignup = true` (R-04-08): 17 asks for the card, then it is uploaded. */
  documentRequired?: boolean;
  dog: string;
  email: string;
  expectedDocument: { type: string; value: string };
  /** `found`: the seed's Laia Fictici001 + Ona 1; `pending`: a holder the club does not have (R-04-12). */
  family: "found" | "pending" | false;
  firstName: string;
  lastName: string;
  page: Page;
  passport?: string;
  /** A capture of 19 under this name (the card is checked against `GET /signup` either way). */
  paymentScreenshot?: string;
  phone: string;
  /** The plan chosen on 17; the first plan (preselected) otherwise. */
  plan?: string;
  screenshots: boolean;
}): Promise<string> {
  await page.goto(`${clubsUrl}/apuntat-hi`);
  await expect(page.getByText(/Pas 1 de 4/u)).toBeVisible();
  await fillPerson(page, {
    document,
    email,
    firstName,
    lastName,
    ...(passport === undefined ? {} : { passport }),
    phone,
  });
  if (screenshots) await screenshot(page, "16-person-core-375.png");

  await page.getByRole("button", { name: "CONTINUA" }).click();
  await page.waitForURL("**/apuntat-hi/gos");
  await fillDog(page, dog, chip);
  if (plan !== undefined) await page.getByRole("button", { name: `Selecciona ${plan}` }).click();
  if (screenshots) await screenshot(page, "17-dog-core-375.png");
  if (documentRequired) {
    // R-04-08: without the card, 17 stays with an actionable error on the file control.
    await expect(page.getByText(/si ara no la tens a mà/u)).toHaveCount(0);
    await page.getByRole("button", { name: "CONTINUA" }).click();
    const card = page.getByLabel("Cartilla de vacunes");
    await expect(card).toBeFocused();
    await expect(page.getByText(/Cal adjuntar la cartilla de vacunes per continuar/u)).toBeVisible();
    await expect(page).toHaveURL(/\/apuntat-hi\/gos$/u);
    await screenshot(page, "17-document-required-core-375.png");
    // M16 on the real core: the PUT forwards the signed headers of the upload URL.
    const uploadUrl = page.waitForResponse(
      (response) => response.url().endsWith("/signup/upload-urls") && response.request().method() === "POST",
    );
    const put = page.waitForRequest((request) => request.method() === "PUT");
    await card.setInputFiles({ buffer: Buffer.from("fictional-vaccination-page"), mimeType: "image/jpeg", name: "scan.jpg" });
    const signed = (await (await uploadUrl).json()) as { headers?: Record<string, string> };
    const sentHeaders = await (await put).allHeaders();
    for (const [name, value] of Object.entries(signed.headers ?? {})) {
      expect(sentHeaders[name.toLowerCase()], name).toBe(value);
    }
    writeFileSync(
      join(evidenceDirectory, "signup-upload-headers-core.json"),
      `${JSON.stringify({ sentOnPut: Object.keys(signed.headers ?? {}).map((name) => [name, sentHeaders[name.toLowerCase()] ?? null]), signed: signed.headers ?? null }, null, 2)}\n`,
    );
    await expect(page.getByText(`cartilla_${dog.replaceAll(/[^A-Za-z0-9]+/gu, "_")}_1.jpg pujada`)).toBeVisible();
    await expect(card).not.toHaveAttribute("aria-invalid", "true");
  }

  await page.getByRole("button", { name: "CONTINUA" }).click();
  await page.waitForURL("**/apuntat-hi/familia");
  if (family === "found") {
    await page.getByLabel("Nom del responsable").fill("Laia Fictici001");
    await page.getByLabel("Nom d'un dels seus gossos").fill("Ona 1");
    await page.getByRole("button", { name: "CONTINUA" }).click();
    await expect(page.getByText(/Grup trobat: Laia F\./u)).toBeVisible();
    if (screenshots) await screenshot(page, "18-family-core-375.png");
  }
  // 19 is a full page load that reads `GET /signup` again: its quotes are what the card must show.
  const paymentConfig = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/signup") &&
      response.request().method() === "GET" &&
      new URL(page.url()).pathname === "/apuntat-hi/pagament",
  );
  if (family === "pending") {
    await page.getByLabel("Nom del responsable").fill("Pere Inexistent");
    await page.getByLabel("Nom d'un dels seus gossos").fill("Tro");
    await page.getByRole("button", { name: "CONTINUA" }).click();
    await page.getByRole("button", { name: "Deixa-ho pendent i continua ›" }).click();
  } else {
    await page.getByRole("button", { name: "CONTINUA" }).click();
  }
  await page.waitForURL("**/apuntat-hi/pagament");
  const config = (await (await paymentConfig).json()) as SignupQuoteConfig;
  await expect(page.locator(".signup-upfront__total")).toBeVisible();
  await expectQuoteCard(page, config, plan);
  writeFileSync(
    join(evidenceDirectory, `signup-quote-${dog.replaceAll(/[^A-Za-z0-9]+/gu, "-").toLowerCase()}-core.json`),
    `${JSON.stringify({ plan: plan ?? config.plans?.[0]?.name ?? null, today: config.upfront?.today ?? null, planQuotes: config.upfront?.planQuotes ?? null }, null, 2)}\n`,
  );
  await page.getByLabel("Accepto la política de privacitat").check();
  if (screenshots) await screenshot(page, "19-payment-core-375.png");
  if (paymentScreenshot !== undefined) await screenshot(page, paymentScreenshot);
  let signupResult: { memberId: string } | undefined;
  let signupBody = "";
  await page.route(
    "**/api/v1/signup",
    async (route) => {
      const upstream = await route.fetch();
      const body = await upstream.text();
      signupBody = body;
      if (upstream.status() === 201) {
        signupResult = JSON.parse(body) as { memberId: string };
      }
      await route.fulfill({ body, response: upstream });
    },
    { times: 1 },
  );
  const signupResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/signup") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }).click();
  const response = await signupResponse;
  expect(response.status(), signupBody).toBe(201);
  // B1 (R-04-01): the submission carries the same normalised document as the identity check.
  const submitted = response.request().postDataJSON() as {
    person: { idDocument: { type: string; value: string } };
  };
  expect(submitted.person.idDocument).toEqual(expectedDocument);
  if (signupResult === undefined) throw new TypeError("Missing signup result");
  await page.waitForURL("**/apuntat-hi/enviada");
  await expect(page.getByRole("heading", { name: "Sol·licitud enviada" })).toBeVisible();
  if (screenshots) await screenshot(page, "enviada-core-375.png");
  return signupResult.memberId;
}

async function openSignupFromDashboard(
  page: Page,
  rowText: string,
  headingText: string,
): Promise<void> {
  const row = page.locator(".dashboard-signups__row").filter({ hasText: rowText });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "VALIDA" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(headingText, "u") })).toBeVisible();
}

async function completeValidation(
  page: Page,
  { nextInvoiceDate }: { nextInvoiceDate?: { input: string; iso: string } } = {},
): Promise<void> {
  const level = page.getByLabel("Nivell inicial").first();
  await expect.poll(() => level.locator("option").count()).toBeGreaterThan(1);
  if ((await level.inputValue()) === "") {
    const firstLevel = level.locator("option").nth(1);
    await level.selectOption((await firstLevel.getAttribute("value")) ?? "");
  }
  if (nextInvoiceDate !== undefined) {
    const invoice = page.getByLabel("Data del proper rebut");
    await expect(invoice).toBeVisible();
    await expect(invoice.locator("xpath=..").getByText("obligatori", { exact: true })).toBeVisible();
    await invoice.fill(nextInvoiceDate.input);
  }
  const paid = page.getByLabel("Import efectivament cobrat:");
  if (await paid.isEditable()) {
    await paid.fill("130");
  }
  const validationResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/validation?") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "VALIDA L'ALTA" }).click();
  const response = await validationResponse;
  if (nextInvoiceDate !== undefined) {
    const body = response.request().postDataJSON() as { nextInvoiceDate?: string };
    expect(body.nextInvoiceDate).toBe(nextInvoiceDate.iso);
  }
  const errorBody = response.status() === 200 ? "" : await response.text();
  expect(response.status(), errorBody).toBe(200);
  await page.waitForURL("**/tauler?signup=validated");
  await expect(page.getByText("L'alta s'ha validat.")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("T-04-34 public signup is validated and enters through the N-02 welcome link", async ({
  browser,
}) => {
  // E3-W08 adds a Pack 6 signup check, the document-required 17 and a readmission.
  test.setTimeout(480_000);
  const publicContext = await localizedContext(browser, { height: 844, width: 375 });
  const publicPage = await publicContext.newPage();
  const acceptedMemberId = await completePublicSignup({
    chip: "941000000009901",
    document: "12345678Z",
    dog: acceptedDog,
    email: acceptedEmail,
    expectedDocument: { type: "DNI", value: "12345678Z" },
    family: "found",
    firstName: "Nora",
    lastName: "Integració E3",
    page: publicPage,
    phone: "699000901",
    screenshots: true,
  });
  await publicContext.close();
  const mailboxBeforeValidation = mailboxFiles();

  const { page: admin } = await openAdmin(browser);
  const signupNavigation = admin.getByRole("link", { name: /Preinscripcions/u });
  await expect(signupNavigation).toHaveText(/Preinscripcions\s*\d+/u);
  const initialPendingCount = Number(/\d+/u.exec((await signupNavigation.textContent()) ?? "")?.[0]);
  expect(initialPendingCount).toBeGreaterThan(0);
  const acceptedRow = admin.locator(".dashboard-signups__row").filter({ hasText: acceptedDog });
  await expect(acceptedRow.getByText("Compte no informat")).toBeVisible();
  await screenshot(admin, "D1-dashboard-core-1280.png");
  const signupView = admin.waitForResponse(
    (response) =>
      response.url().endsWith(`/members/${acceptedMemberId}/signup`) &&
      response.request().method() === "GET",
  );
  await openSignupFromDashboard(admin, acceptedDog, acceptedName);
  const view = (await (await signupView).json()) as {
    dogs: { id: string; version?: number }[];
    member: {
      maskedAccount?: string;
      paymentMethod?: { maskedAccount?: string; type: string };
      plan?: unknown;
      planId?: string;
      status: string;
    };
    planOptions?: unknown[];
    proposals: { nextInvoiceDate?: string; planId?: string };
    upfront?: { firstMonth?: { option: string; portion: string | null; startDate: string } } | null;
    warnDays?: number;
  };
  // Step 0: the adopted contract (api E3-T08) on the real core.
  expect(view.planOptions?.length).toBeGreaterThan(0);
  expect(typeof view.warnDays).toBe("number");
  expect(view.dogs.every((dog) => typeof dog.version === "number")).toBe(true);
  // E3-W08 step 0 (api E3-T12): the D2 first-month line names the month and «(mitja quota)» from
  // the frozen `upfront.firstMonth` (E3-W07 left it deferred).
  const firstMonth = view.upfront?.firstMonth;
  writeFileSync(join(evidenceDirectory, "d2-first-month-core.json"), `${JSON.stringify(firstMonth ?? null, null, 2)}\n`);
  expect(firstMonth).toBeDefined();
  if (firstMonth !== undefined) {
    const breakdown = admin.locator(".signup-review-upfront-breakdown");
    const monthName = new Intl.DateTimeFormat("ca", { month: "long", timeZone: "UTC" }).format(
      new Date(`${firstMonth.startDate}T00:00:00Z`),
    );
    await expect(breakdown).toContainText(monthName);
    if (firstMonth.portion === "HALF") await expect(breakdown).toContainText("(mitja quota)");
    else await expect(breakdown).not.toContainText("(mitja quota)");
  }
  // Real-core shape behind the D2 plan/date/account rendering (fictional member).
  writeFileSync(
    join(evidenceDirectory, "d2-signup-view-core.json"),
    `${JSON.stringify(
      {
        member: {
          maskedAccount: view.member.maskedAccount ?? null,
          paymentMethod: view.member.paymentMethod ?? null,
          plan: view.member.plan ?? null,
          planId: view.member.planId ?? null,
          status: view.member.status,
        },
        proposals: {
          nextInvoiceDate: view.proposals.nextInvoiceDate ?? null,
          planId: view.proposals.planId ?? null,
        },
      },
      null,
      2,
    )}\n`,
  );
  await expect(admin.getByText(/Sí — titular: Laia Fictici001 \+ gos Ona 1/u)).toBeVisible();
  await admin.getByRole("button", { name: "EDITA LES DADES" }).click();
  const edit = admin.getByRole("dialog", { name: "Edita les dades de la preinscripció" });
  // E38: only a readmission locks the DNI/NIE; this ordinary signup keeps it editable on the real core.
  await expect(edit.getByLabel("DNI/NIE")).not.toHaveAttribute("readonly");
  await edit.getByLabel("IBAN").fill("ES9121000418450200051332");
  // M14: the second email and the second phone (R-04-03), kept by the next edit below.
  await edit.locator("#signup-edit-email2").fill("nora.feina.e3@example.test");
  await edit.locator("#signup-edit-phone2Number").fill("699000911");
  await edit.locator("#signup-edit-phone2Label").fill("Feina");
  const signupViewAfterEdit = admin.waitForResponse(
    (response) =>
      response.url().endsWith(`/members/${acceptedMemberId}/signup`) &&
      response.request().method() === "GET",
  );
  await edit.getByRole("button", { name: "DESA ELS CANVIS" }).click();
  const viewAfterEdit = (await (await signupViewAfterEdit).json()) as {
    member: { maskedAccount?: string | null; paymentMethod?: { maskedAccount?: string | null } | null };
  };
  // Real-core masked account after the IBAN edit; D2 shows it in the R-03-27 format.
  writeFileSync(
    join(evidenceDirectory, "d2-signup-masked-account-core.json"),
    `${JSON.stringify(
      {
        maskedAccount: viewAfterEdit.member.maskedAccount ?? null,
        paymentMethodMaskedAccount: viewAfterEdit.member.paymentMethod?.maskedAccount ?? null,
      },
      null,
      2,
    )}\n`,
  );
  const savedToast = admin.locator(".ah-toast").filter({ hasText: "Les dades s'han actualitzat." });
  await expect(savedToast).toBeVisible();
  await expect(savedToast).toHaveClass(/ah-tone--success/u);
  await expect(admin.getByText(/Domiciliació · ···· ···· ···· ···· 1332/u)).toBeVisible();
  // M14 on the real core: editing the first phone keeps the second phone and both emails.
  await admin.getByRole("button", { name: "EDITA LES DADES" }).click();
  await expect(edit.locator("#signup-edit-email2")).toHaveValue("nora.feina.e3@example.test");
  await edit.locator("#signup-edit-phone1Number").fill("699000921");
  const phonePatch = admin.waitForResponse(
    (response) =>
      response.url().endsWith(`/members/${acceptedMemberId}`) && response.request().method() === "PATCH",
  );
  await edit.getByRole("button", { name: "DESA ELS CANVIS" }).click();
  const phonePatchResponse = await phonePatch;
  expect(phonePatchResponse.status(), await phonePatchResponse.text()).toBe(200);
  await expect(edit).not.toBeVisible();
  const contact = admin.locator(".signup-review-data dd").filter({ hasText: "nora.feina.e3@example.test" });
  await expect
    .poll(async () => ((await contact.textContent()) ?? "").replaceAll(/\s/gu, ""))
    .toMatch(/nora\.e3@example\.test·nora\.feina\.e3@example\.test·\+?\d*699000921·\+?\d*699000911/u);
  await expect(
    admin.getByLabel("Modalitat i tarifa").locator("option:checked"),
  ).toHaveText(/€\/mes/u);
  await expect(admin.getByText("Pagament inicial pendent")).toHaveClass(/ah-badge/u);
  await expect(admin.getByLabel("Data del proper rebut")).toBeVisible();
  await screenshot(admin, "D2-signup-core-1280.png");
  // A date different from the core's proposal, so the request proves the typed value is sent.
  expect(view.proposals.nextInvoiceDate).not.toBe("2026-11-01");
  await expect(admin.getByLabel("Data del proper rebut")).not.toHaveValue("01/11/2026");
  // M11 (R-14-01): VALIDA lands on D1, whose first read already omits the signup (no wait, no detour).
  const refreshedDashboard = admin.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/dashboard") && response.request().method() === "GET",
  );
  await completeValidation(admin, { nextInvoiceDate: { input: "01/11/2026", iso: "2026-11-01" } });
  const dashboardResponse = await refreshedDashboard;
  expect(dashboardResponse.status()).toBe(200);
  const dashboard = (await dashboardResponse.json()) as {
    pendingSignups?: { count: number; items: { memberId: string }[] } | null;
  };
  expect(dashboard.pendingSignups?.count).toBe(initialPendingCount - 1);
  expect(dashboard.pendingSignups?.items.some((signup) => signup.memberId === acceptedMemberId)).toBe(
    false,
  );
  await expect(admin.locator(".dashboard-page")).toBeVisible();
  await expect(
    admin.locator(".dashboard-signups header").getByText(String(initialPendingCount - 1), {
      exact: true,
    }),
  ).toBeVisible();
  // The menu count is refreshed by the command itself (R-14-08), not by a navigation.
  await expect(signupNavigation).toHaveText(new RegExp(`Preinscripcions\\s*${String(initialPendingCount - 1)}$`, "u"));
  await screenshot(admin, "D1-dashboard-after-validation-core-1280.png");

  const welcomeMessage = await waitForMessage(
    acceptedEmail,
    mailboxBeforeValidation,
    (message) => `${message.html ?? ""} ${message.text ?? ""}`.includes("/activacio"),
  );
  const welcomeLink = messageLink(welcomeMessage);
  expect(welcomeLink.hostname).toBe("app.example.test");
  const memberContext = await localizedContext(browser, { height: 844, width: 375 });
  const member = await memberContext.newPage();
  const memberPageErrors: string[] = [];
  member.on("pageerror", (error) => {
    memberPageErrors.push(error.message);
  });
  await member.goto(`${clubsUrl}${welcomeLink.pathname}${welcomeLink.search}`);
  await expect(member.getByRole("heading", { name: /Nora/u })).toBeVisible();
  await member.getByRole("button", { name: "CONTINUAR" }).click();
  await member.waitForURL("**/inici");
  await expect(member.locator(".clubs-shell")).toBeVisible();
  await screenshot(member, "03-home-new-member-core-375.png");

  const rejectedContext = await localizedContext(browser, { height: 844, width: 375 });
  const rejectedPage = await rejectedContext.newPage();
  const rejectedMemberId = await completePublicSignup({
    // A NIE applicant (typed lower case with a hyphen) reaches «Sol·licitud enviada» (B1).
    chip: "941000000009902",
    document: "y7654321-g",
    dog: rejectedDog,
    email: rejectedEmail,
    expectedDocument: { type: "NIE", value: "Y7654321G" },
    family: false,
    firstName: "Pau",
    lastName: "Rebuig E3",
    page: rejectedPage,
    // E3-W08 (R-04-14): a PACK plan's card is its pack line, with no start options.
    paymentScreenshot: "19-payment-pack6-core-375.png",
    phone: "699000902",
    plan: "Pack 6",
    screenshots: false,
  });
  await rejectedContext.close();
  // E3-W08 (R-04-08): with `signup.requireDogDocumentAtSignup`, 17 requires the vaccination card.
  const adminParameters = await adminApi(admin);
  expect(await setParameter(admin, adminParameters, "signup.requireDogDocumentAtSignup", true)).toBe(200);
  // A passport-only applicant (DNI / NIE empty) reaches «Sol·licitud enviada» too (B1, R-04-01).
  // She names a family holder the club does not have and leaves it pending (NOT_FOUND_PENDING).
  const passportContext = await localizedContext(browser, { height: 844, width: 375 });
  let passportMemberId: string;
  try {
    passportMemberId = await completePublicSignup({
      chip: "941000000009904",
      document: "",
      documentRequired: true,
      dog: passportDog,
      email: passportEmail,
      expectedDocument: { type: "PASSPORT", value: "PA1234567" },
      family: "pending",
      firstName: "Joana",
      lastName: "Passaport E3",
      page: await passportContext.newPage(),
      passport: "pa1234567",
      phone: "699000904",
      screenshots: false,
    });
  } finally {
    expect(await setParameter(admin, adminParameters, "signup.requireDogDocumentAtSignup", false)).toBe(200);
  }
  await passportContext.close();
  const mailboxBeforeRejection = mailboxFiles();
  await navigateSpa(admin, `/preinscripcions/${rejectedMemberId}`);
  await expect(admin.getByRole("heading", { name: new RegExp(rejectedName, "u") })).toBeVisible();
  await admin.getByRole("button", { name: "REBUTJA (amb motiu)" }).click();
  const rejectModal = admin.getByRole("dialog", { name: "Rebutja la preinscripció" });
  // R-04-23: nothing was collected, so there is no refund warning.
  await expect(rejectModal.getByText(/Hi ha un pagament cobrat/u)).toHaveCount(0);
  await rejectModal.getByLabel("Motiu del rebuig").fill("Dades de prova rebutjades");
  await rejectModal.getByRole("button", { name: "REBUTJA (amb motiu)" }).click();
  await admin.waitForURL("**/tauler");
  rejectionMessage = await waitForMessage(
    rejectedEmail,
    mailboxBeforeRejection,
    (message) =>
      /rebutj|recha|reject/iu.test(
        `${message.subject ?? ""} ${message.text ?? ""} ${message.html ?? ""}`,
      ),
  );

  await navigateSpa(member, "/gossos");
  await expect(member.getByRole("heading", { name: "Els meus gossos" })).toBeVisible();
  await screenshot(member, "13-my-dogs-core-375.png");
  expect(memberPageErrors).toEqual([]);
  const addDogLink = member.getByRole("link", { name: "＋ AFEGEIX UN GOS" }).first();
  await expect(addDogLink).toBeVisible();
  await screenshot(member, "13-my-dogs-loaded-core-375.png");
  await addDogLink.click();
  await member.waitForURL("**/gossos/nou");
  await fillDog(member, additionalDog, "941000000009903");
  await screenshot(member, "17-add-dog-core-375.png");
  const addDogConfig = member.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/signup") &&
      response.request().method() === "GET" &&
      new URL(member.url()).pathname === "/gossos/nou/pagament",
  );
  await member.getByRole("button", { name: "CONTINUA" }).click();
  await member.waitForURL("**/gossos/nou/pagament");
  await expect(member.getByLabel("Mètode de pagament actual")).toHaveValue(/Domiciliació/u);
  // E3-W08 (R-04-14): the add-dog card is the member plan's add-dog quote.
  const addDogQuoteConfig = (await (await addDogConfig).json()) as SignupQuoteConfig & {
    upfront?: { additionalDogOptions?: unknown };
  };
  await expectQuoteCard(member, addDogQuoteConfig, undefined);
  const privacy = member.getByLabel("Accepto la política de privacitat");
  if (await privacy.isVisible()) await privacy.check();
  await screenshot(member, "19-add-dog-core-375.png");
  // The success page is a full page load, which discards the response body: read it on the way.
  const addDogSubmission: { result?: { upfront?: { totalDue: Money } } } = {};
  await member.route("**/api/v1/me/dogs/signup", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    addDogSubmission.result = (await response.json()) as { upfront?: { totalDue: Money } };
    await route.fulfill({ response });
  });
  await member.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }).click();
  await member.waitForURL("**/gossos/nou/enviada");
  await member.unroute("**/api/v1/me/dogs/signup");
  // E3-W08 round 2 #7: the add-dog quote the card showed, and the amounts the api froze on submission.
  expect(addDogSubmission.result).toBeDefined();
  const memberQuote = addDogQuoteConfig.upfront?.planQuotes.find((item) => item.planId === addDogQuoteConfig.member?.planId);
  expect(addDogSubmission.result?.upfront?.totalDue).toEqual(memberQuote?.options[0]?.totalDue ?? memberQuote?.totalDue);
  writeFileSync(
    join(evidenceDirectory, "signup-quote-add-dog-core.json"),
    `${JSON.stringify(
      {
        additionalDogOptions: addDogQuoteConfig.upfront?.additionalDogOptions ?? null,
        memberPlanQuote: memberQuote ?? null,
        submittedUpfront: addDogSubmission.result?.upfront ?? null,
        today: addDogQuoteConfig.upfront?.today ?? null,
      },
      null,
      2,
    )}\n`,
  );
  await expect(member.getByRole("heading", { name: "Sol·licitud enviada" })).toBeVisible();
  // The add-dog success page never promises a welcome message (the member already has access).
  await expect(member.getByText(/benvinguda/u)).toHaveCount(0);
  await screenshot(member, "enviada-add-dog-core-375.png");
  // E36 (R-04-25): screen 13 lists the new dog as pending, with no actions, until the club validates it.
  await navigateSpa(member, "/gossos");
  const pendingCard = member.locator(".dog-card").filter({ has: member.getByRole("heading", { name: additionalDog }) });
  await expect(pendingCard.getByText("pendent de validació")).toBeVisible();
  await expect(pendingCard.getByRole("button")).toHaveCount(0);
  await expect(pendingCard.locator("input, textarea")).toHaveCount(0);
  await screenshot(member, "13-pending-dog-core-375.png");
  await navigateSpa(admin, "/tauler");
  await admin.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await openSignupFromDashboard(admin, additionalDog, additionalDog);
  await expect(admin.getByText("nou gos")).toBeVisible();
  // M12 on the real core: the member (ACTIVE, edited above) and the new dog have different versions;
  // the dog PATCH sends the dog's own. R-04-25: the person is read-only in add-dog mode.
  await admin.getByRole("button", { name: "EDITA LES DADES" }).click();
  const addDogEdit = admin.getByRole("dialog", { name: "Edita les dades de la preinscripció" });
  // Playwright reads `disabled` on the controls a disabled fieldset contains, not on the fieldset.
  await expect(addDogEdit.locator("#signup-edit-firstName")).toBeDisabled();
  await expect(addDogEdit.locator("#signup-edit-dog-0-breed")).toBeEnabled();
  await addDogEdit.locator("#signup-edit-dog-0-breed").fill("Gos d'atura");
  const dogPatch = admin.waitForResponse(
    (response) => /\/api\/v1\/dogs\/[^/]+$/u.test(response.url()) && response.request().method() === "PATCH",
  );
  await addDogEdit.getByRole("button", { name: "DESA ELS CANVIS" }).click();
  const dogPatchResponse = await dogPatch;
  expect(dogPatchResponse.status(), await dogPatchResponse.text()).toBe(200);
  await expect(admin.locator(".ah-toast").filter({ hasText: "Les dades s'han actualitzat." })).toBeVisible();
  await expect(admin.locator(".signup-review-data dd").filter({ hasText: "Gos d'atura" }).first()).toBeVisible();
  await screenshot(admin, "D2-signup-add-dog-core-1280.png");
  await completeValidation(admin);
  additionalDogValidated = true;
  // E36: after the validation, 13 shows the dog as an ordinary active dog.
  await navigateSpa(member, "/inici");
  await navigateSpa(member, "/gossos");
  const validatedCard = member.locator(".dog-card").filter({ has: member.getByRole("heading", { name: additionalDog }) });
  await expect(validatedCard.getByRole("button", { name: "＋ DOC." })).toBeVisible();
  await expect(validatedCard.getByText("pendent de validació")).toHaveCount(0);
  await screenshot(member, "13-validated-dog-core-375.png");
  await memberContext.close();

  // M15 on the real core: the NOT_FOUND_PENDING claim, a plan change with dryRun, a bare 422 on its
  // field, then the claim resolved by attaching the found holder's group (R-04-13).
  await navigateSpa(admin, `/preinscripcions/${passportMemberId}`);
  await expect(admin.getByRole("heading", { name: /Joana Passaport E3/u })).toBeVisible();
  await expect(admin.getByText("Pendent — ha indicat: Pere Inexistent + gos Tro")).toBeVisible();
  await screenshot(admin, "D2-signup-family-pending-core-1280.png");
  const planSelect = admin.getByLabel("Modalitat i tarifa");
  const requestedPlan = await planSelect.inputValue();
  const packValue = await planSelect
    .locator("option", { hasText: /^Pack 6 · / })
    .getAttribute("value");
  expect(packValue).not.toBeNull();
  const packQuote = admin.waitForResponse(
    (response) => response.url().includes("/validation?dryRun=true") && response.request().method() === "POST",
  );
  await planSelect.selectOption(packValue ?? "");
  const packQuoteResponse = await packQuote;
  expect(packQuoteResponse.status(), await packQuoteResponse.text()).toBe(200);
  expect(packQuoteResponse.request().postDataJSON()).toMatchObject({
    planId: (packValue ?? "").split("|")[0],
    priceId: (packValue ?? "").split("|")[1],
  });
  await expect(admin.locator(".signup-review-upfront-breakdown")).toContainText("Pack");
  await expect(admin.getByLabel("Data del proper rebut")).toHaveCount(0);
  await screenshot(admin, "D2-signup-plan-change-core-1280.png");
  const backQuote = admin.waitForResponse(
    (response) => response.url().includes("/validation?dryRun=true") && response.request().method() === "POST",
  );
  await planSelect.selectOption(requestedPlan);
  expect((await backQuote).status()).toBe(200);
  await expect(admin.getByLabel("Data del proper rebut")).toBeVisible();

  // Round 2 (R-04-19, R-04-10): the drawer moves the applicant from direct debit to cash, among the
  // methods of the club's active providers; the reload discards the quote and asks for it again.
  const clubSettings = admin.waitForResponse(
    (response) => response.url().endsWith("/api/v1/club") && response.request().method() === "GET",
  );
  await admin.getByRole("button", { name: "EDITA LES DADES" }).click();
  const methodEdit = admin.getByRole("dialog", { name: "Edita les dades de la preinscripció" });
  const clubResponse = await clubSettings;
  expect(clubResponse.status()).toBe(200);
  // Real-core sources of the club's methods (R-04-10); the bearer is used, never written.
  const authorization = (await clubResponse.request().allHeaders()).authorization;
  const signupMethods = await admin.evaluate(
    async ({ auth, url }) => {
      const probe = async (headers: Record<string, string>) => {
        const response = await fetch(url, { headers });
        const body = response.ok
          ? (((await response.json()) as { paymentMethods?: unknown }).paymentMethods ?? null)
          : await response.text();
        return { paymentMethods: body, status: response.status };
      };
      return { admin: auth === undefined ? null : await probe({ Authorization: auth }), anonymous: await probe({}) };
    },
    { auth: authorization, url: clubResponse.url().replace(/\/club$/u, "/signup") },
  );
  writeFileSync(
    join(evidenceDirectory, "d2-payment-methods-core.json"),
    `${JSON.stringify(
      {
        clubPaymentProviders: ((await clubResponse.json()) as { paymentProviders?: unknown }).paymentProviders ?? null,
        signup: signupMethods,
      },
      null,
      2,
    )}\n`,
  );
  const method = methodEdit.getByLabel("Mètode de pagament");
  await expect(method).toHaveValue("SEPA_DD");
  await expect(method.locator("option", { hasText: "Efectiu" })).toHaveCount(1);
  await method.selectOption("MANUAL");
  await expect(methodEdit.getByLabel("IBAN")).toHaveCount(0);
  // Viewport capture: the selector is below the fold of the drawer's own scroll.
  await method.scrollIntoViewIfNeeded();
  await admin.screenshot({ path: join(evidenceDirectory, "D2-signup-payment-method-core-1280.png") });
  const methodPatch = admin.waitForResponse(
    (response) =>
      response.url().endsWith(`/members/${passportMemberId}`) && response.request().method() === "PATCH",
  );
  const requote = admin.waitForResponse(
    (response) => response.url().includes("/validation?dryRun=true") && response.request().method() === "POST",
  );
  await methodEdit.getByRole("button", { name: "DESA ELS CANVIS" }).click();
  const methodPatchResponse = await methodPatch;
  expect(methodPatchResponse.status(), await methodPatchResponse.text()).toBe(200);
  expect(methodPatchResponse.request().postDataJSON()).toMatchObject({ paymentMethod: { type: "MANUAL" } });
  expect((await requote).status()).toBe(200);
  await expect(methodEdit).not.toBeVisible();
  await expect(admin.locator(".signup-review-data dd").filter({ hasText: /^Efectiu$/u })).toBeVisible();
  await expect(admin.locator(".signup-review-warning--danger")).toHaveCount(0);
  await expect(admin.getByRole("button", { name: "VALIDA L'ALTA" })).toBeEnabled();

  // Nothing collected yet (manual): confirmed, so the next VALIDA reaches the family decision.
  await admin.getByRole("checkbox", { name: "No s'ha cobrat res: queda pendent" }).check();
  await admin.getByRole("button", { name: "VALIDA L'ALTA" }).click();
  await expect(admin.getByText("Tria el grup del titular o «Sense grup».")).toBeVisible();
  const holderSearch = admin.waitForResponse(
    (response) => response.url().includes("/api/v1/members?") && response.request().method() === "GET",
  );
  await admin.getByLabel("Cerca el titular").fill("Laia Fictici001");
  expect((await holderSearch).status()).toBe(200);
  await admin.getByRole("button", { name: /^Afegeix al grup de Laia Fictici001\b/u }).first().click();
  await expect(admin.getByText(/^Grup de Laia Fictici001\b/u)).toBeVisible();

  // A bare 422 from the core lands on its field: LEVEL_REQUIRED on «Nivell inicial».
  await admin.getByLabel("Nivell inicial").first().selectOption("");
  const levelRequired = admin.waitForResponse(
    (response) => response.url().includes("/validation?") && response.request().method() === "POST",
  );
  await admin.getByRole("button", { name: "VALIDA L'ALTA" }).click();
  const levelRequiredResponse = await levelRequired;
  expect(levelRequiredResponse.status()).toBe(422);
  expect(((await levelRequiredResponse.json()) as { code: string }).code).toBe("LEVEL_REQUIRED");
  await expect(admin.locator(".ah-form-field__error").filter({ hasText: "Selecciona el nivell inicial." })).toBeVisible();
  await expect(admin.getByLabel("Nivell inicial").first()).toHaveAttribute("aria-invalid", "true");
  await screenshot(admin, "D2-signup-level-required-core-1280.png");

  const familyValidation = admin.waitForRequest(
    (request) => request.url().includes("/validation?dryRun=false") && request.method() === "POST",
  );
  await completeValidation(admin);
  const familyBody = (await familyValidation).postDataJSON() as { familyGroupId?: string };
  expect(familyBody.familyGroupId).toMatch(/^[0-9a-f-]{36}$/u);

  // E3-W08 step 6 (R-04-06, E38): a LEFT member of the seed applies again with a new phone; D2
  // shows the old and new values; the club rejects the readmission and the record stays as it was.
  const readmissionApi = await adminApi(admin);
  interface SeedMember {
    contactEmails: { email: string }[];
    firstName: string;
    id: string;
    idDocument?: { number: string; type: string } | null;
    lastName1: string;
    phones: { number: string; prefix: string }[];
    status: string;
  }
  const leftLookup = await admin.evaluate(
    async ({ authorization, base }) => {
      const headers = { Authorization: authorization };
      // The D5 «baixa» chip (R-03-03): `status:eq:LEFT`, with a page size the list offers.
      const list = await fetch(`${base}/members?filter=${encodeURIComponent("status:eq:LEFT")}&size=20`, { headers });
      if (!list.ok) return { listError: await list.text(), listStatus: list.status, member: null };
      const items = ((await list.json()) as { items?: { id: string }[] }).items ?? [];
      for (const item of items) {
        const detail = await fetch(`${base}/members/${item.id}`, { headers });
        const member = (await detail.json()) as { idDocument?: { number?: string } | null };
        if (detail.ok && typeof member.idDocument?.number === "string") return { listStatus: list.status, member };
      }
      return { listStatus: list.status, member: null };
    },
    readmissionApi,
  );
  // E3-W08 round 2 #5: the run itself leaves a LEFT member (the applicant rejected above), so the
  // lookup must find one; a failed lookup fails the test instead of skipping the readmission.
  expect(leftLookup.listStatus).toBe(200);
  const leftMember = leftLookup.member as SeedMember | null;
  expect(leftMember).not.toBeNull();
  expect(leftMember?.idDocument).toBeTruthy();
  if (leftMember?.idDocument != null) {
    const leftDocument = leftMember.idDocument;
    const passportOnly = leftDocument.type === "PASSPORT";
    const readmissionContext = await localizedContext(browser, { height: 844, width: 375 });
    const readmittedId = await completePublicSignup({
      chip: "941000000009905",
      document: passportOnly ? "" : leftDocument.number,
      dog: "Retorn E3",
      email: "retorn.e3@example.test",
      expectedDocument: { type: leftDocument.type, value: leftDocument.number },
      family: false,
      firstName: leftMember.firstName,
      lastName: leftMember.lastName1,
      page: await readmissionContext.newPage(),
      ...(passportOnly ? { passport: leftDocument.number } : {}),
      phone: "699000905",
      screenshots: false,
    });
    await readmissionContext.close();
    expect(readmittedId).toBe(leftMember.id);
    await navigateSpa(admin, `/preinscripcions/${readmittedId}`);
    await expect(admin.locator(".ah-badge", { hasText: "Readmissió" }).first()).toBeVisible();
    const changes = admin.getByRole("region", { name: "Canvis respecte de la fitxa de baixa" });
    await expect(changes.getByText(/^Ara: .*699000905/u)).toBeVisible();
    await expect(changes.getByText(new RegExp(`^Abans: .*${leftMember.phones[0]?.number ?? "—"}`, "u"))).toBeVisible();
    // Round 2 #1: `member` is the LEFT record; the card and the drawer carry the submitted values.
    await expect(admin.locator(".signup-review-data dd").filter({ hasText: /retorn\.e3@example\.test · \+34 699000905/u }).first()).toBeVisible();
    await expect(admin.locator(".signup-review-whatsapp")).toHaveAttribute("href", "https://wa.me/34699000905");
    await screenshot(admin, "D2-readmission-core-1280.png");
    await admin.getByRole("button", { name: "EDITA LES DADES" }).click();
    const readmissionDrawer = admin.getByRole("dialog", { name: "Edita les dades de la preinscripció" });
    await expect(readmissionDrawer.locator("#signup-edit-email1")).toHaveValue("retorn.e3@example.test");
    await expect(readmissionDrawer.locator("#signup-edit-phone1Number")).toHaveValue("699000905");
    await expect(readmissionDrawer.getByLabel("DNI/NIE")).toHaveAttribute("readonly", "");
    await screenshot(admin, "D2-readmission-drawer-core-1280.png");
    await readmissionDrawer.getByRole("button", { name: "Cancel·la" }).click();
    await expect(readmissionDrawer).toBeHidden();
    // The readmission block as the core sends it (its nulls included), next to the LEFT record's contact.
    const readmissionView = (await admin.evaluate(
      async ({ authorization, base, id }) =>
        (await (await fetch(`${base}/members/${id}/signup`, { headers: { Authorization: authorization } })).json()) as unknown,
      { ...readmissionApi, id: readmittedId },
    )) as {
      member: { contactEmails: { email: string }[]; phones: { number: string }[] };
      readmission?: { changedFields: string[]; submitted: { contactEmails: { email: string }[]; paymentMethod?: unknown; phones: { number: string }[] } };
    };
    expect(readmissionView.member.phones.map((phone) => phone.number)).toEqual(leftMember.phones.map((phone) => phone.number));
    expect(readmissionView.readmission?.submitted.phones.map((phone) => phone.number)).toEqual(["699000905"]);
    writeFileSync(
      join(evidenceDirectory, "d2-readmission-view-core.json"),
      `${JSON.stringify(
        {
          changedFields: readmissionView.readmission?.changedFields ?? null,
          memberContact: {
            emails: readmissionView.member.contactEmails.map((entry) => entry.email),
            phones: readmissionView.member.phones.map((phone) => phone.number),
          },
          submittedContact: {
            emails: readmissionView.readmission?.submitted.contactEmails.map((entry) => entry.email) ?? null,
            phones: readmissionView.readmission?.submitted.phones.map((phone) => phone.number) ?? null,
          },
          submittedPaymentMethod: readmissionView.readmission?.submitted.paymentMethod ?? null,
        },
        null,
        2,
      )}\n`,
    );
    await admin.getByRole("button", { name: "REBUTJA (amb motiu)" }).click();
    const readmissionReject = admin.getByRole("dialog", { name: "Rebutja la preinscripció" });
    await readmissionReject.getByLabel("Motiu del rebuig").fill("Readmissió de prova rebutjada");
    await readmissionReject.getByRole("button", { name: "REBUTJA (amb motiu)" }).click();
    await admin.waitForURL("**/tauler");
    const after = await admin.evaluate(
      async ({ authorization, base, id }) =>
        (await (await fetch(`${base}/members/${id}`, { headers: { Authorization: authorization } })).json()) as unknown,
      { ...readmissionApi, id: readmittedId },
    ) as SeedMember;
    expect(after.status).toBe("LEFT");
    expect(after.phones).toEqual(leftMember.phones);
    expect(after.contactEmails.map((entry) => entry.email)).toEqual(leftMember.contactEmails.map((entry) => entry.email));
    await navigateSpa(admin, `/abonats/${readmittedId}`);
    await expect(admin.getByText(leftMember.phones[0]?.number ?? leftMember.firstName, { exact: false }).first()).toBeVisible();
    await expect(admin.getByText(/699000905/u)).toHaveCount(0);
    await screenshot(admin, "D10-after-rejected-readmission-core-1280.png");
    writeFileSync(
      join(evidenceDirectory, "readmission-core.json"),
      `${JSON.stringify({ leftMemberWithDocument: true, phonesKeptAfterRejection: true, statusAfterRejection: after.status }, null, 2)}\n`,
    );
  }

  const parametersResponse = admin.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/parameters") && response.request().method() === "GET",
  );
  await navigateSpa(admin, "/parametres");
  const parameters = (await (await parametersResponse).json()) as {
    blocks?: { key: string; rows: { key: string; module?: string | null }[] }[];
  };
  // Real-core placement of the signup switch (D11 hides rows whose module is off).
  writeFileSync(
    join(evidenceDirectory, "d11-signup-parameter-core.json"),
    `${JSON.stringify(
      (parameters.blocks ?? []).flatMap((block) =>
        block.rows
          .filter((row) => row.key.startsWith("signup.") || row.key.startsWith("bookings."))
          .map((row) => ({ block: block.key, key: row.key, module: row.module ?? null })),
      ),
      null,
      2,
    )}\n`,
  );
  await admin.waitForTimeout(1_000);
  await screenshot(admin, "D11-signup-toggle-core-1280.png");
  const parameter = admin.locator(".settings-parameter").filter({ hasText: "Altes públiques" });
  await expect(parameter).toBeVisible();
  // Viewport capture of the switch in its block (the full-page D11 capture is ~6700 px high).
  await parameter.scrollIntoViewIfNeeded();
  await admin.screenshot({ path: join(evidenceDirectory, "D11-signup-toggle-viewport-core-1280.png") });
  await parameter.getByRole("button", { name: /Altes públiques/u }).first().click();
  const editor = admin.getByRole("dialog", { name: "Altes públiques" });
  const toggle = editor.getByRole("switch", { name: "Altes públiques" });
  if (await toggle.isChecked()) await toggle.click();
  const updateResponse = admin.waitForResponse(
    (response) =>
      response.url().endsWith("/parameters/signup.enabled") &&
      response.request().method() === "PUT",
  );
  await editor.getByRole("button", { name: "Desa" }).click();
  expect((await updateResponse).status()).toBe(200);
  await expect(editor).not.toBeVisible();
  signupDisabled = true;
  await adminSession?.context.close();
  adminSession = undefined;
});

test("T-04-34 rejected signup delivers N-03", () => {
  expect(rejectionMessage).toBeDefined();
  expect(`${rejectionMessage?.subject ?? ""} ${rejectionMessage?.text ?? ""} ${rejectionMessage?.html ?? ""}`).toMatch(
    /rebutj|recha|reject/iu,
  );
});

test("T-04-34 active member adds a dog and the club validates it", () => {
  expect(additionalDogValidated).toBe(true);
});

test("T-04-34 signup.enabled=false shows only the configured closed text", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  expect(signupDisabled).toBe(true);

  const publicContext = await localizedContext(browser, { height: 844, width: 375 });
  const page = await publicContext.newPage();
  const configResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/signup") && response.request().method() === "GET",
  );
  await page.goto(`${clubsUrl}/apuntat-hi`);
  const config = await configResponse;
  const configBody = (await config.json()) as { closedText?: string; enabled?: boolean };
  // Diagnostic for the api (E3-W05 finding): what the core answered right after the PUT.
  writeFileSync(
    join(evidenceDirectory, "signup-closed-config-core.json"),
    `${JSON.stringify(
      {
        cacheControl: config.headers()["cache-control"] ?? null,
        closedText: configBody.closedText ?? null,
        enabled: configBody.enabled ?? null,
        status: config.status(),
      },
      null,
      2,
    )}\n`,
  );
  await expect(
    page.getByText(
      "Les inscripcions estan tancades temporalment. Torna-ho a provar més endavant o posa't en contacte amb el club.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "CONTINUA" })).toHaveCount(0);
  await screenshot(page, "16-signup-closed-core-375.png");
  await publicContext.close();
});
