import { createApiClient } from "@agilityhub/api-client";
import { mockScenario, resetActivityState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivitiesPage } from "./ActivitiesPage";
import { ActivityRegistrantsPage } from "./ActivityRegistrantsPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};
// The D7 mockup is read in August 2026: «ds 7» (current month) vs «ds 12/09».
const mockupNow = new Date("2026-08-04T08:00:00Z");
const TOURNAMENT = "activity-torneig-estiu-2026";
const DEMONSTRATION = "activity-demostracio-festa-major";
const WORKSHOP = "activity-taller-contactes";

const patchBodies: unknown[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    if (request.method === "PATCH" && new URL(request.url).pathname.includes("/activities/")) {
      void request
        .clone()
        .json()
        .then((body: unknown) => {
          patchBodies.push(body);
        });
    }
  });
});
beforeEach(() => {
  vi.useFakeTimers({ now: mockupNow, shouldAdvanceTime: true, toFake: ["Date"] });
  resetActivityState();
  mockScenario("admin");
  patchBodies.length = 0;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  resetActivityState();
  mockScenario("admin");
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  server.close();
});

function client() {
  return createApiClient({ baseUrl: `${window.location.origin}/api/v1`, getLocale: () => "ca" });
}

async function renderPage({
  modules = branding.modules,
  readOnly = false,
  selectedId,
}: { modules?: readonly string[]; readOnly?: boolean; selectedId?: string } = {}) {
  window.history.replaceState(
    null,
    "",
    selectedId === undefined ? "/activitats" : `/activitats/${selectedId}`,
  );
  const clubBranding: Branding = { ...branding, modules: [...modules] };
  const i18n = await createI18n({
    branding: clubBranding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-activities", "admin-catalogs", "census", "enums", "errors"],
    storage: undefined,
  });
  const onNavigate = vi.fn();
  const view = render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={clubBranding}>
        <ActivitiesPage
          client={client()}
          onNavigate={onNavigate}
          readOnly={readOnly}
          {...(selectedId === undefined ? {} : { selectedId })}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  return { i18n, onNavigate, view };
}

async function listRow(title: string) {
  const table = await screen.findByRole("table");
  await within(table).findByText(title);
  const row = within(table)
    .getAllByRole("row")
    .find((item) => item.textContent.includes(title));
  if (row === undefined) throw new TypeError(`Missing row ${title}`);
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent.replace(/\s+/gu, " ").trim());
}

async function maintenance(title: string) {
  return screen.findByRole("region", { name: `Manteniment de l'activitat — ${title}` });
}

