import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Locator, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W03");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
const riskText =
  "Aquesta classe només té un alumne: si ningú més s'hi apunta abans de les 7:30 de dimarts, s'anul·larà.";

async function prepareScenario(page: Page, scenario: string) {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
}

async function login(page: Page, scenario: string, landing: string) {
  await prepareScenario(page, scenario);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL(`**${landing}`);
}

/** The words of the cell lines drawn over more than one line: a break inside the word. */
async function brokenWords(grid: Locator): Promise<string[]> {
  return grid
    .locator(".ah-schedule-cell__title, .ah-schedule-cell__subtitle")
    .evaluateAll((lines) =>
      lines.flatMap((line) => {
        const broken: string[] = [];
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          for (const match of (node.textContent ?? "").matchAll(/\S+/gu)) {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
            if (tops.size > 1) broken.push(match[0]);
          }
        }
        return broken;
      }),
    );
}

async function expectIdenticalColumns(grid: Locator) {
  const headers = grid.getByRole("columnheader");
  const widths: number[] = [];
  for (let index = 1; index < (await headers.count()); index += 1) {
    const box = await headers.nth(index).boundingBox();
    widths.push(Math.round(box?.width ?? 0));
  }
  expect(widths).toHaveLength(5);
  expect(new Set(widths).size).toBe(1);
}

test.describe("T-06-29 screen 10 «Classes del dia» (/avui)", () => {
  test("member: mockup day with «Ocupada», identical columns and the risk balloon", async ({
    page,
  }) => {
    await login(page, "member", "/inici");
    await expect(page.getByRole("link", { name: "Avui" })).toHaveAttribute("href", "/avui");
    await page.goto(`${baseUrl}/avui?date=2026-08-04`);

    const grid = page.getByRole("table", { name: "Quadre del dia" });
    await expect(grid).toBeVisible();
    await expect(page.getByRole("heading", { name: "Classes del dia" })).toBeVisible();
    await expect(page.getByText("dt 4 d’agost")).toBeVisible();
    await expect(page.getByRole("button", { name: "dt 4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("link", { name: "Avui" })).toHaveAttribute("aria-current", "page");
    await expectIdenticalColumns(grid);
    await expect(grid.getByText("Ocupada")).toHaveCount(3);
    await expect(grid.getByText(/\d+\/\d+/u)).toHaveCount(0);
    await expect(
      page.getByText("Ocupada = pista reservada per a entrenament o bloquejada"),
    ).toBeVisible();

    await grid.getByRole("button", { name: /D i sup\./u }).click();
    await expect(page.getByRole("status").filter({ hasText: riskText })).toBeVisible();
    await page.screenshot({ fullPage: true, path: resolve(evidenceDirectory, "10-avui-375.png") });

    await page.getByRole("heading", { name: "Classes del dia" }).click();
    await expect(page.getByText(riskText)).toHaveCount(0);
  });

  test("member: empty day «Cap classe aquest dia»", async ({ page }) => {
    await login(page, "dayGridEmpty", "/inici");
    await page.goto(`${baseUrl}/avui?date=2026-08-04`);

    await expect(page.getByText("Cap classe aquest dia")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "10-avui-buit-375.png"),
    });
  });

  test("impersonated: the banner stays and only the member view is requested", async ({ page }) => {
    await prepareScenario(page, "impersonated");
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/day-grid")) requests.push(request.url());
    });
    await page.goto(`${baseUrl}/avui?date=2026-08-04#impersonation=mock-impersonation-token`);

    await expect(page.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    const grid = page.getByRole("table", { name: "Quadre del dia" });
    await expect(grid.getByText("C i sup.")).toBeVisible();
    await expect(grid.getByText(/\d+\/\d+/u)).toHaveCount(0);
    expect(requests.every((url) => url.includes("view=member"))).toBe(true);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "10-avui-impersonat-375.png"),
    });
  });
});

