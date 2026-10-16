import type { components } from "@agilityhub/api-client";

type ClubDefinition = components["schemas"]["ClubDefinition"];
type Colors = components["schemas"]["Colors"];
type ModulePreset = NonNullable<ClubDefinition["preset"]>;
type ThemeMode = ClubDefinition["theme"]["mode"];
export type WizardLocale = "ca" | "en" | "es";

/** S17 §2 «D19 Assistent»: the eight steps, in order. */
export const WIZARD_STEPS = [
  "identity",
  "localization",
  "modules",
  "payments",
  "theme",
  "catalogs",
  "admin",
  "review",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardDraft {
  admin: { email: string; name: string };
  catalogs: { templateId: string };
  identity: {
    city: string;
    contactEmail: string;
    contactPhone: string;
    country: string;
    displayCity: string;
    legalName: string;
    name: string;
    postalCode: string;
    region: string;
    slug: string;
    /** The slug was typed: it no longer follows the name (S17: «slug proposat»). */
    slugEdited: boolean;
    street: string;
    taxId: string;
    websiteUrl: string;
  };
  localization: {
    countryProfile: "ES" | "GENERIC";
    currency: string;
    defaultLocale: WizardLocale;
    locales: WizardLocale[];
    timeZone: string;
  };
  modules: { preset: ModulePreset };
  payments: {
    manual: { enabled: boolean; instructions: Partial<Record<WizardLocale, string>> };
    sepa: {
      creditorId: string;
      creditorName: string;
      enabled: boolean;
      invoiceSeriesPattern: string;
      suffix: string;
    };
    stripe: { enabled: boolean; mode: "live" | "test"; publishableKey: string };
  };
  theme: {
    colors: Colors;
    fontFamily: string;
    mode: ThemeMode;
    radius: string;
    ringPalette: string[];
    /** S17: «preset AgilityHub» (the product's own theme) or the club's colours. */
    source: "custom" | "product";
  };
}

export interface ProductTheme {
  colors: Colors;
  fontFamily?: string | undefined;
  mode: ThemeMode;
  radius?: string | undefined;
  ringPalette?: string[] | undefined;
}

export function emptyDraft(product: ProductTheme): WizardDraft {
  return {
    admin: { email: "", name: "" },
    catalogs: { templateId: "" },
    identity: {
      city: "",
      contactEmail: "",
      contactPhone: "",
      country: "",
      displayCity: "",
      legalName: "",
      name: "",
      postalCode: "",
      region: "",
      slug: "",
      slugEdited: false,
      street: "",
      taxId: "",
      websiteUrl: "",
    },
    localization: {
      countryProfile: "ES",
      currency: "EUR",
      defaultLocale: "ca",
      locales: ["ca", "es"],
      timeZone: "Europe/Madrid",
    },
    modules: { preset: "COMPLET" },
    payments: {
      manual: { enabled: false, instructions: {} },
      sepa: {
        creditorId: "",
        creditorName: "",
        enabled: false,
        invoiceSeriesPattern: "",
        suffix: "",
      },
      stripe: { enabled: false, mode: "test", publishableKey: "" },
    },
    theme: productThemeValues(product),
  };
}

export function productThemeValues(product: ProductTheme): WizardDraft["theme"] {
  return {
    colors: { ...product.colors },
    fontFamily: product.fontFamily ?? "system-ui, sans-serif",
    mode: product.mode,
    radius: /^\d+(\.\d+)?px$/u.test(product.radius ?? "") ? (product.radius ?? "8px") : "8px",
    ringPalette: [...(product.ringPalette ?? [])],
    source: "product",
  };
}

/** «Club Agility Riera» → `club-agility-riera`: lower case, no accents, dashes (`^[a-z0-9-]{3,40}$`). */
export function proposeSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40)
    .replace(/-+$/u, "");
}

/** `{key: value}` with the value trimmed, or nothing when it is empty (never `""`). */
function present<Key extends string>(key: Key, value: string): Partial<Record<Key, string>> {
  const trimmed = value.trim();
  return (trimmed === "" ? {} : { [key]: trimmed }) as Partial<Record<Key, string>>;
}

/**
 * The wizard's `ClubDefinition` (`POST /platform/clubs`, the published WP-A layout): credentials
 * never travel (the IBAN and Stripe secrets are written at the record's «Pagaments»), the domains
 * stay out (cut #1), and an empty optional field is omitted, never sent as `""`.
 */
