import { type components, createApiClient } from "@agilityhub/api-client";
import { resetCatalogState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { InfoPage } from "./InfoPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetCatalogState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetCatalogState();
});
afterAll(() => {
  server.close();
});

async function renderInfo(runtimeBranding: Branding = branding) {
  const i18n = await createI18n({
    branding: runtimeBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["shell"],
    storage: undefined,
  });
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => "ca",
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={runtimeBranding}>
        <InfoPage client={client} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("tab", { name: "FAQ" });
}

describe("T-05-CP-07 screen 30 Info", () => {
  it("shows FAQ, rules and other active pages only", async () => {
    await renderInfo();

    expect(screen.getByRole("tab", { name: "FAQ" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Normes" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Consentiment d'imatge" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Privacitat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Guia de benvinguda" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Convivència al club" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Puc venir amb més gent al club?" }));
    expect(screen.getByText("Sí, sempre que respecti les normes del club.")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Normes" }));
    expect(screen.getByRole("heading", { name: "Normes del club" })).toBeVisible();
    expect(screen.getByText(/Actualitzat el 09\/09\/2026/u)).toBeVisible();
  });

  it("T-11-36 keeps Info available without the FAQ module, omits the FAQ tab and never reads /faq-entries", async () => {
    const paths: string[] = [];
    server.events.on("request:start", ({ request }) => {
      paths.push(new URL(request.url).pathname);
    });
    const withoutFaq = {
      ...branding,
      modules: branding.modules.filter((module) => module !== "FAQ"),
    };
    const i18n = await createI18n({
      branding: withoutFaq,
      browserLanguages: ["ca"],
      initialNamespaces: ["shell"],
      storage: undefined,
    });
    const client = createApiClient({
      baseUrl: `${window.location.origin}/api/v1`,
      getLocale: () => "ca",
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={withoutFaq}>
          <InfoPage client={client} />
        </BrandingProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByRole("tab", { name: "Normes" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "FAQ" })).not.toBeInTheDocument();
    expect(paths).toContain("/api/v1/club-pages");
    expect(paths).not.toContain("/api/v1/faq-entries");
    server.events.removeAllListeners();
  });
});

type FaqEntry = components["schemas"]["FaqReaderView"];

function faqEntry(id: string, category: string, order: number, question: string, answer = "—") {
  return { active: true, answer, category, id, order, question, version: 1 } satisfies FaqEntry;
}

/** `GET /faq-entries` answering `items` in the order given (never the order to show). */
function answerFaq(items: FaqEntry[]) {
  server.use(
    http.get("*/api/v1/faq-entries", () => HttpResponse.json({ items, totalItems: items.length })),
  );
}

describe("T-11-36 screen 30 FAQ (S11 R-11-14, S05 R-05-22)", () => {
  it("groups by category ordered by each group's lowest order, entries by order — never alphabetically nor as delivered", async () => {
    answerFaq([
      faqEntry("f-1", "Convivència al club", 4, "Puc venir amb més gent al club?"),
      faqEntry("f-2", "Reserves de classe", 9, "Què passa si el dia de classe plou?"),
      faqEntry("f-3", "Competicions", 2, "Què cal per poder participar a competicions d'agility?"),
      faqEntry("f-4", "Reserves de classe", 1, "Quantes classes puc reservar i en quin moment?"),
      faqEntry("f-5", "Convivència al club", 7, "El gos pot anar deslligat pel club?"),
    ]);
    await renderInfo();
    const groups = [...document.querySelectorAll(".info-faq section")].map((section) => [
      section.querySelector("h2")?.textContent,
      ...[...section.querySelectorAll("button")].map((button) => button.textContent),
    ]);
    expect(groups).toEqual([
      [
        "Reserves de classe",
        "Quantes classes puc reservar i en quin moment?",
        "Què passa si el dia de classe plou?",
      ],
      ["Competicions", "Què cal per poder participar a competicions d'agility?"],
      [
        "Convivència al club",
        "Puc venir amb més gent al club?",
        "El gos pot anar deslligat pel club?",
      ],
    ]);
  });

  it("opening one answer closes the previous; the answer is plain text with its line breaks", async () => {
    answerFaq([
      faqEntry(
        "f-1",
        "Reserves de classe",
        1,
        "Quantes classes puc reservar?",
        "Dues per setmana.\nTres amb pack.",
      ),
      faqEntry(
        "f-2",
        "Reserves de classe",
        2,
        "Què he de fer si no puc venir?",
        "Anul·la-la des de l'app.",
      ),
    ]);
    await renderInfo();
    const first = screen.getByRole("button", { name: "Quantes classes puc reservar?" });
    const second = screen.getByRole("button", { name: "Què he de fer si no puc venir?" });
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    const answer = document.getElementById("faq-answer-f-1");
    expect(answer?.textContent).toBe("Dues per setmana.\nTres amb pack.");
    expect(answer).toHaveClass("info-faq__answer");
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("faq-answer-f-1")).toBeNull();
    expect(screen.getByText("Anul·la-la des de l'app.")).toBeVisible();
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-expanded", "false");
  });

  it("says «El club encara no ha publicat preguntes» when there is none", async () => {
    answerFaq([]);
    await renderInfo();
    expect(screen.getByText("El club encara no ha publicat preguntes")).toBeVisible();
  });
});
