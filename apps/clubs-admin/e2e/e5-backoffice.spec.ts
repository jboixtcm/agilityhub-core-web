import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
// E5-W05 round 2 (review #10): the captures go to this spec's own task (E5-W03) unless the run names
// another one (`E2E_CAPTURE_TASK`, `pnpm e2e:docker <ID> --capture-task=<ID>`), as E5-W05 does to
// refresh E5-W03's captures (registrants, register, D10, D11, D1) in its own folder: a later
// complete run never rewrites them.
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  captureTask === "" ? "E5-W03" : captureTask,
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
// D4's mockup day (Wednesday 12 August 2026), the S15 §6 example day (Monday 10 at 8:12, after the
// 7:30 review) and the S09 world's week (Monday 3 at 7:10).
const calendarNow = new Date("2026-08-12T10:00:00+02:00");
const jobsNow = new Date("2026-08-10T08:12:00+02:00");
const trainingNow = new Date("2026-08-03T07:10:00+02:00");

test.use({ viewport: { height: 900, width: 1280 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page, scenario: "admin" | "instructor", now: Date) {
  await page.clock.setFixedTime(now);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(`${scenario}@example.test`);
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
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

test.describe("E5-W03 D4 · the registrants of the selected class (S08 §6, R-08-16)", () => {
  test("an ADMIN sees who is booked and who waits, and removes a waiting entry", async ({
    page,
  }) => {
    await signIn(page, "admin", calendarNow);
    await page.goto(`${baseUrl}/calendari`);
    await page.getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/5 \+2/u }).click();
    const card = page.getByRole("region", { name: /^Classe seleccionada/u });
    const panel = card.getByRole("region", { name: "Inscrits (4/5)" });
    // E5-W05 steps 1 and 2: the level chip (levelCode, round 2 #3: Duna's own «C»), the
    // displayState chip and «{guia} + {gos}». Round 3 #4: «B+C» lists B and C dogs only (R-08-04).
    // E7-W07 step 5: no dog over its week's limit (R-08-03): Duna, Mixa, Kai, Coco and Rumba's
    // late cancellation, since Nass, Fish and Blat have had their two classes of the week.
    await expect(panel.getByRole("listitem").first()).toHaveText("Laura + DunaCconfirmada");
    await expect(panel.locator(".ah-registrants__level")).toHaveText(["C", "C", "B", "C", "B"]);
    await expect(panel.getByText("Jana + Mixa")).toBeVisible();
    await expect(panel.getByText("Joel + Rumba")).toBeVisible();
    await expect(panel.getByText("En espera: Júlia + Kira · Roser + Lluna")).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await expectIconsPainted(card);
    await card.screenshot({ path: resolve(evidenceDirectory, "D4-inscrits-1280.png") });

    const removal = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().includes("/waitlist-entries/"),
    );
    await panel.getByRole("button", { name: "Treu Júlia + Kira de la llista d'espera" }).click();
    const dialog = page.getByRole("dialog", { name: "Treure de la llista d'espera" });
    await dialog.getByRole("button", { name: "Treu de la llista" }).click();
    expect((await removal).url()).toMatch(
      /\/waitlist-entries\/wl-cls-2026-08-12-1850-0-0\/cancellation$/u,
    );
    await expect(panel.getByText("En espera: Roser + Lluna")).toBeVisible();
    // The calendar reads the class's counters again (R-08-02: the api counts).
    await expect(
      page.getByRole("button", { name: /^dc 12 18:50 · B\+C · 4\/5 \+1/u }),
    ).toBeVisible();
  });

  test("an INSTRUCTOR reads the same panel without actions (A22 c)", async ({ page }) => {
    await signIn(page, "instructor", calendarNow);
    await page.goto(`${baseUrl}/calendari`);
    await page.getByRole("button", { name: /^dc 12 18:50 · B\+C/u }).click();
    const panel = page.getByRole("region", { name: "Inscrits (4/5)" });
    await expect(panel.getByText("En espera: Júlia + Kira · Roser + Lluna")).toBeVisible();
    await expect(panel.getByRole("button")).toHaveCount(0);
  });
});

