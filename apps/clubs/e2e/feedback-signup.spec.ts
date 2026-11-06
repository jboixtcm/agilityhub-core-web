import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const base = "http://127.0.0.1:4173";
const evidence = resolve(import.meta.dirname, "../../../roadmap/evidence/feedback-20261106");
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

for (const width of [375, 1280]) {
  test(`November 6 independent payments and pending status at ${String(width)}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(
      ({ club }) => {
        localStorage.setItem("agilityhub.locale", "ca");
        localStorage.setItem("agilityhub.mockScenario", "signupStripe");
        localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(club));
        sessionStorage.setItem(
          "signup.draft.v1",
          JSON.stringify({
            mode: "public",
            savedAt: Date.now(),
            additionalDogOption: "TODAY",
            consentVersion: "",
            imageConsent: false,
            privacyAccepted: false,
            holderFromGroup: false,
            wantsFamilyGroup: false,
            familyFound: false,
            familyClaim: { dogName: "", holderName: "", leavePending: false },
            passport: "",
            person: {
              idDocument: { type: "DNI", value: "12345678Z" },
              firstName: "Nora",
              lastName1: "Example",
              lastName2: "",
              gender: "FEMALE",
              birthDate: "05/04/1992",
              emails: ["nora@example.test"],
              phones: [{ prefix: "+34", number: "612345678" }],
              address: { street: "Example Street", postalCode: "08349", town: "Example Town" },
            },
            dog: {
              name: "Kiwi",
              sex: "FEMALE",
              breed: "Example",
              chip: "941000012345678",
              birthDate: "17/03/2022",
              documents: [{ type: "VACCINATION_CARD", files: [] }],
            },
            planId: "10000000-0000-4000-8000-000000000001",
            payment: { type: "SEPA_DD", firstMonthOption: "TODAY" },
          }),
        );
      },
      { club: branding },
    );
    await page.goto(`${base}/apuntat-hi/pagament`);
    const monthly = page.getByRole("group", { name: "Pagament dels rebuts mensuals" });
    await expect(monthly.getByRole("button")).toHaveCount(2);
    await expect(monthly.getByRole("button", { name: "Targeta" })).toHaveCount(0);
    const initial = page.getByRole("group", { name: "Mètode del pagament inicial" });
    await expect(initial.getByRole("button")).toHaveCount(3);
    await expect(page.getByLabel("Accepto la política de privacitat")).not.toBeChecked();
    await expect(page.getByLabel("Autoritzo l'ús de la meva imatge")).not.toBeChecked();
    await initial.getByRole("button", { name: "Efectiu" }).click();
    await expect(page.getByText("Coordini amb el club el pagament")).toBeVisible();
    await expect(page.getByLabel("IBAN")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({
      path: resolve(evidence, `payment-${info.project.name}-${String(width)}.png`),
      fullPage: true,
    });
    await page.getByLabel("Accepto la política de privacitat").check();
    await page.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }).click();
    await expect(page.getByText("Pagament pendent")).toBeVisible();
    await expect(page.getByText("Pagament rebut", { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: resolve(evidence, `pending-${info.project.name}-${String(width)}.png`),
      fullPage: true,
    });
  });
}

test("November 6 direct Spanish signup link", async ({ page }) => {
  await page.addInitScript(
    ({ club }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "signup");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(club));
    },
    { club: branding },
  );
  await page.goto(`${base}/apuntat-hi?lang=es`);
  await expect(page.getByRole("heading", { name: "Apúntate", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Idioma" })).toHaveValue("es");
});
