import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E11-W01");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

async function login(page: Page): Promise<void> {
  await page.addInitScript(
    ({ cachedBranding }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "memberLeft");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test("T-14-17 D10's «Descarrega les dades (RGPD)» queues the package and downloads its ZIP from the exports drawer", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await login(page);
  await page.goto(`${baseUrl}/abonats/member-laura`);
  const queued = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/members/member-laura/data-export",
  );
  await page.getByRole("button", { name: "Descarrega les dades (RGPD)" }).click();
  const answer = await queued;
  expect(answer.status()).toBe(202);
  expect(answer.request().postDataJSON()).toEqual({ deliverToMember: false });
  const exportsDrawer = page.getByRole("dialog", { name: "Exportacions" });
  await expect(exportsDrawer).toContainText("Preparant l'exportació…");
  const readyDownload = exportsDrawer.getByRole("button", {
    name: "Descarrega dades-personals_20261018-1100.zip",
  });
  await expect(readyDownload).toBeVisible();
  const zip = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /\/api\/v1\/exports\/[0-9a-f-]+\/download$/u.test(new URL(response.url()).pathname),
  );
  const download = page.waitForEvent("download");
  await readyDownload.click();
  const file = await zip;
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toContain("application/zip");
  expect((await download).suggestedFilename()).toBe("dades-personals_20261018-1100.zip");
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "D10-paquet-rgpd-mock-1280.png"),
  });
});

test("T-14-18/R-14-18 D10 renders consents and schedules then cancels erasure", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await login(page);
  await page.goto(`${baseUrl}/abonats/member-laura`);
  await expect(page.getByRole("heading", { name: "Historial de consentiments" })).toBeVisible();
  await expect(page.getByText("Política de privacitat")).toBeVisible();
  await expect(page.getByText("Drets d'imatge")).toBeVisible();

  await page.getByRole("button", { name: "Suprimeix les dades (RGPD)" }).click();
  const requestDialog = page.getByRole("dialog", { name: "Suprimeix les dades (RGPD)" });
  const request = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/members/member-laura/erasure",
  );
  await requestDialog.getByRole("button", { name: "PROGRAMA LA SUPRESSIÓ" }).click();
  expect((await request).status()).toBe(201);
  await expect(page.getByText(/Supressió programada per al/u)).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: resolve(evidenceDirectory, "D10-supressio-programada-mock-1280.png"),
  });

  await page.getByRole("button", { name: "Anul·la la supressió" }).click();
  const cancellation = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      new URL(response.url()).pathname === "/api/v1/members/member-laura/erasure",
  );
  await page
    .getByRole("dialog", { name: "Anul·la la supressió" })
    .getByRole("button", { name: "ANUL·LA LA SUPRESSIÓ" })
    .click();
  expect((await cancellation).status()).toBe(204);
  await expect(page.getByText("La sol·licitud s'ha anul·lat.")).toBeVisible();
});
