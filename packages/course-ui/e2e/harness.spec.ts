import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4177";
// The captures go to a task's evidence only when the run names it (`E2E_CAPTURE_TASK`,
// `pnpm e2e:docker <ID> --capture-task=<ID>`); any other run writes them to Playwright's output
// folder, so a later `pnpm e2e` never overwrites the evidence E9-W02 committed (E11-W02, INC-60).
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory =
  captureTask === ""
    ? undefined
    : resolve(import.meta.dirname, "../../../roadmap/evidence", captureTask);

test.beforeAll(() => {
  if (evidenceDirectory !== undefined) mkdirSync(evidenceDirectory, { recursive: true });
});

function capturePath(name: string): string {
  return evidenceDirectory === undefined
    ? test.info().outputPath(name)
    : resolve(evidenceDirectory, name);
}

type Rgb = [number, number, number];

function rgb(colour: string): Rgb {
  const channels = /rgba?\((\d+),\s*(\d+),\s*(\d+)/u.exec(colour);
  if (channels === null) throw new Error(`UNPARSED_COLOUR:${colour}`);
  return [Number(channels[1]), Number(channels[2]), Number(channels[3])];
}

function contrast(a: Rgb, b: Rgb): number {
  const luminance = ([r, g, bl]: Rgb) => {
    const linear = (channel: number) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(bl);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

async function textContrast(control: Locator): Promise<number> {
  const { background, colour } = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, colour: style.color };
  });
  return contrast(rgb(colour), rgb(background));
}

async function open(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`${baseUrl}/?theme=${theme}`);
  await expect(page.getByRole("img", { name: "Recorregut en 3D" }).locator("canvas")).toBeVisible();
  // The FBX models (tire, wall…) and the fonts have arrived.
  await page.waitForLoadState("networkidle");
}

test.describe("E9-W02 round 2: course-ui in a real browser (harness at 1280 px)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`T-16-04 primary controls read on the club's primary pair (${theme}) (E9-W02 round 2 #7)`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await open(page, theme);

      const nudge = page.getByRole("button", { name: "Mou amunt" });
      expect(await textContrast(nudge)).toBeGreaterThanOrEqual(4.5);
      const unit = page.getByRole("button", { name: "metres" });
      expect(await textContrast(unit)).toBeGreaterThanOrEqual(4.5);

      await page.screenshot({
        fullPage: true,
        path: capturePath(`r2-course-ui-harness-1280-${theme}.png`),
      });
      expect(errors).toEqual([]);
    });
  }

  test("T-16-06 the marker diagram draws A at the Core (0, 0) corner (E9-W02 round 2 #6)", async ({
    page,
  }) => {
    await open(page, "light");
    const diagram = page.getByRole("img", { name: "Marcadors de la pista" });
    const markerA = diagram.locator("g", { has: page.locator("text", { hasText: /^A$/u }) });
    await expect(markerA.locator("circle").first()).toHaveAttribute("cx", "0");
    await expect(markerA.locator("circle").first()).toHaveAttribute("cy", "0");
  });

  // INC-60: what it checks is the 2D view; the 3D view's placement is viewers.test.tsx's.
  test("T-16-04 nudging the course moves the 2D view and changes the warnings", async ({
    page,
  }) => {
    await open(page, "light");
    const title = page.getByText(/^Avisos \(\d+\)$/u);
    const before = await title.textContent();
    const canvas2d = page.getByRole("img", { name: "Recorregut en 2D" });
    const firstIcon = canvas2d.locator("g[transform*='rotate(']").first();
    const transformBefore = await firstIcon.getAttribute("transform");

    await page.getByLabel("Pas").selectOption({ label: "1,00 m" });
    for (let step = 0; step < 3; step += 1) {
      await page.getByRole("button", { name: "Mou a la dreta" }).click();
    }

    await expect(title).not.toHaveText(before ?? "");
    expect(await firstIcon.getAttribute("transform")).not.toBe(transformBefore);
    await expect(page.getByText("Marge al perímetre").first()).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: capturePath("r2-course-ui-harness-1280-after-nudge.png"),
    });
  });
});
