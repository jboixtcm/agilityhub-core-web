import { createApiClient } from "@agilityhub/api-client";
import { handlers, mockScenario, resetMessagingMockState } from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { getResponse, http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SendAnnouncementDialog } from "../messaging/SendAnnouncementDialog";

import { DogsPage, MembersPage } from "./CensusListPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

interface Sent {
  body?: { dryRun: boolean; recipients: Record<string, unknown> } | undefined;
  key: string | null;
  line: string;
}

/** The api requests of the page, with the send bodies and keys. */
function record(): Sent[] {
  const list: Sent[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    const entry: Sent = {
      key: request.headers.get("Idempotency-Key"),
      line: `${request.method} ${url.pathname.replace(/^\/api\/v1/u, "")}${url.search}`,
    };
    list.push(entry);
    if (request.method === "POST") {
      void request
        .clone()
        .json()
        .then(
          (body: Sent["body"]) => {
            entry.body = body;
          },
          () => undefined,
        );
    }
  });
  return list;
}

const sends = (requests: Sent[]) =>
  requests.filter((request) => /^POST \/message-templates\/[^/]+\/send$/u.test(request.line));

async function renderPage(kind: "dogs" | "members") {
  server.use(
    http.get("*/api/v1/dashboard/counters", () => HttpResponse.json({ pendingSignups: 0 })),
  );
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["census", "admin-messaging", "errors"],
    storage: undefined,
  });
  const client = createApiClient({ baseUrl: `${window.location.origin}/api/v1` });
  window.history.replaceState(null, "", kind === "members" ? "/abonats" : "/gossos");
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        {kind === "members" ? <MembersPage client={client} /> : <DogsPage client={client} />}
      </BrandingProvider>
    </I18nextProvider>,
  );
}

const dialog = () => screen.findByRole("dialog", { name: "Enviar comunicat" });
const confirmation = (count: number) =>
  `Confirmo que vull enviar aquest comunicat a ${String(count)} ${count === 1 ? "abonat" : "abonats"}`;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetMessagingMockState();
  mockScenario("admin");
});
afterEach(() => {
  cleanup();
  server.events.removeAllListeners();
  server.resetHandlers();
  resetMessagingMockState();
  localStorage.clear();
});
afterAll(() => {
  server.close();
});

// E7-W01 round 2 #8: D5's first render took 16.8 s against the 15 s default on a loaded host
// (0.7 s alone): the D5/D15 renders of this file get 45 s.
vi.setConfig({ testTimeout: 45_000 });