test.describe("E5-W03 «Entrenaments» · the ring-usage register (S09 §2, §13-8, no mockup)", () => {
  test("an ADMIN lists the week's training bookings and the ring blocks, exports and cancels a block", async ({
    page,
  }) => {
    await signIn(page, "admin", trainingNow);
    await page.getByRole("link", { exact: true, name: "Entrenaments" }).click();
    await page.waitForURL("**/entrenaments");
    await expect(page.getByRole("heading", { level: 1, name: "Entrenaments" })).toBeVisible();
    const bookings = page.getByRole("region", { name: "Reserves d'entrenament" });
    await expect(bookings.getByRole("row").filter({ hasText: "Rock" }).first()).toBeVisible();
    // E5-W05 step 3: the slot's end (endsAtLocal) and «{nom complet} · {número}» (memberNumber).
    await expect(
      bookings
        .getByRole("row")
        .filter({ hasText: "dl 3 · 7:00–7:30" })
        .filter({ hasText: "Laura Serra Vidal · 87" }),
    ).toBeVisible();
    await expect(page.getByText("Excel · PDF")).toBeVisible();
    await expectIconsPainted(page.locator("main"));
    await page.screenshot({ path: resolve(evidenceDirectory, "entrenaments-registre-1280.png") });

    const exported = page.waitForRequest((request) =>
      request.url().includes("/training-bookings/export"),
    );
    await page.getByText("Excel · PDF").click();
    await page.getByRole("button", { exact: true, name: "Excel" }).click();
    expect(new URL((await exported).url()).searchParams.get("format")).toBe("xlsx");

    await page.getByRole("tab", { name: "Bloquejos i reserves de pista" }).click();
    const blocks = page.getByRole("region", { name: "Bloquejos i reserves de pista" });
    const maintenance = blocks.getByRole("row").filter({ hasText: "Reg de la sorra" });
    await expect(maintenance).toBeVisible();
    await expect(
      blocks.getByRole("row").filter({ hasText: "Taller d'iniciació" }).getByRole("button"),
    ).toHaveCount(0);
    await expectIconsPainted(page.locator("main"));
    await page.screenshot({ path: resolve(evidenceDirectory, "entrenaments-bloquejos-1280.png") });
    await maintenance.getByRole("button", { name: /Anul·la el bloqueig/u }).click();
    await expect(page.getByText("Bloqueig anul·lat.")).toBeVisible();
    await expect(maintenance.getByRole("button")).toHaveCount(0);
  });

  test("an INSTRUCTOR reads the register without exports nor block actions", async ({ page }) => {
    await signIn(page, "instructor", trainingNow);
    await page.goto(`${baseUrl}/entrenaments`);
    await expect(
      page.getByRole("region", { name: "Reserves d'entrenament" }).getByRole("row").nth(1),
    ).toBeVisible();
    await expect(page.getByText("Excel · PDF")).toHaveCount(0);
    await page.getByRole("tab", { name: "Bloquejos i reserves de pista" }).click();
    await expect(page.getByText("Reg de la sorra")).toBeVisible();
    await expect(page.getByRole("button", { name: /Anul·la el bloqueig/u })).toHaveCount(0);
  });
});

test.describe("E5-W03 D10 · «Reserves» of the member (S08 §2, R-08-19)", () => {
  test("shows the class and training bookings, read-only", async ({ page }) => {
    await signIn(page, "admin", jobsNow);
    await page.goto(`${baseUrl}/abonats/member-laura`);
    const card = page.getByRole("region", { name: "Reserves" });
    await expect(
      card.getByRole("table", { name: "Classes" }).getByRole("row").nth(1),
    ).toBeVisible();
    // E5-W05 step 4: each class booking names its class and its ring (E5-T29).
    await expect(
      card.getByRole("table", { name: "Classes" }).getByRole("columnheader", { name: "Classe" }),
    ).toBeVisible();
    await expect(
      card.getByRole("table", { name: "Entrenaments" }).getByText("Muntanya").first(),
    ).toBeVisible();
    await expect(
      card.getByText("Per reservar o anul·lar en nom seu, fes servir «Entra com l'abonat»."),
    ).toBeVisible();
    // E7-W07 step 5 (R-08-03, R-08-19): in the booking week of Sunday 9 at 20:00 Duna holds two
    // classes, Monday's and Wednesday's 18:50 «B+C», never more than the week's limit.
    await expect(
      card
        .getByRole("table", { name: "Classes" })
        .getByRole("row")
        .filter({ hasText: /^(dl 10|dt 11|dc 12|dj 13|dv 14|ds 15)\/08/u })
        .filter({ hasText: "Duna" }),
    ).toHaveCount(2);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: resolve(evidenceDirectory, "D10-reserves-1280.png") });
  });
});

