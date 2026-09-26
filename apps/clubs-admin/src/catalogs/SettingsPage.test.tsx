import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createApiClient } from "@agilityhub/api-client";
import {
  catalogState,
  mockScenario,
  resetCatalogState,
  resetSettingsState,
} from "@agilityhub/api-client/mocks";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider } from "@agilityhub/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SettingsPage } from "./SettingsPage";

const branding: Branding = {
  ...brandingCanicFixture,
  theme: { ...brandingCanicFixture.theme, mode: "dark" },
};

const HELP = "Els nivells fora de la progressió no compten per a les descripcions «… i sup.».";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  mockScenario("admin");
  resetCatalogState();
  resetSettingsState();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetCatalogState();
  resetSettingsState();
});
afterAll(() => {
  server.close();
});

async function renderSettings(locale: "ca" | "en" | "es" = "ca") {
  const localized: Branding = { ...branding, locales: ["ca", "es", "en"] };
  const i18n = await createI18n({
    branding: localized,
    browserLanguages: [locale],
    initialNamespaces: ["admin-catalogs", "admin-settings", "admin-audit", "enums", "errors"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={localized}>
        <SettingsPage
          client={createApiClient({
            baseUrl: `${window.location.origin}/api/v1`,
            getLocale: () => locale,
          })}
        />
      </BrandingProvider>
    </I18nextProvider>,
  );
  const table = await screen.findByRole("table", {
    name: i18n.t("admin-catalogs:levels.caption"),
  });
  await within(table).findByText(locale === "ca" ? "Teràpia" : /Teràpia|Terapia/u);
  return table;
}

/** The JSON bodies of the `method` requests to `/levels…` (POST /levels, PATCH /levels/{id}). */
function captureLevelBodies(method: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method !== method || !new URL(request.url).pathname.includes("/levels")) return;
    void request
      .clone()
      .json()
      .then((body: Record<string, unknown>) => bodies.push(body));
  });
  return bodies;
}

