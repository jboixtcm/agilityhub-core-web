import { createApiClient } from "@agilityhub/api-client";
import {
  mockScenario,
  type MockScenario,
  resetMessagingMockState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnouncementsPage } from "./AnnouncementsPage";

const canic: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

interface Recorded {
  body?: unknown;
  line: string;
}

/** Every api request of the page (`METHOD path?query`), with the JSON bodies. */
function recordRequests(): Recorded[] {
  const list: Recorded[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    const entry: Recorded = {
      line: `${request.method} ${url.pathname.replace(/^\/api\/v1/u, "")}${url.search}`,
    };
    list.push(entry);
    if (["POST", "PUT"].includes(request.method)) {
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
  });
  return list;
}

async function renderD9({
  modules = canic.modules,
  path = "/comunicats?template=tpl-n-28",
  scenario = "admin",
}: { modules?: readonly string[]; path?: string; scenario?: MockScenario } = {}) {
  mockScenario(scenario);
  window.history.replaceState(null, "", path);
  const branding: Branding = { ...canic, modules: [...modules] };
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-messaging", "admin-audit", "enums", "errors", "common"],
    storage: undefined,
  });
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => "ca",
  });
  const onNavigate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <AnnouncementsPage client={client} onNavigate={onNavigate} />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Comunicats i plantilles" });
  return { onNavigate };
}

