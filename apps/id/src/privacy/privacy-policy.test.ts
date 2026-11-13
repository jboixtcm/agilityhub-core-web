// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { productLocales } from "@agilityhub/i18n";
import { describe, expect, it } from "vitest";

import {
  PRIVACY_POLICY,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from "./privacy-policy";
import { privacyPolicyBuildProblem } from "./release-guard";

const legalDocument = readFileSync(
  fileURLToPath(
    new URL("../../../../docs/legal/POLITICA_PRIVACITAT_AGILITYHUB_ID.md", import.meta.url).href,
  ),
  "utf8",
);

describe("PRIV-01 the platform's privacy policy", () => {
  it("has a text in every product locale, built from the versioned content file", () => {
    expect(PRIVACY_POLICY.version).toBe(PRIVACY_POLICY_VERSION);
    expect(PRIVACY_POLICY.effectiveDate).toBe(PRIVACY_POLICY_EFFECTIVE_DATE);
    expect(PRIVACY_POLICY_VERSION.trim()).not.toBe("");
    for (const locale of productLocales) {
      expect(PRIVACY_POLICY.text[locale].length).toBeGreaterThan(2000);
    }
  });

  it("names the club as controller with its identifiers and privacy contact, and no person", () => {
    for (const locale of productLocales) {
      const text = PRIVACY_POLICY.text[locale];
      expect(text).toContain("Club Agility Cànic");
      expect(text).toContain("G63189617");
      expect(text).toContain("Carrer Sant Pere, 10, 08392 Sant Andreu de Llavaneres");
      expect(text).toContain("[info@agilitycanic.cat](mailto:info@agilitycanic.cat)");
    }
  });

  it("lists the live processors and recipients, and none of the draft's", () => {
    for (const locale of productLocales) {
      const text = PRIVACY_POLICY.text[locale];
      for (const provider of ["AgilityHub", "DigitalOcean", "Brevo", "Stripe"]) {
        expect(text).toContain(`**${provider}**`);
      }
      for (const absent of ["Twilio", "SendGrid", "Amazon", "AWS", "Sentry", "Learn", "OIDC"]) {
        expect(text).not.toContain(absent);
      }
    }
    expect(PRIVACY_POLICY.text.ca).toContain("**El banc del club**");
    expect(PRIVACY_POLICY.text.es).toContain("**El banco del club**");
    expect(PRIVACY_POLICY.text.en).toContain("**The club's bank**");
  });

  it("keeps the six-year retention of the PRIV-02 floors", () => {
    expect(PRIVACY_POLICY.text.ca).toContain("**6 anys**");
    expect(PRIVACY_POLICY.text.es).toContain("**6 años**");
    expect(PRIVACY_POLICY.text.en).toContain("**6 years**");
  });

  it("carries no draft marker, placeholder or forbidden word", () => {
    for (const locale of productLocales) {
      const text = PRIVACY_POLICY.text[locale];
      // A bracket that does not open a Markdown link is a placeholder such as «[NIF]».
      expect(text).not.toMatch(/\[[^\]]*\](?!\()/u);
      expect(text).not.toMatch(/esborrany|borrador|\bdraft\b|DD-MM|AAAA/iu);
      expect(text).not.toMatch(/\bTODO\b|\bXXX\b/u);
      expect(text).not.toMatch(/parell|amigable/iu);
    }
  });

  it("is the text of docs/legal, with the same version and effective date", () => {
    for (const locale of productLocales) {
      expect(legalDocument).toContain(PRIVACY_POLICY.text[locale]);
    }
    expect(legalDocument).toContain(`**Versió:** ${PRIVACY_POLICY_VERSION} ·`);
    expect(legalDocument).toContain(`PLATFORM_PRIVACY_POLICY_VERSION=${PRIVACY_POLICY_VERSION}`);
    expect(legalDocument).toContain(
      PRIVACY_POLICY_EFFECTIVE_DATE === null
        ? "**Data d'entrada en vigor:** pendent"
        : `**Data d'entrada en vigor:** ${PRIVACY_POLICY_EFFECTIVE_DATE}`,
    );
  });

  it("has an effective date that is a calendar day once it is set", () => {
    if (PRIVACY_POLICY_EFFECTIVE_DATE !== null) {
      expect(privacyPolicyBuildProblem(PRIVACY_POLICY_EFFECTIVE_DATE)).toBeNull();
    }
  });
});
