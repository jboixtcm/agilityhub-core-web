import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type BrowserContext, expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E7-W02");
const brandingCanic = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
) as { modules: string[]; pushPublicKey: string | null };
// Screen 11's mock world is read on Sunday 2 August 2026 at 18:00 (Europe/Madrid):
// `NOTIFICATIONS_MOCK_NOW`.
const notificationsNow = new Date("2026-08-02T18:00:00+02:00");
const PUSH_ENDPOINT = "https://push.example.test/send/laura-phone";

test.use({ viewport: { height: 812, width: 375 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

function branding(scenario: string) {
  const without = (module: string) => brandingCanic.modules.filter((item) => item !== module);
  switch (scenario) {
    case "memberNoSms":
      return { ...brandingCanic, modules: without("SMS") };
    case "memberNoPush":
      return { ...brandingCanic, modules: without("PUSH"), pushPublicKey: null };
    case "faqOff":
      return { ...brandingCanic, modules: without("FAQ") };
    default:
      return brandingCanic;
  }
}

async function prepare(page: Page, scenario: string) {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding(scenario), mockScenario: scenario },
  );
}

/**
 * A headless browser has no push service, and mock mode registers no app worker (MSW's owns `/`):
 * this stand-in registration's `PushManager.subscribe` answers a subscription, so the run proves
 * the call to `POST /push-subscriptions`, not the delivery (E7-W03 and staging do).
 */
async function standInPushRegistration(context: BrowserContext) {
  await context.addInitScript(
    ({ endpoint }) => {
      const subscription = {
        toJSON: () => ({ endpoint, keys: { auth: "A".repeat(22), p256dh: "B".repeat(87) } }),
      };
      Reflect.set(window, "__agilityhubPushRegistration", {
        pushManager: { subscribe: () => Promise.resolve(subscription) },
      });
    },
    { endpoint: PUSH_ENDPOINT },
  );
}

/** Signs in (03 is the landing page) with the clock pinned at the feed world's instant. */
async function login(page: Page, scenario = "member") {
  await page.clock.setFixedTime(notificationsNow);
  await prepare(page, scenario);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
}

/** A capture waits until every rendered sprite icon has a box (see `booking.spec.ts`). */
async function shot(page: Page, name: string, fullPage = true) {
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
  await page.screenshot({ fullPage, path: resolve(evidenceDirectory, name) });
}

const card = (page: Page, title: string) =>
  page
    .locator(".notification-card")
    .filter({ has: page.getByRole("heading", { name: title }) })
    .first();

async function openFeed(page: Page) {
  await page.getByRole("link", { name: "Avisos: 2 sense llegir" }).click();
  await page.waitForURL("**/notificacions");
  await expect(page.getByRole("heading", { level: 1, name: "Notificacions" })).toBeVisible();
  await expect(page.locator(".notification-card")).toHaveCount(20);
}

test.describe("E7-W02 T-11-34 screen 11 «Notificacions» (S11 R-11-10, R-11-11)", () => {
  test("the bell opens the feed as mockup 11, entering reads everything and 03's bell goes quiet", async ({
    page,
  }) => {
    await login(page);
    const readAll = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().endsWith("/me/notifications/read-all"),
    );
    await openFeed(page);
    await readAll;
    const first = card(page, "Classe anul·lada pel club");
    await expect(first.locator(".notification-card__meta")).toHaveText("fa 2 min · i per SMS");
    await expect(first.getByRole("button", { name: "CANVIA DE CLASSE" })).toBeVisible();
    await expect(
      card(page, "S'ha alliberat una plaça!").locator(".notification-card__meta"),
    ).toHaveText("fa 4 min");
    await expect(
      card(page, "T'hem trobat a faltar").locator(".notification-card__meta"),
    ).toHaveText("avui 8:00");
    await expect(
      card(page, "En Rock puja de nivell!").locator(".notification-card__meta"),
    ).toHaveText("ahir 19:12");
    await expect(page.getByText(/i per SMS/u)).toHaveCount(1);
    // The left border in the template's tone: ERROR, ACCENT and WARNING only.
    const borders = await page
      .locator(".notification-card")
      .evaluateAll((cards) =>
        cards.slice(0, 6).map((item) => getComputedStyle(item).borderLeftWidth),
      );
    expect(borders).toEqual(["3px", "3px", "1px", "3px", "1px", "1px"]);
    await shot(page, "11-notificacions-375.png", false);

    // More cards load when the list end shows (no page buttons).
    const secondPage = page.waitForRequest((request) =>
      request.url().includes("/me/notifications?page=1"),
    );
    await page.locator(".notifications-page__more").scrollIntoViewIfNeeded();
    await secondPage;
    await expect(page.locator(".notification-card")).toHaveCount(24);

    await page.goto(`${baseUrl}/inici`);
    await expect(page.getByRole("link", { exact: true, name: "Avisos" })).toBeVisible();
    await expect(page.locator(".home-header__dot")).toHaveCount(0);
  });

  test("[CANVIA DE CLASSE] opens 04 with Duna, and [AGAFA LA PLAÇA] the confirmation of her seat", async ({
    page,
  }) => {
    await login(page);
    await openFeed(page);
    await card(page, "Classe anul·lada pel club")
      .getByRole("button", { name: "CANVIA DE CLASSE" })
      .click();
    await page.waitForURL("**/reservar?dogId=dog-duna");
    await expect(
      page.getByRole("group", { name: "Gossos" }).getByRole("button", { name: /^Duna/u }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.goto(`${baseUrl}/notificacions`);
    await card(page, "S'ha alliberat una plaça!")
      .getByRole("button", { name: "AGAFA LA PLAÇA" })
      .click();
    await page.waitForURL("**/reservar/confirmar");
    await expect(page.getByRole("heading", { name: "Confirmar reserva" })).toBeVisible();
  });

  test("a seat already taken: [AGAFA LA PLAÇA] disabled with its hint", async ({ page }) => {
    await login(page, "notificationsSeatTaken");
    await openFeed(page);
    const seat = card(page, "S'ha alliberat una plaça!");
    await expect(seat.getByRole("button", { name: "AGAFA LA PLAÇA" })).toBeDisabled();
    await expect(seat.getByText("Aquesta plaça ja no està disponible")).toBeVisible();
    await shot(page, "11-accio-caducada-375.png", false);
  });

  test("a club without SMS never prints «i per SMS» nor «+SMS»", async ({ page }) => {
    await login(page, "memberNoSms");
    await openFeed(page);
    await expect(page.getByText(/i per SMS/u)).toHaveCount(0);
    await page.goto(`${baseUrl}/perfil`);
    await expect(page.getByText("Operativa (reserves i canvis que has fet tu)")).toBeVisible();
    await expect(page.getByText("+SMS")).toHaveCount(0);
  });
});

test.describe("E7-W02 T-11-35 screen 12 «Avisos», push and «Idioma» (S11 R-11-04, R-11-07)", () => {
  test("the live block as mockup 12: a partial save per change, and push asked for in context", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { height: 812, width: 375 } });
    await context.grantPermissions(["notifications"], { origin: baseUrl });
    await standInPushRegistration(context);
    const page = await context.newPage();
    await login(page);
    await page.goto(`${baseUrl}/perfil`);
    await expect(page.getByText("Operativa (reserves i canvis que has fet tu)")).toBeVisible();
    await expect(page.getByRole("link", { name: "Aprèn amb AgilityHub" })).toBeVisible();
    const refused = page.getByText("Activa les notificacions al navegador per rebre-les al mòbil");
    await expect(refused).toHaveCount(0);
    await shot(page, "12-avisos-375.png");

    const save = page.waitForRequest(
      (request) =>
        request.method() === "PUT" && request.url().endsWith("/me/notification-preferences"),
    );
    await page
      .getByRole("switch", { name: "Correu: Operativa (reserves i canvis que has fet tu)" })
      .click();
    expect((await save).postDataJSON()).toEqual({ emailByCategory: { OPERATIONAL: true } });

    const push = page.getByRole("switch", {
      name: "Vull rebre notificacions al mòbil quan hi hagi comunicats del club",
    });
    await push.click();
    const subscription = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/push-subscriptions"),
    );
    await push.click();
    const body = (await subscription).postDataJSON() as { deviceLabel?: string; endpoint: string };
    expect(body.endpoint).toBe(PUSH_ENDPOINT);
    expect(body.deviceLabel).toMatch(/Chrome/u);
    await expect(refused).toHaveCount(0);
    await context.close();
  });

  test("a browser that does not grant notifications still saves the choice, and the row says how to allow it", async ({
    browser,
  }) => {
    // A context without the notifications permission: headless Chromium answers the request with
    // «default» (a dismissed prompt; log 17 of E7-W02), which the row treats like a refusal.
    const context = await browser.newContext({ viewport: { height: 812, width: 375 } });
    await standInPushRegistration(context);
    const page = await context.newPage();
    await login(page);
    await page.goto(`${baseUrl}/perfil`);
    const push = page.getByRole("switch", {
      name: "Vull rebre notificacions al mòbil quan hi hagi comunicats del club",
    });
    await push.click();
    const save = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        request.url().endsWith("/me/notification-preferences") &&
        (request.postDataJSON() as { pushClubNews?: boolean }).pushClubNews === true,
    );
    await push.click();
    await save;
    await expect(
      page.getByText("Activa les notificacions al navegador per rebre-les al mòbil"),
    ).toBeVisible();
    await shot(page, "12-push-denegat-375.png");
    await context.close();
  });

  test("a club without PUSH shows no push toggle", async ({ page }) => {
    await login(page, "memberNoPush");
    await page.goto(`${baseUrl}/perfil`);
    await expect(page.getByText("Operativa (reserves i canvis que has fet tu)")).toBeVisible();
    await expect(
      page.getByRole("switch", { name: /Vull rebre notificacions al mòbil/u }),
    ).toHaveCount(0);
  });
});