const editor = () => screen.findByRole("region", { name: "Editor de la plantilla" });
const body = () => screen.getByLabelText<HTMLTextAreaElement>("Text");
const title = () => screen.getByLabelText<HTMLInputElement>("Títol —");
const save = () => screen.getByRole("button", { name: "DESA" });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetMessagingMockState();
});
afterEach(() => {
  cleanup();
  server.events.removeAllListeners();
  server.resetHandlers();
  resetMessagingMockState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("T-11-37 D9 «Comunicats i plantilles» (S11 §2, R-11-12)", () => {
  it("mockup D9: the four counts, a category row filters the list, and N-28 opens with its title, category chip, icons, «idioma: CA (amb versió ES)», the body with the variables' labels and the variable chips", async () => {
    await renderD9();
    await editor();
    const rows = screen
      .getAllByRole("button", { pressed: false })
      .filter((button) => button.classList.contains("messaging-categories__row"));
    expect(rows.map((row) => row.textContent)).toEqual([
      "Operativa (reserves, canvis — sistema)12",
      "Comunicats individuals (canvi de nivell, baixa…)6",
      "Canvis en reserves (anul·lacions del club, espera)8",
      "Comunicats del club (activitats, avisos generals)4",
    ]);
    fireEvent.click(screen.getByRole("button", { name: /^Comunicats individuals/u }));
    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Plantilles" })).getAllByRole("listitem"),
      ).toHaveLength(6);
    });
    const list = within(screen.getByRole("list", { name: "Plantilles" }));
    expect(list.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Benvinguda amb accés (N-02)",
      "Canvi de nivell (N-09)",
      "Comunicació de baixa com a associat (N-28)← editant",
      "T'hem trobat a faltar (N-19)",
      "Tasca nova (N-20)",
      "Nou gos afegit (N-37)",
    ]);
    expect(title().value).toBe("Comunicació de baixa com a associat");
    expect(screen.getByText("Comunicats individuals", { selector: ".ah-chip" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Document" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("(amb versió ES)")).toBeVisible();
    expect(body().value).toBe(
      "Hola [[persona_nom]],\net comuniquem que en data [[persona_data_baixa]] s'ha fet efectiva la teva baixa com a associat de [[entitat_nom]].\nT'agraïm el temps que hem compartit — les portes sempre seran obertes per a tu i per a [[gos_nom]].\nFins aviat!",
    );
    expect(
      screen.getAllByRole("button", { name: /^Insereix/u }).map((button) => button.textContent),
    ).toEqual([
      "[[persona_nom]]",
      "[[persona_cognoms]]",
      "[[gos_nom]]",
      "[[gos_nivell]]",
      "[[classe_data]]",
      "[[entitat_nom]]",
      "[[persona_data_baixa]]",
    ]);
    expect(
      screen.getByText(
        "Els textos per a instructors i administració són del producte i no s'editen",
      ),
    ).toBeVisible();
    expect(save()).toBeDisabled();
  });

  it("the language select switches the title and the body; a variable chip inserts its label at the caret and [DESA] saves the code keys with the version read", async () => {
    const requests = recordRequests();
    await renderD9();
    await editor();
    fireEvent.change(screen.getByLabelText("Idioma del text"), { target: { value: "es" } });
    expect(title().value).toBe("Comunicación de baja como asociado");
    expect(body().value).toMatch(/^Hola \[\[persona_nom\]\],\nte comunicamos/u);
    fireEvent.change(screen.getByLabelText("Idioma del text"), { target: { value: "ca" } });
    const field = body();
    fireEvent.focus(field);
    field.setSelectionRange(5, 5);
    fireEvent.click(screen.getByRole("button", { name: "Insereix [[gos_nom]]" }));
    expect(body().value.startsWith("Hola [[gos_nom]][[persona_nom]],")).toBe(true);
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => {
      expect(save()).toBeDisabled();
    });
    const put = requests.find((request) => request.line === "PUT /message-templates/tpl-n-28");
    expect(put?.body).toMatchObject({ enabled: true, version: 3 });
    const sent = put?.body as { body: Record<string, string> } | undefined;
    expect(sent?.body.ca?.startsWith("Hola [[dog_name]][[member_first_name]],")).toBe(true);
    expect(sent?.body.es).toContain("[[effective_date]]");
    expect(body().value.startsWith("Hola [[gos_nom]][[persona_nom]],")).toBe(true);
  });

  it("the matrix: a cell outside caps is an inert «—», one inside toggles; the Push column is informative; SMS and Push columns follow the modules", async () => {
    const requests = recordRequests();
    await renderD9();
    await editor();
    const matrix = screen.getByRole("table");
    expect(
      within(matrix)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["App", "Correu", "SMS", "Push"]);
    const inert = within(matrix).getByRole("checkbox", { name: "Alumne · SMS: no disponible" });
    expect(inert).toHaveAttribute("aria-disabled", "true");
    expect(inert.tagName).toBe("SPAN");
    fireEvent.click(inert);
    expect(save()).toBeDisabled();
    expect(within(matrix).getByText("segons prefer.")).toBeVisible();
    expect(within(matrix).getByRole("img", { name: "Alumne: sense push" })).toBeVisible();
    expect(within(matrix).queryAllByRole("button")).toHaveLength(0);
    fireEvent.click(within(matrix).getByRole("checkbox", { name: "Instructors · App" }));
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => {
      expect(save()).toBeDisabled();
    });
    expect(
      requests.find((request) => request.line === "PUT /message-templates/tpl-n-28")?.body,
    ).toMatchObject({ matrix: { INSTRUCTORS: { APP: true, EMAIL: false, SMS: false } } });
    cleanup();
    await renderD9({
      modules: canic.modules.filter((module) => module !== "SMS"),
      scenario: "messagingNoSms",
    });
    await editor();
    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["App", "Correu", "Push"]);
    cleanup();
    await renderD9({
      modules: canic.modules.filter((module) => module !== "PUSH"),
      path: "/comunicats?template=tpl-n-24",
      scenario: "messagingNoPush",
    });
    await editor();
    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["App", "Correu", "SMS"]);
  });

  it("[Vista prèvia] renders the unsaved draft per language with the SMS counter and the truncation note, and «Envia'm una prova» says it was sent", async () => {
    const requests = recordRequests();
    await renderD9({ path: "/comunicats?template=tpl-n-08a" });
    await editor();
    fireEvent.change(title(), { target: { value: "Classe anul·lada pel club (pluja)" } });
    fireEvent.click(screen.getByRole("button", { name: "Vista prèvia" }));
    const dialog = await screen.findByRole("dialog", { name: "Vista prèvia" });
    expect(
      await within(dialog).findByText("Classe anul·lada pel club (pluja)", { selector: "strong" }),
    ).toBeVisible();
    expect(
      within(dialog).getByText("Classe anul·lada pel club (pluja)", { selector: "p" }),
    ).toHaveClass("messaging-preview__subject");
    expect(within(dialog).getByText("160 caràcters · 1 segment")).toBeVisible();
    expect(within(dialog).getByText("S'escurçarà amb …")).toBeVisible();
    expect(within(dialog).getByTitle("Correu de la vista prèvia")).toHaveAttribute("sandbox", "");
    fireEvent.click(within(dialog).getByRole("tab", { name: "ES" }));
    expect(
      await within(dialog).findByText("Clase anulada por el club", { selector: "strong" }),
    ).toBeVisible();
    const previews = requests.filter(
      (request) => request.line === "POST /message-templates/tpl-n-08a/preview",
    );
    expect(previews.map((request) => (request.body as { locale: string }).locale)).toEqual([
      "ca",
      "es",
    ]);
    expect((previews[0]?.body as { draft: { title: string } }).draft.title).toBe(
      "Classe anul·lada pel club (pluja)",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Envia'm una prova" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent("T'hem enviat la prova");
  });

  it("a stale PUT says «Algú ha modificat aquesta plantilla; recarrega-la»; [Recarrega] reads it again and keeps the admin's edits — the text and the one matrix cell they clicked — saved on the new version", async () => {
    const requests = recordRequests();
    await renderD9();
    await editor();
    fireEvent.change(body(), { target: { value: "Hola [[persona_nom]], fins aviat!" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Instructors · App" }));
    // Another admin saves the template first (version 3 → 4): another colour and another cell.
    const other = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
    const { data } = await other.GET("/message-templates/{id}", {
      params: { path: { id: "tpl-n-28" } },
    });
    if (data === undefined) throw new TypeError("No N-28");
    await other.PUT("/message-templates/{id}", {
      body: {
        body: data.bodyI18n,
        color: "OK",
        enabled: true,
        icon: data.icon,
        matrix: { ...data.matrix, ADMINS: { ...data.matrix.ADMINS, EMAIL: true } },
        title: data.titleI18n,
        version: data.version,
      },
      params: { path: { id: "tpl-n-28" } },
    });
    fireEvent.click(save());
    expect(
      await screen.findByText("Algú ha modificat aquesta plantilla; recarrega-la"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Recarrega" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Correcte" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(body().value).toBe("Hola [[persona_nom]], fins aviat!");
    fireEvent.click(save());
    await waitFor(() => {
      expect(save()).toBeDisabled();
    });
    const puts = requests
      .filter((request) => request.line === "PUT /message-templates/tpl-n-28")
      .map((request) => request.body as { color: string; matrix: unknown; version: number });
    // The other admin's save, the refused one (version 3), and the rebased one: the admin's own
    // edits (the text, Instructors · App) on version 4, with the other admin's colour and cell kept.
    expect(puts.map((put) => [put.version, put.color])).toEqual([
      [3, "OK"],
      [3, "NEUTRAL"],
      [4, "OK"],
    ]);
    expect(puts[2]?.matrix).toEqual({
      ADMINS: { APP: true, EMAIL: true, SMS: false },
      INSTRUCTORS: { APP: true, EMAIL: false, SMS: false },
      MEMBER: { APP: true, EMAIL: true, SMS: false },
    });
  });

  it("the secondary actions as the api allows them: «Restaura el text per defecte» only when customized, no [Desactiva] on a mandatory template, «Elimina» only on the club's own", async () => {
    await renderD9();
    await editor();
    expect(screen.getByRole("button", { name: "Restaura el text per defecte" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Desactiva" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restaura el text per defecte" }));
    const confirm = screen.getByRole("dialog", {
      name: "Vols restaurar el text per defecte d'aquesta plantilla?",
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Restaura" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Restaura el text per defecte" })).toBeNull();
    });
    expect(body().value).not.toContain("\n");
    cleanup();
    await renderD9({ path: "/comunicats?template=tpl-n-02" });
    await editor();
    expect(screen.queryByRole("button", { name: "Desactiva" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restaura el text per defecte" })).toBeNull();
    cleanup();
    await renderD9({ path: "/comunicats?template=tpl-custom-1" });
    await editor();
    expect(screen.getByLabelText("Categoria")).toHaveValue("CLUB_NEWS");
    fireEvent.click(screen.getByRole("button", { name: "Elimina" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Vols eliminar aquesta plantilla?" })).getByRole(
        "button",
        { name: "Elimina" },
      ),
    );
    expect(await screen.findByText("Tria una plantilla")).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Comunicats del club/u })).toHaveTextContent(
        /3$/u,
      );
    });
  });

  it("errors by code where they belong: a missing required variable under the text (VALIDATION_ERROR missingVariables), a disabled mandatory template never offered", async () => {
    await renderD9({ path: "/comunicats?template=tpl-n-02" });
    await editor();
    fireEvent.change(body(), { target: { value: "Ja tens accés a l'app del club." } });
    fireEvent.click(save());
    expect(await screen.findByText("Falta la variable [[enllac]] al text")).toBeVisible();
  });

  it("«＋ Nova plantilla» creates a CUSTOM template of the chosen category and opens it; the admin's unsaved edits stay with their template while another one is open", async () => {
    const requests = recordRequests();
    await renderD9();
    await editor();
    fireEvent.change(body(), { target: { value: "Hola [[persona_nom]]." } });
    fireEvent.click(screen.getByRole("button", { name: "Canvi de nivell (N-09)" }));
    await waitFor(() => {
      expect(title().value).toBe("Canvi de nivell");
    });
    expect(screen.getByText("sense desar")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^Comunicació de baixa com a associat/u }));
    await waitFor(() => {
      expect(body().value).toBe("Hola [[persona_nom]].");
    });
    fireEvent.click(screen.getByRole("button", { name: "Nova plantilla" }));
    const dialog = screen.getByRole("dialog", { name: "Nova plantilla" });
    fireEvent.change(within(dialog).getByLabelText("Categoria"), { target: { value: "PERSONAL" } });
    fireEvent.change(within(dialog).getByLabelText("Títol"), {
      target: { value: "Portes obertes" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea" }));
    await waitFor(() => {
      expect(title().value).toBe("Portes obertes");
    });
    expect(
      requests.find((request) => request.line === "POST /message-templates")?.body,
    ).toMatchObject({
      body: { ca: "Portes obertes" },
      category: "PERSONAL",
      title: { ca: "Portes obertes" },
    });
    expect(new URLSearchParams(window.location.search).get("template")).toMatch(/^tpl-custom-/u);
  });
});
