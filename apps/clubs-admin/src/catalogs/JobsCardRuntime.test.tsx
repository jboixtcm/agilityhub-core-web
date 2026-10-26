import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createApiClient, type components } from "@agilityhub/api-client";
import brandingFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { JobsCard } from "./JobsCard";

type Job = components["schemas"]["JobSummary"];
const branding: Branding = { ...(brandingFixture as Branding), locales: ["ca", "es", "en"] };
// Read the verified API enum: newly published processes must acquire labels in every locale.
const contract = JSON.parse(
  readFileSync(resolve("../../packages/api-client/openapi/openapi.json"), "utf8"),
) as {
  components: { schemas: { JobSummary: { properties: { jobName: { enum: Job["jobName"][] } } } } };
};
const names = contract.components.schemas.JobSummary.properties.jobName.enum;
const jobs: Job[] = names.map((jobName) => ({
  enabled: true,
  jobName,
  name: jobName.toLowerCase().replaceAll("_", "-"),
  schedule: { kind: "DAILY", localTime: "07:30" },
}));

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe("T-15-32 / INC-92 / INC-93: the runtime job catalog", () => {
  it.each(["ca", "es", "en"])(
    "labels every published job in %s and only offers supported switches",
    async (locale) => {
      server.use(http.get("*/api/v1/jobs", () => HttpResponse.json({ items: jobs })));
      const i18n = await createI18n({
        branding,
        browserLanguages: [locale],
        initialNamespaces: ["admin-settings", "enums", "errors"],
        storage: undefined,
      });
      render(
        <I18nextProvider i18n={i18n}>
          <BrandingProvider branding={branding}>
            <JobsCard client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })} />
          </BrandingProvider>
        </I18nextProvider>,
      );
      const card = await screen.findByRole("region", { name: i18n.t("admin-settings:jobs.title") });
      await within(card).findByText(i18n.t("admin-settings:jobs.name.RISK_REVIEW"));
      expect(within(card).getAllByRole("listitem")).toHaveLength(names.length);
      for (const job of jobs) {
        const label: unknown = i18n.getResource(
          locale,
          "admin-settings",
          `jobs.name.${job.jobName}`,
        );
        expect.soft(label, `${locale}:${job.jobName}`).toBeTypeOf("string");
        const row = card.querySelector(`[data-job="${job.name}"]`);
        expect(row).not.toBeNull();
        if (!(row instanceof HTMLElement)) throw new Error("Missing runtime job");
        expect(row.querySelector("strong")?.textContent).not.toMatch(/jobs\.name\./u);
        const mandatory = job.jobName === "ERASURES" || job.jobName === "RETENTION_SWEEP";
        expect
          .soft(within(row).queryAllByRole("switch"), job.jobName)
          .toHaveLength(mandatory ? 0 : 1);
        expect(
          within(row).getByRole("button", {
            name: i18n.t("admin-settings:jobs.dryRunLabel", { name: label }),
          }),
        ).toBeEnabled();
        const run = within(row).getByRole("button", {
          name: i18n.t("admin-settings:jobs.runLabel", { name: label }),
        });
        expect(run).toBeEnabled();
        if (mandatory) {
          fireEvent.click(run);
          const dialog = screen.getByRole("dialog");
          expect(dialog).toHaveTextContent(i18n.t("admin-settings:jobs.runTitle", { name: label }));
          fireEvent.click(
            within(dialog).getByRole("button", { name: i18n.t("admin-settings:common.cancel") }),
          );
        }
      }
    },
  );
});