describe("T-07-29 D7 activities (list, maintenance, publication, cancellation)", () => {
  it("draws the four mockup rows with the R-07-13 dates, rings, registrations and state chips", async () => {
    await renderPage();

    expect(await screen.findByRole("heading", { name: "Activitats" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Nova activitat" })).toBeVisible();
    expect((await listRow("Torneig d'Estiu 2026")).slice(0, 5)).toEqual([
      "Torneig d'Estiu 2026 · competició",
      "dv 7 · 18:30–20:30",
      "totes — bloquejades",
      "22/40 · fins el 6/08",
      "publicada",
    ]);
    expect((await listRow("Seminari de handling")).slice(0, 5)).toEqual([
      "Seminari de handling · seminari",
      "ds 12/09 · 9:00–13:00",
      "Central",
      "6/12 · fins el 6/09",
      "publicada",
    ]);
    expect((await listRow("Lliga social — 3a jornada")).slice(0, 5)).toEqual([
      "Lliga social — 3a jornada · lliga social",
      "ds 19/09 · 9:00",
      "totes — bloquejades",
      "obertes · socis",
      "publicada",
    ]);
    expect((await listRow("Demostració Festa Major")).slice(0, 5)).toEqual([
      "Demostració Festa Major · demostració",
      "dg 4/10",
      "— (fora del club)",
      "—",
      "esborrany",
    ]);
  });

  it("«Nova activitat» creates a draft with title and type and opens its maintenance", async () => {
    const { onNavigate } = await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Nova activitat" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova activitat" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea l'activitat" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Escriu el títol en CA.");
    fireEvent.change(within(dialog).getByLabelText("Títol"), {
      target: { value: "Curset d'estiu" },
    });
    fireEvent.change(within(dialog).getByLabelText("Tipus"), { target: { value: "COURSE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea l'activitat" }));
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/activitats\/activity-\d+$/u),
      );
    });
    cleanup();
    const created = String(onNavigate.mock.calls[0]?.[0]).split("/")[2] ?? "";
    await renderPage({ selectedId: created });
    const card = await maintenance("Curset d'estiu");
    expect(within(card).getByLabelText("Tipus")).toHaveValue("COURSE");
    expect(within(card).getByText("esborrany")).toBeVisible();
    expect(await screen.findByText("Curset d'estiu")).toBeVisible();
  });

  it("shows the mockup maintenance of «Torneig d'Estiu 2026» with the ring, level and waitlist chips", async () => {
    await renderPage({ selectedId: TOURNAMENT });
    const card = await maintenance("Torneig d'Estiu 2026");
    expect(within(card).getByLabelText("Títol")).toHaveValue("Torneig d'Estiu 2026");
    expect(within(card).getByLabelText("Descripció curta")).toHaveValue(
      "Jornada social de tancament de l'estiu",
    );
    expect(within(card).getByText("imatge_torneig.jpg")).toBeVisible();
    expect(within(card).getByText("normativa.pdf")).toBeVisible();
    expect(within(card).getByLabelText("Data")).toHaveValue("07/08/2026");
    expect(within(card).getByText("dv 7 d’agost · 18:30–20:30")).toBeVisible();
    expect(within(card).getByLabelText("Places")).toHaveValue("40");
    expect(await within(card).findByText("Nivells: tots")).toBeVisible();
    expect(within(card).getByRole("button", { name: "Llista d'espera: sí" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const rings = within(card).getByRole("group", { name: "Pistes vinculades (es bloquegen):" });
    await waitFor(() => {
      expect(
        within(rings)
          .getAllByRole("button")
          .map((button) => button.textContent),
      ).toEqual(["Muntanya", "Central", "Carretera", "Cadells", "Petita"]);
    });
    for (const chip of within(rings).getAllByRole("button")) {
      expect(chip).toHaveAttribute("aria-pressed", "true");
    }
    expect(
      within(card).getByText(
        "URL: agilitycanic.cat/activitat/torneig-estiu-2026 · surt a l'API de la web (mai noms)",
      ),
    ).toBeVisible();
    expect(within(card).getByRole("link", { name: "Inscrits (22) ›" })).toHaveAttribute(
      "href",
      `/activitats/${TOURNAMENT}/inscrits`,
    );
  });

  it("disables the ring chips of an activity outside the club («— (fora del club)»)", async () => {
    await renderPage({ selectedId: DEMONSTRATION });
    const card = await maintenance("Demostració Festa Major");
    const rings = within(card).getByRole("group", { name: "Pistes vinculades (es bloquegen):" });
    await waitFor(() => {
      expect(within(rings).getAllByRole("button")).toHaveLength(5);
    });
    for (const chip of within(rings).getAllByRole("button")) {
      expect(chip).toBeDisabled();
    }
    expect(within(rings).getByText("— (fora del club)")).toBeVisible();
    expect(within(card).getByLabelText("Lloc")).toHaveValue("Plaça Major");
  });

  it("R-07-14 hides «Nivells» with levels.enabled=false and «Llista d'espera» without WAITLIST", async () => {
    mockScenario("activitiesNoLevels");
    await renderPage({ selectedId: TOURNAMENT });
    const card = await maintenance("Torneig d'Estiu 2026");
    await within(card).findByRole("button", { name: /^Llista d'espera:/u });
    await waitFor(() => {
      expect(within(card).queryByText(/^Nivells:/u)).toBeNull();
    });
    cleanup();

    mockScenario("activitiesNoWaitlist");
    await renderPage({
      modules: branding.modules.filter((module) => module !== "WAITLIST"),
      selectedId: TOURNAMENT,
    });
    const other = await maintenance("Torneig d'Estiu 2026");
    expect(await within(other).findByText("Nivells: tots")).toBeVisible();
    expect(within(other).queryByRole("button", { name: /^Llista d'espera:/u })).toBeNull();
  });

  it("R-07-03 [DESA] sends only the allow-listed rich text of the editor, with the version", async () => {
    await renderPage({ selectedId: TOURNAMENT });
    const card = await maintenance("Torneig d'Estiu 2026");
    const editor = within(card).getByRole("textbox", { name: "Descripció llarga (text ric)" });
    // The editor fills its content in an effect after the maintenance renders (E3-W10 flake).
    await waitFor(() => {
      expect(editor.innerHTML).toContain("<h3>Horaris</h3>");
    });
    editor.innerHTML =
      '<p onclick="x()">Cal <b>portar</b> <img src="x.png"> la <i>cartilla</i></p><script>x</script><a href="javascript:x">y</a>';
    fireEvent.input(editor);
    fireEvent.click(within(card).getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Canvis desats")).toBeVisible();
    expect(patchBodies).toEqual([
      {
        longDescription: {
          ca: "<p>Cal <strong>portar</strong>  la <em>cartilla</em></p>y",
          es: "<h3>Horarios</h3><p>Recogida de dorsales a las <strong>18:00</strong>.</p><ul><li>Categorías por nivel</li><li>Hay que traer la cartilla</li></ul>",
        },
        version: 7,
      },
    ]);
  });

  it("R-07-05 [PUBLICA] with conflicts opens the dialog with the conflicts and the required notice text", async () => {
    const api = client();
    await api.PATCH("/activities/{id}", {
      body: {
        endTime: "20:30",
        location: { atClub: true },
        registrationFrom: "2026-09-01",
        registrationTo: "2026-10-01",
        ringIds: ["ring-central", "ring-muntanya"],
        startTime: "18:30",
        version: 1,
      },
      params: { path: { id: DEMONSTRATION } },
    });
    await renderPage({ selectedId: DEMONSTRATION });
    const card = await maintenance("Demostració Festa Major");
    fireEvent.click(within(card).getByRole("button", { name: "PUBLICA" }));
    const dialog = await screen.findByRole("dialog", { name: "Conflictes de pista" });
    await waitFor(() => {
      expect(
        within(dialog).getByRole("list", { name: "Classes i bloquejos en conflicte" }),
      ).toHaveTextContent("Central · B+C · 18:30–19:30");
    });
    expect(within(dialog).getByText("3 inscrits")).toBeVisible();
    expect(within(dialog).getByText("Reserves d'entrenament")).toBeVisible();
    expect(within(dialog).getByText("Muntanya · Pau Soler + Blat · 19:00–19:30")).toBeVisible();
    const apply = within(dialog).getByRole("button", { name: "PUBLICA I APLICA" });
    expect(apply).toBeDisabled();
    fireEvent.click(
      within(dialog).getByLabelText("Anul·la les classes en conflicte i avisa els inscrits"),
    );
    fireEvent.click(within(dialog).getByLabelText("Cancel·la les reserves d'entrenament"));
    expect(apply).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Text de l'avís"), {
      target: { value: "La classe queda anul·lada per la demostració" },
    });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(await screen.findByText("Activitat publicada")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(within(card).getAllByText("publicada").length).toBeGreaterThan(0);
  });

  it("R-07-04 a draft without the registration period answers ACTIVITY_INCOMPLETE on the fields", async () => {
    await renderPage({ selectedId: DEMONSTRATION });
    const card = await maintenance("Demostració Festa Major");
    fireEvent.click(within(card).getByRole("button", { name: "PUBLICA" }));
    const confirm = await screen.findByRole("dialog", { name: "Publicar l'activitat" });
    expect(
      within(confirm).getByText("Vols publicar l'activitat? Els abonats admesos rebran un avís."),
    ).toBeVisible();
    expect(within(confirm).getByRole("switch", { name: "Avisa també per correu" })).toBeVisible();
    fireEvent.click(within(confirm).getByRole("button", { name: "PUBLICA" }));
    expect(
      await screen.findByText("Falten dades per publicar l'activitat: revisa els camps marcats."),
    ).toBeVisible();
    expect(within(card).getAllByText("Cal per publicar")).toHaveLength(2);
  });

  it("R-07-06 [CANCEL·LA L'ACTIVITAT] opens the modal with «CANCEL·LA I AVISA ELS 22 INSCRITS» disabled without text", async () => {
    await renderPage({ selectedId: TOURNAMENT });
    const card = await maintenance("Torneig d'Estiu 2026");
    fireEvent.click(within(card).getByRole("button", { name: "CANCEL·LA L'ACTIVITAT" }));
    const modal = await screen.findByRole("dialog", {
      name: "Cancel·lar l'activitat — Torneig d'Estiu 2026",
    });
    expect(modal).toHaveTextContent(
      "Aquesta activitat té 22 inscrits. Si la cancel·les, rebran un avís a l'app, per correu i per SMS amb el text que escriguis a sota.",
    );
    expect(within(modal).getAllByRole("row")).toHaveLength(22);
    expect(within(modal).getAllByText("inscrita")).toHaveLength(22);
    expect(within(modal).getAllByText("app · correu · SMS (2 telèfons)").length).toBeGreaterThan(0);
    const confirm = within(modal).getByRole("button", {
      name: "CANCEL·LA I AVISA ELS 22 INSCRITS",
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(modal).getByLabelText("Text de l'avís"), {
      target: { value: "Pluja forta: pistes tancades" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(await screen.findByText("Activitat cancel·lada")).toBeVisible();
    expect(within(card).getAllByText("cancel·lada").length).toBeGreaterThan(0);
    expect(within(card).queryByRole("button", { name: "DESA" })).toBeInTheDocument();
    expect(within(card).getByLabelText("Títol")).toBeDisabled();
  });

  it("INSTRUCTOR reads D7 without actions, export or internal notes", async () => {
    mockScenario("instructor");
    await renderPage({ readOnly: true, selectedId: TOURNAMENT });
    const card = await maintenance("Torneig d'Estiu 2026");
    expect(screen.queryByRole("button", { name: "Nova activitat" })).toBeNull();
    expect(screen.queryByText("Excel · PDF")).toBeNull();
    expect(within(card).queryByRole("button", { name: "DESA" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "CANCEL·LA L'ACTIVITAT" })).toBeNull();
    expect(within(card).queryByLabelText("Notes internes")).toBeNull();
    expect(within(card).getByLabelText("Títol")).toBeDisabled();
  });

  it("lists the registrants with the FIFO waitlist positions", async () => {
    window.history.replaceState(null, "", `/activitats/${WORKSHOP}/inscrits`);
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-activities", "census", "enums", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <ActivityRegistrantsPage
            activityId={WORKSHOP}
            client={client()}
            onNavigate={vi.fn()}
            readOnly={false}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: "Inscrits — Taller de contactes" }),
    ).toBeVisible();
    const table = await screen.findByRole("table");
    await waitFor(() => {
      expect(
        within(table)
          .getAllByText(/^en llista d'espera/u)
          .map((cell) => cell.textContent),
      ).toEqual(["en llista d'espera (1)", "en llista d'espera (2)"]);
    });
    expect(within(table).getAllByText("inscrita")).toHaveLength(10);
    expect(within(table).getAllByText(/ · \d+$/u).length).toBe(12);
  });

  it("R-07-04 after an upload [DESA] sends only the admin's own edits with the fresh version", async () => {
    await renderPage({ selectedId: TOURNAMENT });
    const card = await maintenance("Torneig d'Estiu 2026");
    fireEvent.change(within(card).getByLabelText("Descripció curta"), {
      target: { value: "Tancament de l'estiu amb sopar" },
    });
    // Meanwhile another administrator renames the activity (version 7 → 8).
    await client().PATCH("/activities/{id}", {
      body: {
        title: { ca: "Torneig d'Estiu 2026 — final", es: "Torneo de Verano 2026" },
        version: 7,
      },
      params: { path: { id: TOURNAMENT } },
    });
    const picker = card.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    if (picker === null) throw new TypeError("Missing the image picker");
    fireEvent.change(picker, {
      target: { files: [new File(["jpeg"], "cartell.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText("Imatge desada")).toBeVisible();
    expect(within(card).getByText("cartell.jpg")).toBeVisible();
    await waitFor(() => {
      expect(within(card).getByLabelText("Títol")).toHaveValue("Torneig d'Estiu 2026 — final");
    });
    expect(within(card).getByLabelText("Descripció curta")).toHaveValue(
      "Tancament de l'estiu amb sopar",
    );
    patchBodies.length = 0;
    fireEvent.click(within(card).getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Canvis desats")).toBeVisible();
    expect(patchBodies).toEqual([
      {
        shortDescription: {
          ca: "Tancament de l'estiu amb sopar",
          es: "Jornada social de cierre del verano",
        },
        version: 9,
      },
    ]);
  });

  it("R-07-05 a RING_BLOCK conflict is not forceable: no option for it and [PUBLICA I APLICA] disabled with the reason", async () => {
    const dateRings = async (ringIds: string[]) => {
      const current = await client().GET("/activities/{id}", {
        params: { path: { id: DEMONSTRATION } },
      });
      await client().PATCH("/activities/{id}", {
        body: {
          endTime: "20:30",
          location: { atClub: true },
          registrationFrom: "2026-09-01",
          registrationTo: "2026-10-01",
          ringIds,
          startTime: "18:30",
          version: current.data?.version ?? 0,
        },
        params: { path: { id: DEMONSTRATION } },
      });
    };
    await dateRings(["ring-petita"]);
    await renderPage({ selectedId: DEMONSTRATION });
    let card = await maintenance("Demostració Festa Major");
    fireEvent.click(within(card).getByRole("button", { name: "PUBLICA" }));
    let dialog = await screen.findByRole("dialog", { name: "Conflictes de pista" });
    await waitFor(() => {
      expect(
        within(dialog).getByRole("list", { name: "Classes i bloquejos en conflicte" }),
      ).toHaveTextContent("Petita · Manteniment de la pista · 17:00–21:00bloqueig de pista");
    });
    expect(
      within(dialog).getByText(
        "Un bloqueig de pista no es pot anul·lar des d'aquí: canvia les pistes o l'horari de l'activitat.",
      ),
    ).toBeVisible();
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    expect(within(dialog).queryByLabelText("Text de l'avís")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "PUBLICA I APLICA" })).toBeDisabled();
    cleanup();

    // With a class too, its option and text do not unlock the block.
    await dateRings(["ring-central", "ring-petita"]);
    await renderPage({ selectedId: DEMONSTRATION });
    card = await maintenance("Demostració Festa Major");
    fireEvent.click(within(card).getByRole("button", { name: "PUBLICA" }));
    dialog = await screen.findByRole("dialog", { name: "Conflictes de pista" });
    fireEvent.click(
      await within(dialog).findByLabelText("Anul·la les classes en conflicte i avisa els inscrits"),
    );
    fireEvent.change(within(dialog).getByLabelText("Text de l'avís"), {
      target: { value: "La classe queda anul·lada" },
    });
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(dialog).getByText("3 inscrits")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "PUBLICA I APLICA" })).toBeDisabled();
  });

  it("R-07-05 the conflict dialog never hangs: a repeated 409 and other errors show inside it", async () => {
    const api = client();
    await api.PATCH("/activities/{id}", {
      body: {
        endTime: "20:30",
        location: { atClub: true },
        registrationFrom: "2026-09-01",
        registrationTo: "2026-10-01",
        ringIds: ["ring-central", "ring-muntanya"],
        startTime: "18:30",
        version: 1,
      },
      params: { path: { id: DEMONSTRATION } },
    });
    const preview = (
      await api.GET("/activities/{id}/ring-conflicts", { params: { path: { id: DEMONSTRATION } } })
    ).data;
    const answers = [
      HttpResponse.json(
        {
          code: "RING_BLOCK_CONFLICT",
          details: { conflicts: preview?.conflicts },
          message: "conflict",
          traceId: "t",
        },
        { status: 409 },
      ),
      HttpResponse.json(
        { code: "ACTIVITY_IN_PAST", details: {}, message: "past", traceId: "t" },
        { status: 422 },
      ),
    ];
    server.use(http.post("*/api/v1/activities/:id/publication", () => answers.shift()));
    await renderPage({ selectedId: DEMONSTRATION });
    const card = await maintenance("Demostració Festa Major");
    fireEvent.click(within(card).getByRole("button", { name: "PUBLICA" }));
    const dialog = await screen.findByRole("dialog", { name: "Conflictes de pista" });
    fireEvent.click(
      await within(dialog).findByLabelText("Anul·la les classes en conflicte i avisa els inscrits"),
    );
    fireEvent.click(within(dialog).getByLabelText("Cancel·la les reserves d'entrenament"));
    fireEvent.change(within(dialog).getByLabelText("Text de l'avís"), {
      target: { value: "La classe queda anul·lada" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "PUBLICA I APLICA" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Aquest bloqueig de pista coincideix amb un altre element.",
    );
    expect(within(dialog).getByRole("button", { name: "PUBLICA I APLICA" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "PUBLICA I APLICA" }));
    await waitFor(() => {
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Aquesta activitat ja ha passat.",
      );
    });
    expect(screen.getByRole("dialog", { name: "Conflictes de pista" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "PUBLICA I APLICA" })).toBeEnabled();
  });

  it("R-07-04/05 save mode: a resync conflict opens «DESA I APLICA»; STALE_VERSION closes it, refetches and says so", async () => {
    await renderPage({ selectedId: TOURNAMENT });
    const card = await maintenance("Torneig d'Estiu 2026");
    fireEvent.change(within(card).getByLabelText("Hora de final"), { target: { value: "20:00" } });
    fireEvent.click(within(card).getByRole("button", { name: "DESA" }));
    const dialog = await screen.findByRole("dialog", { name: "Conflictes de pista" });
    expect(await within(dialog).findByText("Central · B+C · 18:30–19:30")).toBeVisible();
    // Another administrator saves meanwhile: the next PATCH is stale.
    await client().PATCH("/activities/{id}", {
      body: { internalNotes: "Revisat", version: 7 },
      params: { path: { id: TOURNAMENT } },
    });
    // The 409 carries only `conflicts` (the api checks the bookings afterwards).
    fireEvent.click(
      within(dialog).getByLabelText("Anul·la les classes en conflicte i avisa els inscrits"),
    );
    fireEvent.change(within(dialog).getByLabelText("Text de l'avís"), {
      target: { value: "La classe queda anul·lada pel torneig" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "DESA I APLICA" }));
    expect(
      await screen.findByText(
        "Algú altre ha modificat l'activitat: s'han carregat les dades actuals. Revisa-les i torna a desar.",
      ),
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(within(card).getByLabelText("Notes internes")).toHaveValue("Revisat");
    });
  });

  it("the plain publish confirm is pending once, keeps one key per payload and turns ADMIN_TEXT_REQUIRED into the text", async () => {
    await client().PATCH("/activities/{id}", {
      body: { registrationFrom: "2026-09-01", registrationTo: "2026-10-01", version: 1 },
      params: { path: { id: DEMONSTRATION } },
    });
    const keys: string[] = [];
    let first = true;
    server.use(
      http.post("*/api/v1/activities/:id/publication", ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key") ?? "");
        if (!first) return undefined;
        first = false;
        return HttpResponse.json(
          { code: "ADMIN_TEXT_REQUIRED", details: {}, message: "text", traceId: "t" },
          { status: 422 },
        );
      }),
    );
    await renderPage({ selectedId: DEMONSTRATION });
    const card = await maintenance("Demostració Festa Major");
    fireEvent.click(within(card).getByRole("button", { name: "PUBLICA" }));
    const confirm = await screen.findByRole("dialog", { name: "Publicar l'activitat" });
    const publish = within(confirm).getByRole("button", { name: "PUBLICA" });
    fireEvent.click(publish);
    fireEvent.click(publish);
    const dialog = await screen.findByRole("dialog", { name: "Conflictes de pista" });
    expect(keys).toHaveLength(1);
    expect(
      within(dialog).getByText("Cal escriure el text de l'avís per als alumnes."),
    ).toBeVisible();
    const apply = within(dialog).getByRole("button", { name: "PUBLICA I APLICA" });
    expect(apply).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Text de l'avís"), {
      target: { value: "Publiquem la demostració" },
    });
    fireEvent.click(apply);
    expect(await screen.findByText("Activitat publicada")).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("[DESPUBLICA] answers ACTIVITY_HAS_REGISTRATIONS with registrants and unpublishes without them", async () => {
    await renderPage({ selectedId: TOURNAMENT });
    let card = await maintenance("Torneig d'Estiu 2026");
    fireEvent.click(within(card).getByRole("button", { name: "DESPUBLICA" }));
    expect(await screen.findByText("Aquesta activitat ja té inscripcions.")).toBeVisible();
    cleanup();

    await renderPage({ selectedId: "activity-lliga-social-3" });
    card = await maintenance("Lliga social — 3a jornada");
    fireEvent.click(within(card).getByRole("button", { name: "DESPUBLICA" }));
    expect(await screen.findByText("Activitat despublicada")).toBeVisible();
    expect(within(card).getByRole("button", { name: "PUBLICA" })).toBeVisible();
  });

  it("[ELIMINA] cancels the draft with reason DELETED and returns to the list", async () => {
    const { onNavigate } = await renderPage({ selectedId: DEMONSTRATION });
    const card = await maintenance("Demostració Festa Major");
    fireEvent.click(within(card).getByRole("button", { name: "ELIMINA" }));
    const modal = await screen.findByRole("dialog", { name: "Vols eliminar l'activitat?" });
    fireEvent.click(within(modal).getByRole("button", { name: "ELIMINA" }));
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith("/activitats");
    });
    const deleted = await client().GET("/activities/{id}", {
      params: { path: { id: DEMONSTRATION } },
    });
    expect(deleted.data).toMatchObject({ cancellation: { reason: "DELETED" }, state: "CANCELLED" });
  });

  it("R-07-02 DUPLICATE_SLUG and SLUG_LOCKED land on the slug field", async () => {
    await renderPage({ selectedId: DEMONSTRATION });
    const card = await maintenance("Demostració Festa Major");
    const slug = within(card).getByLabelText("Identificador de l'adreça");
    fireEvent.change(slug, { target: { value: "torneig-estiu-2026" } });
    fireEvent.click(within(card).getByRole("button", { name: "DESA" }));
    const slugField = slug.closest(".ah-form-field");
    if (!(slugField instanceof HTMLElement)) throw new TypeError("Missing the slug field");
    expect(await within(slugField).findByRole("alert")).toHaveTextContent(
      "Aquest identificador d'adreça ja està en ús.",
    );

    server.use(
      http.patch("*/api/v1/activities/:id", () =>
        HttpResponse.json(
          { code: "SLUG_LOCKED", details: {}, message: "locked", traceId: "t" },
          { status: 409 },
        ),
      ),
    );
    fireEvent.change(slug, { target: { value: "demostracio-2026" } });
    fireEvent.click(within(card).getByRole("button", { name: "DESA" }));
    await waitFor(() => {
      expect(within(slugField).getByRole("alert")).toHaveTextContent(
        "L'identificador d'adreça està bloquejat.",
      );
    });
  });

  it("D7 list: a finished activity without maximum reads «—»; a filtered empty list keeps «Neteja»", async () => {
    const real = (
      await client().GET("/activities", { params: { query: { filter: ["deleted:eq:false"] } } })
    ).data;
    if (real === undefined) throw new TypeError("Missing the D7 list");
    server.use(
      http.get("*/api/v1/activities", ({ request }) =>
        new URL(request.url).searchParams.get("q") === null
          ? HttpResponse.json({
              ...real,
              items: real.items.map((item) =>
                item.id === "activity-lliga-social-3" ? { ...item, state: "FINISHED" } : item,
              ),
            })
          : undefined,
      ),
    );
    await renderPage();
    expect((await listRow("Lliga social — 3a jornada")).slice(3, 5)).toEqual(["—", "finalitzada"]);
    cleanup();
    server.resetHandlers();

    window.history.replaceState(null, "", "/activitats?q=inexistent");
    const clubBranding: Branding = { ...branding };
    const i18n = await createI18n({
      branding: clubBranding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-activities", "admin-catalogs", "census", "enums", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={clubBranding}>
          <ActivitiesPage client={client()} onNavigate={vi.fn()} readOnly={false} />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const emptyTitle = await screen.findByRole("heading", {
      name: "Cap activitat amb aquests criteris",
    });
    const empty = emptyTitle.closest(".ah-empty-state");
    if (!(empty instanceof HTMLElement)) throw new TypeError("Missing the empty state");
    expect(within(empty).getByRole("button", { name: "Neteja" })).toBeVisible();
    expect(within(empty).queryByRole("button", { name: "Nova activitat" })).toBeNull();
  });

  it("registrants: «cancel·lada pel club» after a cancellation; an INSTRUCTOR reads plain text", async () => {
    await client().POST("/activities/{id}/cancellation", {
      body: { adminText: "Pluja forta: pistes tancades", reason: "CLUB_MANUAL" },
      params: {
        header: { "Idempotency-Key": crypto.randomUUID() },
        path: { id: WORKSHOP },
      },
    });
    const renderRegistrants = async (readOnly: boolean) => {
      window.history.replaceState(null, "", `/activitats/${WORKSHOP}/inscrits`);
      const i18n = await createI18n({
        branding,
        browserLanguages: ["ca"],
        initialNamespaces: ["admin-activities", "census", "enums", "errors"],
        storage: undefined,
      });
      render(
        <I18nextProvider i18n={i18n}>
          <BrandingProvider branding={branding}>
            <ActivityRegistrantsPage
              activityId={WORKSHOP}
              client={client()}
              onNavigate={vi.fn()}
              readOnly={readOnly}
            />
          </BrandingProvider>
        </I18nextProvider>,
      );
      return screen.findByRole("table");
    };
    let table = await renderRegistrants(false);
    await waitFor(() => {
      expect(within(table).getAllByText("cancel·lada pel club")).toHaveLength(12);
    });
    expect(within(table).getAllByRole("link").length).toBeGreaterThan(0);
    cleanup();

    mockScenario("instructor");
    table = await renderRegistrants(true);
    await waitFor(() => {
      expect(within(table).getAllByText("cancel·lada pel club")).toHaveLength(12);
    });
    expect(within(table).queryAllByRole("link")).toHaveLength(0);
  });
});

/** Requests whose path ends with `suffix`: method, JSON body and `Idempotency-Key`. */
function recordRequests(suffix: string) {
  const seen: { body: unknown; key: string | null; method: string; url: URL }[] = [];
  const listener = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (!url.pathname.endsWith(suffix)) return;
    const entry = {
      body: undefined as unknown,
      key: request.headers.get("Idempotency-Key"),
      method: request.method,
      url,
    };
    seen.push(entry);
    if (request.method !== "GET") {
      void request
        .clone()
        .json()
        .then(
          (body: unknown) => {
            entry.body = body;
          },
          () => undefined,
        );
    }
  };
  server.events.on("request:start", listener);
  return {
    seen,
    stop: () => {
      server.events.removeListener("request:start", listener);
    },
  };
}

async function renderRegistrantsPage(activityId: string, search = "") {
  window.history.replaceState(null, "", `/activitats/${activityId}/inscrits${search}`);
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-activities", "census", "enums", "errors"],
    storage: undefined,
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <ActivityRegistrantsPage
          activityId={activityId}
          client={client()}
          onNavigate={vi.fn()}
          readOnly={false}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
}

/** Opens the universal list's `<details>` menu whose summary starts with `name`. */
function menu(name: string) {
  const summary = [...document.querySelectorAll("summary")].find((element) =>
    element.textContent.trim().startsWith(name),
  );
  const details = summary?.parentElement;
  if (summary === undefined || !(details instanceof HTMLElement)) {
    throw new TypeError(`Missing the menu ${name}`);
  }
  fireEvent.click(summary);
  return details;
}

describe("E4-W08 D7 follow-ups of the E4-W04 round-2 review", () => {
  it("R-07-04 the rich text is read-only while [DESA] is pending, and nothing typed is lost", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = 0;
    server.use(
      http.patch("*/api/v1/activities/:id", async () => {
        held += 1;
        if (held === 1) await gate;
        return undefined;
      }),
    );
    await renderPage({ selectedId: TOURNAMENT });
    const card = await maintenance("Torneig d'Estiu 2026");
    const editor = within(card).getByRole("textbox", { name: "Descripció llarga (text ric)" });
    await waitFor(() => {
      expect(editor.innerHTML).toContain("<h3>Horaris</h3>");
    });
    expect(editor).toHaveAttribute("contenteditable", "true");
    editor.innerHTML = "<p>Abans de desar</p>";
    fireEvent.input(editor);
    fireEvent.click(within(card).getByRole("button", { name: "DESA" }));

    // While the PATCH is pending the editor refuses input (aria-readonly), toolbar included.
    await waitFor(() => {
      expect(editor).toHaveAttribute("contenteditable", "false");
    });
    expect(editor).toHaveAttribute("aria-readonly", "true");
    for (const tool of within(
      within(card).getByRole("toolbar", { name: "Format del text" }),
    ).getAllByRole("button")) {
      expect(tool).toBeDisabled();
    }
    editor.innerHTML = "<p>Escrit durant el desat</p>";
    fireEvent.input(editor);
    expect(editor.innerHTML).toBe("<p>Abans de desar</p>");

    release();
    expect(await screen.findByText("Canvis desats")).toBeVisible();
    expect(editor).toHaveAttribute("contenteditable", "true");
    expect(editor).not.toHaveAttribute("aria-readonly");
    expect(editor.innerHTML).toBe("<p>Abans de desar</p>");
    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toMatchObject({ longDescription: { ca: "<p>Abans de desar</p>" } });
    expect(within(card).getByRole("button", { name: "DESA" })).toBeDisabled();

    // Typing again after the save is kept and sent.
    editor.innerHTML = "<p>Després del desat</p>";
    fireEvent.input(editor);
    fireEvent.click(within(card).getByRole("button", { name: "DESA" }));
    await waitFor(() => {
      expect(patchBodies).toHaveLength(2);
    });
    expect(patchBodies[1]).toMatchObject({ longDescription: { ca: "<p>Després del desat</p>" } });
  });

  it("R-07-14 an INSTRUCTOR (403 on /parameters) of a club without levels sees no «Nivells» on an activity without levels", async () => {
    const parameters = recordRequests("/parameters/levels.enabled");
    mockScenario("activitiesInstructorNoLevels");
    await renderPage({ readOnly: true, selectedId: TOURNAMENT });
    const card = await maintenance("Torneig d'Estiu 2026");
    await waitFor(() => {
      expect(parameters.seen).toHaveLength(1);
    });
    await waitFor(() => {
      expect(within(card).queryByText(/^Nivells:/u)).toBeNull();
    });
    parameters.stop();
  });

  it("R-07-14 an INSTRUCTOR sees «Nivells» when the activity itself has levels (the D4 rule)", async () => {
    const seminar = await client().GET("/activities/{id}", {
      params: { path: { id: "activity-seminari-handling" } },
    });
    await client().PATCH("/activities/{id}", {
      body: { levelIds: ["level-a", "level-b"], version: seminar.data?.version ?? 0 },
      params: { path: { id: "activity-seminari-handling" } },
    });
    mockScenario("instructor");
    await renderPage({ readOnly: true, selectedId: "activity-seminari-handling" });
    const card = await maintenance("Seminari de handling");
    expect(await within(card).findByText("Nivells: A, B")).toBeVisible();
  });

  it("R-07-05 away from the club the hours cover the whole day: 6:00 when the club opens at 7:00", async () => {
    await renderPage({ selectedId: DEMONSTRATION });
    const card = await maintenance("Demostració Festa Major");
    const start = within(card).getByLabelText("Hora d'inici");
    await waitFor(() => {
      expect(within(start).getByRole("option", { name: "0:00" })).toBeInTheDocument();
    });
    expect(within(start).getByRole("option", { name: "6:00" })).toBeInTheDocument();
    expect(within(start).getByRole("option", { name: "23:50" })).toBeInTheDocument();
    fireEvent.change(start, { target: { value: "06:00" } });
    expect(start).toHaveValue("06:00");
    fireEvent.click(within(card).getByRole("button", { name: "DESA" }));
    expect(await screen.findByText("Canvis desats")).toBeVisible();
    expect(patchBodies).toEqual([{ startTime: "06:00", version: 1 }]);
    cleanup();

    // At the club with linked rings the ring blocks keep the opening hours (7:00–22:00).
    await renderPage({ selectedId: TOURNAMENT });
    const club = await maintenance("Torneig d'Estiu 2026");
    const clubStart = within(club).getByLabelText("Hora d'inici");
    await waitFor(() => {
      expect(within(clubStart).getByRole("option", { name: "7:00" })).toBeInTheDocument();
    });
    expect(within(clubStart).queryByRole("option", { name: "6:00" })).toBeNull();
  });

  it("R-07-06 ADMIN_TEXT_REQUIRED after an empty preview fetches it again and asks for the notice text", async () => {
    let previews = 0;
    server.use(
      http.get("*/api/v1/activities/:id/cancellation-preview", () => {
        previews += 1;
        // Nobody was registered when the modal opened; 22 registered before the confirmation.
        return previews === 1
          ? HttpResponse.json({ activeCount: 0, registrations: [], waitingCount: 0 })
          : undefined;
      }),
    );
    const cancellations = recordRequests(`/activities/${TOURNAMENT}/cancellation`);
    await renderPage({ selectedId: TOURNAMENT });
    const card = await maintenance("Torneig d'Estiu 2026");
    fireEvent.click(within(card).getByRole("button", { name: "CANCEL·LA L'ACTIVITAT" }));
    const simple = await screen.findByRole("dialog", { name: "Vols cancel·lar l'activitat?" });
    fireEvent.click(within(simple).getByRole("button", { name: "CANCEL·LA L'ACTIVITAT" }));

    const modal = await screen.findByRole("dialog", {
      name: "Cancel·lar l'activitat — Torneig d'Estiu 2026",
    });
    expect(previews).toBe(2);
    const text = within(modal).getByLabelText("Text de l'avís");
    expect(text).toHaveAccessibleDescription("Cal escriure el text de l'avís per als alumnes.");
    expect(within(modal).getAllByRole("row")).toHaveLength(22);
    fireEvent.change(text, { target: { value: "Pluja forta: pistes tancades" } });
    fireEvent.click(
      within(modal).getByRole("button", { name: "CANCEL·LA I AVISA ELS 22 INSCRITS" }),
    );
    expect(await screen.findByText("Activitat cancel·lada")).toBeVisible();
    await waitFor(() => {
      expect(cancellations.seen.map((request) => request.body)).toEqual([
        { reason: "CLUB_MANUAL" },
        { adminText: "Pluja forta: pistes tancades", reason: "CLUB_MANUAL" },
      ]);
    });
    const [first, second] = cancellations.seen;
    expect(first?.key).not.toBe(second?.key);
    cancellations.stop();
  });

  it("S07 §6 the registrants filter by member (memberId): values from the registrants, the name in the chip, saved views and the URL", async () => {
    const registrants = await client().GET("/activities/{id}/registrations", {
      params: { path: { id: WORKSHOP } },
    });
    const member = registrants.data?.items[1]?.member;
    if (member === undefined) throw new TypeError("Missing the second registrant");
    const label = `${member.fullName} · ${member.memberNumber}`;
    const lists = recordRequests(`/activities/${WORKSHOP}/registrations`);
    const views = recordRequests("/saved-views");
    await renderRegistrantsPage(WORKSHOP);
    const table = await screen.findByRole("table");
    await within(table).findByText(label);

    const filters = menu("Filtre");
    const field = within(filters).getByLabelText("Columna");
    expect(
      within(field)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Estat", "Origen", "Data d'inscripció", "Abonat"]);
    fireEvent.change(field, { target: { value: "memberId" } });
    const value = within(filters).getByLabelText("Valor");
    await waitFor(() => {
      expect(within(value).getByRole("option", { name: `${label} (1)` })).toBeInTheDocument();
    });
    fireEvent.change(value, { target: { value: member.id } });
    fireEvent.click(within(filters).getByRole("button", { name: "Afegeix el filtre" }));

    await waitFor(() => {
      expect(lists.seen.map((request) => request.url.searchParams.getAll("filter"))).toContainEqual(
        [`memberId:eq:${member.id}`],
      );
    });
    await waitFor(() => {
      expect(within(table).getAllByRole("row")).toHaveLength(2);
    });
    expect(filters.querySelector("summary")).toHaveTextContent(`Filtre (1): Abonat = «${label}»`);
    expect(within(filters).getByText(`Abonat = «${label}»`)).toBeVisible();
    expect(new URLSearchParams(window.location.search).getAll("filter")).toEqual([
      `memberId:eq:${member.id}`,
    ]);

    // Saved view: the filter is stored with the view.
    const viewsMenu = menu("Vistes");
    fireEvent.change(within(viewsMenu).getByLabelText("Nom de la vista"), {
      target: { value: "Només un abonat" },
    });
    fireEvent.click(within(viewsMenu).getByRole("button", { name: "Desa la vista" }));
    await waitFor(() => {
      expect(views.seen.find((request) => request.method === "POST")?.body).toMatchObject({
        filters: [{ field: "memberId", op: "eq", value: member.id }],
        listKey: "activity-registrations",
      });
    });
    cleanup();

    // The URL (reload or shared link): the filter and its member label come back.
    await renderRegistrantsPage(WORKSHOP, `?filter=memberId%3Aeq%3A${member.id}`);
    expect(await screen.findByText(`Abonat = «${label}»`)).toBeInTheDocument();
    await waitFor(() => {
      expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    });
    lists.stop();
    views.stop();
  });
});
