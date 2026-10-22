// E11-W04 (ruling E137): the es action labels are infinitives. Run by `packages/i18n`'s `test`:
// node --test.
import assert from "node:assert/strict";
import { test } from "node:test";

import { flaggedActions, KEEP, keptActions } from "./check-es-actions.mjs";

/** An es catalog as `packages/i18n/src/locales/es/<namespace>.json` holds it, by namespace. */
const CATALOG = {
  fixture: {
    imperative: {
      save: "Guarda",
      saveChanges: "GUARDA LOS CAMBIOS",
      retry: "Vuelve a intentarlo",
      remove: "Quita de la lista",
      addDog: "＋ AÑADE UN PERRO",
      swap: "Anula {oldDay} y confirma {newDay}",
      // E11-W05 step 5 (E155 #1): «de nuevo» is no noun complement; a participle that does not
      // agree with the homograph is a noun (the action's object), not the homograph's adjective.
      retry2: "Prueba de nuevo",
      download: "Descarga resultados",
      show: "Muestra salidas",
    },
    infinitive: {
      save: "Guardar",
      retry: "Volver a intentarlo",
    },
    noun: {
      confirmed: "Reserva confirmada",
      ringBooking: "Reserva de pista",
      checklistItem: "Marca: logo y colores propios",
      done: "Descarga completada",
      program: "Programa cancelado",
    },
    instruction: {
      level: "Selecciona el nivel inicial.",
      choosePlaceholder: "Elige una opción",
    },
    readerVoice: "APÚNTAME",
    enumValue: "activa",
  },
  // A real `KEEP` key: «Activa» is the adjective there, so it is kept, not flagged.
  common: { gallery: { active: "Activa" } },
};

const keys = (entries) => entries.map((entry) => entry.key);

test("an imperative action label is flagged, whatever its case, its «＋» or its placeholders", () => {
  assert.deepEqual(keys(flaggedActions(CATALOG)), [
    "fixture:imperative.save",
    "fixture:imperative.saveChanges",
    "fixture:imperative.retry",
    "fixture:imperative.remove",
    "fixture:imperative.addDog",
    "fixture:imperative.swap",
    "fixture:imperative.retry2",
    "fixture:imperative.download",
    "fixture:imperative.show",
  ]);
});

test("infinitives, nouns, sentences, placeholders, the reader's own voice and enum values are not", () => {
  const flagged = new Set(keys(flaggedActions(CATALOG)));
  for (const key of [
    "fixture:infinitive.save",
    "fixture:infinitive.retry",
    "fixture:noun.confirmed",
    "fixture:noun.ringBooking",
    "fixture:noun.checklistItem",
    "fixture:noun.done",
    "fixture:noun.program",
    "fixture:instruction.level",
    "fixture:instruction.choosePlaceholder",
    "fixture:readerVoice",
    "fixture:enumValue",
    "common:gallery.active",
  ]) {
    assert.equal(flagged.has(key), false, `${key} is flagged`);
  }
});

test("a key in KEEP is not flagged and is reported as kept, with its reason", () => {
  assert.equal(typeof KEEP.get("common:gallery.active"), "string");
  assert.deepEqual(keptActions(CATALOG), [
    { key: "common:gallery.active", reason: KEEP.get("common:gallery.active"), value: "Activa" },
  ]);
});

test("the same label is flagged once its key leaves KEEP", () => {
  assert.deepEqual(flaggedActions(CATALOG, new Map()).at(-1), {
    key: "common:gallery.active",
    value: "Activa",
  });
  assert.deepEqual(keptActions(CATALOG, new Map()), []);
});

test("every KEEP entry carries a one-line reason", () => {
  for (const [key, reason] of KEEP) {
    assert.match(key, /^[a-z-]+:[\w.]+$/u, key);
    assert.ok(reason.trim().length > 0 && !reason.includes("\n"), `${key} has no one-line reason`);
  }
});
