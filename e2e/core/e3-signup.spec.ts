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
    phone: string;
  },
): Promise<void> {
  await page.getByLabel("DNI / NIE").fill(values.document);
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
  document,
  dog,
  email,
  family,
  firstName,
  lastName,
  page,
  screenshots,
}: {
  document: string;
  dog: string;
  email: string;
  family: boolean;
  firstName: string;
  lastName: string;
  page: Page;
  screenshots: boolean;
}): Promise<string> {
  await page.goto(`${clubsUrl}/apuntat-hi`);
  await expect(page.getByText(/Pas 1 de 4/u)).toBeVisible();
  await fillPerson(page, {
    document,
    email,
    firstName,
    lastName,
    phone: document === "12345678Z" ? "699000901" : "699000902",
  });
  if (screenshots) await screenshot(page, "16-person-core-375.png");

  await page.getByRole("button", { name: "CONTINUA" }).click();
  await page.waitForURL("**/apuntat-hi/gos");
  await fillDog(page, dog, document === "12345678Z" ? "941000000009901" : "941000000009902");
  if (screenshots) await screenshot(page, "17-dog-core-375.png");

  await page.getByRole("button", { name: "CONTINUA" }).click();
  await page.waitForURL("**/apuntat-hi/familia");
  if (family) {
    await page.getByLabel("Nom del responsable").fill("Laia Fictici001");
    await page.getByLabel("Nom d'un dels seus gossos").fill("Ona 1");
    await page.getByRole("button", { name: "CONTINUA" }).click();
    await expect(page.getByText(/Grup trobat: Laia F\./u)).toBeVisible();
    if (screenshots) await screenshot(page, "18-family-core-375.png");
  }
  await page.getByRole("button", { name: "CONTINUA" }).click();
  await page.waitForURL("**/apuntat-hi/pagament");
  await page.getByLabel("Accepto la política de privacitat").check();
  if (screenshots) await screenshot(page, "19-payment-core-375.png");
  let signupResult: { memberId: string } | undefined;
  await page.route(
    "**/api/v1/signup",
    async (route) => {
      const upstream = await route.fetch();
      const body = await upstream.text();
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
  expect(response.status()).toBe(201);
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
  test.setTimeout(300_000);
  const publicContext = await localizedContext(browser, { height: 844, width: 375 });
  const publicPage = await publicContext.newPage();
  const acceptedMemberId = await completePublicSignup({
    document: "12345678Z",
    dog: acceptedDog,
    email: acceptedEmail,
    family: true,
    firstName: "Nora",
    lastName: "Integració E3",
    page: publicPage,
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
    member: {
      maskedAccount?: string;
      paymentMethod?: { maskedAccount?: string; type: string };
      plan?: unknown;
      planId?: string;
      status: string;
    };
    proposals: { nextInvoiceDate?: string; planId?: string };
  };
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
  await edit.getByLabel("IBAN").fill("ES9121000418450200051332");
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
  await expect(
    admin.getByLabel("Modalitat i tarifa").locator("option:checked"),
  ).toHaveText(/€\/mes/u);
  await expect(admin.getByText("Pagament inicial pendent")).toHaveClass(/ah-badge/u);
  await expect(admin.getByLabel("Data del proper rebut")).toBeVisible();
  await screenshot(admin, "D2-signup-core-1280.png");
  // A date different from the core's proposal, so the request proves the typed value is sent.
  expect(view.proposals.nextInvoiceDate).not.toBe("2026-11-01");
  await expect(admin.getByLabel("Data del proper rebut")).not.toHaveValue("01/11/2026");
  await completeValidation(admin, { nextInvoiceDate: { input: "01/11/2026", iso: "2026-11-01" } });
  await admin.waitForTimeout(1_000);
  await navigateSpa(admin, "/abonats");
  await expect(admin.getByRole("heading", { name: "Abonats" })).toBeVisible();
  const refreshedDashboard = admin.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/dashboard") && response.request().method() === "GET",
  );
  await navigateSpa(admin, "/tauler");
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
    document: "00000000T",
    dog: rejectedDog,
    email: rejectedEmail,
    family: false,
    firstName: "Pau",
    lastName: "Rebuig E3",
    page: rejectedPage,
    screenshots: false,
  });
  await rejectedContext.close();
  const mailboxBeforeRejection = mailboxFiles();
  await navigateSpa(admin, `/preinscripcions/${rejectedMemberId}`);
  await expect(admin.getByRole("heading", { name: new RegExp(rejectedName, "u") })).toBeVisible();
  await admin.getByRole("button", { name: "REBUTJA (amb motiu)" }).click();
  const rejectModal = admin.getByRole("dialog", { name: "Rebutja la preinscripció" });
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
  await addDogLink.click();
  await member.waitForURL("**/gossos/nou");
  await fillDog(member, additionalDog, "941000000009903");
  await member.getByRole("button", { name: "CONTINUA" }).click();
  await member.waitForURL("**/gossos/nou/pagament");
  await expect(member.getByLabel("Mètode de pagament actual")).toHaveValue(/Domiciliació/u);
  const privacy = member.getByLabel("Accepto la política de privacitat");
  if (await privacy.isVisible()) await privacy.check();
  await screenshot(member, "19-add-dog-core-375.png");
  await member.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }).click();
  await member.waitForURL("**/apuntat-hi/enviada");
  await memberContext.close();
  await navigateSpa(admin, "/tauler");
  await admin.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await openSignupFromDashboard(admin, additionalDog, additionalDog);
  await expect(admin.getByText("nou gos")).toBeVisible();
  await completeValidation(admin);
  additionalDogValidated = true;

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
  await page.goto(`${clubsUrl}/apuntat-hi`);
  await expect(
    page.getByText(
      "Les inscripcions estan tancades temporalment. Torna-ho a provar més endavant o posa't en contacte amb el club.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "CONTINUA" })).toHaveCount(0);
  await screenshot(page, "16-signup-closed-core-375.png");
  await publicContext.close();
});
