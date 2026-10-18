import {
  CONSOLE_CLUB_IDS,
  consoleState,
  resetConsoleMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE, captureRequests, renderConsole } from "./console-test-utils";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetConsoleMockState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetConsoleMockState();
  vi.restoreAllMocks();
});
afterAll(() => {
  server.close();
});

const CANIC = CONSOLE_CLUB_IDS.canic;
const MINIM = CONSOLE_CLUB_IDS.minim;

function stored(id: string) {
  const found = consoleState.clubs.find((candidate) => candidate.id === id);
  if (found === undefined) throw new TypeError(`No fixture club ${id}`);
  return found;
}

/** Another session's write while the form is open: the record moves one version ahead. */
function concurrentEdit(id: string, changes: Partial<ReturnType<typeof stored>>) {
  consoleState.clubs = consoleState.clubs.map((candidate) =>
    candidate.id === id ? { ...candidate, ...changes, version: candidate.version + 1 } : candidate,
  );
}

async function openTab(id: string, tab: string) {
  const rendered = await renderConsole(`/consola/clubs/${id}/${tab}`);
  await screen.findByRole("heading", { level: 1, name: stored(id).name });
  return rendered;
}

describe("E10-W01 step 3 · D19 record (S17 §2 «D19 Fitxa»)", () => {
  it("T-17-12 lists every tab of S17 §2 in its order (E10-W03: Dominis, Paràmetres) and keeps the tab in the route", async () => {
    const { navigations } = await openTab(CANIC, "identitat");
    const tabs = within(screen.getByRole("navigation", { name: "Seccions de la fitxa del club" }));
    expect(tabs.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Identitat",
      "Localització",
      "Dominis",
      "Tema",
      "Mòduls",
      "Pagaments",
      "Legal",
      "Paràmetres",
      "Catàlegs base",
      "Equip",
      "Processos",
      "Auditoria",
      "Ús",
      "Estat",
    ]);
    expect(tabs.getByRole("link", { name: "Identitat" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(tabs.getByRole("link", { name: "Ús" }));
    expect(navigations.at(-1)).toBe(`/consola/clubs/${CANIC}/us`);
    expect(screen.queryByRole("button", { name: /Entra com a administrador/u })).toBeNull();
    fireEvent.click(tabs.getByRole("link", { name: "Estat" }));
    expect(await screen.findByRole("heading", { name: "Estat" })).toBeInTheDocument();
    // R-17-10: the support access lives in «Estat».
    expect(
      screen.getByRole("button", { name: "Entra com a administrador del club" }),
    ).toBeInTheDocument();
  });

  it("T-17-12 an ONBOARDING club shows its onboarding checklist item by item (R-17-06)", async () => {
    await openTab(MINIM, "identitat");
    const checklist = screen.getByRole("region", { name: "Checklist d'onboarding" });
    const items = within(checklist).getAllByRole("listitem");
    expect(items.map((item) => item.dataset.done)).toEqual([
      "false",
      "true",
      "true",
      "true",
      "false",
      "false",
      "true",
    ]);
    expect(within(checklist).getByText(/4\/7/u)).toBeInTheDocument();
    // Incomplete: no activation proposed (R-17-06: manual, proposed once complete).
    expect(within(checklist).queryByRole("link", { name: "Activa el club" })).toBeNull();
  });

  it("Identitat: PATCH sends only the changed fields with the version read; STALE_VERSION rebases the user's edits on the fresh record", async () => {
    const patches = captureRequests(
      (method, url) => method === "PATCH" && url.pathname.endsWith(`/platform/clubs/${CANIC}`),
    );
    await openTab(CANIC, "identitat");
    const before = stored(CANIC);
    fireEvent.change(screen.getByLabelText("Nom legal"), {
      target: { value: "Associació Agility de prova" },
    });
    concurrentEdit(CANIC, { displayCity: "Vilassar de Mar" });
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(await screen.findByText(/Algú ha canviat el club mentrestant/u)).toBeInTheDocument();
    expect(patches[0]?.body).toEqual({
      legalName: "Associació Agility de prova",
      version: before.version,
    });
    // The fresh record shows (the other session's town) with the user's own edit on top.
    await waitFor(() => {
      expect(screen.getByLabelText("Població que es mostra")).toHaveValue("Vilassar de Mar");
    });
    expect(screen.getByLabelText("Nom legal")).toHaveValue("Associació Agility de prova");
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Canvis desats.")).toBeInTheDocument();
    // The retry sends the fresh version with the user's edit only, never the stale town.
    expect(patches[1]?.body).toEqual({
      legalName: "Associació Agility de prova",
      version: before.version + 1,
    });
    expect(stored(CANIC)).toMatchObject({
      displayCity: "Vilassar de Mar",
      legalName: "Associació Agility de prova",
    });
  });

  it("Identitat: the api's fieldErrors show on their own fields (CONVENCIONS_API §6), the address too", async () => {
    server.use(
      http.patch(`${API_BASE}/platform/clubs/:id`, () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            details: {
              fieldErrors: [
                { code: "INVALID_VALUE", field: "address.postalCode" },
                { code: "REQUIRED", field: "websiteUrl" },
              ],
            },
            message: "Validation failed",
            traceId: "trace-console-1",
          },
          { status: 400 },
        ),
      ),
    );
    await openTab(CANIC, "identitat");
    fireEvent.change(screen.getByLabelText("Codi postal"), { target: { value: "0833" } });
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    const postal = await screen.findByLabelText("Codi postal");
    await waitFor(() => {
      expect(postal).toHaveAttribute("aria-invalid", "true");
    });
    expect(postal.closest(".ah-form-field")).toHaveTextContent("Aquest valor no és vàlid.");
    expect(screen.getByLabelText("Web").closest(".ah-form-field")).toHaveTextContent(
      "Aquest camp és obligatori.",
    );
    expect(screen.getByText("Reviseu els camps destacats.")).toBeInTheDocument();
  });

  it("Localització: every change shows its consequences first; TIMEZONE_CHANGE_BLOCKED lands on the zone field", async () => {
    const patches = captureRequests((method) => method === "PATCH");
    await openTab(CANIC, "localitzacio");
    fireEvent.change(screen.getByLabelText("Fus horari"), { target: { value: "Atlantic/Canary" } });
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    const dialog = await screen.findByRole("dialog", { name: "Canvis de localització" });
    expect(
      within(dialog).getByText(/El fus horari passa de Europe\/Madrid a Atlantic\/Canary/u),
    ).toBeInTheDocument();
    expect(patches).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "DESA ELS CANVIS" }));
    const zone = screen.getByLabelText("Fus horari");
    await waitFor(() => {
      expect(zone.closest(".ah-form-field")).toHaveTextContent(
        "No es pot canviar el fus horari mentre hi hagi elements futurs.",
      );
    });
    expect(patches[0]?.body).toEqual({
      timeZone: "Atlantic/Canary",
      version: stored(CANIC).version,
    });
  });

  it("T-17-12 Tema: the live preview reads the draft's tokens, AA contrast blocks the save, and a logo goes through the one upload route", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:console-logo-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const writes = captureRequests(
      (method, url) =>
        method !== "GET" &&
        (url.pathname.includes("/theme") || url.hostname === "uploads.example.test"),
    );
    await openTab(MINIM, "tema");
    const accent = brandingCanicFixture.theme.colors.primary.toLocaleLowerCase();
    fireEvent.change(screen.getByLabelText("Principal"), { target: { value: accent } });
    for (const preview of [
      screen.getByTestId("theme-preview-clubs"),
      screen.getByTestId("theme-preview-clubs-admin"),
    ]) {
      const frame = preview.querySelector<HTMLElement>("[data-theme]");
      expect(frame?.style.getPropertyValue("--ah-color-primary")).toBe(accent);
    }
    // The text on the primary equal to the primary: 1:1, below AA.
    fireEvent.change(screen.getByLabelText("Text sobre el principal"), {
      target: { value: accent },
    });
    expect(
      screen.getByLabelText("Text sobre el principal").closest(".ah-form-field"),
    ).toHaveTextContent(/Contrast 1\.00:1 sobre «Principal»/u);
    expect(
      screen.getByText("Hi ha colors sense prou contrast: corregeix-los abans de desar."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DESA" })).toBeDisabled();
    // The text colour the accent was approved with (S17, A32: 5.9:1).
    const onPrimary = brandingCanicFixture.theme.colors.onPrimary.toLocaleLowerCase();
    fireEvent.change(screen.getByLabelText("Text sobre el principal"), {
      target: { value: onPrimary },
    });
    expect(
      screen.queryByText("Hi ha colors sense prou contrast: corregeix-los abans de desar."),
    ).toBeNull();
    // Round 2 #8: a translated, labelled button opens the hidden picker (never the browser's text).
    const picker = screen.getByLabelText<HTMLInputElement>("Logo");
    expect(picker).toHaveAttribute("type", "file");
    expect(picker).toHaveAttribute("tabindex", "-1");
    expect(picker).toHaveClass("ah-sr-only");
    const opened = vi.spyOn(picker, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Tria una imatge: Logo" }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: /^Tria una imatge: / })).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Logo"), {
      target: { files: [new File(["logo"], "logo.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("logo.png es publicarà en desar.")).toBeInTheDocument();
    // E10-W03 #9 (E10-W01 review #4): the visible button carries the pending-file help.
    expect(
      screen.getByRole("button", { name: "Tria una imatge: Logo" }),
    ).toHaveAccessibleDescription("logo.png es publicarà en desar.");
    expect(
      screen.getByRole("button", { name: "Tria una imatge: Marca (versió petita)" }),
    ).not.toHaveAttribute("aria-describedby");
    const grant = writes.find((request) => request.url.pathname.endsWith("/theme/upload-url"));
    expect(grant?.headers.get("Idempotency-Key")).toMatch(/[0-9a-f-]{36}/u);
    expect(grant?.body).toEqual({ fileName: "logo.png", mimeType: "image/png", sizeBytes: 4 });
    expect(
      writes.some(
        (request) => request.method === "PUT" && request.url.hostname === "uploads.example.test",
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Canvis desats.")).toBeInTheDocument();
    const theme = writes.find(
      (request) => request.method === "PUT" && request.url.pathname.endsWith("/theme"),
    );
    expect(theme?.body).toMatchObject({
      colors: { onPrimary, primary: accent },
      logoFileKey: expect.stringMatching(/^theme\//u) as unknown,
      version: 3,
    });
    expect(theme?.body).not.toHaveProperty("markFileKey");
  });

  it("E11-W02 round 2 (review #7): Tema previews «Automàtic» in the reader's dark scheme, dark logo included", async () => {
    // jsdom has no `matchMedia`: a reader who asks for the dark scheme.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (media: string) =>
        ({
          addEventListener: () => undefined,
          matches: media === "(prefers-color-scheme: dark)",
          media,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    });
    try {
      await openTab(MINIM, "tema");
      fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "auto" } });
      const frame = screen
        .getByTestId("theme-preview-clubs")
        .querySelector<HTMLElement>("[data-theme]");
      expect(frame).toHaveAttribute("data-scheme", "dark");
      expect(frame?.style.getPropertyValue("--ah-color-background")).toBe(
        "var(--ah-product-dark-background)",
      );
      fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "light" } });
      expect(frame).toHaveAttribute("data-scheme", "light");
    } finally {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("Mòduls: dependencies (R-17-04) gate the switches; the list or the preset is saved with the version", async () => {
    const puts = captureRequests(
      (method, url) => method === "PUT" && url.pathname.endsWith("/modules"),
    );
    await openTab(MINIM, "moduls");
    const packs = screen.getByRole("switch", { name: "Packs" });
    expect(packs).toBeDisabled();
    expect(screen.getAllByText("Cal activar abans: Facturació").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("switch", { name: "Facturació" }));
    expect(packs).toBeEnabled();
    fireEvent.click(packs);
    // BILLING cannot go off while PACKS needs it.
    expect(screen.getByRole("switch", { name: "Facturació" })).toBeDisabled();
    expect(screen.getByText("En depèn: Packs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Canvis desats.")).toBeInTheDocument();
    expect(puts[0]?.body).toEqual({
      modules: ["BILLING", "PACKS", "WAITLIST", "FAQ", "PUSH"],
      version: 3,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Mínim" }));
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    await waitFor(() => {
      expect(puts[1]?.body).toEqual({ preset: "MINIM", version: 4 });
    });
  });

  it("E10-W01 round 2 #4: modules and locales compare as sets, whatever order the api answers in", async () => {
    // The api lists the club's modules and languages in another order than the catalog's.
    server.use(
      http.get(`${API_BASE}/platform/clubs/:id`, () => {
        const club = stored(MINIM);
        return HttpResponse.json({
          ...club,
          locales: [...club.locales].reverse(),
          modules: [...club.modules].reverse(),
        });
      }),
    );
    await openTab(MINIM, "moduls");
    const save = () => screen.getByRole("button", { name: "DESA" });
    expect(save()).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "Facturació" }));
    expect(save()).toBeEnabled();
    fireEvent.click(screen.getByRole("switch", { name: "Facturació" }));
    expect(save()).toBeDisabled();
    // A save whose reread answers in another order leaves the form clean.
    fireEvent.click(screen.getByRole("switch", { name: "Facturació" }));
    fireEvent.click(save());
    expect(await screen.findByText("Canvis desats.")).toBeInTheDocument();
    await waitFor(() => {
      expect(stored(MINIM).modules).toContain("BILLING");
    });
    await waitFor(() => {
      expect(save()).toBeDisabled();
    });
    cleanup();
    await openTab(MINIM, "localitzacio");
    expect(save()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Anglès" }));
    expect(save()).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Anglès" }));
    expect(save()).toBeDisabled();
  });

  it("E10-W01 round 2 #8: a failed reread after a successful write says so and retries", async () => {
    let reads = 0;
    server.use(
      http.get(`${API_BASE}/platform/clubs/:id`, () => {
        reads += 1;
        if (reads === 1) return HttpResponse.json(stored(MINIM));
        return HttpResponse.json(
          {
            code: "INTERNAL_ERROR",
            details: null,
            message: "Unexpected error",
            traceId: "trace-console-reload",
          },
          { status: 500 },
        );
      }),
    );
    await openTab(MINIM, "moduls");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Facturació" }));
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Canvis desats.")).toBeInTheDocument();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "No s'ha pogut tornar a llegir el club: les dades que es mostren poden no ser les últimes.",
    );
    // E10-W03 #7 (E10-W01 review #2): while the reread failed, nothing can be written with the
    // possibly stale version — the tab's controls and its DESA are disabled; the retry is not.
    const modules = captureRequests(
      (method, url) => method === "PUT" && url.pathname.endsWith("/modules"),
    );
    expect(screen.getByRole("switch", { name: "Facturació" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "DESA" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(modules).toEqual([]);
    server.resetHandlers();
    fireEvent.click(within(alert).getByRole("button", { name: "Torna-ho a provar" }));
    await waitFor(() => {
      expect(screen.queryByText(/No s'ha pogut tornar a llegir el club/u)).toBeNull();
    });
    expect(screen.getByRole("switch", { name: "Facturació" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Facturació" })).toBeEnabled();
  });

  it("E10-W01 round 2 #8: the Stripe secrets are never offered to the browser's password manager", async () => {
    await openTab(CANIC, "pagaments");
    for (const label of ["Clau secreta", "Secret del webhook"]) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute("type", "password");
      expect(field).toHaveAttribute("autocomplete", "new-password");
    }
  });

  it("Mòduls: 422 MODULE_DEPENDENCY {module, requires} names both modules", async () => {
    server.use(
      http.put(`${API_BASE}/platform/clubs/:id/modules`, () =>
        HttpResponse.json(
          {
            code: "MODULE_DEPENDENCY",
            details: { module: "SOCIAL_LEAGUE", requires: "STATS" },
            message: "Module dependency missing",
            traceId: "trace-console-2",
          },
          { status: 422 },
        ),
      ),
    );
    await openTab(MINIM, "moduls");
    fireEvent.click(screen.getByRole("button", { name: "Complet" }));
    fireEvent.click(screen.getByRole("button", { name: "DESA" }));
    expect(
      await screen.findByText("Per activar Lliga social cal activar Estadístiques."),
    ).toBeInTheDocument();
  });

  it("Pagaments: the IBAN is write-only, PROVIDER_IN_USE says how many members, and Stripe is tested once configured (R-17-05)", async () => {
    const writes = captureRequests(
      (method, url) => method !== "GET" && url.pathname.includes("/payment-providers"),
    );
    await openTab(CANIC, "pagaments");
    const iban = screen.getByLabelText("IBAN");
    expect(iban).toHaveValue("");
    expect(iban.closest(".ah-form-field")).toHaveTextContent(
      "IBAN desat: ES·· ···· ···· ···· ···· 4821.",
    );
    const sepa = screen
      .getByRole("heading", { name: "Domiciliació SEPA" })
      .closest(".console-card");
    if (!(sepa instanceof HTMLElement)) throw new TypeError("No SEPA card");
    fireEvent.click(within(sepa).getByRole("button", { name: "DESA" }));
    expect(await within(sepa).findByText("Canvis desats.")).toBeInTheDocument();
    expect(writes[0]?.body).toEqual({
      creditorId: "ES12000G00000000",
      creditorName: brandingCanicFixture.club.legalName,
      enabled: true,
      suffix: "000",
      version: 7,
    });
    fireEvent.click(within(sepa).getByRole("button", { name: "Retira el proveïdor" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Retira el proveïdor",
      }),
    );
    expect(
      await within(sepa).findByText("Hi ha 164 abonats que paguen amb aquest proveïdor."),
    ).toBeInTheDocument();
    expect(writes[1]?.url.searchParams.get("version")).toBe("8");

    const stripe = screen.getByRole("heading", { name: "Stripe" }).closest(".console-card");
    if (!(stripe instanceof HTMLElement)) throw new TypeError("No Stripe card");
    const test = within(stripe).getByRole("button", { name: "Prova la connexió" });
    expect(test).toBeDisabled();
    fireEvent.change(within(stripe).getByLabelText("Clau pública"), {
      target: { value: "pk_test_console" },
    });
    fireEvent.change(within(stripe).getByLabelText("Clau secreta"), {
      target: { value: "sk_test_console" },
    });
    fireEvent.click(within(stripe).getByRole("button", { name: "DESA" }));
    await waitFor(() => {
      expect(within(stripe).getByLabelText("Clau secreta")).toHaveValue("");
    });
    expect(within(stripe).getByTestId("stripe-summary")).toHaveTextContent(
      "configurada · test · clau pública …sole · sense provar",
    );
    fireEvent.click(within(stripe).getByRole("button", { name: "Prova la connexió" }));
    expect(
      await within(stripe).findByText(
        `Connexió correcta amb el compte ${brandingCanicFixture.club.legalName} (test).`,
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(within(stripe).getByTestId("stripe-summary")).toHaveTextContent(/última prova OK/u);
    });
  });

  it("Legal: [Publica una versió nova] saves the three legal fields with the new version (re-consent notice)", async () => {
    const patches = captureRequests((method) => method === "PATCH");
    await openTab(CANIC, "legal");
    expect(screen.getByText("Versió vigent dels textos legals: 2026-09-01")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publica una versió nova" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Publica una versió nova dels textos legals",
    });
    expect(within(dialog).getByText(/No se'ls bloqueja l'accés/u)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Versió nova"), {
      target: { value: "2026-10-15" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "PUBLICA" }));
    expect(
      await screen.findByText("Versió vigent dels textos legals: 2026-10-15"),
    ).toBeInTheDocument();
    expect(patches[0]?.body).toEqual({
      legal: {
        imageConsentText: { ca: "Autoritzo l'ús d'imatges del meu gos a les xarxes del club." },
        legalTextsVersion: "2026-10-15",
        privacyPolicyUrl: "https://canic.example.test/privacitat",
      },
      version: 7,
    });
  });

  it("E10-W03 #8 (E10-W01 review #3): an unknown tab segment shows Identitat and the address says /identitat", async () => {
    const replaced = vi.spyOn(window.history, "replaceState");
    await openTab(MINIM, "parametres-antics");
    const tabs = within(screen.getByRole("navigation", { name: "Seccions de la fitxa del club" }));
    expect(tabs.getByRole("link", { name: "Identitat" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => {
      expect(window.location.pathname).toBe(`/consola/clubs/${MINIM}/identitat`);
    });
    expect(replaced).toHaveBeenCalledWith(null, "", `/consola/clubs/${MINIM}/identitat`);
    // A known tab is never rewritten.
    replaced.mockClear();
    fireEvent.click(tabs.getByRole("link", { name: "Ús" }));
    await screen.findByRole("heading", { name: "Ús" });
    expect(replaced).not.toHaveBeenCalled();
  });

  it("Catàlegs base: only empty parts are cloned (409 CATALOG_NOT_EMPTY names the part), with one key per payload", async () => {
    const posts = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith("/catalog-clone"),
    );
    await openTab(MINIM, "catalegs");
    fireEvent.click(await screen.findByRole("button", { name: "Clona d'un club plantilla" }));
    expect(
      await screen.findByText(
        "Preguntes freqüents: el club ja en té. Només es copien les parts buides.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Preguntes freqüents" }));
    fireEvent.click(screen.getByRole("button", { name: "Clona d'un club plantilla" }));
    expect(
      await screen.findByText(
        /S'ha copiat: Nivells 9 · Pistes 5 · Modalitats i preus 4 · Plantilles de comunicat 21\./u,
      ),
    ).toBeInTheDocument();
    expect(posts[1]?.body).toEqual({
      fromClubId: CONSOLE_CLUB_IDS.template,
      parts: ["LEVELS", "RINGS", "PLANS", "MESSAGE_TEMPLATES"],
    });
    const keys = posts.map((request) => request.headers.get("Idempotency-Key"));
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("T-17-07 E10-W03 #5: the clone's warnings by code, part and locale, one translated message each (R-17-08)", async () => {
    // Riera speaks ca and es; the template club also en: its English texts are left out.
    await openTab(CONSOLE_CLUB_IDS.riera, "catalegs");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Nivells" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pistes" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Modalitats i preus" }));
    fireEvent.click(screen.getByRole("button", { name: "Clona d'un club plantilla" }));
    const result = await screen.findByRole("status");
    expect(
      within(result)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Preguntes freqüents: els textos en Anglès no s'han copiat, perquè el club no fa servir aquest idioma.",
      "Plantilles de comunicat: els textos en Anglès no s'han copiat, perquè el club no fa servir aquest idioma.",
    ]);
  });

  it("E10-W03 #5: DEFAULT_LOCALE_COPIED names the club's default and the source locale it took", async () => {
    server.use(
      http.post(`${API_BASE}/platform/clubs/:id/catalog-clone`, () =>
        HttpResponse.json({
          copied: { FAQ: 6 },
          warnings: [{ code: "DEFAULT_LOCALE_COPIED", from: "es", part: "FAQ" }],
        }),
      ),
    );
    await openTab(CONSOLE_CLUB_IDS.riera, "catalegs");
    fireEvent.click(await screen.findByRole("button", { name: "Clona d'un club plantilla" }));
    expect(
      await screen.findByText(
        "Preguntes freqüents: alguns textos no tenien versió en Català i s'hi ha copiat el text en Castellà. Revisa'ls.",
      ),
    ).toBeInTheDocument();
  });

  it("Equip: invite (key per submission), LAST_ADMIN on the last one, and the platform role per account (R-17-09)", async () => {
    const writes = captureRequests(
      (method, url) =>
        method !== "GET" &&
        (url.pathname.includes("/admins") || url.pathname.includes("/platform-roles")),
    );
    await openTab(MINIM, "equip");
    const table = await screen.findByRole("table", { name: "Administradors del club" });
    expect(await within(table).findByText("Marta Pons")).toBeInTheDocument();
    fireEvent.click(within(table).getByRole("button", { name: "Retira" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Retira" }),
    );
    expect(
      await screen.findByText("El club ha de mantenir almenys un administrador."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Correu electrònic"), {
      target: { value: "nil.roca@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Nil Roca" } });
    fireEvent.click(screen.getByRole("button", { name: "CONVIDA" }));
    expect(
      await screen.findByText("S'ha enviat la invitació a nil.roca@example.test."),
    ).toBeInTheDocument();
    expect(await within(table).findByText("Nil Roca")).toBeInTheDocument();
    const invite = writes.find((request) => request.method === "POST");
    expect(invite?.body).toEqual({ email: "nil.roca@example.test", name: "Nil Roca" });
    expect(invite?.headers.get("Idempotency-Key")).toMatch(/[0-9a-f-]{36}/u);
    const role = await within(table).findByRole("switch", {
      name: "Marta Pons és admin de plataforma",
    });
    await waitFor(() => {
      expect(role).toBeEnabled();
    });
    fireEvent.click(role);
    await waitFor(() => {
      expect(role).toHaveAttribute("aria-checked", "true");
    });
    expect(writes.at(-1)?.body).toEqual({ platformRoles: ["AGILITYHUB_ADMIN"] });
  });

  it("Processos: the club's processes with their health; [Simula] runs dry and [Executa ara] asks first", async () => {
    const triggers = captureRequests(
      (method, url) => method === "POST" && url.pathname.includes("/jobs/"),
    );
    await openTab(CANIC, "processos");
    expect(await screen.findByText("Revisió de classes en risc")).toBeInTheDocument();
    expect(screen.getByText("avís")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simula Revisió de classes en risc" }));
    expect(await screen.findByText("Simulació: no s'ha aplicat cap canvi.")).toBeInTheDocument();
    expect(triggers[0]?.body).toEqual({ dryRun: true });
    expect(triggers[0]?.url.pathname).toBe(
      `/api/v1/platform/clubs/${CANIC}/jobs/risk-review/trigger`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Executa ara Revisió de classes en risc" }));
    const dialog = await screen.findByRole("dialog");
    expect(triggers).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Executa ara" }));
    await waitFor(() => {
      expect(triggers[1]?.body).toEqual({ dryRun: false });
    });
  });

  it("Auditoria and Ús: the club's configuration audit, and the month's aggregates in the club's month", async () => {
    const reads = captureRequests(
      (method, url) =>
        method === "GET" &&
        (url.pathname.endsWith("/audit-entries") || url.pathname.endsWith("/usage")),
    );
    await openTab(CANIC, "auditoria");
    expect(await screen.findByText("Estat del club modificat")).toBeInTheDocument();
    expect(screen.getByText("Mòduls del club modificats")).toBeInTheDocument();
    expect(reads[0]?.url.searchParams.getAll("filter")).toEqual([`clubId:eq:${CANIC}`]);
    cleanup();
    await openTab(CANIC, "us");
    expect(await screen.findByText("168")).toBeInTheDocument();
    expect(reads.at(-1)?.url.searchParams.get("month")).toMatch(/^\d{4}-\d{2}$/u);
    fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-09" } });
    expect(await screen.findByText("165")).toBeInTheDocument();
    expect(reads.at(-1)?.url.searchParams.get("month")).toBe("2026-09");
  });

  it("Estat: a suspension needs its reason and goes with a key; the record shows the new status (R-17-07)", async () => {
    const puts = captureRequests(
      (method, url) => method === "PUT" && url.pathname.endsWith("/status"),
    );
    await openTab(CANIC, "estat");
    const suspend = screen.getByRole("button", { name: "Suspèn el club" });
    expect(suspend).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motiu de la suspensió"), {
      target: { value: "Impagament de la quota" },
    });
    fireEvent.click(suspend);
    expect(await screen.findByText("S'ha canviat l'estat del club.")).toBeInTheDocument();
    expect(puts[0]?.body).toEqual({ reason: "Impagament de la quota", status: "SUSPENDED" });
    expect(puts[0]?.headers.get("Idempotency-Key")).toMatch(/[0-9a-f-]{36}/u);
    expect(screen.getAllByText("Suspès").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "Reactiva el club" })).toBeEnabled();
  });
});