export function buildClubDefinition(draft: WizardDraft): ClubDefinition {
  const { identity, localization, payments } = draft;
  const address = {
    ...present("city", identity.city),
    ...present("country", identity.country),
    ...present("postalCode", identity.postalCode),
    ...present("region", identity.region),
    ...present("street", identity.street),
  };
  const locales = localization.locales;
  const club: ClubDefinition["club"] = {
    ...(Object.keys(address).length === 0 ? {} : { address }),
    ...present("contactEmail", identity.contactEmail),
    ...present("contactPhone", identity.contactPhone),
    countryProfile: localization.countryProfile,
    currency: localization.currency.trim().toUpperCase(),
    defaultLocale: localization.defaultLocale,
    ...present("displayCity", identity.displayCity),
    ...present("legalName", identity.legalName),
    locales: [...locales],
    name: identity.name.trim(),
    slug: identity.slug.trim(),
    status: "ONBOARDING",
    ...present("taxId", identity.taxId),
    timeZone: localization.timeZone.trim(),
    ...present("websiteUrl", identity.websiteUrl),
  };
  const providers: NonNullable<Exclude<ClubDefinition["paymentProviders"], string[]>> = {};
  if (payments.sepa.enabled) {
    providers.SEPA_XML = {
      ...present("creditorId", payments.sepa.creditorId),
      ...present("creditorName", payments.sepa.creditorName),
      enabled: true,
      ...present("invoiceSeriesPattern", payments.sepa.invoiceSeriesPattern),
      ...present("suffix", payments.sepa.suffix),
    };
  }
  if (payments.stripe.enabled) {
    providers.STRIPE = {
      enabled: true,
      mode: payments.stripe.mode,
      ...present("publishableKey", payments.stripe.publishableKey),
    };
  }
  if (payments.manual.enabled) {
    const instructions: Partial<Record<WizardLocale, string>> = Object.fromEntries(
      locales.flatMap((locale) => {
        const text = (payments.manual.instructions[locale] ?? "").trim();
        return text === "" ? [] : [[locale, text]];
      }),
    );
    providers.MANUAL = {
      enabled: true,
      ...(Object.keys(instructions).length === 0 ? {} : { instructions }),
    };
  }
  const admin = draft.admin;
  return {
    ...(admin.email.trim() === "" && admin.name.trim() === ""
      ? {}
      : {
          admins: [
            {
              email: admin.email.trim(),
              locale: localization.defaultLocale,
              name: admin.name.trim(),
            },
          ],
        }),
    apiVersion: "agilityhub.club/v1",
    ...(draft.catalogs.templateId === ""
      ? {}
      : { catalogs: { fromTemplate: draft.catalogs.templateId } }),
    club,
    ...(Object.keys(providers).length === 0 ? {} : { paymentProviders: providers }),
    preset: draft.modules.preset,
    theme: {
      colors: { ...draft.theme.colors },
      fontFamily: draft.theme.fontFamily.trim(),
      mode: draft.theme.mode,
      radius: draft.theme.radius.trim(),
      ringPalette: [...draft.theme.ringPalette],
    },
  };
}

/**
 * The api's field path of a refused definition (`club.slug`, `admins[0].email`,
 * `paymentProviders.SEPA_XML.creditorId`, `modules`) → the step that edits it.
 */
export function stepOfField(field: string): WizardStep {
  if (field.startsWith("club.")) {
    const name = field.slice("club.".length).split(".")[0] ?? "";
    return ["locales", "defaultLocale", "timeZone", "currency", "countryProfile"].includes(name)
      ? "localization"
      : "identity";
  }
  if (field === "modules" || field.startsWith("modules[") || field === "preset") return "modules";
  if (field.startsWith("paymentProviders")) return "payments";
  if (field.startsWith("theme")) return "theme";
  if (field.startsWith("catalogs")) return "catalogs";
  if (field.startsWith("admins")) return "admin";
  return "review";
}

/**
 * The local draft («Es pot desar com a esborrany (local)»), without personal data: the first
 * admin's email and name and the contact email and phone are never written to the device.
 */
export function storableDraft(draft: WizardDraft): WizardDraft {
  return {
    ...draft,
    admin: { email: "", name: "" },
    identity: { ...draft.identity, contactEmail: "", contactPhone: "" },
  };
}

export const WIZARD_DRAFT_KEY = "agilityhub.console.newClubDraft";

export function readStoredDraft(
  storage: Pick<Storage, "getItem"> | undefined,
  fallback: WizardDraft,
): WizardDraft | undefined {
  const raw = storage?.getItem(WIZARD_DRAFT_KEY);
  if (raw === null || raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<WizardDraft>;
    return {
      ...fallback,
      ...parsed,
      admin: fallback.admin,
      identity: { ...fallback.identity, ...parsed.identity, contactEmail: "", contactPhone: "" },
    };
  } catch {
    return undefined;
  }
}

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  // Plain only when YAML reads it back as the same string.
  return /^[A-Za-z_/][\w ./@+-]*$/u.test(text) &&
    !/^(true|false|yes|no|on|off|null|~)$/iu.test(text) &&
    !text.endsWith(" ")
    ? text
    : JSON.stringify(text);
}

/** A plain value as YAML (block style), for the review step's club-as-code file (S17 §3). */
export function toYaml(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) => {
        if (typeof item === "object" && item !== null && Object.keys(item as object).length > 0) {
          const nested = toYaml(item, indent + 2).trimStart();
          return `${pad}- ${nested}`;
        }
        return `${pad}- ${yamlScalar(item)}`;
      })
      .join("\n");
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, item]) => item !== undefined,
    );
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([key, item]) => {
        const name = yamlScalar(key);
        if (Array.isArray(item)) {
          return item.length === 0
            ? `${pad}${name}: []`
            : `${pad}${name}:\n${toYaml(item, indent + 2)}`;
        }
        if (typeof item === "object" && item !== null) {
          return Object.keys(item).length === 0
            ? `${pad}${name}: {}`
            : `${pad}${name}:\n${toYaml(item, indent + 2)}`;
        }
        return `${pad}${name}: ${yamlScalar(item)}`;
      })
      .join("\n");
  }
  return `${pad}${yamlScalar(value)}`;
}
