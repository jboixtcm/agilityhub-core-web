import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { ADMIN_ROUTES, AdminNavigation } from "./App";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

afterEach(cleanup);

async function renderNavigation(roles: ("ADMIN" | "INSTRUCTOR" | "MEMBER")[]) {
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <AdminNavigation modules={branding.modules} pathname="/tauler" roles={roles} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-02-14 clubs-admin shell", () => {
  it("hides the Configuració group from instructors", async () => {
    await renderNavigation(["INSTRUCTOR"]);

    expect(screen.queryByRole("heading", { name: "Configuració" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Paràmetres" })).not.toBeInTheDocument();
  });

  it("shows the fixed sidebar groups to administrators", async () => {
    await renderNavigation(["ADMIN"]);

    expect(screen.getByRole("heading", { name: "Persones" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Camp" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gestió" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Configuració" })).toBeInTheDocument();
  });

  it("registers every desktop route from the frontend plan", () => {
    expect(ADMIN_ROUTES.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "/tauler",
        "/preinscripcions/:id",
        "/plantilles",
        "/calendari",
        "/abonats",
        "/abonats/:id",
        "/gossos",
        "/facturacio",
        "/facturacio/remeses",
        "/activitats",
        "/modalitats",
        "/comunicats",
        "/parametres",
        "/agenda",
        "/alumnes/:id",
        "/seguiment",
        "/pistes",
        "/equip",
        "/recorreguts",
        "/inactivitats",
        "/auditoria",
        "/consola/*",
      ]),
    );
  });
});