test.describe("E5-W03 D11 · «Processos automàtics» (S15 §2, no mockup)", () => {
  test("T-15-32 lists the processes and simulates, runs and switches one", async ({ page }) => {
    await signIn(page, "admin", jobsNow);
    await page.goto(`${baseUrl}/parametres#processos`);
    const card = page.getByRole("region", { name: "Processos automàtics" });
    // The Cànic under `waitlist.mode = ALL_AT_ONCE`: no `waitlist-fifo` nor `payment-timeouts`
    // (S15 §6, E7-W03 round 2 #6).
    await expect(card.getByRole("listitem")).toHaveCount(8);
    await expect(card.getByText("Llista d'espera (FIFO)")).toHaveCount(0);
    await expect(card.getByText("cada dia a les 7:30")).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await expectIconsPainted(card);
    await card.screenshot({ path: resolve(evidenceDirectory, "D11-processos-1280.png") });

    await card.getByRole("button", { name: "Simula Revisió de classes en risc" }).click();
    const plan = page.getByRole("dialog", {
      name: "Simulació: què faria ara · Revisió de classes en risc",
    });
    await expect(plan.getByText("Simulació: no s'ha aplicat cap canvi.")).toBeVisible();
    await expect(plan.getByRole("listitem")).toHaveCount(2);
    await expectIconsPainted(plan);
    await page.screenshot({ path: resolve(evidenceDirectory, "D11-simulacio-1280.png") });
    await plan.getByRole("button", { name: "Tanca" }).click();

    await card.getByRole("button", { name: "Executa ara Revisió de classes en risc" }).click();
    await page
      .getByRole("dialog", { name: "Executar «Revisió de classes en risc» ara" })
      .getByRole("button", { name: "Executa ara" })
      .click();
    await expect(
      card.getByText(
        "Revisió de classes en risc: correcta · 1 en risc · 1 anul·lada · 3 classes revisades",
      ),
    ).toBeVisible();

    const switched = page.waitForRequest((request) => request.method() === "PUT");
    await card.getByRole("switch", { name: "Recordatoris activat" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Desactiva" }).click();
    expect((await switched).postDataJSON()).toEqual({ enabled: false });
    await expect(card.getByRole("switch", { name: "Recordatoris activat" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});

test.describe("E5-W03 D1 · «Revisió de classes en risc» (S15 §6 form A)", () => {
  test("T-15-33 renders the four statuses and opens D4 on the class", async ({ page }) => {
    await signIn(page, "admin", jobsNow);
    const card = page.locator(".dashboard-risk");
    // E5-W05 round 3 #4: a D dog in «Nivell D» and an F one in «F i G» (S08 R-08-04), where mockup
    // D1 names Laura + Duna («C») and Pau + Blat («B»).
    await expect(card.getByText("anul·lada · avisada Clara + Trevi")).toBeVisible();
    await expect(card.getByText("en risc · avisats Dani + Rayo")).toBeVisible();
    await expect(card.getByText("s'anul·larà dc a les 7:30")).toBeVisible();
    await expectIconsPainted(card);
    await card.screenshot({ path: resolve(evidenceDirectory, "D1-risc-1280.png") });
    const row = card.getByRole("link", { name: "Cadells · dc 9:30 · Cadells" });
    await expect(row).toHaveAttribute(
      "href",
      "/calendari?classe=cls-2026-08-12-0930-0&estat=actives&setmana=2026-08-10",
    );
    await row.click();
    // The admin app navigates in place (`history.pushState`): D4 opens on the class's week with
    // that class selected (on the example day the calendar world holds the review's classes).
    await expect(page).toHaveURL(/\/calendari\?.*setmana=2026-08-10/u);
    const selected = page.getByRole("region", { name: /^Classe seleccionada/u });
    await expect(selected).toContainText("dc 12 · 9:30 · Cadells");

    // A class the review cancelled opens under «Anul·lades», selected too.
    await page.goto(`${baseUrl}/tauler`);
    await page
      .locator(".dashboard-risk")
      .getByRole("link", { name: "Nivell D · avui 17:40 · Petita" })
      .click();
    await expect(page.getByRole("button", { name: "Anul·lades" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(selected).toContainText("dl 10 · 17:40 · Nivell D");
    await expect(selected).toContainText("Clara + Trevi");
  });
});
