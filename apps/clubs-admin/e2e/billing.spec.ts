import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
// The captures go to this spec's own task (E8-W01) unless the run names another one
// (`E2E_CAPTURE_TASK`, `pnpm e2e:docker <ID> --capture-task=<ID>`), as `e5-backoffice.spec.ts` does.
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  captureTask === "" ? "E8-W01" : captureTask,
);
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// `BILLING_MOCK_NOW` (fixtures/billing.ts): the day after the mockup's September was generated.
const billingNow = new Date("2026-08-26T08:00:00Z");

type BillingScenario = "admin" | "billingManualOnly" | "billingStripe";

test.use({ viewport: { height: 900, width: 1280 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page, scenario: BillingScenario) {
  await page.clock.setFixedTime(billingNow);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

/** D6 on a month; the page is ready once the list draws the month's receipts. */
async function openMonth(page: Page, period: string, title: string) {
  await page.goto(`${baseUrl}/facturacio?mes=${period}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

function invoiceRow(page: Page, number: string): Locator {
  return page.locator(`tr[data-invoice-number="${number}"]`);
}

function chips(page: Page): Locator {
  return page.getByRole("group", { name: "Estat dels rebuts" });
}

// Icons are `<use>` references to the external sprite: a capture waits until each has a box.
async function expectIconsPainted(scope: Locator) {
  await expect
    .poll(() =>
      scope
        .locator("svg.ah-icon")
        .evaluateAll((icons) =>
          icons.every((icon) => icon instanceof SVGSVGElement && icon.getBBox().width > 0),
        ),
    )
    .toBe(true);
}

test.describe("E8-W01 D6 «Facturació» (S12 §2, mockup V7, MSW)", () => {
  test("T-12-25 D6 as the mockup draws it: incidents first, cash members, KPIs, chips and the month's receipts", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await openMonth(page, "2026-09", "Setembre 2026");
    await expect(page.getByRole("button", { name: "Mes anterior" })).toHaveText("‹ mes");
    await expect(page.getByRole("button", { name: "Mes següent" })).toHaveText("mes ›");
    await expect(page.getByRole("button", { name: "1 · SIMULA EL MES" })).toBeEnabled();
    // September is generated already: button 2 waits and the rollback is offered (R-12-14).
    await expect(page.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Retrocedeix la remesa" })).toBeVisible();

    const simulation = page.locator(".billing-simulation");
    await expect(
      simulation.getByRole("heading", { name: "Pas 1 — Simulació: incidències primer" }),
    ).toBeVisible();
    // The red «2» is read out as «2 incidències» (visually hidden text next to it).
    const counter = simulation.locator(".ah-badge").filter({ hasText: "2 incidències" });
    await expect(counter.locator('[aria-hidden="true"]')).toHaveText("2");
    await expect(counter.locator(".ah-sr-only")).toHaveText("2 incidències");
    const incidents = simulation.getByRole("table").nth(0);
    const cash = simulation.getByRole("table").nth(1);
    // Incidents first (R-12-07), each with its label and its «Obre fitxa» link.
    await expect(incidents.getByRole("row")).toHaveCount(2);
    await expect(incidents.getByRole("row").nth(0)).toContainText("Joan Vila");
    await expect(incidents.getByRole("row").nth(0)).toContainText("sense compte bancari informat");
    await expect(incidents.getByRole("row").nth(1)).toContainText("Pau Riera");
    await expect(incidents.getByRole("row").nth(1)).toContainText("sense tarifa assignada");
    await expect(incidents.getByRole("link", { name: "Obre fitxa de Joan Vila" })).toHaveText(
      "Obre fitxa",
    );
    await expect(
      simulation.getByText("Els abonats amb incidència s'ometen de la generació."),
    ).toBeVisible();
    await expect(
      simulation.getByRole("heading", { name: "Actius amb pagament en efectiu" }),
    ).toBeVisible();
    await expect(cash.getByRole("row")).toHaveText([
      /^Joan Vila\s*data de baixa prevista: 31\/12\/2026\s*Obre fitxa$/u,
      /^Roser Camps\s*data de baixa prevista: 30\/06\/2027\s*Obre fitxa$/u,
    ]);

    await expect(page.locator(".billing-kpi")).toHaveText([
      /^168\s*Rebuts del mes\s*simulats el 25\/08$/u,
      /^6\.480\s€\s*Import de la remesa\s*data de cobrament: 01\/09\s*Remeses ›$/u,
      /^4\s*En efectiu\s*pendents de marcar cobrat$/u,
      /^2\s*Quota d'inactivitat\s*20\s€ el 1r mes · 10\s€\/mes$/u,
    ]);

    await expect(chips(page).getByRole("button")).toHaveText([
      "Tots (168)",
      "Pendents (4)",
      "Remesats (162)",
      "Cobrats",
      "Impagats (2)",
    ]);
    await expect(chips(page).getByRole("button", { name: "Tots (168)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Marcar cobrat (selecció)" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Exporta per a comptabilitat" })).toBeEnabled();

    // The mockup's rows: frozen concepts, amounts, methods and the D6 status wordings.
    const laura = invoiceRow(page, "2026-0912");
    for (const text of [
      "Laura Serra",
      "Quota Abonat 2 gossos — Setembre 2026",
      "90,00 €",
      "Domiciliació",
      "remesat",
    ]) {
      await expect(laura).toContainText(text);
    }
    await expect(invoiceRow(page, "2026-0913")).toContainText("Marc Prats");
    await expect(invoiceRow(page, "2026-0914")).toContainText("Quota inactivitat — Setembre 2026");
    await expect(invoiceRow(page, "2026-0914")).toContainText("10,00 €");
    const joan = invoiceRow(page, "2026-0915");
    for (const text of ["Joan Vila", "60,00 €", "Efectiu", "pendent · marca cobrat"]) {
      await expect(joan).toContainText(text);
    }

    await expectIconsPainted(page.locator("main"));
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D6-facturacio-1280.png"),
    });
  });

  test("T-12-25 the strong confirmation: the next month is simulated, then «Es generaran 168 rebuts…» generates it", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await openMonth(page, "2026-09", "Setembre 2026");
    await page.getByRole("button", { name: "Mes següent" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Octubre 2026" })).toBeVisible();
    await expect(page).toHaveURL(/[?&]mes=2026-10(&|$)/u);
    await expect(
      page.getByRole("heading", { name: "Encara no hi ha cap simulació d'aquest mes" }),
    ).toBeVisible();
    const generate = page.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" });
    await expect(generate).toBeDisabled();
    await expect(page.getByRole("button", { name: "Retrocedeix la remesa" })).toHaveCount(0);

    const simulated = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/billing/simulations"),
    );
    await page.getByRole("button", { name: "1 · SIMULA EL MES" }).first().click();
    expect((await simulated).postDataJSON()).toEqual({ period: "2026-10" });
    await expect(page.getByText("Mes simulat.")).toBeVisible();
    await expect(page.getByText("sense compte bancari informat")).toBeVisible();
    await expect(generate).toBeEnabled();

    await generate.click();
    const dialog = page.getByRole("dialog", { name: "Genera els rebuts · Octubre 2026" });
    await expect(dialog).toContainText(
      "Es generaran 168 rebuts per un total de 6.480,00 €. La data del proper rebut dels abonats avançarà al dia 1 de novembre.",
    );
    await expect(dialog.getByRole("button", { exact: true, name: "Cancel·la" })).toBeEnabled();
    await expectIconsPainted(dialog);
    await page.screenshot({
      path: resolve(evidenceDirectory, "D6-facturacio-confirmacio-1280.png"),
    });

    const generated = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/billing/runs"),
    );
    await dialog.getByRole("button", { exact: true, name: "Genera" }).click();
    const runRequest = await generated;
    expect(runRequest.postDataJSON()).toEqual({
      period: "2026-10",
      simulationId: expect.any(String),
    });
    expect(runRequest.headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(page.getByText("168 rebuts generats")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(generate).toBeDisabled();
    await expect(page.getByRole("button", { name: "Retrocedeix la remesa" })).toBeVisible();
  });

  test("T-12-25 the rollback stays disabled until «RETROCEDIR» is typed, then the month's 168 receipts are cancelled", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await openMonth(page, "2026-09", "Setembre 2026");
    await expect(invoiceRow(page, "2026-0912")).toBeVisible();
    await page.getByRole("button", { name: "Retrocedeix la remesa" }).click();
    const dialog = page.getByRole("dialog", { name: "Retrocedeix la remesa · Setembre 2026" });
    await expect(dialog.getByText("s'anul·laran 168 rebuts;")).toBeVisible();
    const confirm = dialog.getByRole("button", { exact: true, name: "Retrocedeix" });
    const keyword = dialog.getByLabel("Escriu RETROCEDIR per confirmar-ho");
    await expect(confirm).toBeDisabled();
    await keyword.fill("retrocedir");
    await expect(confirm).toBeDisabled();
    await keyword.fill("RETROCEDI");
    await expect(confirm).toBeDisabled();
    await keyword.fill("RETROCEDIR");
    await dialog.getByLabel("Motiu").fill("Preu de la quota equivocat");
    await expect(confirm).toBeEnabled();
    await expectIconsPainted(dialog);
    await page.screenshot({ path: resolve(evidenceDirectory, "D6-facturacio-retroces-1280.png") });

    const rolledBack = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/rollback"),
    );
    await confirm.click();
    expect((await rolledBack).postDataJSON()).toEqual({
      confirmation: "RETROCEDIR",
      reason: "Preu de la quota equivocat",
    });
    await expect(page.getByText("168 rebuts anul·lats")).toBeVisible();
    await expect(chips(page).getByRole("button", { name: "Tots (0)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retrocedeix la remesa" })).toHaveCount(0);
  });

  test("T-12-25 the receipt drawer of a pending cash receipt (2026-0915) offers «Marca cobrat», «Anul·la el rebut» and the PDF", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await openMonth(page, "2026-09", "Setembre 2026");
    await page.getByRole("button", { name: "Obre el rebut 2026-0915" }).click();
    const drawer = page.getByRole("dialog", { name: "Rebut 2026-0915" });
    await expect(drawer.getByText("Quota Abonat — Setembre 2026")).toBeVisible();
    await expect(drawer).toContainText("Joan Vila");
    await expect(
      drawer.getByRole("group", { name: "Accions del rebut" }).getByRole("button"),
    ).toHaveText(["Marca cobrat", "Anul·la el rebut", "Descarrega el justificant"]);
    // R-12-10: an issued receipt has no edit affordance.
    await expect(drawer.getByRole("button", { name: /^Edita/u })).toHaveCount(0);
    await expectIconsPainted(drawer);
    await page.screenshot({
      path: resolve(evidenceDirectory, "D6-facturacio-calaix-rebut-1280.png"),
    });
  });

  test("T-12-32 billingManualOnly: a cash-only club reads «2 · GENERA ELS REBUTS» on its simulated September", async ({
    page,
  }) => {
    await signIn(page, "billingManualOnly");
    await openMonth(page, "2026-09", "Setembre 2026");
    const generate = page.getByRole("button", { name: "2 · GENERA ELS REBUTS" });
    await expect(generate).toBeEnabled();
    await expect(page.getByRole("button", { name: "2 · GENERA REMESA SEPA (XML)" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "COBRA LES TARGETES" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retrocedeix la remesa" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Pas 1 — Simulació: incidències primer" }),
    ).toBeVisible();
    await expect(chips(page).getByRole("button", { name: "Tots (0)" })).toBeVisible();
    await expectIconsPainted(page.locator("main"));
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D6-facturacio-manual-only-1280.png"),
    });
  });

  test("T-12-32 billingStripe: «… I COBRA LES TARGETES», the card KPI, [COBRA LES TARGETES] → «163 cobraments enviats» and the declined card «impagat (targeta)»", async ({
    page,
  }) => {
    await signIn(page, "billingStripe");
    await openMonth(page, "2026-09", "Setembre 2026");
    await expect(
      page.getByRole("button", { name: "2 · GENERA ELS REBUTS I COBRA LES TARGETES" }),
    ).toBeDisabled();
    await expect(page.locator(".billing-kpi").filter({ hasText: "Amb targeta" })).toHaveText(
      /^164\s*Amb targeta\s*6\.240,00\s€$/u,
    );
    await expect(invoiceRow(page, "2026-0912")).toContainText("Targeta");

    await page.getByRole("button", { exact: true, name: "COBRA LES TARGETES" }).click();
    const dialog = page.getByRole("dialog", { name: "Cobra les targetes" });
    await expect(dialog).toContainText(
      "Es cobraran 164 rebuts amb targeta per un total de 6.240,00 €.",
    );
    const charged = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/card-charges"),
    );
    await dialog.getByRole("button", { exact: true, name: "Cobra" }).click();
    expect((await charged).headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(page.getByText("163 cobraments enviats")).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "COBRA LES TARGETES" })).toHaveCount(
      0,
    );
    // R-12-13: the run is read every 5 s while CHARGING; once settled, the month and the list are
    // read again and Laura's declined card reads «impagat (targeta)».
    await expect(invoiceRow(page, "2026-0912")).toContainText("impagat (targeta)", {
      timeout: 20_000,
    });
    await expect(page.getByText("Cobrant les targetes…")).toHaveCount(0);
  });

  test("T-12-25 /facturacio/remeses: the statuses, the XML through the signed URL and «Marca com a enviada al banc»", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.goto(`${baseUrl}/facturacio/remeses`);
    await expect(page.getByRole("heading", { level: 1, name: "Remeses" })).toBeVisible();
    const generated = page.locator('tr[data-remittance-status="GENERATED"]');
    const submitted = page.locator('tr[data-remittance-status="SUBMITTED"]');
    const rolledBack = page.locator('tr[data-remittance-status="ROLLED_BACK"]');
    await expect(generated).toHaveCount(1);
    await expect(generated).toContainText("Setembre 2026");
    await expect(generated.locator(".ah-badge")).toHaveText("generada");
    await expect(submitted).toContainText("Agost 2026");
    await expect(submitted.locator(".ah-badge")).toHaveText("enviada al banc");
    await expect(rolledBack).toContainText("Agost 2026");
    await expect(rolledBack.locator(".ah-badge")).toHaveText("retrocedida");
    // A rolled-back remittance is read-only: never «Marca com a enviada al banc».
    await expect(
      rolledBack.getByRole("button", { name: "Marca com a enviada al banc" }),
    ).toHaveCount(0);
    await expect(
      submitted.getByRole("button", { name: "Marca com a enviada al banc" }),
    ).toHaveCount(0);
    await expect(rolledBack.getByRole("button", { name: "Descarrega l'XML" })).toBeVisible();
    await expectIconsPainted(page.locator("main"));
    await page.screenshot({ fullPage: true, path: resolve(evidenceDirectory, "remeses-1280.png") });

    // [Marca com a enviada al banc] (R-12-15): the rollback becomes impossible.
    await generated.getByRole("button", { name: "Marca com a enviada al banc" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Marca com a enviada al banc · Setembre 2026",
    });
    await expect(dialog).toContainText(
      "La remesa quedarà marcada com a enviada al banc. A partir d'aquí ja no es podrà retrocedir.",
    );
    const submission = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/submission"),
    );
    await dialog.getByRole("button", { exact: true, name: "Marca com a enviada" }).click();
    expect((await submission).postDataJSON()).toEqual({ submittedAt: "2026-08-26" });
    await expect(page.getByText("Remesa marcada com a enviada al banc.")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(generated).toHaveCount(0);
    await expect(submitted).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Marca com a enviada al banc" })).toHaveCount(0);

    // [Descarrega l'XML] of September: `GET /remittances/{id}/file` answers a signed URL; its
    // download carries the file name (`Content-Disposition`), never rendered nor parsed here. Last
    // step on purpose: a cross-origin link is a navigation (the `download` attribute is ignored),
    // its `beforeunload` tells the MSW worker the client closed, and no later api call is mocked.
    const september = submitted.filter({ hasText: "Setembre 2026" });
    const signedUrls: string[] = [];
    await page.route("https://files.example.test/**", async (route) => {
      const url = new URL(route.request().url());
      signedUrls.push(url.href);
      const fileName = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      await route.fulfill({
        body: '<?xml version="1.0" encoding="UTF-8"?><Document/>',
        headers: {
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Type": "application/xml",
        },
        status: 200,
      });
    });
    const fileRequest = page.waitForRequest(
      (request) => request.method() === "GET" && /\/remittances\/[^/]+\/file$/u.test(request.url()),
    );
    const download = page.waitForEvent("download");
    await september.getByRole("button", { name: "Descarrega l'XML" }).click();
    const remittanceId = /\/remittances\/([^/]+)\/file$/u.exec((await fileRequest).url())?.[1];
    const saved = await download;
    expect(remittanceId).toBeDefined();
    expect(signedUrls).toHaveLength(1);
    const signed = new URL(signedUrls[0] ?? "");
    expect(signed.pathname).toMatch(
      new RegExp(`^/remittances/${remittanceId ?? ""}/[^/]+\\.xml$`, "u"),
    );
    expect(saved.suggestedFilename()).toBe(signed.pathname.split("/").at(-1));
    // The api's attachment name (snapshot b67a07b).
    expect(saved.suggestedFilename()).toBe("remesa-2026-09.xml");
    // The page stays: the file is a download, never a navigation away from the list.
    await expect(page).toHaveURL(/\/facturacio\/remeses/u);
    await expect(september).toBeVisible();
  });
});
