import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-11-01-delivery-log",
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
  test(`delivery log access email and temporary rejection ${String(width)}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.addInitScript((cached) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "admin");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cached));
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const input = args[0];
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input : input.url,
          location.href,
        );
        const row = {
          id: "reset-example",
          code: "N-25",
          title: "",
          body: "",
          locale: "ca",
          category: "SYSTEM",
          audience: null,
          createdAt: "2026-11-01T03:03:00Z",
          readAt: null,
          recipient: { displayName: "", email: "example@example.test" },
          channels: [{ channel: "EMAIL", status: "SENT", temporaryFailure: true }],
          deliveries: [
            {
              channel: "EMAIL",
              status: "SENT",
              target: "example@example.test",
              attempts: 1,
              sentAt: "2026-11-01T03:03:01Z",
              temporaryFailureAt: "2026-11-01T03:03:02Z",
              temporaryFailureReason: "SENDING_IP_BLOCKED_SPAMCOP",
            },
          ],
        };
        if (url.pathname === "/api/v1/notifications") {
          return Response.json({
            items: [row],
            page: 0,
            size: 50,
            totalItems: 1,
            totalPages: 1,
            appliedFilters: [],
          });
        }
        if (url.pathname === "/api/v1/notifications/reset-example") return Response.json(row);
        return originalFetch(...args);
      };
    }, branding);
    await page.goto(`${baseUrl}/entrar`);
    await page.getByLabel("Correu electrònic").fill("admin@example.test");
    await page.getByRole("button", { name: "Tinc contrasenya" }).click();
    await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
    await page.getByRole("button", { name: "ENTRA", exact: true }).click();
    await page.waitForURL("**/tauler");
    await page.goto(`${baseUrl}/notificacions?q=example%40example.test`);
    await expect(page.getByRole("searchbox")).toHaveValue("example@example.test");
    await expect(
      page.getByText("Accés i recuperació de contrasenya", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Correu · incidència temporal", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({
      path: resolve(evidence, `delivery-log-${browserName}-${String(width)}.png`),
    });
    await page
      .getByRole("link", { name: "N-25 Accés i recuperació de contrasenya", exact: true })
      .click();
    const detail = page.getByRole("dialog", { name: "Avís N-25" });
    await expect(detail.getByText(/IP d’enviament bloquejada per SpamCop/u)).toBeVisible();
    await expect(detail.getByText("Lliurament confirmat", { exact: true })).toBeVisible();
    await expect(detail).not.toContainText("example@example.test");
    await page.screenshot({
      path: resolve(evidence, `delivery-detail-${browserName}-${String(width)}.png`),
    });
    const incident = detail.getByText(/IP d’enviament bloquejada per SpamCop/u);
    await incident.scrollIntoViewIfNeeded();
    await expect(incident).toBeInViewport();
    await page.screenshot({
      path: resolve(evidence, `delivery-history-${browserName}-${String(width)}.png`),
    });
  });
}
