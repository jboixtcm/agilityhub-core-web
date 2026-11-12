import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "feedback-20261112",
);
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
  test(`R-12-07 incomplete SEPA configuration explains the club issue at ${String(width)}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-08-26T08:00:00Z"));
    await page.addInitScript((cached) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "admin");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cached));
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const response = await originalFetch(input, init);
        const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
        if (url.pathname === "/api/v1/club") {
          const body = (await response.json()) as { paymentProviders: Record<string, unknown> };
          body.paymentProviders.SEPA_XML = { enabled: true, configured: false };
          return Response.json(body, { status: response.status });
        }
        if (url.pathname === "/api/v1/billing/periods/2026-09") {
          const body = (await response.json()) as { simulation?: { incidents: unknown[] } };
          if (body.simulation !== undefined) {
            body.simulation.incidents = [
              {
                memberId: "missing-account-example",
                memberName: "Joan Vila",
                code: "NO_BANK_ACCOUNT",
              },
              { memberId: "provider-example", memberName: "Marta Puig", code: "PROVIDER_DISABLED" },
            ];
          }
          return Response.json(body, { status: response.status });
        }
        return response;
      };
    }, branding);
    await page.goto(`${baseUrl}/entrar`);
    await page.getByLabel("Correu electrònic").fill("admin@example.test");
    await page.getByRole("button", { name: "Tinc contrasenya" }).click();
    await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
    await page.getByRole("button", { name: "ENTRA", exact: true }).click();
    await page.waitForURL("**/tauler");
    await page.goto(`${baseUrl}/facturacio?mes=2026-09`);
    const card = page.locator(".billing-simulation");
    const notice = card.getByRole("note", { name: "Configuració de pagaments del club" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      "La domiciliació SEPA està activada, però falten les dades del creditor del club.",
    );
    await expect(notice).toContainText("torna a simular el mes");
    const provider = card.getByRole("row", { name: /Marta Puig/u });
    await expect(provider).toContainText(
      "proveïdor de pagament desactivat o amb configuració incompleta",
    );
    await expect(provider.getByRole("link")).toHaveCount(0);
    await expect(card.getByRole("link", { name: "Obre fitxa de Joan Vila" }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    mkdirSync(evidence, { recursive: true });
    await card.screenshot({
      path: resolve(evidence, `billing-provider-${browserName}-${String(width)}.png`),
    });
  });
}
