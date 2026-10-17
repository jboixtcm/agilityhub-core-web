// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  configurePlannerStore,
  RingDoorEditor,
  UploadCourse,
  type PlannerRing,
  type RingDoorEditorLabels,
  type UploadCourseLabels,
} from "@agilityhub/course-ui";
import { createCourseTexts, createI18n, type CourseTexts } from "@agilityhub/i18n";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiClient } from "./client";
import { CoreApiStore } from "./core-api-store";
import { createFakeCoreApi, fakeEntrance, type FakeCoreApi } from "./core-api-store.fake";
import type { components } from "./generated/schema";

const source = readFileSync(
  resolve(process.cwd(), "../course-core/fixtures/smarter/jp-s-sw_993483_sadesign.txt"),
  "utf8",
);

let texts: CourseTexts;

beforeAll(async () => {
  const i18n = await createI18n({
    branding: { defaultLocale: "ca", locales: ["ca", "es", "en"] },
    browserLanguages: ["ca"],
    initialNamespaces: ["common", "enums", "errors"],
    storage: undefined,
  });
  const t = i18n.getFixedT("ca");
  texts = createCourseTexts((key, options) => t(key, options ?? {}));
});

afterEach(cleanup);

function storeOn(api: FakeCoreApi): CoreApiStore {
  const store = new CoreApiStore({
    client: createApiClient({ baseUrl: "https://core.test", fetch: api.fetch }),
    uploadFetch: api.uploadFetch,
    venue: { id: "club-1", locale: "ca", name: "Club", slug: "club" },
  });
  configurePlannerStore(store);
  return store;
}

function uploadLabels(): UploadCourseLabels {
  return {
    continue: "Continua",
    dimensions: (length, width) => `${String(length)} × ${String(width)} m`,
    error: (error) => texts.errorText(error),
    file: "Fitxer Smarter",
    ignoredLogos: (count) => `${String(count)} logos`,
    noGoZones: (count) => `${String(count)} zones`,
    numbers: (count) => `${String(count)} números`,
    obstacles: (count) => `${String(count)} obstacles`,
    parseError: "No s'ha pogut llegir el fitxer.",
    parsing: (filename) => `Llegint ${filename}`,
    savedContinue: "Desat",
    title: "Puja un recorregut",
    units: (value) => value,
    uploading: "Pujant…",
  };
}

function doorLabels(): RingDoorEditorLabels {
  return {
    active: "Activa",
    add: "Afegeix una porta",
    clearance: "Marge",
    clearanceFor: (index) => `Marge de la porta ${String(index)}`,
    description: "Portes de la pista",
    door: (index) => `Porta ${String(index)}`,
    empty: () => "Cap porta",
    end: "Fi",
    endFor: (index) => `Fi de la porta ${String(index)}`,
    error: (error) => texts.errorText(error),
    flow: "Sentit",
    flowFor: (index) => `Sentit de la porta ${String(index)}`,
    flowOption: { both: "Entrada i sortida", in: "Entrada", out: "Sortida" },
    geometry: () => "",
    maximumReached: () => "Màxim",
    notes: "Notes",
    notesFor: (index) => `Notes de la porta ${String(index)}`,
    notesPlaceholder: "",
    preview: "Vista prèvia",
    previewAria: (ring) => `Portes de ${ring}`,
    remove: (index) => `Treu la porta ${String(index)}`,
    revert: "Desfés",
    save: "Desa",
    saved: "Portes desades",
    saving: "Desant…",
    side: {
      east: { hint: "est", label: "Est" },
      north: { hint: "nord", label: "Nord" },
      south: { hint: "sud", label: "Sud" },
      west: { hint: "oest", label: "Oest" },
    },
    start: "Inici",
    startFor: (index) => `Inici de la porta ${String(index)}`,
    title: (ring) => ring,
    validation: {
      clearance: () => "marge",
      endpoints: () => "extrems",
      maximum: () => "màxim",
      order: () => "ordre",
      wall: () => "paret",
    },
    wall: "Paret",
    wallFor: (index) => `Paret de la porta ${String(index)}`,
  };
}

function geometryPuts(api: FakeCoreApi): components["schemas"]["RingGeometryRequest"][] {
  return api.requests
    .filter((request) => request.method === "PUT" && request.path === "/rings/ring-1/geometry")
    .map((request) => request.body as components["schemas"]["RingGeometryRequest"]);
}

async function ringOf(store: CoreApiStore): Promise<PlannerRing> {
  const ring = await store.getRing("ring-1");
  if (ring === null) throw new Error("RING_NOT_FOUND");
  return ring;
}

