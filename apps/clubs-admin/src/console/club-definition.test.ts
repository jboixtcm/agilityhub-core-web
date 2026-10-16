import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { describe, expect, it } from "vitest";

import {
  buildClubDefinition,
  emptyDraft,
  proposeSlug,
  readStoredDraft,
  stepOfField,
  storableDraft,
  toYaml,
  WIZARD_DRAFT_KEY,
  type WizardDraft,
} from "./club-definition";

const product = {
  colors: brandingCanicFixture.theme.colors,
  fontFamily: brandingCanicFixture.theme.fontFamily,
  mode: "dark" as const,
  radius: "4px",
  ringPalette: [brandingCanicFixture.theme.colors.primary],
};

function filled(): WizardDraft {
  const draft = emptyDraft(product);
  return {
    ...draft,
    admin: { email: "laia.costa@example.test", name: "Laia Costa" },
    catalogs: { templateId: "template-1" },
    identity: {
      ...draft.identity,
      contactEmail: "hola@serralada.example.test",
      contactPhone: "+34 600 000 202",
      name: "Club Agility Serralada",
      slug: "serralada",
      street: "Carrer Major 1",
      taxId: "G00000000",
    },
    payments: {
      manual: {
        enabled: true,
        instructions: { ca: "Paga a la secretaria.", en: "Ignored: not a club language." },
      },
      sepa: {
        creditorId: "ES12000G00000000",
        creditorName: "Club Agility Serralada",
        enabled: true,
        invoiceSeriesPattern: "",
        suffix: "000",
      },
      stripe: { enabled: false, mode: "test", publishableKey: "" },
    },
  };
}

describe("T-17-12 · the wizard's ClubDefinition (S17 §3, E10-T01 layout)", () => {
  it("sends the preset, the first admin in the club's language, the template, and no empty field", () => {
    const definition = buildClubDefinition(filled());
    expect(definition).toMatchObject({
      admins: [{ email: "laia.costa@example.test", locale: "ca", name: "Laia Costa" }],
      apiVersion: "agilityhub.club/v1",
      catalogs: { fromTemplate: "template-1" },
      club: {
        address: { street: "Carrer Major 1" },
        countryProfile: "ES",
        currency: "EUR",
        defaultLocale: "ca",
        locales: ["ca", "es"],
        name: "Club Agility Serralada",
        slug: "serralada",
        status: "ONBOARDING",
        taxId: "G00000000",
        timeZone: "Europe/Madrid",
      },
      preset: "COMPLET",
      theme: { fontFamily: product.fontFamily, mode: "dark", radius: "4px" },
    });
    expect(definition.modules).toBeUndefined();
    // An empty optional field is omitted, never `""` (S02 §3: `""` would clear it).
    expect(definition.club).not.toHaveProperty("legalName");
    expect(definition.club).not.toHaveProperty("websiteUrl");
    expect(definition.club.address).toEqual({ street: "Carrer Major 1" });
  });

  it("never carries a credential: no IBAN, no Stripe secret; manual texts only in the club's languages", () => {
    const definition = buildClubDefinition(filled());
    expect(definition.paymentProviders).toEqual({
      MANUAL: { enabled: true, instructions: { ca: "Paga a la secretaria." } },
      SEPA_XML: {
        creditorId: "ES12000G00000000",
        creditorName: "Club Agility Serralada",
        enabled: true,
        suffix: "000",
      },
    });
    expect(JSON.stringify(definition)).not.toMatch(/iban|secretKey|webhookSecret|sk_/u);
  });

  it("omits the providers when payments stay «for later» and the admins when there is none", () => {
    const draft = emptyDraft(product);
    const definition = buildClubDefinition({
      ...draft,
      identity: { ...draft.identity, name: "X", slug: "xyz" },
    });
    expect(definition).not.toHaveProperty("paymentProviders");
    expect(definition).not.toHaveProperty("admins");
    expect(definition).not.toHaveProperty("catalogs");
  });

  it("proposes the slug from the name: lower case, no accents, dashes, at most 40", () => {
    expect(proposeSlug("Club Agility Riera")).toBe("club-agility-riera");
    expect(proposeSlug("  Escola d'Agility L'Àliga  ")).toBe("escola-d-agility-l-aliga");
    expect(proposeSlug("Associació ".repeat(8))).toBe("associacio-associacio-associacio-associa");
    // Cut at 40, a trailing dash goes too.
    expect(proposeSlug(`${"a".repeat(39)} b`)).toBe("a".repeat(39));
  });

  it("maps every refused field path to the step that edits it", () => {
    expect(stepOfField("club.slug")).toBe("identity");
    expect(stepOfField("club.address.city")).toBe("identity");
    expect(stepOfField("club.timeZone")).toBe("localization");
    expect(stepOfField("modules[2]")).toBe("modules");
    expect(stepOfField("paymentProviders.SEPA_XML.creditorId")).toBe("payments");
    expect(stepOfField("theme.radius")).toBe("theme");
    expect(stepOfField("catalogs.fromTemplate")).toBe("catalogs");
    expect(stepOfField("admins[0].email")).toBe("admin");
    expect(stepOfField("accounts")).toBe("review");
  });

  it("the local draft never holds personal data (review checklist: drafts)", () => {
    const stored = JSON.stringify(storableDraft(filled()));
    expect(stored).not.toContain("laia.costa@example.test");
    expect(stored).not.toContain("Laia Costa");
    expect(stored).not.toContain("hola@serralada.example.test");
    expect(stored).not.toContain("+34 600 000 202");
    const storage = {
      getItem: (key: string) => (key === WIZARD_DRAFT_KEY ? JSON.stringify(filled()) : null),
    };
    // Even a draft written with them (an older build) is read back without them.
    const restored = readStoredDraft(storage, emptyDraft(product));
    expect(restored?.identity.name).toBe("Club Agility Serralada");
    expect(restored?.admin).toEqual({ email: "", name: "" });
    expect(restored?.identity.contactEmail).toBe("");
    expect(readStoredDraft({ getItem: () => "{not json" }, emptyDraft(product))).toBeUndefined();
  });

  it("renders the definition as club-as-code YAML: block style, quoted colours, lists of objects", () => {
    const yaml = toYaml(buildClubDefinition(filled()));
    expect(yaml).toContain("apiVersion: agilityhub.club/v1");
    expect(yaml).toContain("club:\n  address:\n    street: Carrer Major 1");
    expect(yaml).toContain("  locales:\n    - ca\n    - es");
    expect(yaml).toContain(
      "admins:\n  - email: laia.costa@example.test\n    locale: ca\n    name: Laia Costa",
    );
    // `#` starts a YAML comment: a colour is always quoted.
    expect(yaml).toContain(`primary: ${JSON.stringify(product.colors.primary)}`);
    expect(toYaml({ empty: [], flag: true, nothing: {}, word: "yes" })).toBe(
      'empty: []\nflag: true\nnothing: {}\nword: "yes"',
    );
  });
});
