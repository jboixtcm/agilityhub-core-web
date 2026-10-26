import {
  CONSOLE_CLUB_IDS,
  consoleState,
  resetConsoleMockState,
} from "@agilityhub/api-client/mocks";
import { server } from "@agilityhub/api-client/mocks/server";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { WIZARD_DRAFT_KEY } from "./club-definition";
import { API_BASE, captureRequests, renderConsole } from "./console-test-utils";
import { productTheme } from "./product-theme";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  resetConsoleMockState();
  localStorage.removeItem(WIZARD_DRAFT_KEY);
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetConsoleMockState();
  localStorage.removeItem(WIZARD_DRAFT_KEY);
});
afterAll(() => {
  server.close();
});

function next() {
  fireEvent.click(screen.getByRole("button", { name: "SEGÜENT" }));
}

async function step(name: string, position: number) {
  return screen.findByRole("heading", { level: 2, name: `Pas ${String(position)} de 8 · ${name}` });
}

async function fillIdentity(name: string) {
  await step("Identitat", 1);
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Correu de contacte"), {
    target: { value: "hola@serralada.example.test" },
  });
}

/** From step 2 to the review with the defaults and a first admin. */
async function toReview() {
  next();
  await step("Localització", 2);
  next();
  await step("Mòduls", 3);
  next();
  await step("Pagaments", 4);
  next();
  await step("Tema", 5);
  next();
  await step("Catàlegs base", 6);
  next();
  await step("Primer administrador", 7);
  fireEvent.change(screen.getByLabelText("Correu electrònic"), {
    target: { value: "laia.costa@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Laia Costa" } });
  next();
  await step("Revisió", 8);
}

/** From the theme step's [SEGÜENT] to the review, with a first admin. */
async function toAdmin() {
  await step("Catàlegs base", 6);
  next();
  await step("Primer administrador", 7);
  fireEvent.change(screen.getByLabelText("Correu electrònic"), {
    target: { value: "laia.costa@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Laia Costa" } });
  next();
  await step("Revisió", 8);
}