describe("E9-W02 round 2: course-ui on the real CoreApiStore (no mocked adapter)", () => {
  it("T-16-15 R-16-03 UploadCourse retries a lost answer with the same key and body: one upload, one course (E9-W02 round 2 #1)", async () => {
    const api = createFakeCoreApi();
    storeOn(api);
    api.loseNextAnswer("POST", "/courses");
    const onUploaded = vi.fn();
    render(<UploadCourse labels={uploadLabels()} onUploaded={onUploaded} />);

    fireEvent.change(screen.getByLabelText("Fitxer Smarter"), {
      target: { files: [new File([source], "jp-s-sw.txt", { type: "text/plain" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Continua" }));
    // A lost answer is a network failure: the generic catalog text, beside the upload.
    expect((await screen.findByRole("alert")).textContent).toBe(
      "S'ha produït un error inesperat. Torneu-ho a provar; si persisteix, indiqueu el codi de referència al club.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledOnce();
    });

    expect(onUploaded.mock.calls[0]?.[1]).toBe("course-1");
    expect(api.uploads).toHaveLength(1);
    const creations = api.requests.filter((request) => request.path === "/courses");
    expect(creations).toHaveLength(2);
    expect(creations[1]?.idempotencyKey).toBe(creations[0]?.idempotencyKey);
    expect(creations[1]?.body).toEqual(creations[0]?.body);
    expect(api.courses).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("T-16-14 R-16-02 a source over files.maxSizeMb reads FILE_TOO_LARGE's own catalog text in the upload card (E9-W02 round 2 #8)", async () => {
    const api = createFakeCoreApi({ maxSizeMb: 1 });
    storeOn(api);
    render(<UploadCourse labels={uploadLabels()} onUploaded={vi.fn()} />);

    // The same course with 1.1 MB of trailing blank lines: still a valid Smarter file.
    const padded = `${source}${"\n".repeat(1_150_000)}`;
    fireEvent.change(screen.getByLabelText("Fitxer Smarter"), {
      target: { files: [new File([padded], "jp-s-sw.txt", { type: "text/plain" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Continua" }));

    expect((await screen.findByRole("alert")).textContent).toBe("El fitxer és massa gran.");
    expect(api.requests.at(-1)).toMatchObject({
      body: { contentType: "text/plain", purpose: "SMARTER_SOURCE", size: padded.length },
      path: "/courses/upload-urls",
    });
    expect(api.uploads).toHaveLength(0);
    expect(api.courses).toHaveLength(0);
  });

  it("T-16-06 R-16-04 add → save → edit → save keeps the saved door's id and leaves the editor clean (E9-W02 round 2 #9)", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);
    const onSaved = vi.fn();
    render(<RingDoorEditor ring={await ringOf(store)} labels={doorLabels()} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "Afegeix una porta" }));
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    await screen.findByText("Portes desades");

    const [first] = geometryPuts(api);
    expect(first?.version).toBe(3);
    const added = first?.doors[1];
    expect(added).toMatchObject({ label: "Porta 2", side: "SOUTH" });
    expect(added?.id).toMatch(/^[0-9a-f-]{36}$/u);
    // Rebuilt from the saved ring: nothing left to save or revert.
    expect(screen.getByRole("button", { name: "Desa" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Desfés" })).toHaveProperty("disabled", true);
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ geometry_version: 4 }));

    fireEvent.change(screen.getByLabelText("Porta 2"), { target: { value: "Sortida" } });
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));
    await screen.findByText("Portes desades");

    const second = geometryPuts(api)[1];
    expect(second?.version).toBe(4);
    expect(second?.doors.map((door) => [door.id, door.label])).toEqual([
      ["door-entrance", "Entrada"],
      [added?.id, "Sortida"],
    ]);
    expect(api.geometry.doors).toHaveLength(2);
    expect(api.geometry.version).toBe(5);
  });

  it("T-16-06 R-16-04 another editor's save in between: STALE_VERSION reads its catalog text in the editor, [Desa] waits for [Desfés] (INC-60), and [Desfés] brings their door in (E9-W02 round 2 #3/#8)", async () => {
    const api = createFakeCoreApi();
    const store = storeOn(api);
    render(<RingDoorEditor ring={await ringOf(store)} labels={doorLabels()} onSaved={vi.fn()} />);

    api.saveGeometryElsewhere((geometry) => ({
      ...geometry,
      doors: [
        ...geometry.doors,
        { ...fakeEntrance, id: "door-south", label: "Sortida sud", side: "SOUTH" as const },
      ],
    }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Desa" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Aquest element s'ha modificat des d'un altre lloc. Actualitzeu-lo i torneu-ho a provar.",
    );
    expect(geometryPuts(api).map((body) => body.version)).toEqual([3]);
    expect(api.geometry.doors.map((door) => [door.id, door.isActive])).toEqual([
      ["door-entrance", true],
      ["door-south", true],
    ]);
    // INC-60: saving again would repeat the same 409; only [Desfés] (read their doors) goes on.
    expect(screen.getByRole("button", { name: "Desa" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Desfés" })).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: "Desfés" }));
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>("Porta 2").value).toBe("Sortida sud");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
