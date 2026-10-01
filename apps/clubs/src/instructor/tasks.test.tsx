import { createApiClient } from "@agilityhub/api-client";
import {
  ATTENDANCE_MOCK_NOW,
  handlers,
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
import { getResponse, http, HttpResponse } from "msw";
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
  tasks = 3,
}: { locale?: "ca" | "en" | "es"; scenario?: MockScenario; tasks?: number } = {}) {
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
    expect(document.querySelectorAll(".ah-task")).toHaveLength(tasks);
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
    // E6-W04 step 0d: the api's refusal of a file names it, as the picker's does.
    expect(await screen.findByText("vídeo_llarg.mp4: El fitxer és massa gran.")).toBeVisible();
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

describe("E6-W02 round 2 (review of 30-09): screen 26", () => {
  const newTask = (text: string, files: File[] = []) => {
    fireEvent.click(screen.getByRole("button", { name: "Afegir" }));
    const form = screen.getByRole("form", { name: "Nova tasca" });
    fireEvent.change(within(form).getByLabelText("Text de la tasca nova"), {
      target: { value: text },
    });
    if (files.length > 0) {
      fireEvent.change(within(form).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
        target: { files },
      });
    }
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    return form;
  };
  const tasksBlock = () =>
    present(screen.getByRole("heading", { name: "Tasques" }).closest<HTMLElement>("section"));

  it("#1 (CONVENCIONS_API §7, T-10-25): a network failure keeps the submission's key, so its retry creates one task", async () => {
    let lost = true;
    server.use(
      http.post("*/api/v1/tasks", async ({ request }) => {
        if (!lost) return undefined;
        lost = false;
        // The api creates the task and its answer never arrives.
        await getResponse(handlers, request.clone());
        return HttpResponse.error();
      }),
    );
    const requests = recordRequests();
    await renderTasks();
    const form = newTask("Salts amb calma");
    expect(await within(tasksBlock()).findByRole("alert")).toHaveTextContent(
      "S'ha produït un error inesperat.",
    );
    expect(within(form).getByLabelText("Text de la tasca nova")).toHaveValue("Salts amb calma");
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(cards()).toHaveLength(4);
    });
    const posts = requests.filter((request) => request.line === "POST /tasks");
    expect(posts).toHaveLength(2);
    expect(posts[1]?.key).toBe(posts[0]?.key);
    expect(cards().filter((item) => item.textContent.includes("Salts amb calma"))).toHaveLength(1);
  });

  it("#1 (E74): two deliberate submissions with the same text are two tasks, each with its own key", async () => {
    const requests = recordRequests();
    await renderTasks();
    for (const expected of [4, 5]) {
      newTask("Salts amb calma");
      await waitFor(() => {
        expect(cards()).toHaveLength(expected);
      });
      await waitFor(() => {
        expect(screen.queryByRole("form", { name: "Nova tasca" })).toBeNull();
      });
    }
    const posts = requests.filter((request) => request.line === "POST /tasks");
    expect(posts.map((request) => request.body)).toEqual([
      { attachmentIds: [], dogId: "dog-duna", text: "Salts amb calma" },
      { attachmentIds: [], dogId: "dog-duna", text: "Salts amb calma" },
    ]);
    expect(posts[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(posts[1]?.key).not.toBe(posts[0]?.key);
  });

  it("#2 (R-10-10): with 52 tasks «Mostra'n més» reads the next page into the same list, whose tasks are managed like the rest — the oldest done one reopened, the oldest pending one edited, completed and deleted", async () => {
    const requests = recordRequests();
    await renderTasks({ scenario: "tasksMany", tasks: 50 });
    expect(screen.queryByText(/^Repàs 49/u)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostra'n més" }));
    await waitFor(() => {
      expect(cards()).toHaveLength(52);
    });
    expect(
      requests.some(
        (request) => request.line === "GET /tasks?dogId=dog-duna&includeDone=true&page=1&size=50",
      ),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Mostra'n més" })).toBeNull();
    expect(cardText(card(50))).toBe(
      "feta | Repàs 48: dues sessions curtes de contactes | 10-06 · Marc · feta per la Laura el 12-06",
    );
    expect(cardText(card(51))).toBe(
      "pendent | Repàs 49: dues sessions curtes de contactes | 09-06 · Estel",
    );
    fireEvent.click(within(card(50)).getByRole("button", { name: "Torna-la a pendent" }));
    await waitFor(() => {
      expect(cardText(card(50))).toMatch(/^pendent \| Repàs 48/u);
    });
    fireEvent.click(within(card(51)).getByRole("button", { name: "Edita la tasca" }));
    fireEvent.change(within(card(51)).getByLabelText("Text de la tasca"), {
      target: { value: "Repàs 49: contactes i balancí" },
    });
    fireEvent.click(within(card(51)).getByRole("button", { name: "Desa" }));
    await waitFor(() => {
      expect(cardText(card(51))).toBe("pendent | Repàs 49: contactes i balancí | 09-06 · Estel");
    });
    fireEvent.click(within(card(51)).getByRole("button", { name: "Marca-la com a feta" }));
    await waitFor(() => {
      expect(cardText(card(51))).toContain("feta per l'Estel el 03-08");
    });
    fireEvent.click(within(card(51)).getByRole("button", { name: "Elimina la tasca" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Vols eliminar aquesta tasca?" })).getByRole(
        "button",
        { name: "Elimina" },
      ),
    );
    await waitFor(() => {
      expect(cards()).toHaveLength(51);
    });
    expect(screen.queryByText(/^Repàs 49/u)).toBeNull();
    expect(
      requests.filter((request) => !request.line.startsWith("GET")).map((request) => request.line),
    ).toEqual([
      "POST /tasks/t-repas-48/reopening",
      "PATCH /tasks/t-repas-49",
      "POST /tasks/t-repas-49/completion",
      "DELETE /tasks/t-repas-49",
    ]);
    expect(requests.find((request) => request.line === "PATCH /tasks/t-repas-49")?.body).toEqual({
      text: "Repàs 49: contactes i balancí",
      version: 1,
    });
  });

  it("#4 (AGENTS rule 4): a clip that cannot be opened says why next to it — by its code, or «No s'ha pogut obrir el fitxer.» without an answer — on the list, the member's note and the history drawer", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    let answer: "forbidden" | "network" = "forbidden";
    server.use(
      http.get("*/api/v1/attachments", () =>
        answer === "network"
          ? HttpResponse.error()
          : HttpResponse.json(
              { code: "FORBIDDEN", details: {}, message: "Forbidden", traceId: "t" },
              { status: 403 },
            ),
      ),
    );
    await renderTasks();
    const clip = within(card(0)).getByRole("button", { name: "vídeo_balancí.mp4" });
    fireEvent.click(clip);
    const refused = await within(card(0)).findByRole("alert");
    expect(refused).toHaveTextContent("No teniu permís per fer aquesta acció.");
    expect(clip.closest(".ah-attachment-chip")?.nextElementSibling).toBe(refused);
    answer = "network";
    fireEvent.click(clip);
    await waitFor(() => {
      expect(within(card(0)).getByRole("alert")).toHaveTextContent(
        "No s'ha pogut obrir el fitxer.",
      );
    });
    const note = present(
      screen
        .getByRole("heading", { name: "Notes als instructors · de l'alumne · només lectura" })
        .closest<HTMLElement>("section"),
    );
    fireEvent.click(within(note).getByRole("button", { name: "foto_balancí.jpg" }));
    expect(await within(note).findByRole("alert")).toHaveTextContent(
      "No s'ha pogut obrir el fitxer.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Veure l'historial complet ›" }));
    const drawer = await screen.findByRole("dialog", { name: "Historial de tasques" });
    await waitFor(() => {
      expect(within(drawer).getAllByRole("listitem")).toHaveLength(3);
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "vídeo_balancí.mp4" }));
    expect(await within(drawer).findByRole("alert")).toHaveTextContent(
      "No s'ha pogut obrir el fitxer.",
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("#7 (ruling E74): an instructor cannot read the file limits, so a 30 MB file is checked by the signed-url request: FILE_TOO_LARGE by its code, and nothing is PUT nor registered — an observation file and a new task's file", async () => {
    const requests = recordRequests();
    await renderTasks();
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line.startsWith("GET /parameters/")),
      ).toHaveLength(3);
    });
    const big = () => file("vídeo_llarg.mp4", "video/mp4", 30 * 1024 * 1024);
    fireEvent.change(firstPicker(), { target: { files: [big()] } });
    // E6-W04 step 0d: the api's refusal of an attached file names it.
    expect(await screen.findByText("vídeo_llarg.mp4: El fitxer és massa gran.")).toBeVisible();
    const form = newTask("Salts amb calma", [big()]);
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line === "POST /attachments/upload-url"),
      ).toHaveLength(2);
    });
    expect(await within(tasksBlock()).findByRole("alert")).toHaveTextContent(
      "El fitxer és massa gran.",
    );
    expect(requests.map((request) => request.body)).toContainEqual({
      fileName: "vídeo_llarg.mp4",
      mimeType: "video/mp4",
      purpose: "TASK",
      sizeBytes: 30 * 1024 * 1024,
    });
    expect(requests.some((request) => request.line.startsWith("PUT "))).toBe(false);
    expect(
      requests.some((request) => ["POST /attachments", "POST /tasks"].includes(request.line)),
    ).toBe(false);
    expect(within(form).getByLabelText("Text de la tasca nova")).toHaveValue("Salts amb calma");
    expect(within(form).getByRole("button", { name: "vídeo_llarg.mp4" })).toBeVisible();
  });
});