test.describe("E7-W02 T-11-36 screen 30 «Info» (S11 R-11-14, S05 R-05-22)", () => {
  test("the FAQ groups in R-05-22 order, one answer open at a time", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/info`);
    await expect(page.getByRole("heading", { level: 1, name: "Info" })).toBeVisible();
    await expect(page.locator(".info-faq h2")).toHaveText([
      "Convivència al club",
      "Reserves de classe",
      "Competicions",
    ]);
    const first = page.getByRole("button", { name: "Puc venir amb més gent al club?" });
    const cancel = page.getByRole("button", {
      name: "Què he de fer si no puc venir a una classe?",
    });
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await cancel.click();
    await expect(cancel).toHaveAttribute("aria-expanded", "true");
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await shot(page, "30-info-375.png");
  });

  test("a club without FAQ keeps «Info» for its pages, with no FAQ tab", async ({ page }) => {
    await login(page, "faqOff");
    await page.goto(`${baseUrl}/info`);
    await expect(page.getByRole("tab", { name: "Normes" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "FAQ" })).toHaveCount(0);
  });
});

test("E7-W02 step 10 the e-mail unsubscribe link turns the club's announcements off (S11 R-11-08)", async ({
  page,
}) => {
  await prepare(page, "member");
  await page.goto(`${baseUrl}/comunicats/baixa?t=mock-unsubscribe-valid`);
  await expect(page.getByText("Ja no rebràs els comunicats del club per correu.")).toBeVisible();
  await page.goto(`${baseUrl}/comunicats/baixa?t=mock-unsubscribe-expired`);
  await expect(page.getByText("Aquest enllaç ja no és vàlid.")).toBeVisible();
});
