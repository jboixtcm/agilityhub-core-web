import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  captureTask === "" ? "E11-W08" : captureTask,
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
/** The member's own plan («Abonat»), with a price twin in `signupMemberPriceTwin`. */
const MEMBER_PLAN = "10000000-0000-4000-8000-000000000001";
const REVIEW = "El club ha de revisar els preus d'aquesta modalitat.";

test.use({ viewport: { height: 812, width: 375 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function login(page: Page) {
  await page.addInitScript(
    ({ cachedBranding }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "signupMemberPriceTwin");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
}

test.describe("E11-W08 step 5 (S04 §2 16, §6, ruling E138): the add-dog on a plan with a price twin", () => {
  test("17: the member's own plan is listed unavailable with the club's review text; [CONTINUA] waits for another plan", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`${baseUrl}/gossos/nou`);
    await expect(page.getByText(/Pas 1 de 2/u)).toBeVisible();
    const own = page.getByRole("button", { name: "Selecciona Abonat" });
    await expect(own).toBeDisabled();
    await expect(own).toHaveAccessibleDescription(REVIEW);
    await expect(page.getByRole("button", { name: "CONTINUA" })).toBeDisabled();
    await own.scrollIntoViewIfNeeded();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "16-add-dog-price-twin-375.png"),
    });
  });

  test("19 → 17: a submission on the twinned plan answers 409 PRICE_OVERLAP and the member is back on the dog step, never on a payment", async ({
    page,
  }) => {
    await login(page);
    // A draft kept from before the club's prices got their twin.
    await page.evaluate(
      ({ planId }) => {
        sessionStorage.setItem(
          "signup.draft.v1",
          JSON.stringify({
            additionalDogOption: "TODAY",
            consentVersion: "",
            dog: {
              birthMonth: "03/2022",
              breed: "Mestís",
              chip: "941000012345670",
              documents: [{ files: [], type: "VACCINATION_CARD" }],
              name: "Kiwi",
              notesToInstructors: "",
              sex: "FEMALE",
            },
            familyClaim: { dogName: "", holderName: "", leavePending: false },
            familyFound: false,
            holderFromGroup: false,
            imageConsent: false,
            mode: "add-dog",
            passport: "",
            payment: { firstMonthOption: "TODAY", type: "SEPA_DD" },
            person: {
              address: { postalCode: "", street: "", town: "" },
              birthDate: "",
              emails: ["", ""],
              firstName: "",
              gender: "OTHER",
              idDocument: { type: "DNI", value: "" },
              lastName1: "",
              lastName2: "",
              phones: [
                { label: "", number: "", prefix: "+34" },
                { label: "", number: "", prefix: "+34" },
              ],
            },
            planId,
            privacyAccepted: false,
            savedAt: Date.now(),
          }),
        );
      },
      { planId: MEMBER_PLAN },
    );
    await page.goto(`${baseUrl}/gossos/nou/pagament`);
    await expect(page.getByText(/Pas 2 de 2/u)).toBeVisible();
    const privacy = page.getByLabel("Accepto la política de privacitat");
    if (await privacy.isVisible()) await privacy.check();
    const refused = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/me/dogs/signup" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }).click();
    expect((await refused).status()).toBe(409);
    await page.waitForURL("**/gossos/nou");
    await expect(page.getByText(/Pas 1 de 2/u)).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: REVIEW })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "16-add-dog-price-overlap-refused-375.png"),
    });
  });
});