test.describe("T-06-29 screen 23 «Visió global» (/instructor/avui)", () => {
  test("instructor: n/n +e, training names, block, class drawer", async ({ page }) => {
    await login(page, "instructor", "/instructor/avui");
    await expect(page.getByRole("link", { name: "Visió global" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goto(`${baseUrl}/instructor/avui?date=2026-08-03`);

    const grid = page.getByRole("table", { name: "Quadre del dia" });
    await expect(page.getByRole("heading", { name: "Visió global" })).toBeVisible();
    await expect(grid.getByText("5/5 +2 · Marc")).toBeVisible();
    for (const names of ["Pau + Blat", "Júlia + Kira", "Sergio + Thai"]) {
      await expect(grid.getByText(names)).toBeVisible();
    }
    await expect(grid.getByText("Bloq.")).toBeVisible();
    await expectIdenticalColumns(grid);
    await expect(
      page.getByText(
        "n/n +e = inscrits/places + llista d'espera · l'instructor previst es mostra sempre",
      ),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "23-visio-global-375.png"),
    });

    await grid.getByRole("button", { name: /B\+C/u }).click();
    const drawer = page.getByRole("dialog", { name: "B+C" });
    await expect(drawer.getByText("dl 3 d’agost · 18:50–19:50")).toBeVisible();
    await expect(drawer.getByText("5/5 +2")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "23-visio-global-classe-375.png"),
    });
    await drawer.getByRole("button", { name: "Tanca" }).click();

    await grid.getByRole("button", { name: /Bloq\./u }).click();
    const blockDrawer = page.getByRole("dialog", { name: "Bloqueig de pista" });
    await expect(blockDrawer.getByText("Carretera · 16:00–18:00")).toBeVisible();
    const cancellation = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().includes("/cancellation"),
    );
    await blockDrawer.getByRole("button", { name: "Anul·la el bloqueig" }).click();
    expect((await cancellation).postDataJSON()).toEqual({});
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(grid.getByText("Bloq.")).toHaveCount(0);
  });
});

test.describe("T-06-29 E4-W14 screen 23's class drawer names its instructors", () => {
  const drawerEvidence = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W14");

  test.beforeAll(() => {
    mkdirSync(drawerEvidence, { recursive: true });
  });

  test("the «Instructor» row follows the count of instructorNames, the names as a list", async ({
    page,
  }) => {
    await login(page, "instructor", "/instructor/avui");
    await page.goto(`${baseUrl}/instructor/avui?date=2026-08-03`);
    const grid = page.getByRole("table", { name: "Quadre del dia" });
    await grid.getByRole("button", { name: /B\+C/u }).click();
    const drawer = page.getByRole("dialog", { name: "B+C" });
    await expect(drawer.getByText("dl 3 d’agost · 18:50–19:50")).toBeVisible();
    // One instructor in the mock class: the singular label.
    const term = drawer.getByRole("term").filter({ hasText: /^Instructors?$/u });
    await expect(term).toHaveText("Instructor");
    await expect(term.locator("xpath=following-sibling::dd[1]")).toHaveText("Marc");
    await page.screenshot({
      fullPage: true,
      path: resolve(drawerEvidence, "23-calaix-instructor-375.png"),
    });
  });
});

test.describe("E4-W12 step 7 the 375 px cells of 10 and 23", () => {
  const stepEvidence = resolve(import.meta.dirname, "../../../roadmap/evidence/E4-W12");

  test("member: «Ocupada · manteniment» wraps between words or ends with an ellipsis, never inside a word", async ({
    page,
  }) => {
    await login(page, "member", "/inici");
    await page.goto(`${baseUrl}/avui?date=2026-08-04`);
    const grid = page.getByRole("table", { name: "Quadre del dia" });
    await expect(grid.getByText("Ocupada").first()).toBeVisible();
    expect(await brokenWords(grid)).toEqual([]);
    await page.screenshot({ fullPage: true, path: resolve(stepEvidence, "10-avui-cells-375.png") });
  });

  test("instructor: «Bloq.» and its reason wrap between words or end with an ellipsis, never inside a word", async ({
    page,
  }) => {
    await login(page, "instructor", "/instructor/avui");
    await page.goto(`${baseUrl}/instructor/avui?date=2026-08-03`);
    const grid = page.getByRole("table", { name: "Quadre del dia" });
    await expect(grid.getByText("Bloq.")).toBeVisible();
    expect(await brokenWords(grid)).toEqual([]);
    await page.screenshot({
      fullPage: true,
      path: resolve(stepEvidence, "23-visio-global-cells-375.png"),
    });
  });
});
