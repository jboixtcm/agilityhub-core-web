// E11-W03 round 2 (kit review #2): the literal inventory reads every branch of an ICU plural or
// select, nested ones too. Run by `packages/i18n`'s `test`: node --test.
import assert from "node:assert/strict";
import { test } from "node:test";

import { fragments, matchingMockup, mockupText } from "./qa-literals.mjs";

const mockup = (id, html) => ({ id, text: mockupText(html) });

test("a select's alternative branch is a fragment, not only its other branch", () => {
  // instructor:attendance.waitlistRule (ca), the FIFO text the first inventory dropped.
  const message =
    "{mode, select, FIFO {Si s'allibera una plaça, s'avisa per ordre d'arribada: cadascú té {minutes} min per confirmar.} other {Si s'allibera una plaça, s'avisa alhora tothom qui espera.}}";
  assert.deepEqual(fragments(message), [
    "si s'allibera una plaça, s'avisa per ordre d'arribada: cadascú té",
    "min per confirmar",
    "si s'allibera una plaça, s'avisa alhora tothom qui espera",
  ]);
});

test("a nested select inside a plural gives every branch of both", () => {
  const message =
    "Tens {count, plural, one {un gos {sex, select, FEMALE {inscrita} other {inscrit}}} other {# gossos {sex, select, FEMALE {inscrites} other {inscrits}}}} avui";
  assert.deepEqual(fragments(message), [
    "tens",
    "un gos",
    "inscrita",
    "inscrit",
    "gossos",
    "inscrites",
    "inscrits",
    "avui",
  ]);
});

test("an empty other branch never makes a message «variables only»", () => {
  const message = "{count, plural, one {Queda una plaça} other {}}";
  assert.deepEqual(fragments(message), ["queda una plaça"]);
  assert.equal(matchingMockup(message, [mockup("04", "<p>Reserva</p>")]), undefined);
});

test("a message stays a literal when one branch is in no mockup", () => {
  const message = "{mode, select, FIFO {Per ordre d'arribada} other {Tothom alhora}}";
  const onlyOther = mockup("22", "<span>Tothom alhora</span>");
  assert.equal(matchingMockup(message, [onlyOther]), undefined);
  const both = mockup("22", "<span>Tothom alhora</span><span>Per ordre d&rsquo;arribada</span>");
  assert.equal(matchingMockup(message, [onlyOther, both])?.id, "22");
});

test("a message of variables and signs only is still «variables only»", () => {
  assert.equal(matchingMockup("{amount} · {date}", []), null);
  assert.equal(matchingMockup("{count, plural, one {#} other {# ×}}", []), null);
});