describe("T-11-38 «Enviar comunicat» from D5 and D15 (S11 §2, R-11-13)", () => {
  it("D5's selection: the dialog sends `memberIds`, the dryRun drives «S'enviarà a 2 abonats», [ENVIA] waits for the tick, and the page says it was sent", async () => {
    const requests = record();
    await renderPage("members");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Selecciona Laura Serra Vidal" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecciona Anna Ballart Consul" }));
    const [, bulk] = screen.getAllByRole("button", { name: "Enviar comunicat" });
    fireEvent.click(bulk ?? document.body);
    const modal = await dialog();
    expect(await within(modal).findByText("2 abonats seleccionats")).toBeVisible();
    expect(await within(modal).findByText("S'enviarà a 2 abonats")).toBeVisible();
    const submit = within(modal).getByRole("button", { name: "ENVIA" });
    expect(submit).toBeDisabled();
    fireEvent.click(within(modal).getByRole("checkbox", { name: confirmation(2) }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(await screen.findByText("Comunicat enviat a 2 abonats")).toBeVisible();
    expect(screen.getByRole("link", { name: "Avisos enviats ›" })).toHaveAttribute(
      "href",
      "/notificacions",
    );
    const [dry, real] = sends(requests);
    expect(dry?.body).toEqual({
      dryRun: true,
      recipients: { memberIds: ["member-laura", "member-anna"] },
    });
    expect(real?.body).toEqual({
      dryRun: false,
      recipients: { memberIds: ["member-laura", "member-anna"] },
    });
    expect(real?.line).toBe("POST /message-templates/tpl-n-24/send");
    expect(real?.key).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("D5's current filters: the dialog sends the list's filters and search, and the count is the api's for them (the members GET /members lists)", async () => {
    const requests = record();
    await renderPage("members");
    await screen.findByRole("checkbox", { name: "Selecciona Laura Serra Vidal" });
    const [header] = screen.getAllByRole("button", { name: "Enviar comunicat" });
    fireEvent.click(header ?? document.body);
    const modal = await dialog();
    expect(await within(modal).findByText("Els abonats dels filtres del llistat")).toBeVisible();
    // D5 opens on its «Alta» chip (E4-W12): the dialog sends that filter as the list holds it.
    const filters = ["status:eq:ACTIVE"];
    const { data } = await createApiClient({ baseUrl: `${window.location.origin}/api/v1` }).GET(
      "/members",
      { params: { query: { filter: filters } } },
    );
    expect(
      await within(modal).findByText(`S'enviarà a ${String(data?.totalItems)} abonats`),
    ).toBeVisible();
    expect(sends(requests)[0]?.body).toEqual({ dryRun: true, recipients: { filters } });
  });

  it("another template clears the tick and asks the dryRun again; NO_RECIPIENTS is said inside the dialog and [ENVIA] stays off", async () => {
    const requests = record();
    await renderPage("members");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Selecciona Laura Serra Vidal" }));
    const [, bulk] = screen.getAllByRole("button", { name: "Enviar comunicat" });
    fireEvent.click(bulk ?? document.body);
    const modal = await dialog();
    fireEvent.click(await within(modal).findByRole("checkbox", { name: confirmation(1) }));
    fireEvent.change(within(modal).getByLabelText("Plantilla"), {
      target: { value: "tpl-custom-1" },
    });
    expect(within(modal).getByRole("button", { name: "ENVIA" })).toBeDisabled();
    const tick = await within(modal).findByRole("checkbox", { name: confirmation(1) });
    expect(tick).not.toBeChecked();
    expect(sends(requests).map((request) => request.line)).toEqual([
      "POST /message-templates/tpl-n-24/send",
      "POST /message-templates/tpl-custom-1/send",
    ]);
    server.use(
      http.post("*/api/v1/message-templates/:id/send", () =>
        HttpResponse.json(
          { code: "NO_RECIPIENTS", details: {}, message: "No recipients", traceId: "t" },
          { status: 422 },
        ),
      ),
    );
    fireEvent.change(within(modal).getByLabelText("Plantilla"), {
      target: { value: "tpl-custom-2" },
    });
    expect(await within(modal).findByRole("alert")).toHaveTextContent("No hi ha destinataris.");
    expect(within(modal).queryByRole("checkbox")).toBeNull();
    expect(within(modal).getByRole("button", { name: "ENVIA" })).toBeDisabled();
  });

  it("one Idempotency-Key per submission: a send that got no answer is retried with its key — also after closing and opening the dialog again — and the api counts it once", async () => {
    let lost = true;
    server.use(
      http.post("*/api/v1/message-templates/:id/send", async ({ request }) => {
        const body = (await request.clone().json()) as { dryRun: boolean };
        if (body.dryRun || !lost) return undefined;
        lost = false;
        await getResponse(handlers, request.clone());
        return HttpResponse.error();
      }),
    );
    const requests = record();
    await renderPage("members");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Selecciona Laura Serra Vidal" }));
    const [, bulk] = screen.getAllByRole("button", { name: "Enviar comunicat" });
    fireEvent.click(bulk ?? document.body);
    const modal = await dialog();
    fireEvent.click(await within(modal).findByRole("checkbox", { name: confirmation(1) }));
    fireEvent.click(within(modal).getByRole("button", { name: "ENVIA" }));
    expect(await within(modal).findByRole("alert")).toHaveTextContent(
      "No s'ha pogut enviar el comunicat. Torna-ho a provar.",
    );
    fireEvent.click(within(modal).getByRole("button", { name: "Tanca" }));
    fireEvent.click(bulk ?? document.body);
    const again = await dialog();
    fireEvent.click(await within(again).findByRole("checkbox", { name: confirmation(1) }));
    fireEvent.click(within(again).getByRole("button", { name: "ENVIA" }));
    expect(await screen.findByText("Comunicat enviat a 1 abonat")).toBeVisible();
    const real = sends(requests).filter((request) => request.body?.dryRun === false);
    expect(real).toHaveLength(2);
    expect(real[1]?.key).toBe(real[0]?.key);
  });

  it("E7-W01 round 2 #2: the tick confirms the latest dry run only — template A → B → A with three counts clears it each time", async () => {
    const counts = [11, 22, 33];
    server.use(
      http.post("*/api/v1/message-templates/:id/send", async ({ request }) => {
        const body = (await request.clone().json()) as { dryRun: boolean };
        if (!body.dryRun) return undefined;
        return HttpResponse.json({ recipientCount: counts.shift() ?? 0 });
      }),
    );
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-messaging", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <SendAnnouncementDialog
            audience={{ kind: "selection", memberIds: ["member-laura", "member-anna"] }}
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            initialTemplateId="tpl-n-24"
            onClose={() => undefined}
            onSent={() => undefined}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const modal = await dialog();
    const submit = within(modal).getByRole("button", { name: "ENVIA" });
    // A: 11 members, ticked.
    fireEvent.click(await within(modal).findByRole("checkbox", { name: confirmation(11) }));
    expect(submit).toBeEnabled();
    // B: its own count, not ticked (and left unticked).
    fireEvent.change(within(modal).getByLabelText("Plantilla"), {
      target: { value: "tpl-custom-1" },
    });
    expect(submit).toBeDisabled();
    const second = await within(modal).findByRole("checkbox", { name: confirmation(22) });
    expect(second).not.toBeChecked();
    expect(submit).toBeDisabled();
    // A again: a new dry run (33), and A's old tick does not come back with it.
    fireEvent.change(within(modal).getByLabelText("Plantilla"), {
      target: { value: "tpl-n-24" },
    });
    expect(submit).toBeDisabled();
    const third = await within(modal).findByRole("checkbox", { name: confirmation(33) });
    expect(third).not.toBeChecked();
    expect(submit).toBeDisabled();
  });

  it("E7-W04 step 1 (CONVENCIONS_API §7, E79): «IN_PROGRESS» is not the send's answer — a network failure, a retry answered IN_PROGRESS and another retry all carry one key, and the api makes one batch", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstDone: Promise<unknown> = Promise.resolve();
    let real = 0;
    server.use(
      http.post("*/api/v1/message-templates/:id/send", async ({ request }) => {
        const body = (await request.clone().json()) as { dryRun: boolean };
        if (body.dryRun) return undefined;
        real += 1;
        if (real === 1) {
          // The api takes the send and is still working on it; its answer never arrives.
          const copy = request.clone();
          firstDone = firstMayFinish.then(() => getResponse(handlers, copy));
          return HttpResponse.error();
        }
        if (real === 2) {
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
    const batches: unknown[] = [];
    server.events.on("response:mocked", ({ request, response }) => {
      if (request.method !== "POST" || response.status !== 202) return;
      void response
        .clone()
        .json()
        .then((json: { batchId?: unknown }) => batches.push(json.batchId));
    });
    const requests = record();
    const onSent = vi.fn();
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-messaging", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <SendAnnouncementDialog
            audience={{ kind: "selection", memberIds: ["member-laura", "member-anna"] }}
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            initialTemplateId="tpl-n-24"
            onClose={() => undefined}
            onSent={onSent}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const modal = await dialog();
    fireEvent.click(await within(modal).findByRole("checkbox", { name: confirmation(2) }));
    const submit = within(modal).getByRole("button", { name: "ENVIA" });
    fireEvent.click(submit);
    expect(await within(modal).findByRole("alert")).toHaveTextContent(
      "No s'ha pogut enviar el comunicat. Torna-ho a provar.",
    );
    fireEvent.click(submit);
    // E7-W05 step 4 (CONVENCIONS_API §7, E80): the shared text of a write still in progress.
    expect(await within(modal).findByText(/encara està en curs/u)).toHaveTextContent(
      "L'operació encara està en curs. Torna-ho a provar d'aquí a un moment.",
    );
    releaseFirst();
    await firstDone;
    fireEvent.click(submit);
    await vi.waitFor(() => {
      expect(onSent).toHaveBeenCalledWith(2);
    });
    const sent = sends(requests).filter((request) => request.body?.dryRun === false);
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((request) => request.key)).size).toBe(1);
    // The answer that reached the dialog replays the first send's batch: the api made one.
    await vi.waitFor(() => {
      expect(batches).toEqual(["batch-0001"]);
    });
  });

  it("E7-W05 step 4 (CONVENCIONS_API §7, E80): IDEMPOTENCY_KEY_REUSED {reason: DIFFERENT_REQUEST} keeps the error's own text, not the in-progress one, and retires the key", async () => {
    let real = 0;
    server.use(
      http.post("*/api/v1/message-templates/:id/send", async ({ request }) => {
        const body = (await request.clone().json()) as { dryRun: boolean };
        if (body.dryRun) return undefined;
        real += 1;
        if (real > 1) return undefined;
        return HttpResponse.json(
          {
            code: "IDEMPOTENCY_KEY_REUSED",
            details: { reason: "DIFFERENT_REQUEST" },
            message: "Idempotency key reused",
            traceId: "t-409",
          },
          { status: 409 },
        );
      }),
    );
    const requests = record();
    const onSent = vi.fn();
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-messaging", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <SendAnnouncementDialog
            audience={{ kind: "selection", memberIds: ["member-laura", "member-anna"] }}
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            initialTemplateId="tpl-n-24"
            onClose={() => undefined}
            onSent={onSent}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const modal = await dialog();
    fireEvent.click(await within(modal).findByRole("checkbox", { name: confirmation(2) }));
    const submit = within(modal).getByRole("button", { name: "ENVIA" });
    fireEvent.click(submit);
    expect(await within(modal).findByRole("alert")).toHaveTextContent(
      "La clau d'idempotència ja s'ha utilitzat per a una altra petició.",
    );
    expect(within(modal).queryByText(/encara està en curs/u)).toBeNull();
    fireEvent.click(submit);
    await vi.waitFor(() => {
      expect(onSent).toHaveBeenCalledWith(2);
    });
    const sent = sends(requests).filter((request) => request.body?.dryRun === false);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).not.toBe(sent[0]?.key);
  });

  it("E7-W04 step 2 (R-11-13): the count and the tick belong to the latest dry run — A answers 11, B is asked, back to A before B answers: no count, ENVIA off, nothing sent; A's new answer shows its count unticked", async () => {
    const holds: (() => void)[] = [];
    const counts = [11, 22, 33];
    server.use(
      http.post("*/api/v1/message-templates/:id/send", async ({ request }) => {
        const body = (await request.clone().json()) as { dryRun: boolean };
        if (!body.dryRun) return undefined;
        const count = counts.shift() ?? 0;
        if (count !== 11) {
          await new Promise<void>((resolve) => {
            holds.push(resolve);
          });
        }
        return HttpResponse.json({ batchId: null, recipientCount: count });
      }),
    );
    const requests = record();
    const i18n = await createI18n({
      branding,
      browserLanguages: ["ca"],
      initialNamespaces: ["admin-messaging", "errors"],
      storage: undefined,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <BrandingProvider branding={branding}>
          <SendAnnouncementDialog
            audience={{ kind: "selection", memberIds: ["member-laura", "member-anna"] }}
            client={createApiClient({ baseUrl: `${window.location.origin}/api/v1` })}
            initialTemplateId="tpl-n-24"
            onClose={() => undefined}
            onSent={() => undefined}
          />
        </BrandingProvider>
      </I18nextProvider>,
    );
    const modal = await dialog();
    const submit = within(modal).getByRole("button", { name: "ENVIA" });
    fireEvent.click(await within(modal).findByRole("checkbox", { name: confirmation(11) }));
    expect(submit).toBeEnabled();
    fireEvent.change(within(modal).getByLabelText("Plantilla"), {
      target: { value: "tpl-custom-1" },
    });
    await vi.waitFor(() => {
      expect(holds).toHaveLength(1);
    });
    // Back to A before B answers: A's old count is not the latest dry run's.
    fireEvent.change(within(modal).getByLabelText("Plantilla"), {
      target: { value: "tpl-n-24" },
    });
    await vi.waitFor(() => {
      expect(holds).toHaveLength(2);
    });
    expect(within(modal).getByText("Comptant els destinataris")).toBeVisible();
    expect(within(modal).queryByText("S'enviarà a 11 abonats")).toBeNull();
    expect(within(modal).queryByRole("checkbox")).toBeNull();
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    // B's late answer changes nothing.
    holds[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(within(modal).queryByText("S'enviarà a 22 abonats")).toBeNull();
    expect(submit).toBeDisabled();
    // A's new answer: its count, unticked.
    holds[1]?.();
    const tick = await within(modal).findByRole("checkbox", { name: confirmation(33) });
    expect(tick).not.toBeChecked();
    expect(submit).toBeDisabled();
    expect(sends(requests).filter((request) => request.body?.dryRun === false)).toHaveLength(0);
  });

  it("D15's selection is dogs: the dialog reads their owners and sends to each once («2 gossos · 1 abonat»)", async () => {
    const requests = record();
    await renderPage("dogs");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Selecciona Duna" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecciona Rock" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar comunicat" }));
    const modal = await dialog();
    expect(await within(modal).findByText("2 gossos · 1 abonat")).toBeVisible();
    expect(await within(modal).findByText("S'enviarà a 1 abonat")).toBeVisible();
    expect(
      requests.some(
        (request) =>
          request.line.startsWith("GET /dogs?") &&
          request.line.includes("fields=id%2Cowner") &&
          request.line.includes("filter=id%3Ain%3Adog-duna%2Cdog-rock"),
      ),
    ).toBe(true);
    expect(sends(requests)[0]?.body).toEqual({
      dryRun: true,
      recipients: { memberIds: ["member-laura"] },
    });
  });
});
