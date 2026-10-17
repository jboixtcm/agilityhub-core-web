import { createI18n } from "@agilityhub/i18n";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BOOT_FAILURE_BRANDING, BootFailurePage } from "./BootFailurePage";

afterEach(cleanup);

describe("E11-W02 (INC-41): the app that cannot read /branding says so instead of a blank page", () => {
  it.each([
    ["ca", "No disponible", "No hi ha connexió amb el servidor.", "Torna-ho a provar"],
    ["es", "No disponible", "No hay conexión con el servidor.", "Volver a intentarlo"],
    ["en", "Unavailable", "There is no connection to the server.", "Try again"],
  ] as const)(
    "%s: the product's texts and a retry that loads the page again",
    async (locale, title, message, retry) => {
      const i18n = await createI18n({
        branding: BOOT_FAILURE_BRANDING,
        browserLanguages: [locale],
        initialNamespaces: ["common"],
        storage: undefined,
      });
      const reload = vi.fn();
      render(
        <I18nextProvider i18n={i18n}>
          <BootFailurePage reload={reload} />
        </I18nextProvider>,
      );
      expect(screen.getByRole("heading", { name: title })).toBeVisible();
      expect(screen.getByText(message)).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: retry }));
      expect(reload).toHaveBeenCalledOnce();
    },
  );
});
