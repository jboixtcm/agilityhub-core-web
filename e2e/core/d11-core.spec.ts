import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Page } from "@playwright/test";

import { expect, test } from "./oauth-token-log";

// E4-W06 step 4: D11 against the published core shows no raw i18n keys. The run also records what
// the core sends for every parameter row (block, key, module), the source of the D11 labels.

const adminUrl = "http://127.0.0.1:4174";
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E4-W06");

mkdirSync(evidenceDirectory, { recursive: true });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto(`${adminUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) {
    await reveal.click();
  }
  await page.getByLabel("Contrasenya").fill(corePassword);
  const token = page.waitForResponse(
    (response) =>
      response.url().endsWith("/oauth2/token") &&
      response.request().method() === "POST" &&
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "password",
  );
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click({ noWaitAfter: true });
  expect((await token).status()).toBe(200);
  await page.waitForURL("**/tauler");
  await expect(page.locator(".admin-shell")).toBeVisible();
}

async function navigateSpa(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState(null, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path}$`, "u"));
}

interface CoreParameterBlock {
  key: string;
  rows: { block: string; editableBy: string; key: string; module?: string | null }[];
  title: string;
}

test("T-02-13 E4-W06 D11 on the published core names every block and parameter (no raw keys)", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  const page = await context.newPage();
  await loginAdmin(page);
  const parameters = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/parameters" &&
      response.request().method() === "GET",
  );
  await navigateSpa(page, "/parametres");
  const response = await parameters;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { blocks: CoreParameterBlock[] };
  // Only the catalog structure (no values): what the D11 labels and the i18n check rely on.
  writeFileSync(
    join(evidenceDirectory, "d11-core-parameter-blocks.json"),
    `${JSON.stringify(
      body.blocks.map((block) => ({
        key: block.key,
        rows: block.rows.map((row) => ({
          editableBy: row.editableBy,
          key: row.key,
          module: row.module ?? null,
        })),
        title: block.title,
      })),
      null,
      2,
    )}\n`,
  );
  await expect(page.getByRole("heading", { name: "Paràmetres" })).toBeVisible();
  // The loading card is a `.settings-card` too: wait for the parameter rows themselves.
  await expect(page.locator(".settings-grid .settings-parameter").first()).toBeVisible();

  // `textContent`, not `innerText`: the card titles are upper-cased by CSS, the check reads the
  // strings themselves (a raw block title is «admin-settings:block.x.title»).
  const texts = await page
    .locator(".settings-grid h2, .settings-grid .settings-parameter__main span")
    .allTextContents();
  const raw = texts
    .map((line) => line.trim())
    .filter((line) => /admin-settings:|^param\.|\bparam\.[a-z]+\.[a-z.]+/iu.test(line));
  // The card titles and the rows were read (not an empty page).
  expect(texts.length).toBeGreaterThan(50);
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({
    fullPage: true,
    path: join(evidenceDirectory, "D11-parametres-core-1280.png"),
  });
  expect(raw).toEqual([]);
  await context.close();
});