describe("E6-W05 (reviews of E6-W02's round 2): screen 26", () => {
  const newTask = (text: string, files: File[] = []) => {
    fireEvent.click(screen.getByRole("button", { name: "Afegir" }));
    const form = screen.getByRole("form", { name: "Nova tasca" });
    fireEvent.change(within(form).getByLabelText("Text de la tasca nova"), {
      target: { value: text },
    });
    if (files.length > 0) {
      fireEvent.change(within(form).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
        target: { files },
      });
    }
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    return form;
  };
  const tasksBlock = () =>
    present(screen.getByRole("heading", { name: "Tasques" }).closest<HTMLElement>("section"));
  const writes = (requests: Recorded[]) =>
    requests
      .filter((request) => !request.line.startsWith("GET"))
      .map((request) => request.line.replace(/mock-uploads\/.+$/u, "mock-uploads/…"));
  const fileKeys = (request: Recorded | undefined) =>
    (request?.body as { attachmentIds?: string[] } | undefined)?.attachmentIds ?? [];
  /** The five minutes of a signed upload (R-10-11) have gone by. */
  const pastTheGrant = () => {
    vi.setSystemTime(Date.now() + 6 * 60_000);
  };

  it("step 1 (R-10-11): after a refused creation, a retry past the upload's five minutes uploads the file again and creates the task", async () => {
    let refuse = true;
    server.use(
      http.post("*/api/v1/tasks", () => {
        if (!refuse) return undefined;
        refuse = false;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "Internal error", traceId: "t-500" },
          { status: 500 },
        );
      }),
    );
    const requests = recordRequests();
    await renderTasks();
    const form = newTask("Salts amb calma", [file("vídeo_salt.mp4", "video/mp4")]);
    expect(await within(tasksBlock()).findByRole("alert")).toHaveTextContent(
      "S'ha produït un error inesperat.",
    );
    pastTheGrant();
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(cards()).toHaveLength(4);
    });
    expect(cardText(cards()[0])).toBe("pendent | Salts amb calma | 03-08 · Estel · vídeo_salt.mp4");
    expect(writes(requests)).toEqual([
      "POST /attachments/upload-url",
      "PUT /mock-uploads/…",
      "POST /tasks",
      "POST /attachments/upload-url",
      "PUT /mock-uploads/…",
      "POST /tasks",
    ]);
    const posts = requests.filter((request) => request.line === "POST /tasks");
    expect(fileKeys(posts[1])).toHaveLength(1);
    expect(fileKeys(posts[1])).not.toEqual(fileKeys(posts[0]));
    expect(posts[1]?.key).not.toBe(posts[0]?.key);
  });

  it("step 1: within the five minutes the retry reuses the uploaded file (one upload)", async () => {
    let refuse = true;
    server.use(
      http.post("*/api/v1/tasks", () => {
        if (!refuse) return undefined;
        refuse = false;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "Internal error", traceId: "t-500" },
          { status: 500 },
        );
      }),
    );
    const requests = recordRequests();
    await renderTasks();
    const form = newTask("Salts amb calma", [file("vídeo_salt.mp4", "video/mp4")]);
    expect(await within(tasksBlock()).findByRole("alert")).toBeVisible();
    vi.setSystemTime(Date.now() + 2 * 60_000);
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(cards()).toHaveLength(4);
    });
    expect(writes(requests)).toEqual([
      "POST /attachments/upload-url",
      "PUT /mock-uploads/…",
      "POST /tasks",
      "POST /tasks",
    ]);
  });

  it("step 1 (E74): an unanswered creation is retried past the five minutes with its own key and files; the api had created it, so it replays one task", async () => {
    let lost = true;
    server.use(
      http.post("*/api/v1/tasks", async ({ request }) => {
        if (!lost) return undefined;
        lost = false;
        // The api creates the task and its answer never arrives.
        await getResponse(handlers, request.clone());
        return HttpResponse.error();
      }),
    );
    const requests = recordRequests();
    await renderTasks();
    const form = newTask("Salts amb calma", [file("vídeo_salt.mp4", "video/mp4")]);
    expect(await within(tasksBlock()).findByRole("alert")).toBeVisible();
    pastTheGrant();
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(cards()).toHaveLength(4);
    });
    expect(writes(requests)).toEqual([
      "POST /attachments/upload-url",
      "PUT /mock-uploads/…",
      "POST /tasks",
      "POST /tasks",
    ]);
    const posts = requests.filter((request) => request.line === "POST /tasks");
    expect(posts[1]?.key).toBe(posts[0]?.key);
    expect(posts[1]?.body).toEqual(posts[0]?.body);
    expect(cards().filter((item) => item.textContent.includes("Salts amb calma"))).toHaveLength(1);
  });

  it("step 1 (E74): an unanswered creation the api never received is retried as it was; the expired file is refused (409 INVALID_STATE), uploaded again and the task created once", async () => {
    let lost = true;
    server.use(
      http.post("*/api/v1/tasks", () => {
        if (!lost) return undefined;
        lost = false;
        // The request never reached the api.
        return HttpResponse.error();
      }),
    );
    const statuses: string[] = [];
    server.events.on("response:mocked", ({ request, response }) => {
      if (request.method === "POST" && new URL(request.url).pathname === "/api/v1/tasks") {
        statuses.push(String(response.status));
      }
    });
    const requests = recordRequests();
    await renderTasks();
    const form = newTask("Salts amb calma", [file("vídeo_salt.mp4", "video/mp4")]);
    expect(await within(tasksBlock()).findByRole("alert")).toBeVisible();
    pastTheGrant();
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(cards()).toHaveLength(4);
    });
    expect(writes(requests)).toEqual([
      "POST /attachments/upload-url",
      "PUT /mock-uploads/…",
      "POST /tasks",
      "POST /tasks",
      "POST /attachments/upload-url",
      "PUT /mock-uploads/…",
      "POST /tasks",
    ]);
    expect(statuses.slice(-2)).toEqual(["409", "201"]);
    const posts = requests.filter((request) => request.line === "POST /tasks");
    // The retry of the unanswered submission: its key and its payload.
    expect(posts[1]?.key).toBe(posts[0]?.key);
    expect(posts[1]?.body).toEqual(posts[0]?.body);
    // Refused, it is over: the file uploaded again is a new submission with a new key.
    expect(posts[2]?.key).not.toBe(posts[1]?.key);
    expect(fileKeys(posts[2])).not.toEqual(fileKeys(posts[1]));
    expect(cards().filter((item) => item.textContent.includes("Salts amb calma"))).toHaveLength(1);
    expect(within(tasksBlock()).queryByRole("alert")).toBeNull();
  });

  it("step 1 (CONVENCIONS_API §7, E79): «IN_PROGRESS» is not the submission's answer — its retry keeps the key and the files, and one task is created", async () => {
    let answers = 0;
    server.use(
      http.post("*/api/v1/tasks", () => {
        answers += 1;
        if (answers === 1) return HttpResponse.error();
        if (answers === 2) {
          return HttpResponse.json(
            {
              code: "IDEMPOTENCY_KEY_REUSED",
              details: { reason: "IN_PROGRESS" },
              message: "Idempotency key reused",
              traceId: "t-409",
            },
            { status: 409 },
          );
        }
        return undefined;
      }),
    );
    const requests = recordRequests();
    await renderTasks();
    const form = newTask("Salts amb calma", [file("vídeo_salt.mp4", "video/mp4")]);
    expect(await within(tasksBlock()).findByRole("alert")).toBeVisible();
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(requests.filter((request) => request.line === "POST /tasks")).toHaveLength(2);
    });
    await waitFor(() => {
      expect(within(form).getByRole("button", { name: "Afegeix" })).toBeEnabled();
    });
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(cards()).toHaveLength(4);
    });
    const posts = requests.filter((request) => request.line === "POST /tasks");
    expect(posts).toHaveLength(3);
    expect(new Set(posts.map((request) => request.key)).size).toBe(1);
    expect(posts[2]?.body).toEqual(posts[0]?.body);
    expect(writes(requests).filter((line) => line.startsWith("POST /attachments"))).toHaveLength(1);
  });

  it("step 2: a mixed selection keeps the refused file's message while the accepted one uploads — on the observations and on an open task", async () => {
    const requests = recordRequests();
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
      target: {
        files: [file("espatlla.jpg", "image/jpeg"), file("prog.exe", "application/x-msdownload")],
      },
    });
    expect(await screen.findByRole("button", { name: "espatlla.jpg" })).toBeVisible();
    // The upload and its registration are over (the pickers wait while a write runs).
    await waitFor(() => {
      expect(firstPicker()).toBeEnabled();
    });
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "prog.exe: Aquest tipus de fitxer no està permès.",
    ]);
    fireEvent.click(within(card(1)).getByRole("button", { name: "Edita la tasca" }));
    fireEvent.change(within(card(1)).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
      target: {
        files: [file("contactes.jpg", "image/jpeg"), file("eina.exe", "application/x-msdownload")],
      },
    });
    expect(await within(card(1)).findByRole("button", { name: "contactes.jpg" })).toBeVisible();
    await waitFor(() => {
      expect(card(1)).not.toHaveAttribute("aria-busy");
    });
    expect(within(tasksBlock()).getByRole("alert")).toHaveTextContent(
      "eina.exe: Aquest tipus de fitxer no està permès.",
    );
    expect(
      requests.filter((request) => request.line === "POST /attachments").map((r) => r.body),
    ).toEqual([
      expect.objectContaining({ entityType: "DOG_OBSERVATIONS", name: "espatlla.jpg" }),
      expect.objectContaining({ entityId: "t2", entityType: "TASK", name: "contactes.jpg" }),
    ]);
  });

  it("step 4: a refused deletion says why inside its confirmation, which stays open", async () => {
    server.use(
      http.delete("*/api/v1/tasks/:id", () =>
        HttpResponse.json(
          { code: "NOT_FOUND", details: {}, message: "Task not found", traceId: "t-404" },
          { status: 404 },
        ),
      ),
    );
    await renderTasks();
    fireEvent.click(within(card(1)).getByRole("button", { name: "Elimina la tasca" }));
    const dialog = screen.getByRole("dialog", { name: "Vols eliminar aquesta tasca?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "No s'ha trobat l'element sol·licitat.",
    );
    expect(screen.getByRole("dialog", { name: "Vols eliminar aquesta tasca?" })).toBe(dialog);
    // Said once, where the user is: not again behind the confirmation.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("E6-W04 step 0d (review of E6-W05): screen 26", () => {
  const newTask = (text: string, files: File[] = []) => {
    fireEvent.click(screen.getByRole("button", { name: "Afegir" }));
    const form = screen.getByRole("form", { name: "Nova tasca" });
    fireEvent.change(within(form).getByLabelText("Text de la tasca nova"), {
      target: { value: text },
    });
    if (files.length > 0) {
      fireEvent.change(within(form).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
        target: { files },
      });
    }
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    return form;
  };
  const tasksBlock = () =>
    present(screen.getByRole("heading", { name: "Tasques" }).closest<HTMLElement>("section"));
  const writes = (requests: Recorded[]) =>
    requests
      .filter((request) => !request.line.startsWith("GET"))
      .map((request) => request.line.replace(/mock-uploads\/.+$/u, "mock-uploads/…"));
  const fileKeys = (request: Recorded | undefined) =>
    (request?.body as { attachmentIds?: string[] } | undefined)?.attachmentIds ?? [];
  /** The statuses MSW answered `POST /tasks` with, in order. */
  const taskStatuses = () => {
    const statuses: number[] = [];
    server.events.on("response:mocked", ({ request, response }) => {
      if (request.method === "POST" && new URL(request.url).pathname === "/api/v1/tasks") {
        statuses.push(response.status);
      }
    });
    return statuses;
  };

  it("E6-W04 step 0d: a creation whose answer was lost but which the api created, its text edited, «Afegeix» — a new task with a new upload and a new key, never the first submission's file", async () => {
    let lost = true;
    server.use(
      http.post("*/api/v1/tasks", async ({ request }) => {
        if (!lost) return undefined;
        lost = false;
        // The api creates the task and its answer never arrives.
        await getResponse(handlers, request.clone());
        return HttpResponse.error();
      }),
    );
    const statuses = taskStatuses();
    const requests = recordRequests();
    await renderTasks();
    const form = newTask("Salts amb calma", [file("vídeo_salt.mp4", "video/mp4")]);
    expect(await within(tasksBlock()).findByRole("alert")).toHaveTextContent(
      "S'ha produït un error inesperat.",
    );
    fireEvent.change(within(form).getByLabelText("Text de la tasca nova"), {
      target: { value: "Salts amb calma i girs" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(cards()).toHaveLength(5);
    });
    expect(within(tasksBlock()).queryByRole("alert")).toBeNull();
    expect(writes(requests)).toEqual([
      "POST /attachments/upload-url",
      "PUT /mock-uploads/…",
      "POST /tasks",
      "POST /attachments/upload-url",
      "PUT /mock-uploads/…",
      "POST /tasks",
    ]);
    expect(statuses.slice(-1)).toEqual([201]);
    const posts = requests.filter((request) => request.line === "POST /tasks");
    expect(fileKeys(posts[1])).toHaveLength(1);
    expect(fileKeys(posts[1])).not.toEqual(fileKeys(posts[0]));
    expect(posts[1]?.key).not.toBe(posts[0]?.key);
    expect(cards().map(cardText)).toEqual(
      expect.arrayContaining([
        "pendent | Salts amb calma | 03-08 · Estel · vídeo_salt.mp4",
        "pendent | Salts amb calma i girs | 03-08 · Estel · vídeo_salt.mp4",
      ]),
    );
  });

  it("E6-W04 step 0d: a reused file the api refuses as bound to another task (422 ATTACHMENT_ENTITY_MISMATCH) is uploaded again, once, and the submission sent again with a new key", async () => {
    let created = false;
    server.use(
      http.post("*/api/v1/tasks", async ({ request }) => {
        if (created) return undefined;
        created = true;
        // The api created the task, and then answered with an error.
        await getResponse(handlers, request.clone());
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", details: {}, message: "Internal error", traceId: "t-500" },
          { status: 500 },
        );
      }),
    );
    const statuses = taskStatuses();
    const requests = recordRequests();
    await renderTasks();
    const form = newTask("Salts amb calma", [file("vídeo_salt.mp4", "video/mp4")]);
    expect(await within(tasksBlock()).findByRole("alert")).toHaveTextContent(
      "S'ha produït un error inesperat.",
    );
    fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
    await waitFor(() => {
      expect(screen.queryByRole("form", { name: "Nova tasca" })).toBeNull();
    });
    expect(cards()).toHaveLength(5);
    expect(within(tasksBlock()).queryByRole("alert")).toBeNull();
    expect(writes(requests)).toEqual([
      "POST /attachments/upload-url",
      "PUT /mock-uploads/…",
      "POST /tasks",
      "POST /tasks",
      "POST /attachments/upload-url",
      "PUT /mock-uploads/…",
      "POST /tasks",
    ]);
    expect(statuses).toEqual([500, 422, 201]);
    const posts = requests.filter((request) => request.line === "POST /tasks");
    // Answered, the first submission is over: the press is a new one that reuses the live file…
    expect(posts[1]?.key).not.toBe(posts[0]?.key);
    expect(fileKeys(posts[1])).toEqual(fileKeys(posts[0]));
    // …which the first task holds: uploaded again, it is sent once more with a new key.
    expect(posts[2]?.key).not.toBe(posts[1]?.key);
    expect(fileKeys(posts[2])).toHaveLength(1);
    expect(fileKeys(posts[2])).not.toEqual(fileKeys(posts[1]));
  });

  it("E6-W04 step 0d: an instructor's mixed selection (a JPEG and an executable) attaches the JPEG and says «prog.exe: …» — on the observations and on an open task", async () => {
    const requests = recordRequests();
    await renderTasks();
    // An instructor cannot read the file limits (403): every file goes to the api.
    await waitFor(() => {
      expect(
        requests.filter((request) => request.line.startsWith("GET /parameters/files.")),
      ).toHaveLength(3);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.change(firstPicker(), {
      target: {
        files: [file("espatlla.jpg", "image/jpeg"), file("prog.exe", "application/x-msdownload")],
      },
    });
    expect(await screen.findByRole("button", { name: "espatlla.jpg" })).toBeVisible();
    await waitFor(() => {
      expect(firstPicker()).toBeEnabled();
    });
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "prog.exe: Aquest tipus de fitxer no està permès.",
    ]);
    fireEvent.click(within(card(1)).getByRole("button", { name: "Edita la tasca" }));
    // The refused file first: the accepted one after it is still attached.
    fireEvent.change(within(card(1)).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
      target: {
        files: [file("eina.exe", "application/x-msdownload"), file("contactes.jpg", "image/jpeg")],
      },
    });
    expect(await within(card(1)).findByRole("button", { name: "contactes.jpg" })).toBeVisible();
    await waitFor(() => {
      expect(card(1)).not.toHaveAttribute("aria-busy");
    });
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "eina.exe: Aquest tipus de fitxer no està permès.",
    ]);
    expect(
      requests
        .filter((request) => request.line === "POST /attachments/upload-url")
        .map((request) => (request.body as { fileName?: string } | undefined)?.fileName),
    ).toEqual(["espatlla.jpg", "prog.exe", "eina.exe", "contactes.jpg"]);
    // The executables were refused by their signed-url request: never PUT nor registered.
    expect(requests.filter((request) => request.line.startsWith("PUT "))).toHaveLength(2);
    expect(
      requests.filter((request) => request.line === "POST /attachments").map((r) => r.body),
    ).toEqual([
      expect.objectContaining({ entityType: "DOG_OBSERVATIONS", name: "espatlla.jpg" }),
      expect.objectContaining({ entityId: "t2", entityType: "TASK", name: "contactes.jpg" }),
    ]);
  });

  it("E6-W04 step 0d (its review): when a later file of the selection gets no answer, the files attached before it show next to the error, so they are not picked again", async () => {
    server.use(
      http.post("*/api/v1/attachments/upload-url", async ({ request }) => {
        const body = (await request.clone().json()) as { fileName?: string };
        return body.fileName === "segon.jpg" ? HttpResponse.error() : undefined;
      }),
    );
    await renderTasks();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.change(firstPicker(), {
      target: { files: [file("primer.jpg", "image/jpeg"), file("segon.jpg", "image/jpeg")] },
    });
    expect(await screen.findByRole("alert")).toBeVisible();
    await waitFor(() => {
      expect(firstPicker()).toBeEnabled();
    });
    // «primer.jpg» was registered before «segon.jpg» failed: the block shows it.
    expect(await screen.findByRole("button", { name: "primer.jpg" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "segon.jpg" })).toBeNull();
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