describe("T-02-13 E4-W06 S05 §2 D11 «Nivells»: the «Progressió» switch (S05 §3 Level.progression, E29)", () => {
  it("shows one switch per level with the help text: Teràpia is off, the progression levels on", async () => {
    const table = await renderSettings();
    expect(within(table).getByRole("columnheader", { name: "Progressió" })).toBeVisible();
    expect(screen.getByRole("switch", { name: "Progressió: Teràpia" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("switch", { name: "Progressió: D" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(HELP)).toBeVisible();
    expect(screen.getByRole("switch", { name: "Progressió: D" })).toHaveAccessibleDescription(HELP);
  });

  it("saves a toggle with PATCH /levels/{id} {progression, version} and keeps the saved level", async () => {
    const bodies = captureLevelBodies("PATCH");
    await renderSettings();
    const therapy = screen.getByRole("switch", { name: "Progressió: Teràpia" });
    fireEvent.click(therapy);
    // The switch is locked while its PATCH is on its way.
    expect(therapy).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Progressió: Teràpia" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });
    expect(bodies).toEqual([{ progression: true, version: 1 }]);
    expect(screen.getByRole("switch", { name: "Progressió: Teràpia" })).toBeEnabled();
    expect(catalogState.levels.find((level) => level.id === "level-t")).toMatchObject({
      progression: true,
      version: 2,
    });

    // The next toggle sends the saved level's new version.
    fireEvent.click(screen.getByRole("switch", { name: "Progressió: Teràpia" }));
    await waitFor(() => {
      expect(bodies).toEqual([
        { progression: true, version: 1 },
        { progression: false, version: 2 },
      ]);
    });
  });

  it("shows a refused toggle by its code next to the table and keeps the switch as saved; STALE_VERSION reloads the levels", async () => {
    let answer: { code: string; status: number } = { code: "FORBIDDEN", status: 403 };
    server.use(
      http.patch("*/api/v1/levels/:id", () =>
        HttpResponse.json(
          { code: answer.code, details: {}, message: answer.code, traceId: "trace-e4-w06" },
          { status: answer.status },
        ),
      ),
    );
    const levelLists: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "GET" && new URL(request.url).pathname.endsWith("/levels")) {
        levelLists.push(request.url);
      }
    });
    await renderSettings();
    const section = screen.getByRole("table", { name: "Nivells del club" }).closest("section");
    if (section === null) throw new TypeError("Missing the Nivells card");
    fireEvent.click(screen.getByRole("switch", { name: "Progressió: D" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent(
      "No teniu permís per fer aquesta acció.",
    );
    expect(screen.getByRole("switch", { name: "Progressió: D" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    answer = { code: "STALE_VERSION", status: 409 };
    const before = levelLists.length;
    fireEvent.click(screen.getByRole("switch", { name: "Progressió: D" }));
    await waitFor(() => {
      expect(within(section).getByRole("alert")).toHaveTextContent(
        "Algú ha modificat aquest registre; torna a carregar",
      );
    });
    await waitFor(() => {
      expect(levelLists.length).toBeGreaterThan(before);
    });
  });

  it("the level form carries «Progressió»: a new level outside the progression is created with progression false; an edit keeps the level's value", async () => {
    const posts = captureLevelBodies("POST");
    const patches = captureLevelBodies("PATCH");
    await renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Nou nivell" }));
    const create = await screen.findByRole("dialog", { name: "Nou nivell" });
    const progression = within(create).getByRole("switch", { name: "Progressió" });
    // A new level is part of the progression by default (S05 §3).
    expect(progression).toHaveAttribute("aria-checked", "true");
    expect(within(create).getByText(HELP)).toBeVisible();
    fireEvent.change(within(create).getByLabelText("Nom"), { target: { value: "Avaluació" } });
    fireEvent.change(within(create).getByLabelText("Codi"), { target: { value: "ava" } });
    fireEvent.click(progression);
    fireEvent.click(within(create).getByRole("button", { name: "DESA" }));
    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({ code: "AVA", progression: false });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Nou nivell" })).not.toBeInTheDocument();
    });

    const row = (await screen.findByText("Teràpia")).closest("tr");
    if (row === null) throw new TypeError("Missing the Teràpia row");
    // The catalog table names its row actions after the row's name (E4-W14, AGENTS rule 6).
    fireEvent.click(within(row).getByRole("button", { name: "Edita Teràpia" }));
    const edit = await screen.findByRole("dialog", { name: "Edita el nivell" });
    expect(within(edit).getByRole("switch", { name: "Progressió" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    fireEvent.click(within(edit).getByRole("button", { name: "DESA" }));
    await waitFor(() => {
      expect(patches).toHaveLength(1);
    });
    expect(patches[0]).toMatchObject({ progression: false, version: 1 });
  });
});

/** The «Nivells» row of the level whose «Progressió» switch is named `name`. */
function levelRow(name: string): HTMLElement {
  const row = screen.getByRole("switch", { name: `Progressió: ${name}` }).closest("tr");
  if (row === null) throw new TypeError(`Missing the ${name} row`);
  return row;
}

/**
 * `PATCH /levels/{id}` held until `release(id)`; then a level in `refuse` answers 403 FORBIDDEN as
 * the api does, any other falls through to the mock (which saves it).
 */
function heldLevelPatches(refuse: ReadonlySet<string>) {
  const waiting = new Map<string, () => void>();
  server.use(
    http.patch("*/api/v1/levels/:id", async ({ params }) => {
      const id = String(params.id);
      await new Promise<void>((resolve) => {
        waiting.set(id, resolve);
      });
      return refuse.has(id)
        ? HttpResponse.json(
            { code: "FORBIDDEN", details: {}, message: "Forbidden", traceId: "trace-e4-w14" },
            { status: 403 },
          )
        : undefined;
    }),
  );
  return {
    release: async (id: string) => {
      await waitFor(() => {
        expect(waiting.has(id)).toBe(true);
      });
      waiting.get(id)?.();
      waiting.delete(id);
    },
  };
}

describe("T-02-13 E4-W14 S05 §2 D11 «Nivells» follow-ups of the E4-W06 review", () => {
  it("S05 §2 the «Progressió» help names no club level, in ca, es and en", async () => {
    const helps = {
      ca: HELP,
      en: "Levels outside the progression don't count for «… and up» descriptions.",
      es: "Los niveles fuera de la progresión no cuentan para las descripciones «… y sup.».",
    } as const;
    for (const locale of ["ca", "es", "en"] as const) {
      await renderSettings(locale);
      const help = document.getElementById("levels-progression-help");
      expect(help).toHaveTextContent(helps[locale]);
      // No level of the club (Teràpia, Pendent, D…) is named in a text every club reads.
      for (const level of catalogState.levels) {
        for (const name of [level.name, ...Object.values(level.nameI18n ?? {})]) {
          expect(help?.textContent).not.toMatch(new RegExp(`(^|[\\s«])${name}\\b`, "u"));
        }
      }
      cleanup();
    }
  });

  it("S05 §12 B32 the mock levels include «Pendent», outside the progression (off like Teràpia)", async () => {
    await renderSettings();
    expect(screen.getByRole("switch", { name: "Progressió: Pendent" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(within(levelRow("Pendent")).getByText("PENDENT")).toBeVisible();
    expect(screen.getByRole("switch", { name: "Progressió: Teràpia" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("a second toggle never re-enables a switch whose PATCH is still pending; each row keeps its own error", async () => {
    const patches = heldLevelPatches(new Set(["level-d"]));
    await renderSettings();
    fireEvent.click(screen.getByRole("switch", { name: "Progressió: D" }));
    fireEvent.click(screen.getByRole("switch", { name: "Progressió: E" }));
    expect(screen.getByRole("switch", { name: "Progressió: D" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Progressió: E" })).toBeDisabled();

    // D is refused: its error is in its own row, and E, still on its way, stays locked.
    await patches.release("level-d");
    expect(await within(levelRow("D")).findByRole("alert")).toHaveTextContent(
      "No teniu permís per fer aquesta acció.",
    );
    expect(screen.getByRole("switch", { name: "Progressió: D" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Progressió: D" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Progressió: E" })).toBeDisabled();
    expect(within(levelRow("E")).queryByRole("alert")).toBeNull();

    // Another row's toggle keeps D's error; E is saved without touching it.
    fireEvent.click(screen.getByRole("switch", { name: "Progressió: F" }));
    expect(within(levelRow("D")).getByRole("alert")).toBeVisible();
    await patches.release("level-e");
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Progressió: E" })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    });
    expect(screen.getByRole("switch", { name: "Progressió: E" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Progressió: F" })).toBeDisabled();
    expect(within(levelRow("D")).getByRole("alert")).toBeVisible();
    expect(within(levelRow("E")).queryByRole("alert")).toBeNull();
    // The error describes its switch.
    expect(screen.getByRole("switch", { name: "Progressió: D" })).toHaveAccessibleDescription(
      `${HELP} No teniu permís per fer aquesta acció.`,
    );
    await patches.release("level-f");
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Progressió: F" })).toBeEnabled();
    });
  });

  it("AGENTS rule 6: the catalog row buttons are named after the row's name, not its id", async () => {
    const table = await renderSettings();
    expect(
      within(levelRow("Teràpia")).getByRole("button", { name: "Edita Teràpia" }),
    ).toBeVisible();
    expect(within(levelRow("D")).getByRole("button", { name: "Elimina D" })).toBeVisible();
    expect(within(table).queryByRole("button", { name: /level-/u })).toBeNull();
    const faq = await screen.findByRole("table", { name: "Preguntes freqüents" });
    const [firstQuestion] = within(faq).getAllByRole("row").slice(1);
    const question = firstQuestion?.querySelectorAll("td")[2]?.textContent ?? "";
    expect(question).not.toBe("");
    expect(within(faq).getByRole("button", { name: `Edita ${question}` })).toBeVisible();
    expect(within(faq).queryByRole("button", { name: /faq-/u })).toBeNull();
  });

  it("S05 §2 the help sits inside the «Nivells» card, and «Nou nivell» keeps its icon inline", async () => {
    const table = await renderSettings();
    const card = table.closest(".catalog-table-card");
    expect(card).not.toBeNull();
    expect(card?.contains(document.getElementById("levels-progression-help") ?? null)).toBe(true);

    const button = screen.getByRole("button", { name: "Nou nivell" });
    expect(button.closest(".catalog-page")).not.toBeNull();
    const content = button.querySelector(".ah-button__content");
    expect(content?.querySelector("svg")).not.toBeNull();
    // Tailwind's preflight makes the icon a block; the design system lays every button's content
    // out inline (E4-W14 round 2, review nit #7), and no page keeps its own copy of the rule.
    const css = readFileSync(
      resolve(import.meta.dirname, "../../../../packages/ui/src/components.css"),
      "utf8",
    );
    const rule = /(?:^|\n)\.ah-button__content\s*\{([^}]*)\}/u.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/display:\s*inline-flex;/u);
    expect(rule).toMatch(/align-items:\s*center;/u);
    for (const file of [
      "../styles.css",
      "../planning/planning.css",
      "../activities/activities.css",
    ]) {
      expect(readFileSync(resolve(import.meta.dirname, file), "utf8")).not.toMatch(
        /\.ah-button__content\s*[,{]/u,
      );
    }
  });
});
