import { createI18n } from "@agilityhub/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

afterEach(cleanup);

describe("id placeholder", () => {
  it("renders the AgilityHub ID landing", async () => {
    const i18n = await createI18n({
      branding: { defaultLocale: "ca", locales: ["ca", "es", "en"] },
      browserLanguages: ["ca"],
      initialNamespaces: ["shell"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>,
    );

    expect(screen.getByRole("heading", { name: "AgilityHub ID" })).toBeInTheDocument();
  });
});
