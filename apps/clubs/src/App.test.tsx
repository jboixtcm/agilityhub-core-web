import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { MOBILE_ROUTES, MobileNavigation } from "./App";

const canicBranding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

afterEach(cleanup);

async function renderNavigation(modules: string[], roles: ("ADMIN" | "INSTRUCTOR" | "MEMBER")[]) {
  const i18n = await createI18n({
    branding: canicBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={{ ...canicBranding, modules }}>
        <MobileNavigation modules={modules} pathname="/inici" roles={roles} />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("T-02-14 clubs shell", () => {
  it("filters the six-tab mockup navigation by modules and roles", async () => {
    await renderNavigation(["FREE_TRAINING", "FAQ"], ["MEMBER"]);

    expect(screen.getByRole("link", { name: "Inici" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reservar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrenaments" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Avui" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Info" })).toBeInTheDocument();
  });

  it("omits Entrenaments when FREE_TRAINING is disabled", async () => {
    await renderNavigation(["WAITLIST", "FAQ", "PUSH"], ["MEMBER"]);

    expect(screen.queryByRole("link", { name: "Entrenaments" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Info" })).toBeInTheDocument();
  });

  it("registers every mobile route from the frontend plan", () => {
    expect(MOBILE_ROUTES.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "/entrar",
        "/activacio",
        "/perfil-acces",
        "/inici",
        "/reservar",
        "/reservar/confirmar",
        "/reserves/:id",
        "/entrenaments",
        "/avui",
        "/notificacions",
        "/perfil",
        "/gossos",
        "/dades",
        "/inactivitat",
        "/baixa",
        "/apuntat-hi/*",
        "/instructor/pistes/:ringId/reservar",
        "/instructor/tasques",
        "/instructor/*",
        "/instructor/avui",
        "/historic",
        "/info",
        "/recorreguts/muntat/:ringId",
        "/instructor/pistes/:ringId/muntat",
        "/instructor/muntatge/:sessionId",
        "/estadistiques",
        "/estadistiques/lliga",
      ]),
    );
  });
});
