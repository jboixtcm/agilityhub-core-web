import {
  CONSOLE_CLUB_IDS,
  consoleState,
  resetConsoleMockState,
} from "@agilityhub/api-client/mocks";
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
const TEMPLATE = CONSOLE_CLUB_IDS.template;

function clubName(id: string): string {
  return consoleState.clubs.find((club) => club.id === id)?.name ?? "";
}

async function openDomains(id: string) {
  const rendered = await renderConsole(`/consola/clubs/${id}/dominis`);
  await screen.findByRole("heading", { level: 1, name: clubName(id) });
  await screen.findByRole("heading", { level: 2, name: "Dominis" });
  return rendered;
}

function domainsTable() {
  return within(screen.getByRole("table"));
}

function row(host: string) {
  const cell = domainsTable().getByText(host);
  const found = cell.closest("tr");
  if (found === null) throw new TypeError(`No row for ${host}`);
  return within(found);
}

function instructions(host: string) {
  const card = screen
    .getByRole("heading", { name: `Registres DNS de ${host}` })
    .closest<HTMLElement>(".console-card");
  if (card === null) throw new TypeError(`No DNS card for ${host}`);
  return within(card);
}

function addDomain(host: string, app: "App dels abonats" | "Backoffice") {
  fireEvent.change(screen.getByLabelText("Host"), { target: { value: host } });
  fireEvent.change(screen.getByLabelText("App"), {
    target: { value: app === "Backoffice" ? "clubs-admin" : "clubs" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Afegeix domini" }));
}

describe("E10-W03 step 1 · D19 «Dominis» (S17 §2, R-17-02/03, T-17-12)", () => {
  it("T-17-12 the table lists host, app, state and primary; a PENDING domain shows its CNAME and TXT records", async () => {
    await openDomains(MINIM);
    const pending = row("minim.example.test");
    expect(pending.getByText("App dels abonats")).toBeInTheDocument();
    expect(pending.getByText("pendent")).toBeInTheDocument();
    expect(pending.queryByText("principal")).toBeNull();
    expect(pending.getByRole("button", { name: "Verifica minim.example.test" })).toBeEnabled();
    const dns = instructions("minim.example.test");
    // R-17-03: either record, exactly as the api names them (E10-T04 `verification`).
    expect(dns.getByText("clubs.agilitydoghub.com")).toBeInTheDocument();
    expect(dns.getByText("_agilityhub-verify.minim.example.test")).toBeInTheDocument();
    expect(dns.getByText("agh-verify-m1n1m")).toBeInTheDocument();
  });

  it("T-17-12 a VERIFIED primary domain has no DNS instructions and no [Elimina] (E123)", async () => {
    await openDomains(CANIC);
    const admin = row("admin.example.test");
    expect(admin.getByText("Backoffice")).toBeInTheDocument();
    expect(admin.getByText("verificat")).toBeInTheDocument();
    expect(admin.getByText("principal")).toBeInTheDocument();
    expect(admin.queryByRole("button", { name: /Verifica/u })).toBeNull();
    expect(admin.queryByRole("button", { name: /Elimina/u })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Registres DNS de/u })).toBeNull();
    // The backoffice note of R-17-03 (Caddy's CLUB_ADMIN_HOSTS step, INC-64).
    expect(screen.getByText(/no s'hi serveix fins que operacions/u)).toBeInTheDocument();
  });

  it("R-17-02 [Afegeix domini] sends {host, app} with one key per payload and shows the new domain's DNS records", async () => {
    const posts = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith(`/clubs/${MINIM}/domains`),
    );
    await openDomains(MINIM);
    addDomain("Admin.Minim.Example.Test", "Backoffice");
    expect(
      await screen.findByText(
        "S'ha afegit admin.minim.example.test. Crea un dels registres DNS i després verifica'l.",
      ),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toEqual({ app: "clubs-admin", host: "Admin.Minim.Example.Test" });
    expect(posts[0]?.headers.get("Idempotency-Key")).toMatch(/[0-9a-f-]{36}/u);
    // The api normalizes the host; the row and its instructions are the api's.
    expect(
      await screen.findByRole("heading", { name: "Registres DNS de admin.minim.example.test" }),
    ).toBeInTheDocument();
    expect(
      instructions("admin.minim.example.test").getByText("clubsadmin.agilitydoghub.com"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Host")).toHaveValue("");
  });

  it("R-17-02 a host already used (409) or reserved (422) is refused where the user is, nothing added", async () => {
    await openDomains(MINIM);
    addDomain("app.example.test", "App dels abonats");
    expect(await screen.findByText("Aquest domini ja està en ús.")).toBeInTheDocument();
    addDomain("clubs.agilitydoghub.com", "App dels abonats");
    expect(await screen.findByText("Aquest domini està reservat.")).toBeInTheDocument();
    expect(domainsTable().getAllByRole("row")).toHaveLength(2);
  });

  it("R-17-03 [Verifica] without either record: 422 HOST_NOT_VERIFIED names the records it looked for, nothing changes", async () => {
    const verifications = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith("/verification"),
    );
    await openDomains(MINIM);
    fireEvent.click(
      row("minim.example.test").getByRole("button", { name: "Verifica minim.example.test" }),
    );
    expect(
      await screen.findByText(
        "No s'ha trobat cap dels dos registres DNS de minim.example.test. Comprova'ls i torna-ho a provar d'aquí a uns minuts.",
      ),
    ).toBeInTheDocument();
    expect(row("minim.example.test").getByText("pendent")).toBeInTheDocument();
    // A retry checks again: the api released the key of the refused check (R-17-03).
    fireEvent.click(
      row("minim.example.test").getByRole("button", { name: "Verifica minim.example.test" }),
    );
    await waitFor(() => {
      expect(verifications).toHaveLength(2);
    });
    expect(verifications[0]?.headers.get("Idempotency-Key")).toMatch(/[0-9a-f-]{36}/u);
  });

  it("R-17-03 with the record in the (fake) DNS: VERIFIED, the app's first verified domain becomes its primary, the challenge goes", async () => {
    consoleState.dns["minim.example.test"] = "TXT";
    await openDomains(MINIM);
    fireEvent.click(
      row("minim.example.test").getByRole("button", { name: "Verifica minim.example.test" }),
    );
    expect(
      await screen.findByText("S'ha verificat minim.example.test (registre TXT)."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(row("minim.example.test").getByText("verificat")).toBeInTheDocument();
    });
    expect(row("minim.example.test").getByText("principal")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Registres DNS de minim.example.test" }),
    ).toBeNull();
  });

  it("R-17-03 [Fes-lo principal] moves the app's primary to another verified domain; the old one can then be removed", async () => {
    consoleState.dns["gestio.canic.example.test"] = "CNAME";
    const primaries = captureRequests(
      (method, url) => method === "PUT" && url.pathname.endsWith("/primary"),
    );
    await openDomains(CANIC);
    addDomain("gestio.canic.example.test", "Backoffice");
    await screen.findByRole("heading", { name: "Registres DNS de gestio.canic.example.test" });
    fireEvent.click(
      row("gestio.canic.example.test").getByRole("button", {
        name: "Verifica gestio.canic.example.test",
      }),
    );
    await waitFor(() => {
      expect(row("gestio.canic.example.test").getByText("verificat")).toBeInTheDocument();
    });
    // The app already had its primary: the new one is not.
    expect(row("gestio.canic.example.test").queryByText("principal")).toBeNull();
    fireEvent.click(
      row("gestio.canic.example.test").getByRole("button", {
        name: "Fes-lo principal: gestio.canic.example.test",
      }),
    );
    expect(
      await screen.findByText("gestio.canic.example.test és ara el domini principal (Backoffice)."),
    ).toBeInTheDocument();
    expect(primaries).toHaveLength(1);
    await waitFor(() => {
      expect(row("gestio.canic.example.test").getByText("principal")).toBeInTheDocument();
    });
    expect(row("admin.example.test").queryByText("principal")).toBeNull();
    expect(
      row("admin.example.test").getByRole("button", { name: "Elimina admin.example.test" }),
    ).toBeEnabled();
  });

  it("§5 (E123) [Elimina] asks first, removes a non-primary domain, and a 409 «primary» from the api is said in the tab", async () => {
    const deletes = captureRequests((method) => method === "DELETE");
    await openDomains(MINIM);
    addDomain("reserva.minim.example.test", "App dels abonats");
    await screen.findByRole("heading", { name: "Registres DNS de reserva.minim.example.test" });
    fireEvent.click(
      row("reserva.minim.example.test").getByRole("button", {
        name: "Elimina reserva.minim.example.test",
      }),
    );
    const dialog = within(
      await screen.findByRole("dialog", { name: "Elimina reserva.minim.example.test" }),
    );
    expect(deletes).toEqual([]);
    fireEvent.click(dialog.getByRole("button", { name: "ELIMINA" }));
    expect(
      await screen.findByText("S'ha eliminat reserva.minim.example.test."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(domainsTable().queryByText("reserva.minim.example.test")).toBeNull();
    });
    expect(deletes[0]?.url.pathname).toBe(
      `/api/v1/platform/clubs/${MINIM}/domains/reserva.minim.example.test`,
    );
    expect(deletes[0]?.headers.get("Idempotency-Key")).toMatch(/[0-9a-f-]{36}/u);

    // Another session made it primary meanwhile: the api's 409 {status, primary: true}.
    server.use(
      http.delete(`${API_BASE}/platform/clubs/:id/domains/:host`, () =>
        HttpResponse.json(
          {
            code: "INVALID_STATE",
            details: { primary: true, status: "VERIFIED" },
            message: "The primary domain of its app",
            traceId: "trace-domain-primary",
          },
          { status: 409 },
        ),
      ),
    );
    fireEvent.click(
      row("minim.example.test").getByRole("button", { name: "Elimina minim.example.test" }),
    );
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Elimina minim.example.test" })).getByRole(
        "button",
        { name: "ELIMINA" },
      ),
    );
    expect(
      await screen.findByText(
        "És el domini principal de la seva app: abans fes principal un altre domini verificat.",
      ),
    ).toBeInTheDocument();
  });

  it("a pending action disables the other domain actions until the api answers", async () => {
    let release: () => void = () => undefined;
    server.use(
      http.post(`${API_BASE}/platform/clubs/:id/domains/:host/verification`, async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json(
          {
            code: "HOST_NOT_VERIFIED",
            details: {
              cnameTarget: "clubs.agilitydoghub.com",
              host: "minim.example.test",
              recordName: null,
              recordValue: null,
            },
            message: "No DNS record found",
            traceId: "trace-dns",
          },
          { status: 422 },
        );
      }),
    );
    await openDomains(MINIM);
    addDomain("altre.minim.example.test", "App dels abonats");
    await screen.findByRole("heading", { name: "Registres DNS de altre.minim.example.test" });
    fireEvent.click(
      row("minim.example.test").getByRole("button", { name: "Verifica minim.example.test" }),
    );
    await waitFor(() => {
      expect(
        row("minim.example.test").getByRole("button", { name: "Verifica minim.example.test" }),
      ).toHaveAttribute("aria-busy", "true");
    });
    expect(
      row("altre.minim.example.test").getByRole("button", {
        name: "Verifica altre.minim.example.test",
      }),
    ).toBeDisabled();
    expect(
      row("altre.minim.example.test").getByRole("button", {
        name: "Elimina altre.minim.example.test",
      }),
    ).toBeDisabled();
    release();
    // A refusal without a challenge left names only the CNAME (the TXT pair is null).
    await screen.findByText(/No s'ha trobat cap dels dos registres DNS de minim.example.test/u);
    expect(
      row("altre.minim.example.test").getByRole("button", {
        name: "Elimina altre.minim.example.test",
      }),
    ).toBeEnabled();
  });

  it("a template club has no domains: no add form, the api's rule said", async () => {
    await openDomains(TEMPLATE);
    expect(screen.getByText("Un club plantilla no té dominis.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Afegeix domini" })).toBeNull();
    expect(screen.getByText("El club encara no té cap domini.")).toBeInTheDocument();
  });
});

describe("E10-W03 step 3 · the club's public API key (R-17-11)", () => {
  it("T-17-11 generating asks first, shows the key once, and each confirmation is a new rotation (its own key)", async () => {
    const posts = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith("/public-api-key"),
    );
    await openDomains(CANIC);
    expect(screen.queryByLabelText("Clau d'API pública nova")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Genera una clau nova" }));
    const dialog = within(
      await screen.findByRole("dialog", { name: "Genera una clau d'API nova" }),
    );
    expect(dialog.getByText(/deixarà de funcionar d'aquí a 24 hores/u)).toBeInTheDocument();
    expect(posts).toEqual([]);
    fireEvent.click(dialog.getByRole("button", { name: "GENERA LA CLAU" }));
    const key = await screen.findByLabelText("Clau d'API pública nova");
    expect(key.textContent).toMatch(/^agh_pub_[A-Za-z0-9_-]{43}$/u);
    expect(screen.getByText("Copia-la ara: no es tornarà a mostrar.")).toBeInTheDocument();
    // Never kept anywhere the browser persists it.
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(key.textContent);
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain(key.textContent);

    fireEvent.click(screen.getByRole("button", { name: "Genera una clau nova" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Genera una clau d'API nova" })).getByRole(
        "button",
        { name: "GENERA LA CLAU" },
      ),
    );
    await waitFor(() => {
      expect(posts).toHaveLength(2);
    });
    const keys = posts.map((request) => request.headers.get("Idempotency-Key"));
    expect(keys[0]).toMatch(/[0-9a-f-]{36}/u);
    expect(keys[0]).not.toBe(keys[1]);
    await waitFor(() => {
      expect(screen.getByLabelText("Clau d'API pública nova").textContent).not.toBe(
        key.textContent,
      );
    });
  });
});
