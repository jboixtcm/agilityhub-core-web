import { describe, expect, it } from "vitest";

import { createCourseTexts, type CourseWarningRule } from "./course-texts";
import { createI18n } from "./setup";
import type { Locale } from "./types";

async function textsIn(locale: Locale) {
  const instance = await createI18n({
    branding: { defaultLocale: locale, locales: ["ca", "es", "en"] },
    browserLanguages: [locale],
    initialNamespaces: ["common", "enums", "errors"],
    storage: undefined,
  });
  const t = instance.getFixedT(locale);
  return createCourseTexts((key, options) => t(key, options ?? {}));
}

/** The api's error envelope, as `ApiError` carries it (status, top-level code, details). */
function apiError(status: number, code: string, details: unknown = null) {
  return { code, details, message: "ignored", status, traceId: "trace-1" };
}

const RULES: readonly CourseWarningRule[] = [
  "outside-ring",
  "border-clearance",
  "course-no-go",
  "ring-no-go",
  "door-clearance",
  "course-larger-than-ring",
  "obstacle-inventory",
];

describe("E9-W02 round 2 #8/#9: the course texts shared by course-ui's callers", () => {
  it("R-16-17 each warning rule reads a translated name in ca, es and en (never its id)", async () => {
    for (const locale of ["ca", "es", "en"] as const) {
      const texts = await textsIn(locale);
      for (const rule of RULES) {
        const label = texts.warningRule(rule);
        expect(label).not.toBe(rule);
        expect(label).not.toContain("courseWarningRule");
      }
    }
    const ca = await textsIn("ca");
    expect(ca.warningRule("door-clearance")).toBe("Distància a la porta");
    expect((await textsIn("es")).warningRule("door-clearance")).toBe("Distancia a la puerta");
    expect((await textsIn("en")).warningRule("door-clearance")).toBe("Door clearance");
  });

  it("R-16-04 / R-16-02 STALE_VERSION, GEOMETRY_INVALID and FILE_TOO_LARGE each read their own catalog message", async () => {
    const ca = await textsIn("ca");
    const stale = ca.errorText(apiError(409, "STALE_VERSION"));
    const geometry = ca.errorText(
      apiError(422, "GEOMETRY_INVALID", { fieldErrors: [{ field: "markers" }] }),
    );
    const tooLarge = ca.errorText(apiError(400, "FILE_TOO_LARGE"));
    expect(stale).toBe(
      "Aquest element s'ha modificat des d'un altre lloc. Actualitza'l i torna-ho a provar.",
    );
    expect(geometry).toBe("La geometria no és vàlida.");
    expect(tooLarge).toBe("El fitxer és massa gran.");
    expect(new Set([stale, geometry, tooLarge]).size).toBe(3);
    expect((await textsIn("en")).errorText(apiError(409, "STALE_VERSION"))).toBe(
      "This item was changed elsewhere. Reload and try again.",
    );
  });

  it("CONVENCIONS_API §7: a keyed write still running reads «in progress»; a network failure and an unknown code, the generic text", async () => {
    const ca = await textsIn("ca");
    expect(ca.errorText(apiError(409, "IDEMPOTENCY_KEY_REUSED", { reason: "IN_PROGRESS" }))).toBe(
      "L'operació encara està en curs. Torna-ho a provar d'aquí a un moment.",
    );
    const generic =
      "S'ha produït un error inesperat. Torna-ho a provar; si persisteix, indica el codi de referència al club.";
    expect(ca.errorText({ code: "NETWORK", details: null, status: 0 })).toBe(generic);
    expect(ca.errorText(new TypeError("Failed to fetch"))).toBe(generic);
    expect(ca.errorText(apiError(422, "SOMETHING_NEW"))).toBe(generic);
  });
});