describe("T-17-12 · «Nou club» wizard (S17 §2 «D19 Assistent»)", () => {
  it("eight steps create the club (POST /platform/clubs, one key) and land on its record with the onboarding checklist", async () => {
    const posts = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith("/platform/clubs"),
    );
    const { navigations } = await renderConsole("/consola/clubs/nou");
    expect(
      within(screen.getByRole("list", { name: "Passos de l'assistent" })).getAllByRole("listitem"),
    ).toHaveLength(8);
    // A step does not advance with what it lacks.
    next();
    expect(await screen.findByText("Escriu el nom del club.")).toBeInTheDocument();
    await fillIdentity("Club Agility Serralada");
    // S17: «slug proposat» from the name.
    expect(screen.getByLabelText("Slug")).toHaveValue("club-agility-serralada");
    next();
    await step("Localització", 2);
    next();
    await step("Mòduls", 3);
    fireEvent.click(screen.getByRole("radio", { name: "Mínim" }));
    expect(screen.getByRole("list", { name: "Mòduls que s'activen" })).toHaveTextContent(
      /Llista d'espera.*Preguntes freqüents.*Notificacions push/u,
    );
    next();
    await step("Pagaments", 4);
    fireEvent.click(screen.getByRole("switch", { name: "Activa Domiciliació SEPA" }));
    fireEvent.change(screen.getByLabelText("Nom del creditor"), {
      target: { value: "Club Agility Serralada" },
    });
    fireEvent.change(screen.getByLabelText("Identificador de creditor"), {
      target: { value: "ES12000G00000001" },
    });
    fireEvent.change(screen.getByLabelText("Sufix"), { target: { value: "000" } });
    next();
    await step("Tema", 5);
    expect(screen.getByTestId("theme-preview-clubs")).toHaveTextContent("Club Agility Serralada");
    next();
    await step("Catàlegs base", 6);
    // E11-W05 step 6 (A41.1): the copied set is a starting point the club edits afterwards.
    expect(
      screen.getByText(/És un punt de partida: el club els pot editar després\.$/u),
    ).toBeInTheDocument();
    const template = screen.getByLabelText("Club plantilla");
    await waitFor(() => {
      expect(within(template).getAllByRole("option")).toHaveLength(2);
    });
    fireEvent.change(template, { target: { value: CONSOLE_CLUB_IDS.template } });
    next();
    await step("Primer administrador", 7);
    next();
    expect(await screen.findByText("Escriu un correu electrònic vàlid.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Correu electrònic"), {
      target: { value: "laia.costa@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Laia Costa" } });
    next();
    await step("Revisió", 8);
    const yaml = screen.getByLabelText("Fitxer club-as-code");
    expect(yaml).toHaveTextContent("apiVersion: agilityhub.club/v1");
    expect(yaml).toHaveTextContent("slug: club-agility-serralada");
    expect(yaml).toHaveTextContent("preset: MINIM");
    fireEvent.click(screen.getByRole("button", { name: "CREA EL CLUB" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Club Agility Serralada" }),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]?.headers.get("Idempotency-Key")).toMatch(/[0-9a-f-]{36}/u);
    expect(posts[0]?.body).toMatchObject({
      admins: [{ email: "laia.costa@example.test", locale: "ca", name: "Laia Costa" }],
      apiVersion: "agilityhub.club/v1",
      catalogs: { fromTemplate: CONSOLE_CLUB_IDS.template },
      club: {
        contactEmail: "hola@serralada.example.test",
        name: "Club Agility Serralada",
        slug: "club-agility-serralada",
        status: "ONBOARDING",
      },
      paymentProviders: {
        SEPA_XML: { creditorId: "ES12000G00000001", enabled: true, suffix: "000" },
      },
      preset: "MINIM",
    });
    const created = consoleState.clubs.find((club) => club.slug === "club-agility-serralada");
    expect(navigations.at(-1)).toBe(`/consola/clubs/${created?.id ?? ""}/identitat?creat=1`);
    expect(screen.getByText(/S'ha creat el club Club Agility Serralada/u)).toBeInTheDocument();
    const checklist = screen.getByRole("region", { name: "Checklist d'onboarding" });
    expect(within(checklist).getAllByRole("listitem")).toHaveLength(7);
    expect(within(checklist).getByText(/falten:/u)).toBeInTheDocument();
  });

  it("a refusal goes back to the step that fixes it: SLUG_TAKEN to Identitat, fieldErrors to their field", async () => {
    await renderConsole("/consola/clubs/nou");
    await fillIdentity("Canic");
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "canic" } });
    await toReview();
    fireEvent.click(screen.getByRole("button", { name: "CREA EL CLUB" }));
    await step("Identitat", 1);
    expect(screen.getByLabelText("Slug").closest(".ah-form-field")).toHaveTextContent(
      "Aquest identificador d'adreça ja està en ús.",
    );
    server.use(
      http.post(`${API_BASE}/platform/clubs`, () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            details: { fieldErrors: [{ code: "INVALID_VALUE", field: "admins[0].email" }] },
            message: "Validation failed",
            traceId: "trace-console-3",
          },
          { status: 400 },
        ),
      ),
    );
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "serralada" } });
    await toReview();
    fireEvent.click(screen.getByRole("button", { name: "CREA EL CLUB" }));
    await step("Primer administrador", 7);
    expect(screen.getByLabelText("Correu electrònic").closest(".ah-form-field")).toHaveTextContent(
      "Aquest valor no és vàlid.",
    );
  });

  it("E10-W01 round 2 #2: on a club's admin host the new club gets the product's theme, never the host's", async () => {
    const posts = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith("/platform/clubs"),
    );
    await renderConsole("/consola/clubs/nou", { hostBranding: "admin" });
    const light = productTheme("light");
    // The host really is a club's: its branding is applied to the page, and it is not the product's.
    const page = getComputedStyle(document.documentElement);
    expect(page.getPropertyValue("--ah-color-primary").trim().toLowerCase()).not.toBe(
      light.colors.primary,
    );
    expect(page.getPropertyValue("--ah-color-primary").trim()).not.toBe("");
    await fillIdentity("Club Agility Serralada");
    next();
    await step("Localització", 2);
    next();
    await step("Mòduls", 3);
    next();
    await step("Pagaments", 4);
    next();
    await step("Tema", 5);
    expect(screen.getByRole("radio", { name: "Tema predeterminat" })).toBeChecked();
    next();
    await toAdmin();
    fireEvent.click(screen.getByRole("button", { name: "CREA EL CLUB" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Club Agility Serralada" }),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect((posts[0]?.body as { theme: unknown }).theme).toEqual({
      colors: light.colors,
      fontFamily: light.fontFamily,
      mode: "light",
      radius: light.radius,
      ringPalette: [],
    });
  });

  it("E10-W01 round 2 #2: the preset's dark mode sends the product's dark palette, and back", async () => {
    const posts = captureRequests(
      (method, url) => method === "POST" && url.pathname.endsWith("/platform/clubs"),
    );
    await renderConsole("/consola/clubs/nou", { hostBranding: "admin" });
    await fillIdentity("Club Agility Serralada");
    next();
    await step("Localització", 2);
    next();
    await step("Mòduls", 3);
    next();
    await step("Pagaments", 4);
    next();
    await step("Tema", 5);
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "dark" } });
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "light" } });
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "dark" } });
    next();
    await toAdmin();
    fireEvent.click(screen.getByRole("button", { name: "CREA EL CLUB" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Club Agility Serralada" }),
    ).toBeInTheDocument();
    const dark = productTheme("dark");
    expect(dark.colors.background).not.toBe(productTheme("light").colors.background);
    expect((posts[0]?.body as { theme: unknown }).theme).toMatchObject({
      colors: dark.colors,
      mode: "dark",
    });
  });

  it("the draft is kept on this device without personal data, and restored", async () => {
    await renderConsole("/consola/clubs/nou");
    await fillIdentity("Club Agility Serralada");
    fireEvent.click(screen.getByRole("button", { name: "Desa com a esborrany" }));
    expect(
      screen.getByText("Esborrany desat en aquest dispositiu, sense les dades personals."),
    ).toBeInTheDocument();
    const saved = localStorage.getItem(WIZARD_DRAFT_KEY) ?? "";
    expect(saved).toContain("Club Agility Serralada");
    expect(saved).not.toContain("hola@serralada.example.test");
    cleanup();
    await renderConsole("/consola/clubs/nou");
    expect(await screen.findByText(/S'ha recuperat l'esborrany/u)).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Club Agility Serralada");
    expect(screen.getByLabelText("Correu de contacte")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Descarta l'esborrany" }));
    expect(localStorage.getItem(WIZARD_DRAFT_KEY)).toBeNull();
    expect(screen.getByLabelText("Nom")).toHaveValue("");
  });
});
