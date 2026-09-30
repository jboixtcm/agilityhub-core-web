import { createApiClient } from "@agilityhub/api-client";
import {
  ATTENDANCE_MOCK_NOW,
  mockScenario,
  resetAttendanceMockState,
  resetFollowupMockState,
  type MockScenario,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "../booking/test-utils";

import { TasksPage } from "./TasksPage";

const canic: Branding = {
  ...brandingCanicFixture,
  locales: ["ca", "es", "en"],
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

interface Recorded {
  body?: unknown;
  key: string | null;
  line: string;
}

/** Every api request of the page (`METHOD path?query`), with the JSON bodies and keys. */
function recordRequests(): Recorded[] {
  const list: Recorded[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    const entry: Recorded = {
      key: request.headers.get("Idempotency-Key"),
      line: `${request.method} ${url.pathname.replace(/^\/api\/v1/u, "")}${url.search}`,
    };
    list.push(entry);
    if (["PATCH", "POST", "PUT"].includes(request.method) && url.pathname.startsWith("/api/")) {
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

async function renderTasks({
  locale = "ca",
  scenario = "instructor",
}: { locale?: "ca" | "en" | "es"; scenario?: MockScenario } = {}) {
  mockScenario(scenario);
  window.history.replaceState(null, "", "/instructor/alumnes/dog-duna/tasques");
  const i18n = await createI18n({
    branding: canic,
    browserLanguages: [locale],
    initialNamespaces: ["instructor", "enums", "errors", "common"],
    storage: undefined,
  });
  const client = createApiClient({
    baseUrl: `${window.location.origin}/api/v1`,
    getLocale: () => locale,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={canic}>
        <TasksPage client={client} dogId="dog-duna" />
      </BrandingProvider>
    </I18nextProvider>,
  );
  await waitFor(() => {
    expect(document.querySelectorAll(".ah-task")).toHaveLength(3);
  });
}

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new TypeError("Expected an element");
  return value;
}
const cards = () => [...document.querySelectorAll<HTMLElement>(".ah-tasks__list > .ah-task")];
const card = (index: number) => present(cards()[index]);
const firstPicker = () =>
  present(screen.getAllByLabelText("Adjunta un fitxer", { selector: "input" })[0]);
/** «state | text | meta» of a task card, as a reader sees it. */
const cardText = (card: HTMLElement | undefined) =>
  [".ah-badge", ".ah-task__text", ".ah-task__meta"]
    .map((selector) => clean(card?.querySelector(selector)?.textContent))
    .join(" | ");
const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/gu, " ").trim();

function file(name: string, type: string, size = 1_000): File {
  const created = new File(["x"], name, { type });
  Object.defineProperty(created, "size", { value: size });
  return created;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  vi.useFakeTimers({
    now: new Date(ATTENDANCE_MOCK_NOW),
    shouldAdvanceTime: true,
    toFake: ["Date"],
  });
  resetFollowupMockState();
  resetAttendanceMockState();
});
afterEach(() => {
  cleanup();
  server.events.removeAllListeners();
  server.resetHandlers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetFollowupMockState();
  resetAttendanceMockState();
  mockScenario("member");
});
afterAll(() => {
  server.close();
});

describe("T-10-28 (26) screen 26 «Tasques i notes» (S10 §2, R-10-10…R-10-12)", () => {
  it("mockup 26: the title, the private observations, the three tasks (the done one struck through with «feta per la Laura el 02-08»), the history link, the member's note read-only and [DESA] waiting for a change", async () => {
    await renderTasks();
    expect(
      screen.getByRole("heading", { level: 1, name: "Tasques i notes — Laura + Duna" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Observacions · privades · camp únic" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Observacions privades")).toHaveValue(
      "Va molt bé amb reforç de pilota. Evitar sobrecàrrega de salts: revisar espatlla dreta si coixeja. Parlar amb la Laura del pas a D a final de temporada.",
    );
    const header = screen.getByRole("heading", { name: "Tasques" }).parentElement;
    expect(within(present(header)).getByRole("button", { name: "Afegir" })).toBeVisible();
    expect(cards().map((card) => cardText(card))).toEqual([
      "pendent | Aquesta setmana practiqueu el balancí amb calma: sessions curtes i moltes recompenses | 31-07 · Estel · vídeo_balancí.mp4",
      "pendent | Repasseu la taula de contactes al jardí, 5 minuts al dia | 30-07 · Marc",
      "feta | Treballar l'«espera» a la línia de sortida | 28-07 · Estel · feta per la Laura el 02-08",
    ]);
    expect(cards()[2]?.querySelector(".ah-task__text")).toHaveTextContent(
      "Treballar l'«espera» a la línia de sortida",
    );
    expect(cards()[2]).toHaveClass("ah-task--done");
    expect(screen.getByRole("button", { name: "Veure l'historial complet ›" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Notes als instructors · de l'alumne · només lectura" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "A veure si treballem una mica el doble a classe. El gos s'atura molt aviat al balancí",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "foto_balancí.jpg" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Desa" })).toBeDisabled();
  });

  it("T-10-25 «＋ Afegir» uploads the video through the signed url (TASK, the signed headers, no bearer) and creates one task with one Idempotency-Key, even on a double tap; 22's counters follow", async () => {
    const requests = recordRequests();
    await renderTasks();
    fireEvent.click(screen.getByRole("button", { name: "Afegir" }));
    const form = screen.getByRole("form", { name: "Nova tasca" });
    fireEvent.change(within(form).getByLabelText("Text de la tasca nova"), {
      target: { value: "Salts amb calma" },
    });
    fireEvent.change(within(form).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
      target: { files: [file("vídeo_salt.mp4", "video/mp4")] },
    });
    const create = within(form).getByRole("button", { name: "Afegeix" });
    fireEvent.click(create);
    fireEvent.click(create);
    await waitFor(() => {
      expect(cards()).toHaveLength(4);
    });
    expect(cardText(cards()[0])).toBe("pendent | Salts amb calma | 03-08 · Estel · vídeo_salt.mp4");
    const writes = requests.filter((request) => !request.line.startsWith("GET"));
    expect(
      writes.map((request) => request.line.replace(/mock-uploads\/.+$/u, "mock-uploads/…")),
    ).toEqual(["POST /attachments/upload-url", "PUT /mock-uploads/…", "POST /tasks"]);
    const upload = writes[0];
    expect(upload?.body).toEqual({
      fileName: "vídeo_salt.mp4",
      mimeType: "video/mp4",
      purpose: "TASK",
      sizeBytes: 1_000,
    });
    const created = writes[2];
    expect(created?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(created?.body).toEqual({
      attachmentIds: [expect.stringMatching(/^task\/mock\//u)],
      dogId: "dog-duna",
      text: "Salts amb calma",
    });
    // A read after the write sees it: the card of 22/D13 counts three pending tasks now.
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line === "GET /dogs/dog-duna/instructor-card"),
      ).toHaveLength(2);
    });
  });

  it("the pencil edits the text with the version read; the ✕ asks «Vols eliminar aquesta tasca?» and deletes with its key; ✓ completes (feta per l'Estel) and ↺ reopens", async () => {
    const requests = recordRequests();
    await renderTasks();
    fireEvent.click(within(card(1)).getByRole("button", { name: "Edita la tasca" }));
    fireEvent.change(screen.getByLabelText("Text de la tasca"), {
      target: { value: "Repasseu la taula de contactes" },
    });
    fireEvent.click(within(card(1)).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(cardText(cards()[1])).toBe("pendent | Repasseu la taula de contactes | 30-07 · Marc");
    });
    expect(requests.find((request) => request.line === "PATCH /tasks/t2")?.body).toEqual({
      text: "Repasseu la taula de contactes",
      version: 1,
    });
    fireEvent.click(within(card(1)).getByRole("button", { name: "Elimina la tasca" }));
    const dialog = screen.getByRole("dialog", { name: "Vols eliminar aquesta tasca?" });
    expect(requests.some((request) => request.line.startsWith("DELETE"))).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    await waitFor(() => {
      expect(cards()).toHaveLength(2);
    });
    expect(requests.find((request) => request.line === "DELETE /tasks/t2")?.key).toMatch(
      /^[0-9a-f-]{36}$/u,
    );
    fireEvent.click(within(card(0)).getByRole("button", { name: "Marca-la com a feta" }));
    await waitFor(() => {
      expect(cardText(cards()[0])).toContain("feta per l'Estel el 03-08");
    });
    fireEvent.click(within(card(1)).getByRole("button", { name: "Torna-la a pendent" }));
    await waitFor(() => {
      expect(cardText(cards()[1])).toMatch(/^pendent \| Treballar/u);
    });
  });

  it("an edit opened before another instructor's change is sent with its own version: STALE_VERSION (409), and the typed text stays", async () => {
    const requests = recordRequests();
    await renderTasks();
    fireEvent.click(within(card(1)).getByRole("button", { name: "Edita la tasca" }));
    fireEvent.change(screen.getByLabelText("Text de la tasca"), {
      target: { value: "La meva versió" },
    });
    // Another instructor edits the same task (version 1 → 2) …
    await createApiClient({ baseUrl: `${window.location.origin}/api/v1` }).PATCH("/tasks/{id}", {
      body: { text: "La versió de la Núria", version: 1 },
      params: { path: { id: "t2" } },
    });
    // … and a write of mine reads the list again while the edit is open.
    fireEvent.click(within(card(0)).getByRole("button", { name: "Marca-la com a feta" }));
    await waitFor(() => {
      expect(cardText(card(0))).toContain("feta per l'Estel");
    });
    fireEvent.click(within(card(1)).getByRole("button", { name: "Desa" }));
    expect(
      await screen.findByText(
        "Aquest element s'ha modificat des d'un altre lloc. Actualitzeu-lo i torneu-ho a provar.",
      ),
    ).toBeVisible();
    expect(
      requests
        .filter((request) => request.line === "PATCH /tasks/t2")
        .map((request) => request.body),
    ).toEqual([
      { text: "La versió de la Núria", version: 1 },
      { text: "La meva versió", version: 1 },
    ]);
    expect(screen.getByLabelText("Text de la tasca")).toHaveValue("La meva versió");
  });

  it("errors by code inside the editor: TASK_ALREADY_DONE (422) after a completion the api refuses, then the list read again", async () => {
    server.use(
      http.post("*/api/v1/tasks/:id/completion", () =>
        HttpResponse.json(
          { code: "TASK_ALREADY_DONE", details: {}, message: "Task already done", traceId: "t" },
          { status: 422 },
        ),
      ),
    );
    const requests = recordRequests();
    await renderTasks();
    fireEvent.click(within(card(0)).getByRole("button", { name: "Marca-la com a feta" }));
    expect(await screen.findByText("Aquesta tasca ja està completada.")).toBeVisible();
    await waitFor(() => {
      expect(requests.filter((request) => request.line.startsWith("GET /tasks?"))).toHaveLength(2);
    });
  });

  it("[DESA] saves the observations with the version read and one key; a stale version (tasksStale) keeps the typed text to recover and saves it again on the new version", async () => {
    const requests = recordRequests();
    await renderTasks({ scenario: "tasksStale" });
    const field = screen.getByLabelText("Observacions privades");
    fireEvent.change(field, { target: { value: "Treballar la sortida amb calma." } });
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    expect(
      await screen.findByText("Algú ha desat les observacions fa un moment: revisa-les."),
    ).toBeVisible();
    expect(field).toHaveValue("Va molt bé amb reforç de pilota. Evitar sobrecàrrega de salts.");
    expect(screen.getByText("Treballar la sortida amb calma.")).toBeVisible();
    const first = requests.find((request) => request.line === "PUT /dogs/dog-duna/observations");
    expect(first?.body).toEqual({ text: "Treballar la sortida amb calma.", version: 4 });
    fireEvent.click(screen.getByRole("button", { name: "Recupera el meu text" }));
    expect(field).toHaveValue("Treballar la sortida amb calma.");
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Desa" })).toBeDisabled();
    });
    const puts = requests.filter((request) => request.line === "PUT /dogs/dog-duna/observations");
    expect(puts.map((request) => request.body)).toEqual([
      { text: "Treballar la sortida amb calma.", version: 4 },
      { text: "Treballar la sortida amb calma.", version: 5 },
    ]);
    expect(puts[0]?.key).not.toBe(puts[1]?.key);
    expect(field).toHaveValue("Treballar la sortida amb calma.");
    expect(
      screen.queryByText("Algú ha desat les observacions fa un moment: revisa-les."),
    ).toBeNull();
  });

  it("a file the api refuses (FILE_TOO_LARGE) is said inside the editor; with the club's limits readable (ADMIN) it is refused before any signed url", async () => {
    const requests = recordRequests();
    await renderTasks();
    fireEvent.change(firstPicker(), {
      target: { files: [file("vídeo_llarg.mp4", "video/mp4", 30 * 1024 * 1024)] },
    });
    expect(await screen.findByText("El fitxer és massa gran.")).toBeVisible();
    expect(requests.some((request) => request.line === "POST /attachments/upload-url")).toBe(true);
    cleanup();
    requests.length = 0;
    await renderTasks({ scenario: "admin" });
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line.startsWith("GET /parameters/files.")),
      ).toHaveLength(3);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.change(firstPicker(), {
      target: { files: [file("vídeo_llarg.mp4", "video/mp4", 30 * 1024 * 1024)] },
    });
    expect(await screen.findByText("vídeo_llarg.mp4: El fitxer és massa gran.")).toBeVisible();
    expect(requests.some((request) => request.line === "POST /attachments/upload-url")).toBe(false);
  });

  it("an observation file goes through the DOG_OBSERVATIONS upload and POST /attachments; a clip opens a fresh signed url", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const requests = recordRequests();
    await renderTasks();
    fireEvent.change(firstPicker(), {
      target: { files: [file("espatlla.jpg", "image/jpeg")] },
    });
    expect(await screen.findByRole("button", { name: "espatlla.jpg" })).toBeVisible();
    const upload = requests.find((request) => request.line === "POST /attachments/upload-url");
    expect(upload?.body).toMatchObject({ purpose: "DOG_OBSERVATIONS" });
    expect(requests.find((request) => request.line === "POST /attachments")?.body).toMatchObject({
      entityId: "dog-duna",
      entityType: "DOG_OBSERVATIONS",
      name: "espatlla.jpg",
    });
    fireEvent.click(screen.getByRole("button", { name: "vídeo_balancí.mp4" }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/files\.example\.test\/.+X-Amz-Expires=300/u),
        "_blank",
        "noopener,noreferrer",
      );
    });
    expect(
      requests.some((request) => request.line === "GET /attachments?entityId=t1&entityType=TASK"),
    ).toBe(true);
  });

  it("«Veure l'historial complet ›» reads every task, done ones included, in a read-only drawer", async () => {
    const requests = recordRequests();
    await renderTasks();
    fireEvent.click(screen.getByRole("button", { name: "Veure l'historial complet ›" }));
    const drawer = await screen.findByRole("dialog", { name: "Historial de tasques" });
    await waitFor(() => {
      expect(within(drawer).getAllByRole("listitem")).toHaveLength(3);
    });
    expect(within(drawer).queryByRole("button", { name: "Afegir" })).toBeNull();
    expect(within(drawer).queryByRole("button", { name: "Edita la tasca" })).toBeNull();
    expect(
      requests.some(
        (request) => request.line === "GET /tasks?dogId=dog-duna&includeDone=true&page=0&size=50",
      ),
    ).toBe(true);
  });

  it("T-10-32 (26): es and en with no missing key", async () => {
    for (const [locale, title] of [
      ["es", "Tareas y notas — Laura + Duna"],
      ["en", "Tasks and notes — Laura + Duna"],
    ] as const) {
      cleanup();
      await renderTasks({ locale });
      expect(screen.getByRole("heading", { level: 1, name: title })).toBeVisible();
      expect(document.body.textContent).not.toMatch(/instructor:|enums:|errors:/u);
    }
    expect(cardText(cards()[2])).toContain("done by Laura on");
  });
});

describe("26's route (S10 §2): INSTRUCTOR and ADMIN, never an impersonation", () => {
  it("an impersonated session reaching 26 reads «No es permet la suplantació.» and asks nothing", async () => {
    const requests = recordRequests();
    await renderApp("/instructor/alumnes/dog-duna/tasques", { scenario: "impersonated" });
    expect(await screen.findByText("No es permet la suplantació.")).toBeVisible();
    expect(requests.some((request) => request.line.startsWith("GET /tasks"))).toBe(false);
  });
});
