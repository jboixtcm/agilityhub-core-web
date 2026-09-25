import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { fmtMaskedIban, LOCALE_STORAGE_KEY, productLocales, useClubFormats } from "@agilityhub/i18n";
import {
  Button,
  Card,
  Checkbox,
  FormField as UiFormField,
  Icon,
  Input,
  resolveBrandingLogo,
  Select,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import {
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { clubToday } from "./today/useDayGrid";

type SignupConfig = components["schemas"]["SignupConfig"];
type EnabledSignupConfig = SignupConfig & {
  legal: NonNullable<SignupConfig["legal"]>;
  plans: NonNullable<SignupConfig["plans"]>;
  steps: NonNullable<SignupConfig["steps"]>;
  texts: NonNullable<SignupConfig["texts"]>;
};
type SignupPerson = components["schemas"]["SignupPerson"];
type SignupDog = components["schemas"]["SignupDog"];
type SignupPhone = components["schemas"]["SignupPhone"];
type SignupTown = components["schemas"]["Town"];
type SignupFamilyLookup = components["schemas"]["FamilyGroupLookupResult"];
type SignupIdentityResult = components["schemas"]["IdentityCheckResult"];
type SignupIdDocument = components["schemas"]["SignupIdDocument"];
type SignupPayment = components["schemas"]["SignupPayment"];
type SignupDocumentFile = components["schemas"]["SignupFile"];
type SignupRequest = components["schemas"]["SignupRequest"];
type AddDogSignupRequest = components["schemas"]["AddDogSignupRequest"];
type QuoteOption = components["schemas"]["SignupQuoteOption"];
type QuoteLine = components["schemas"]["SignupQuoteLine"];
type SignupUpfront = components["schemas"]["SignupUpfront"];
type Money = components["schemas"]["Money"];
type Translate = ReturnType<typeof useTranslation>["t"];

/** The start option as 19 showed it: what labels a first month (`SignupUpfront` has no first-month block). */
type StartChoice = Pick<QuoteOption, "option" | "startDate"> & Partial<Pick<QuoteOption, "portion">>;

type DraftPerson = Omit<SignupPerson, "gender"> & {
  gender: SignupPerson["gender"] | "";
};

/** The step-19 operation in flight: one idempotency key per payload, kept until the flow ends. */
interface SignupSubmission {
  checkoutKey?: string;
  /** SHA-256 of the canonical payload (never the payload: it holds the IBAN). */
  fingerprint: string;
  /**
   * R-04-14 «congelat en enviar»: the `upfront` of the api's answer (amounts only) and the start
   * option 19 showed and sent. A retry on a later day shows these, never the day's live quote.
   */
  frozen?: { start?: StartChoice; upfront: SignupUpfront };
  idempotencyKey: string;
  memberId?: string;
  signupToken?: string;
}

/**
 * An api error routed to the step and field that own it (S04 §2, CATALEG_ERRORS). It lives in the
 * draft, so it survives the full page load of the production navigator; the step consumes it.
 */
interface PendingError {
  /** The api code; "" for a failure without one (network). */
  code: string;
  field?: string;
  /** `details.fieldErrors` of the owning step: form field → code. */
  fields?: Record<string, string>;
  retryAfter?: number;
  step: SignupStep;
}

interface SignupDraft {
  additionalDogOption: "ALTERNATIVE" | "TODAY";
  /** The legal texts version the applicant accepted (R-04-17); "" until accepted. */
  consentVersion: string;
  dog: SignupDog;
  familyClaim: components["schemas"]["SignupFamilyGroupClaim"];
  familyFound: boolean;
  /** R-04-10: the account holder was prefilled with the group holder of a FOUND claim. */
  holderFromGroup: boolean;
  imageConsent: boolean;
  mode: "add-dog" | "public";
  passport: string;
  payment: SignupPayment;
  pendingError?: PendingError;
  person: DraftPerson;
  planId: string;
  privacyAccepted: boolean;
  savedAt: number;
  submission?: SignupSubmission;
}

type DraftUpdate = Dispatch<SetStateAction<SignupDraft>>;
type FieldErrors = Readonly<Record<string, string>>;
type SignupStep = "dog" | "family" | "payment" | "person";

interface CountryProfile {
  code: string;
  idDocumentTypes: string[];
  phonePrefix: string;
}

const DRAFT_KEY = "signup.draft.v1";
const CHECKOUT_KEY = "signup.checkout.v1";
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STEP_ORDER: readonly SignupStep[] = ["person", "dog", "family", "payment"];
const PERSON_FIELDS = new Set(["birthDate", "firstName", "gender", "lastName1", "lastName2"]);
const DOG_FIELDS = new Set(["birthMonth", "breed", "chip", "documents", "name", "notesToInstructors", "sex"]);

const CODE_ROUTES: Readonly<Record<string, { field?: string; step: SignupStep }>> = {
  CONSENT_VERSION_OUTDATED: { field: "privacy", step: "payment" },
  DOG_CHIP_ALREADY_REGISTERED: { field: "chip", step: "dog" },
  DOG_DOCUMENT_REQUIRED: { field: "documents", step: "dog" },
  FAMILY_HOLDER_NOT_FOUND: { field: "familyHolder", step: "family" },
  FILE_NOT_FOUND: { field: "documents", step: "dog" },
  ID_DOCUMENT_AMBIGUOUS: { field: "idDocument", step: "person" },
  INVALID_IBAN: { field: "iban", step: "payment" },
  INVALID_ID_DOCUMENT: { field: "idDocument", step: "person" },
  INVALID_PHONE: { field: "phones0", step: "person" },
  MEMBER_ALREADY_EXISTS: { step: "person" },
  PLAN_NOT_AVAILABLE: { field: "plan", step: "dog" },
  SIGNUP_ALREADY_PENDING: { step: "person" },
};

function signupPaths(addDog: boolean): Readonly<Record<SignupStep | "sent", string | undefined>> {
  return addDog
    ? {
        dog: "/gossos/nou",
        family: undefined,
        payment: "/gossos/nou/pagament",
        person: undefined,
        sent: "/gossos/nou/enviada",
      }
    : {
        dog: "/apuntat-hi/gos",
        family: "/apuntat-hi/familia",
        payment: "/apuntat-hi/pagament",
        person: "/apuntat-hi",
        sent: "/apuntat-hi/enviada",
      };
}

function isEnabledSignupConfig(config: SignupConfig): config is EnabledSignupConfig {
  return (
    config.enabled &&
    config.legal !== undefined &&
    config.plans !== undefined &&
    config.steps !== undefined &&
    config.texts !== undefined
  );
}

function maskNumericDate(value: string, segmentLengths: readonly number[]): string {
  const digits = value.replaceAll(/\D/gu, "").slice(
    0,
    segmentLengths.reduce((sum, item) => sum + item, 0),
  );
  const segments: string[] = [];
  let cursor = 0;
  for (const length of segmentLengths) {
    const segment = digits.slice(cursor, cursor + length);
    if (segment === "") break;
    segments.push(segment);
    cursor += length;
  }
  return segments.join("/");
}

function birthDateToIso(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value);
  if (match === null) return undefined;
  const [, day = "", month = "", year = ""] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number(year) > 0 &&
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : undefined;
}

function birthMonthToIso(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{4})$/u.exec(value);
  if (match === null) return undefined;
  const [, month = "", year = ""] = match;
  const monthNumber = Number(month);
  return Number(year) > 0 && monthNumber >= 1 && monthNumber <= 12 ? `${year}-${month}` : undefined;
}

function legacyDateToDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return value;
  const [, year = "", month = "", day = ""] = match;
  return `${day}/${month}/${year}`;
}

function legacyMonthToDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})$/u.exec(value);
  if (match === null) return value;
  const [, year = "", month = ""] = match;
  return `${month}/${year}`;
}

function normaliseDocument(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[-\s]/gu, "");
}

/** R-04-07 / S04 §3: the chip is stored without separators, in upper case. */
function normaliseChip(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[-\s.]/gu, "");
}

function validChip(value: string, profileCode: string): boolean {
  return profileCode === "ES" ? /^\d{15}$/u.test(value) : /^[A-Z0-9]{8,15}$/u.test(value);
}

function normaliseIban(value: string): string {
  return value.replaceAll(/\s/gu, "").toUpperCase();
}

/** The payment of another method: the SEPA-only fields never stay in the session draft. */
function withPaymentType(payment: SignupPayment, type: SignupPayment["type"]): SignupPayment {
  const next: SignupPayment = { ...payment, type };
  if (type !== "SEPA_DD") {
    delete next.iban;
    delete next.holderTaxId;
  }
  return next;
}

/** JSON with sorted keys, so the same payload always gives the same digest. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The payload fingerprint: a SHA-256 digest (Web Crypto), so no personal data is kept. */
async function payloadDigest(body: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(body)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** R-04-10: mod-97 and the country length (ES = 24). */
function validIban(value: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/u.test(value)) return false;
  if (value.startsWith("ES") && value.length !== 24) return false;
  const digits = `${value.slice(4)}${value.slice(0, 4)}`.replaceAll(/[A-Z]/gu, (letter) =>
    String(letter.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

function FormField({
  children,
  error,
  id,
  label,
}: {
  children: ReactNode;
  error?: string | undefined;
  id: string;
  label: string;
}) {
  return (
    <UiFormField {...(error === undefined ? {} : { error })} id={id} label={label}>
      {children}
    </UiFormField>
  );
}

/** `aria-invalid` + `aria-describedby` pointing at the FormField error (`{id}-error`). */
function invalidProps(
  id: string,
  error: string | undefined,
): { "aria-describedby"?: string; "aria-invalid"?: true } {
  return error === undefined ? {} : { "aria-describedby": `${id}-error`, "aria-invalid": true };
}

/** Focuses the first invalid control after the errors have rendered. */
function useFocusFirstError(root: RefObject<HTMLElement | null>): () => void {
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (request === 0) return;
    const container = root.current;
    if (container === null) return;
    const invalid = container.querySelector<HTMLElement>("[aria-invalid='true']");
    const control =
      invalid === null
        ? container.querySelector<HTMLElement>("[data-signup-message]")
        : invalid.matches("input, select, textarea, button")
          ? invalid
          : invalid.querySelector<HTMLElement>("input, select, textarea, button");
    control?.focus();
  }, [request, root]);
  return useCallback(() => {
    setRequest((current) => current + 1);
  }, []);
}

/**
 * Consumes the error routed to this step (from the draft, also after a full page load): shows it
 * on its field or as the step message, focuses it, and removes it from the draft.
 */
function usePendingError(
  step: SignupStep,
  pending: PendingError | undefined,
  onChange: DraftUpdate,
  apply: (errors: { fields: FieldErrors; message?: string | undefined }) => void,
): void {
  const { t } = useTranslation(["signup", "errors"]);
  useEffect(() => {
    if (pending?.step !== step) return;
    apply(pendingErrorMessages(pending, t));
    onChange((current) => {
      if (current.pendingError !== pending) return current;
      const next = { ...current };
      delete next.pendingError;
      return next;
    });
  }, [apply, onChange, pending, step, t]);
}

function countryProfile(value: unknown): CountryProfile {
  if (typeof value !== "object" || value === null) {
    return { code: "GENERIC", idDocumentTypes: [], phonePrefix: "" };
  }
  const candidate = value as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : "GENERIC",
    idDocumentTypes: Array.isArray(candidate.idDocumentTypes)
      ? candidate.idDocumentTypes.filter((entry): entry is string => typeof entry === "string")
      : [],
    phonePrefix: typeof candidate.phonePrefix === "string" ? candidate.phonePrefix : "",
  };
}

/** GENERIC profiles offer only `PASSPORT` / `OTHER` (R-04-01), in the profile's order. */
function genericDocumentTypes(profile: CountryProfile): ("OTHER" | "PASSPORT")[] {
  const types = profile.idDocumentTypes.filter(
    (type): type is "OTHER" | "PASSPORT" => type === "PASSPORT" || type === "OTHER",
  );
  return types.length === 0 ? ["PASSPORT", "OTHER"] : types;
}

function identityDocument(draft: SignupDraft, spanishProfile: boolean): SignupIdDocument {
  if (spanishProfile && draft.person.idDocument.value.trim() === "") {
    return { type: "PASSPORT", value: normaliseDocument(draft.passport) };
  }
  const value = normaliseDocument(draft.person.idDocument.value);
  return {
    type: spanishProfile
      ? /^[XYZ]/u.test(value)
        ? "NIE"
        : "DNI"
      : draft.person.idDocument.type,
    value,
  };
}

function applicantName(person: DraftPerson): string {
  return [person.firstName, person.lastName1, person.lastName2]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "")
    .join(" ");
}

function emptyPhone(prefix: string): SignupPhone {
  return { label: "", number: "", prefix };
}

function emptyDraft(addDog: boolean, profile: CountryProfile): SignupDraft {
  return {
    additionalDogOption: "TODAY",
    consentVersion: "",
    dog: {
      birthMonth: "",
      breed: "",
      chip: "",
      documents: [{ files: [], type: "VACCINATION_CARD" }],
      name: "",
      notesToInstructors: "",
      sex: "FEMALE",
    },
    familyClaim: { dogName: "", holderName: "", leavePending: false },
    familyFound: false,
    holderFromGroup: false,
    imageConsent: false,
    mode: addDog ? "add-dog" : "public",
    passport: "",
    payment: { firstMonthOption: "TODAY", type: "SEPA_DD" },
    person: {
      address: { postalCode: "", street: "", town: "" },
      birthDate: "",
      emails: ["", ""],
      firstName: "",
      gender: "",
      idDocument: {
        type: profile.code === "ES" ? "DNI" : (genericDocumentTypes(profile)[0] ?? "PASSPORT"),
        value: "",
      },
      lastName1: "",
      lastName2: "",
      phones: [emptyPhone(profile.phonePrefix), emptyPhone(profile.phonePrefix)],
    },
    planId: "",
    privacyAccepted: false,
    savedAt: Date.now(),
  };
}

function readDraft(addDog: boolean, profile: CountryProfile): SignupDraft {
  try {
    const serialized = sessionStorage.getItem(DRAFT_KEY);
    if (serialized !== null) {
      const candidate = JSON.parse(serialized) as Omit<
        SignupDraft,
        "additionalDogOption" | "consentVersion" | "familyFound" | "holderFromGroup"
      > &
        Partial<
          Pick<
            SignupDraft,
            "additionalDogOption" | "consentVersion" | "familyFound" | "holderFromGroup"
          >
        >;
      const mode = addDog ? "add-dog" : "public";
      if (
        candidate.mode === mode &&
        Number.isFinite(candidate.savedAt) &&
        Date.now() - candidate.savedAt <= DRAFT_MAX_AGE_MS
      ) {
        // A draft without the accepted version cannot prove which texts were accepted.
        const consentVersion = candidate.consentVersion ?? "";
        // A fingerprint of an older build held the plain payload (IBAN included): never kept.
        const submission =
          candidate.submission === undefined ||
          /^[0-9a-f]{64}$/u.test(candidate.submission.fingerprint)
            ? candidate.submission
            : { ...candidate.submission, fingerprint: "" };
        const consentKnown = consentVersion !== "";
        return {
          ...candidate,
          additionalDogOption: candidate.additionalDogOption ?? "TODAY",
          consentVersion,
          dog: {
            ...candidate.dog,
            birthMonth: legacyMonthToDisplay(candidate.dog.birthMonth),
          },
          familyFound: candidate.familyFound ?? false,
          holderFromGroup: candidate.holderFromGroup ?? false,
          imageConsent: consentKnown && candidate.imageConsent,
          person: {
            ...candidate.person,
            birthDate: legacyDateToDisplay(candidate.person.birthDate),
          },
          privacyAccepted: consentKnown && candidate.privacyAccepted,
          ...(submission === undefined ? {} : { submission }),
        };
      }
      sessionStorage.removeItem(DRAFT_KEY);
    }
  } catch {
    sessionStorage.removeItem(DRAFT_KEY);
  }
  return emptyDraft(addDog, profile);
}

function apiFieldErrors(error: unknown): { code: string; field: string }[] {
  if (!isApiError(error) || typeof error.details !== "object" || error.details === null) {
    return [];
  }
  const errors = (error.details as Record<string, unknown>).fieldErrors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const candidate = entry as Record<string, unknown>;
    return typeof candidate.code === "string" && typeof candidate.field === "string"
      ? [{ code: candidate.code, field: candidate.field }]
      : [];
  });
}

function personFormField(segments: readonly string[]): string | undefined {
  const [first = "", second, third] = segments;
  if (first === "idDocument") return "idDocument";
  if (first === "emails") return second === "1" ? "emails1" : "emails0";
  if (first === "phones") {
    if (second !== "1") return "phones0";
    return third === "label" ? "phones1label" : "phones1";
  }
  if (first === "address") {
    return second === "street" || second === "postalCode" || second === "town" ? second : "street";
  }
  return PERSON_FIELDS.has(first) ? first : undefined;
}

/** Maps an api field path (`emails[0]`, `person.idDocument.value`, `dog.chip`…) to the form. */
function formField(path: string): { field: string; step: SignupStep } | undefined {
  const segments = path
    .replaceAll(/\[(\d+)\]/gu, ".$1")
    .split(".")
    .filter((segment) => segment !== "");
  const [head = "", ...rest] = segments;
  if (head === "dog" || head === "documents") {
    const field = head === "documents" ? "documents" : (rest[0] ?? "");
    return DOG_FIELDS.has(field) ? { field, step: "dog" } : undefined;
  }
  if (head === "planId" || head === "planIdRequested") return { field: "plan", step: "dog" };
  if (head === "familyGroupClaim") {
    return { field: rest[0] === "dogName" ? "familyDog" : "familyHolder", step: "family" };
  }
  if (head === "payment") {
    const field =
      rest[0] === "iban"
        ? "iban"
        : rest[0] === "holderName"
          ? "accountHolder"
          : rest[0] === "holderTaxId"
            ? "holderTaxId"
            : undefined;
    return field === undefined ? undefined : { field, step: "payment" };
  }
  if (head === "consents") return { field: "privacy", step: "payment" };
  const field = personFormField(head === "person" ? rest : segments);
  return field === undefined ? undefined : { field, step: "person" };
}

function codeMessage(code: string, t: Translate, fallback: string): string {
  switch (code) {
    case "CONSENT_VERSION_OUTDATED":
      return t("signup:payment.consentOutdated");
    case "INVALID_EMAIL":
      return t("signup:common.invalidEmail");
    case "INVALID_PHONE":
      return t("signup:common.invalidPhone");
    case "SIGNUP_ALREADY_PENDING":
      return t("signup:person.alreadyPending");
    case "NOT_BLANK":
    case "NOT_NULL":
    case "REQUIRED":
      return t("signup:common.required");
    default:
      return t(`errors:${code}`, { defaultValue: fallback });
  }
}

/** The texts of a routed error: field messages, or the step message. */
function pendingErrorMessages(
  pending: PendingError,
  t: Translate,
): { fields: FieldErrors; message?: string } {
  const generic = t("signup:common.genericError");
  if (pending.code === "RATE_LIMITED") {
    return { fields: {}, message: t("signup:common.rateLimited", { seconds: pending.retryAfter ?? 60 }) };
  }
  if (pending.fields !== undefined) {
    const fieldFallback = t("errors:VALIDATION_ERROR");
    return {
      fields: Object.fromEntries(
        Object.entries(pending.fields).map(([field, code]) => [
          field,
          codeMessage(code, t, fieldFallback),
        ]),
      ),
    };
  }
  const message = pending.code === "" ? generic : codeMessage(pending.code, t, generic);
  return pending.field === undefined
    ? { fields: {}, message }
    : { fields: { [pending.field]: message } };
}

/** Where an api error belongs (the page handles `SIGNUP_CLOSED` itself). */
function routeApiError(error: unknown, currentStep: SignupStep): PendingError {
  if (!isApiError(error)) return { code: "", step: currentStep };
  if (error.status === 429 || error.code === "RATE_LIMITED") {
    return {
      code: "RATE_LIMITED",
      ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
      step: currentStep,
    };
  }
  const fieldErrors = apiFieldErrors(error).flatMap((entry) => {
    const target = formField(entry.field);
    return target === undefined ? [] : [{ ...target, code: entry.code }];
  });
  if (fieldErrors.length > 0) {
    const step = STEP_ORDER.find((candidate) =>
      fieldErrors.some((entry) => entry.step === candidate),
    ) ?? currentStep;
    return {
      code: error.code,
      fields: Object.fromEntries(
        fieldErrors.filter((entry) => entry.step === step).map((entry) => [entry.field, entry.code]),
      ),
      step,
    };
  }
  const route = CODE_ROUTES[error.code];
  if (route === undefined) return { code: error.code, step: currentStep };
  return route.field === undefined
    ? { code: error.code, step: route.step }
    : { code: error.code, field: route.field, step: route.step };
}

function safeSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Signup still works when storage is unavailable.
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Signup still works when storage is unavailable.
  }
}

function StepMessage({ message }: { message: string | undefined }) {
  return message === undefined ? null : (
    <p
      className="signup-message signup-message--error"
      data-signup-message=""
      role="alert"
      tabIndex={-1}
    >
      {message}
    </p>
  );
}

/**
 * The public footer (mockups 16–19; Jordi 25-09): «{legalName} · {taxId} · {city}», from
 * `/branding` (the entity's public identifiers, LSSI art. 10); without a tax id, «{name} · {city}».
 */
function footerText(branding: ReturnType<typeof useBranding>, t: Translate): string {
  const city = branding.club.city?.trim() ?? "";
  const taxId = branding.club.taxId?.trim() ?? "";
  if (taxId === "") {
    const club = branding.club.name;
    return city === ""
      ? t("signup:common.footer", { club })
      : t("signup:common.footerWithCity", { city, club });
  }
  const legalName = branding.club.legalName?.trim() ?? "";
  const club = legalName === "" ? branding.club.name : legalName;
  return city === ""
    ? t("signup:common.footerWithTaxId", { club, taxId })
    : t("signup:common.footerWithTaxIdAndCity", { city, club, taxId });
}

function Layout({ children }: { children: ReactNode }) {
  const branding = useBranding();
  const { i18n, t } = useTranslation("signup");
  const logo = resolveBrandingLogo(branding.theme, { placement: "compact" });
  const locales = productLocales.filter((locale) => branding.locales.includes(locale));

  return (
    <main className="signup-page">
      <header className="signup-header">
        {logo.kind === "initial" ? (
          <span aria-hidden="true" className="signup-header__fallback">
            {branding.club.name.charAt(0)}
          </span>
        ) : (
          <img alt="" className="signup-header__logo" src={logo.src} />
        )}
        <h1>{t("signup:common.title")}</h1>
        <label className="signup-language">
          <Icon aria-hidden="true" name="globe" />
          <span className="ah-sr-only">{t("signup:common.language")}</span>
          <Select
            aria-label={t("signup:common.language")}
            onChange={(event) => {
              localStorage.setItem(LOCALE_STORAGE_KEY, event.currentTarget.value);
              void i18n.changeLanguage(event.currentTarget.value);
            }}
            value={i18n.resolvedLanguage ?? branding.defaultLocale}
          >
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {locale === "ca"
                  ? t("signup:common.locale.ca")
                  : locale === "es"
                    ? t("signup:common.locale.es")
                    : t("signup:common.locale.en")}
              </option>
            ))}
          </Select>
        </label>
      </header>
      <div className="signup-page__body">{children}</div>
      <footer className="signup-footer">{footerText(branding, t)}</footer>
    </main>
  );
}

function Progress({ current, label, total }: { current: number; label: ReactNode; total: number }) {
  const { t } = useTranslation("signup");
  return (
    <div className="signup-progress">
      <div aria-hidden="true" className="signup-progress__track">
        {Array.from({ length: total }, (_, index) => (
          <span className={index < current ? "signup-progress__done" : undefined} key={index} />
        ))}
      </div>
      <p>
        {t("signup:progress.label", { current, total })} · <strong>{label}</strong>
      </p>
    </div>
  );
}

function PersonStep({
  client,
  draft,
  onApiError,
  onChange,
  onContinue,
  today,
  totalSteps,
}: {
  client: ApiClient;
  draft: SignupDraft;
  onApiError: (error: unknown, step: SignupStep) => void;
  onChange: DraftUpdate;
  onContinue: (path: string) => void;
  today: string;
  totalSteps: number;
}) {
  const branding = useBranding();
  const profile = countryProfile(branding.countryProfile);
  const { t } = useTranslation(["signup", "errors"]);
  const formRef = useRef<HTMLFormElement>(null);
  const focusFirstError = useFocusFirstError(formRef);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [towns, setTowns] = useState<SignupTown[]>([]);
  const [recognition, setRecognition] = useState<SignupIdentityResult>();
  const [message, setMessage] = useState<string>();
  const [working, setWorking] = useState(false);
  const townLookup = useRef(0);
  const isSpanishProfile = profile.code === "ES";
  const documentTypes = genericDocumentTypes(profile);
  // A passport-only applicant (R-04-01): the document errors belong to the passport field.
  const passportOnly =
    isSpanishProfile &&
    draft.person.idDocument.value.trim() === "" &&
    draft.passport.trim() !== "";
  const dniError = passportOnly ? undefined : errors.idDocument;
  const passportError = passportOnly ? errors.idDocument : undefined;

  usePendingError(
    "person",
    draft.pendingError,
    onChange,
    useCallback(
      (next: { fields: FieldErrors; message?: string | undefined }) => {
        setErrors(next.fields);
        setMessage(next.message);
        focusFirstError();
      },
      [focusFirstError],
    ),
  );

  const patchPerson = <Key extends keyof DraftPerson>(key: Key, value: DraftPerson[Key]) => {
    onChange((current) => ({ ...current, person: { ...current.person, [key]: value } }));
  };

  const patchAddress = (key: keyof SignupPerson["address"], value: string) => {
    onChange((current) => ({
      ...current,
      person: { ...current.person, address: { ...current.person.address, [key]: value } },
    }));
  };

  const patchPhone = (index: number, key: keyof SignupPhone, value: string) => {
    onChange((current) => ({
      ...current,
      person: {
        ...current.person,
        phones: current.person.phones.map((phone, phoneIndex) =>
          phoneIndex === index ? { ...phone, [key]: value } : phone,
        ),
      },
    }));
  };

  const patchEmail = (index: number, value: string) => {
    onChange((current) => ({
      ...current,
      person: {
        ...current.person,
        emails: current.person.emails.map((email, emailIndex) =>
          emailIndex === index ? value : email,
        ),
      },
    }));
  };

  const localErrors = (): Record<string, string> => {
    const next: Record<string, string> = {};
    const required = t("signup:common.required");
    if (identityDocument(draft, isSpanishProfile).value === "") next.idDocument = required;
    for (const key of ["firstName", "lastName1"] as const) {
      if (draft.person[key].trim() === "") next[key] = required;
    }
    const birthDate = birthDateToIso(draft.person.birthDate);
    if (draft.person.birthDate.trim() === "") {
      next.birthDate = required;
    } else if (birthDate === undefined || birthDate < "1900-01-01" || birthDate >= today) {
      next.birthDate = t("signup:common.invalidDate");
    }
    if (draft.person.gender === "") next.gender = required;
    const primaryEmail = draft.person.emails[0]?.trim() ?? "";
    const secondEmail = draft.person.emails[1]?.trim() ?? "";
    if (!/^\S+@\S+\.\S+$/u.test(primaryEmail)) next.emails0 = t("signup:common.invalidEmail");
    if (secondEmail !== "" && !/^\S+@\S+\.\S+$/u.test(secondEmail)) {
      next.emails1 = t("signup:common.invalidEmail");
    } else if (secondEmail !== "" && secondEmail.toLowerCase() === primaryEmail.toLowerCase()) {
      next.emails1 = t("signup:common.duplicateEmail");
    }
    for (const [index, phone] of draft.person.phones.entries()) {
      const digits = phone.number.replaceAll(/\D/gu, "");
      if (index > 0 && phone.number.trim() === "") continue;
      if (
        phone.prefix.trim() === "" ||
        (isSpanishProfile ? !/^\d{9}$/u.test(digits) : !/^\d{7,15}$/u.test(digits))
      ) {
        next[`phones${String(index)}`] = t("signup:common.invalidPhone");
      }
      if (index > 0 && (phone.label ?? "").trim() === "") next.phones1label = required;
    }
    if (draft.person.phones.length === 0) next.phones0 = t("signup:common.invalidPhone");
    if (draft.person.address.street.trim() === "") next.street = required;
    const postalCode = draft.person.address.postalCode.trim();
    if (postalCode === "") {
      next.postalCode = required;
    } else if (isSpanishProfile ? !/^\d{5}$/u.test(postalCode) : !/^.{3,10}$/u.test(postalCode)) {
      next.postalCode = t("signup:common.invalidPostalCode");
    }
    if (draft.person.address.town.trim() === "") next.town = required;
    return next;
  };

  const checkIdentity = async () => {
    setWorking(true);
    setMessage(undefined);
    setRecognition(undefined);
    try {
      const response = await client.POST("/signup/identity-checks", {
        body: {
          emails: draft.person.emails.filter((email) => email.trim() !== ""),
          idDocument: identityDocument(draft, isSpanishProfile),
        },
      });
      if (response.data === undefined) throw new TypeError("Missing identity-check response");
      setRecognition(response.data);
      if (response.data.result === "NEW") onContinue("/apuntat-hi/gos");
    } catch (error) {
      onApiError(error, "person");
    } finally {
      setWorking(false);
    }
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = localErrors();
    setErrors(nextErrors);
    setMessage(undefined);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError();
      return;
    }
    void checkIdentity();
  };

  const lookupTowns = async () => {
    const postalCode = draft.person.address.postalCode.trim();
    if (!isSpanishProfile || !/^\d{5}$/u.test(postalCode)) return;
    townLookup.current += 1;
    const lookup = townLookup.current;
    try {
      const result = await client.GET("/signup/towns", {
        params: { query: { postalCode } },
      });
      if (result.data === undefined || lookup !== townLookup.current) return;
      const found = result.data;
      setTowns(found);
      const first = found[0];
      if (first === undefined) return;
      // Functional update: fields typed while the lookup was in flight are kept.
      onChange((current) =>
        current.person.address.postalCode.trim() === postalCode
          ? {
              ...current,
              person: {
                ...current.person,
                address: { ...current.person.address, town: first.name },
              },
            }
          : current,
      );
    } catch (error) {
      if (isApiError(error) && error.status === 429) {
        setMessage(t("signup:common.rateLimited", { seconds: error.retryAfter ?? 60 }));
      }
    }
  };

  return (
    <form className="signup-form" noValidate onSubmit={submit} ref={formRef}>
      <Progress current={1} label={t("signup:progress.person")} total={totalSteps} />
      {isSpanishProfile ? (
        <div className="signup-grid signup-grid--identity">
          <FormField error={dniError} id="signup-id" label={t("signup:person.idDniNie")}>
            <Input
              {...invalidProps("signup-id", dniError)}
              id="signup-id"
              onChange={(event) => {
                const value = event.currentTarget.value;
                onChange((current) => ({
                  ...current,
                  passport: value.trim() === "" ? current.passport : "",
                  person: {
                    ...current.person,
                    idDocument: { ...current.person.idDocument, value },
                  },
                }));
              }}
              value={draft.person.idDocument.value}
            />
          </FormField>
          <FormField error={passportError} id="signup-passport" label={t("signup:person.passport")}>
            <Input
              {...invalidProps("signup-passport", passportError)}
              disabled={draft.person.idDocument.value.trim() !== ""}
              id="signup-passport"
              onChange={(event) => {
                const value = event.currentTarget.value;
                onChange((current) => ({ ...current, passport: value }));
              }}
              value={draft.passport}
            />
          </FormField>
        </div>
      ) : (
        <div className="signup-grid signup-grid--identity">
          <FormField id="signup-document-type" label={t("signup:person.documentType")}>
            <Select
              id="signup-document-type"
              onChange={(event) => {
                patchPerson("idDocument", {
                  ...draft.person.idDocument,
                  type: event.currentTarget.value as "OTHER" | "PASSPORT",
                });
              }}
              value={draft.person.idDocument.type}
            >
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {type === "PASSPORT"
                    ? t("signup:person.passportType")
                    : t("signup:person.otherType")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            error={errors.idDocument}
            id="signup-id"
            label={t("signup:person.documentValue")}
          >
            <Input
              {...invalidProps("signup-id", errors.idDocument)}
              id="signup-id"
              onChange={(event) => {
                patchPerson("idDocument", {
                  ...draft.person.idDocument,
                  value: event.currentTarget.value,
                });
              }}
              value={draft.person.idDocument.value}
            />
          </FormField>
        </div>
      )}
      <FormField
        error={errors.firstName}
        id="signup-first-name"
        label={t("signup:person.firstName")}
      >
        <Input
          {...invalidProps("signup-first-name", errors.firstName)}
          autoComplete="given-name"
          id="signup-first-name"
          onChange={(event) => {
            patchPerson("firstName", event.currentTarget.value);
          }}
          value={draft.person.firstName}
        />
      </FormField>
      <div className="signup-grid">
        <FormField
          error={errors.lastName1}
          id="signup-last-name-1"
          label={t("signup:person.lastName1")}
        >
          <Input
            {...invalidProps("signup-last-name-1", errors.lastName1)}
            autoComplete="family-name"
            id="signup-last-name-1"
            onChange={(event) => {
              patchPerson("lastName1", event.currentTarget.value);
            }}
            value={draft.person.lastName1}
          />
        </FormField>
        <FormField
          error={errors.lastName2}
          id="signup-last-name-2"
          label={t("signup:person.lastName2")}
        >
          <Input
            {...invalidProps("signup-last-name-2", errors.lastName2)}
            id="signup-last-name-2"
            onChange={(event) => {
              patchPerson("lastName2", event.currentTarget.value);
            }}
            value={draft.person.lastName2}
          />
        </FormField>
      </div>
      <FormField
        error={errors.birthDate}
        id="signup-birth-date"
        label={t("signup:person.birthDate")}
      >
        <Input
          {...invalidProps("signup-birth-date", errors.birthDate)}
          autoComplete="bday"
          id="signup-birth-date"
          inputMode="numeric"
          maxLength={10}
          onChange={(event) => {
            patchPerson("birthDate", maskNumericDate(event.currentTarget.value, [2, 2, 4]));
          }}
          placeholder={t("signup:person.birthDatePlaceholder")}
          type="text"
          value={draft.person.birthDate}
        />
      </FormField>
      <fieldset
        className="signup-chips signup-chips--gender"
        {...invalidProps("signup-gender", errors.gender)}
      >
        <legend>{t("signup:person.gender")}</legend>
        {(["MALE", "FEMALE", "OTHER"] as const).map((gender) => (
          <button
            aria-pressed={draft.person.gender === gender}
            key={gender}
            onClick={() => {
              patchPerson("gender", gender);
            }}
            type="button"
          >
            {gender === "MALE"
              ? t("signup:person.male")
              : gender === "FEMALE"
                ? t("signup:person.female")
                : t("signup:person.other")}
          </button>
        ))}
        {errors.gender === undefined ? null : (
          <span id="signup-gender-error" role="alert">
            {errors.gender}
          </span>
        )}
      </fieldset>
      <FormField error={errors.emails0} id="signup-email" label={t("signup:person.email")}>
        <Input
          {...invalidProps("signup-email", errors.emails0)}
          autoComplete="email"
          id="signup-email"
          onChange={(event) => {
            patchEmail(0, event.currentTarget.value);
          }}
          type="email"
          value={draft.person.emails[0] ?? ""}
        />
      </FormField>
      <FormField
        error={errors.emails1}
        id="signup-second-email"
        label={t("signup:person.secondEmail")}
      >
        <Input
          {...invalidProps("signup-second-email", errors.emails1)}
          id="signup-second-email"
          onChange={(event) => {
            patchEmail(1, event.currentTarget.value);
          }}
          type="email"
          value={draft.person.emails[1] ?? ""}
        />
      </FormField>
      {[0, 1].map((index) => {
        const prefixId = `signup-phone-prefix-${String(index)}`;
        const numberId = `signup-phone-${String(index)}`;
        const labelId = `signup-phone-label-${String(index)}`;
        const numberError = errors[`phones${String(index)}`];
        const labelError = index === 1 ? errors.phones1label : undefined;
        const prefix = draft.person.phones[index]?.prefix ?? profile.phonePrefix;
        return (
          <div className="signup-grid signup-grid--phone" key={index}>
            <FormField id={prefixId} label={t("signup:person.phonePrefix")}>
              {isSpanishProfile ? (
                <Select
                  id={prefixId}
                  onChange={(event) => {
                    patchPhone(index, "prefix", event.currentTarget.value);
                  }}
                  value={prefix}
                >
                  <option value={prefix}>{prefix}</option>
                </Select>
              ) : (
                <Input
                  autoComplete="tel-country-code"
                  id={prefixId}
                  inputMode="tel"
                  onChange={(event) => {
                    patchPhone(index, "prefix", event.currentTarget.value);
                  }}
                  value={prefix}
                />
              )}
            </FormField>
            <FormField
              error={numberError}
              id={numberId}
              label={index === 0 ? t("signup:person.phone") : t("signup:person.secondPhone")}
            >
              <Input
                {...invalidProps(numberId, numberError)}
                id={numberId}
                inputMode="tel"
                onChange={(event) => {
                  patchPhone(index, "number", event.currentTarget.value);
                }}
                value={draft.person.phones[index]?.number ?? ""}
              />
            </FormField>
            <FormField error={labelError} id={labelId} label={t("signup:person.phoneDescription")}>
              <Input
                {...invalidProps(labelId, labelError)}
                id={labelId}
                onChange={(event) => {
                  patchPhone(index, "label", event.currentTarget.value);
                }}
                value={draft.person.phones[index]?.label ?? ""}
              />
            </FormField>
          </div>
        );
      })}
      <FormField error={errors.street} id="signup-street" label={t("signup:person.street")}>
        <Input
          {...invalidProps("signup-street", errors.street)}
          autoComplete="street-address"
          id="signup-street"
          onChange={(event) => {
            patchAddress("street", event.currentTarget.value);
          }}
          value={draft.person.address.street}
        />
      </FormField>
      <div className="signup-grid signup-grid--address">
        <FormField
          error={errors.postalCode}
          id="signup-postal-code"
          label={t("signup:person.postalCode")}
        >
          <Input
            {...invalidProps("signup-postal-code", errors.postalCode)}
            autoComplete="postal-code"
            id="signup-postal-code"
            onBlur={() => void lookupTowns()}
            onChange={(event) => {
              townLookup.current += 1;
              setTowns([]);
              patchAddress("postalCode", event.currentTarget.value);
            }}
            value={draft.person.address.postalCode}
          />
        </FormField>
        <FormField error={errors.town} id="signup-town" label={t("signup:person.town")}>
          {towns.length > 1 ? (
            <Select
              {...invalidProps("signup-town", errors.town)}
              id="signup-town"
              onChange={(event) => {
                patchAddress("town", event.currentTarget.value);
              }}
              value={draft.person.address.town}
            >
              {towns.map((town) => (
                <option key={`${town.region}-${town.name}`} value={town.name}>
                  {town.name}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              {...invalidProps("signup-town", errors.town)}
              id="signup-town"
              onChange={(event) => {
                patchAddress("town", event.currentTarget.value);
              }}
              readOnly={towns.length === 1}
              value={draft.person.address.town}
            />
          )}
        </FormField>
      </div>
      <aside className="signup-note signup-note--neutral signup-note--info">
        <Icon aria-hidden="true" name="info" />
        <span>{t("signup:person.existingDogNote")}</span>
      </aside>
      {recognition?.result === "VERIFICATION_SENT" ? (
        <section className="signup-recognition" role="status">
          <h2>{t("signup:person.reviewEmailTitle")}</h2>
          <p>{t("signup:person.reviewEmail", { email: recognition.maskedEmail ?? "" })}</p>
          <Button
            disabled={working}
            onClick={() => void checkIdentity()}
            type="button"
            variant="secondary"
          >
            {t("signup:person.resend")}
          </Button>
        </section>
      ) : recognition?.result === "SIGNUP_ALREADY_PENDING" ? (
        <p className="signup-message signup-message--error" role="alert">
          {t("signup:person.alreadyPending")}
        </p>
      ) : recognition?.result === "CONTACT_CLUB" ? (
        <p className="signup-message signup-message--error" role="alert">
          {t("signup:person.contactClub")}
        </p>
      ) : null}
      <StepMessage message={message} />
      <Button className="signup-primary" disabled={working} loading={working} type="submit">
        {t("signup:common.continue")}
      </Button>
    </form>
  );
}

function DogStep({
  addDog,
  client,
  config,
  draft,
  onChange,
  onContinue,
  step,
  today,
  totalSteps,
}: {
  addDog: boolean;
  client: ApiClient;
  config: EnabledSignupConfig;
  draft: SignupDraft;
  onChange: DraftUpdate;
  onContinue: (path: string) => void;
  step: number;
  /** The club's date (R-04 §4: «today» in `CLUB.timeZone`), never the browser's. */
  today: string;
  totalSteps: number;
}) {
  const branding = useBranding();
  const profile = countryProfile(branding.countryProfile);
  const { formatMoney } = useClubFormats();
  const { t } = useTranslation(["signup", "errors"]);
  const formRef = useRef<HTMLFormElement>(null);
  const focusFirstError = useFocusFirstError(formRef);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const files = draft.dog.documents?.[0]?.files ?? [];
  const familyOffers = branding.modules.includes("FAMILY_GROUP");
  // R-04-08: `signup.requireDogDocumentAtSignup` makes the vaccination card required on 17.
  const documentRequired = config.requireDogDocumentAtSignup === true;

  usePendingError(
    "dog",
    draft.pendingError,
    onChange,
    useCallback(
      (next: { fields: FieldErrors; message?: string | undefined }) => {
        setErrors(next.fields);
        setMessage(next.message);
        focusFirstError();
      },
      [focusFirstError],
    ),
  );

  const patchDog = <Key extends keyof SignupDog>(key: Key, value: SignupDog[Key]) => {
    onChange((current) => ({ ...current, dog: { ...current.dog, [key]: value } }));
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    if (selected.length === 0) return;
    if (files.length + selected.length > 10) {
      setMessage(t("signup:dog.tooManyFiles"));
      return;
    }
    setUploading(true);
    setMessage(undefined);
    try {
      const uploaded: SignupDocumentFile[] = [];
      for (const [offset, file] of selected.entries()) {
        const extension = file.name.includes(".") ? (file.name.split(".").pop() ?? "") : "";
        const safeName = draft.dog.name
          .normalize("NFD")
          .replaceAll(/\p{Diacritic}/gu, "")
          .trim()
          .replaceAll(/[^A-Za-z0-9]+/gu, "_");
        const proposed = `cartilla_${safeName}_${String(files.length + offset + 1)}${extension === "" ? "" : `.${extension}`}`;
        const response = await client.POST("/signup/upload-urls", {
          body: { contentType: file.type, fileName: proposed, sizeBytes: file.size },
        });
        if (response.data === undefined) throw new TypeError("Missing upload URL response");
        // R-04-08: the storage signed these headers (Content-Type, If-None-Match: *); sent unchanged.
        const put = await fetch(response.data.uploadUrl, {
          body: file,
          headers: response.data.headers,
          method: "PUT",
        });
        if (!put.ok) throw new TypeError("Signed upload failed");
        uploaded.push({ fileKey: response.data.fileKey, name: proposed });
      }
      // Functional update: fields typed while the upload was in flight are kept.
      onChange((current) => ({
        ...current,
        dog: {
          ...current.dog,
          documents: [
            {
              files: [...(current.dog.documents?.[0]?.files ?? []), ...uploaded],
              type: "VACCINATION_CARD",
            },
          ],
        },
      }));
      if (uploaded.length > 0) {
        setErrors((current) => {
          if (current.documents === undefined) return current;
          const next = { ...current };
          delete next.documents;
          return next;
        });
      }
    } catch (error) {
      setMessage(
        isApiError(error, "FILE_TOO_LARGE")
          ? t("errors:FILE_TOO_LARGE")
          : isApiError(error, "FILE_TYPE_NOT_ALLOWED")
            ? t("errors:FILE_TYPE_NOT_ALLOWED")
            : t("signup:common.genericError"),
      );
    } finally {
      setUploading(false);
    }
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    for (const key of ["name", "breed"] as const) {
      if (draft.dog[key].trim() === "") next[key] = t("signup:common.required");
    }
    const birthMonth = birthMonthToIso(draft.dog.birthMonth);
    if (draft.dog.birthMonth.trim() === "") {
      next.birthMonth = t("signup:common.required");
    } else if (birthMonth === undefined || birthMonth > today.slice(0, 7)) {
      next.birthMonth = t("signup:common.invalidMonth");
    }
    const chip = normaliseChip(draft.dog.chip);
    if (chip === "") {
      next.chip = t("signup:common.required");
    } else if (!validChip(chip, profile.code)) {
      next.chip = t("signup:dog.invalidChip");
    }
    if (documentRequired && files.length === 0) next.documents = t("signup:dog.documentRequired");
    setErrors(next);
    setMessage(undefined);
    if (Object.keys(next).length > 0) {
      focusFirstError();
      return;
    }
    if (chip !== draft.dog.chip) patchDog("chip", chip);
    onContinue(
      addDog
        ? "/gossos/nou/pagament"
        : config.steps.includes("FAMILY_GROUP")
          ? "/apuntat-hi/familia"
          : "/apuntat-hi/pagament",
    );
  };

  return (
    <form className="signup-form" noValidate onSubmit={submit} ref={formRef}>
      <Progress
        current={step}
        label={
          <>
            {t("signup:progress.dog")} <span>{t("signup:progress.dogHelp")}</span>
          </>
        }
        total={totalSteps}
      />
      <FormField error={errors.name} id="signup-dog-name" label={t("signup:dog.name")}>
        <Input
          {...invalidProps("signup-dog-name", errors.name)}
          id="signup-dog-name"
          onChange={(event) => {
            patchDog("name", event.currentTarget.value);
          }}
          value={draft.dog.name}
        />
      </FormField>
      <div className="signup-chips signup-chips--dog">
        {(["MALE", "FEMALE"] as const).map((sex) => (
          <button
            aria-pressed={draft.dog.sex === sex}
            key={sex}
            onClick={() => {
              patchDog("sex", sex);
            }}
            type="button"
          >
            {sex === "MALE" ? t("signup:dog.male") : t("signup:dog.female")}
          </button>
        ))}
      </div>
      <div className="signup-grid">
        <FormField error={errors.breed} id="signup-dog-breed" label={t("signup:dog.breed")}>
          <Input
            {...invalidProps("signup-dog-breed", errors.breed)}
            id="signup-dog-breed"
            onChange={(event) => {
              patchDog("breed", event.currentTarget.value);
            }}
            value={draft.dog.breed}
          />
        </FormField>
        <FormField
          error={errors.birthMonth}
          id="signup-dog-birth"
          label={t("signup:dog.birthMonth")}
        >
          <Input
            {...invalidProps("signup-dog-birth", errors.birthMonth)}
            id="signup-dog-birth"
            inputMode="numeric"
            maxLength={7}
            onChange={(event) => {
              patchDog("birthMonth", maskNumericDate(event.currentTarget.value, [2, 4]));
            }}
            placeholder={t("signup:dog.birthMonthPlaceholder")}
            type="text"
            value={draft.dog.birthMonth}
          />
        </FormField>
      </div>
      <FormField error={errors.chip} id="signup-dog-chip" label={t("signup:dog.chip")}>
        <Input
          {...invalidProps("signup-dog-chip", errors.chip)}
          id="signup-dog-chip"
          inputMode={profile.code === "ES" ? "numeric" : "text"}
          onChange={(event) => {
            patchDog("chip", event.currentTarget.value);
          }}
          value={draft.dog.chip}
        />
      </FormField>
      <FormField
        error={errors.notesToInstructors}
        id="signup-dog-notes"
        label={t("signup:dog.notesToInstructors")}
      >
        <Textarea
          {...invalidProps("signup-dog-notes", errors.notesToInstructors)}
          id="signup-dog-notes"
          maxLength={1000}
          onChange={(event) => {
            patchDog("notesToInstructors", event.currentTarget.value);
          }}
          rows={2}
          value={draft.dog.notesToInstructors ?? ""}
        />
      </FormField>
      <div
        className={`ah-form-field signup-file-field${errors.documents === undefined ? "" : " ah-form-field--error"}`}
      >
        <label className="signup-file-control" htmlFor="signup-dog-document">
          <Icon aria-hidden="true" name="doc" />
          <span>{t("signup:dog.vaccinationCard")}</span>
        </label>
        <Input
          {...invalidProps("signup-dog-document", errors.documents)}
          accept="application/pdf,image/*"
          aria-required={documentRequired || undefined}
          className="signup-file-input"
          disabled={uploading}
          id="signup-dog-document"
          multiple
          onChange={(event) => void upload(event)}
          type="file"
        />
        {errors.documents === undefined ? null : (
          <div className="ah-form-field__error" id="signup-dog-document-error" role="alert">
            {errors.documents}
          </div>
        )}
      </div>
      <div className="signup-upload-list">
        {files.map((file) => (
          <p className="signup-uploaded" key={file.fileKey}>
            {t("signup:dog.uploaded", { name: file.name })}
          </p>
        ))}
        <label className="signup-add-page" htmlFor="signup-dog-document">
          {uploading ? t("signup:dog.uploading") : t("signup:dog.addPage")}
        </label>
      </div>
      {documentRequired ? null : (
        <aside className="signup-note signup-note--neutral">
          {t("signup:dog.optionalDocument")}
        </aside>
      )}
      {config.texts.freeTrainingConditions === "" ? null : (
        <p className="signup-copy">{config.texts.freeTrainingConditions}</p>
      )}
      {config.texts.therapyIntro === "" ? null : (
        <p className="signup-copy">{config.texts.therapyIntro}</p>
      )}
      {config.plans.length === 0 ? null : (
        <section className="signup-plans" aria-labelledby="signup-plans-title">
          <h2 id="signup-plans-title">{t("signup:dog.planTitle")}</h2>
          <div
            className="signup-plans__grid"
            role="group"
            aria-labelledby="signup-plans-title"
            {...invalidProps("signup-plans", errors.plan)}
          >
            {config.plans.map((plan) => {
              const planClassName = [
                "signup-plan",
                plan.type === "PACK" ? "signup-plan--pack" : "",
                plan.maintenanceFee === undefined ? "" : "signup-plan--therapy",
                draft.planId === plan.id ? "signup-plan--selected" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <Card className={planClassName} key={plan.id}>
                  <button
                    aria-label={t("signup:dog.selectPlan", { plan: plan.name })}
                    aria-pressed={draft.planId === plan.id}
                    onClick={() => {
                      onChange((current) => ({ ...current, planId: plan.id }));
                    }}
                    type="button"
                  >
                    {/* The name, the conditions on one line and the price: the long description is
                        already in the step's intro texts (E3-W05 17a–d). */}
                    <span className="signup-plan__head">
                      <strong>{plan.name}</strong>
                      {plan.maintenanceFee !== undefined ? (
                        plan.conditions === "" ? null : (
                          <small className="signup-plan__conditions">{plan.conditions}</small>
                        )
                      ) : plan.price === undefined || plan.type === "PACK" ? null : (
                        <b>
                          {t("signup:dog.monthlyPrice", {
                            price: formatMoney(plan.price.amount.amountMinor / 100),
                          })}
                        </b>
                      )}
                    </span>
                    {plan.type !== "PACK" || plan.price === undefined ? null : (
                      <small className="signup-plan__pack-price">
                        {t("signup:dog.packPrice", {
                          months: plan.pack?.validityMonths ?? 1,
                          price: formatMoney(plan.price.amount.amountMinor / 100),
                        })}
                      </small>
                    )}
                    {/* R-04-14: a plan without an entry fee (or a zero one) shows no entry line. */}
                    {plan.entryFee === undefined ||
                    plan.entryFee.amountMinor <= 0 ||
                    plan.maintenanceFee !== undefined ? null : (
                      <small>
                        {t("signup:dog.entryFee", {
                          price: formatMoney(plan.entryFee.amountMinor / 100),
                        })}
                      </small>
                    )}
                    {plan.conditions === "" || plan.maintenanceFee !== undefined ? null : (
                      <small className="signup-plan__conditions">{plan.conditions}</small>
                    )}
                    {/* No «Entrada a compte: 0,00 €» either: without an entry fee only the fee shows. */}
                    {plan.maintenanceFee === undefined ? null : (
                      <small>
                        {t("signup:dog.maintenance", {
                          entry: formatMoney((plan.entryFee?.amountMinor ?? 0) / 100),
                          fee: formatMoney(plan.maintenanceFee.amountMinor / 100),
                          withEntry: (plan.entryFee?.amountMinor ?? 0) > 0 ? "yes" : "no",
                        })}
                      </small>
                    )}
                    {plan.offerLabel === undefined || !familyOffers ? null : (
                      <small>{plan.offerLabel}</small>
                    )}
                    {draft.planId === plan.id ? (
                      <span className="signup-plan__activate">{t("signup:dog.activate")}</span>
                    ) : null}
                  </button>
                </Card>
              );
            })}
          </div>
          {errors.plan === undefined ? null : (
            <p className="ah-form-field__error" id="signup-plans-error" role="alert">
              {errors.plan}
            </p>
          )}
        </section>
      )}
      <StepMessage message={message ?? (config.plans.length === 0 ? errors.plan : undefined)} />
      <Button className="signup-primary" disabled={uploading} type="submit">
        {t("signup:common.continue")}
      </Button>
    </form>
  );
}

function FamilyStep({
  client,
  config,
  draft,
  onApiError,
  onChange,
  onContinue,
  totalSteps,
}: {
  client: ApiClient;
  config: EnabledSignupConfig;
  draft: SignupDraft;
  onApiError: (error: unknown, step: SignupStep) => void;
  onChange: DraftUpdate;
  onContinue: (path: string) => void;
  totalSteps: number;
}) {
  const { formatMoney } = useClubFormats();
  const { t } = useTranslation("signup");
  const rootRef = useRef<HTMLDivElement>(null);
  const focusFirstError = useFocusFirstError(rootRef);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lookup, setLookup] = useState<SignupFamilyLookup>();
  const [message, setMessage] = useState<string>();
  const [working, setWorking] = useState(false);
  const plan = config.plans.find((candidate) => candidate.id === draft.planId);
  // The api's display name already ends with the initial's period («Marta R.»).
  const holderDisplayName = (lookup?.holderDisplayName ?? "").replace(/\.+$/u, "");

  usePendingError(
    "family",
    draft.pendingError,
    onChange,
    useCallback(
      (next: { fields: FieldErrors; message?: string | undefined }) => {
        setErrors(next.fields);
        setMessage(next.message);
        focusFirstError();
      },
      [focusFirstError],
    ),
  );

  const patchClaim = (key: "dogName" | "holderName", value: string) => {
    setLookup(undefined);
    setErrors({});
    onChange((current) => ({
      ...withoutGroupHolder(current),
      familyClaim: { ...current.familyClaim, [key]: value },
    }));
  };

  const continueStep = async () => {
    const holderName = draft.familyClaim.holderName.trim();
    const dogName = draft.familyClaim.dogName.trim();
    setMessage(undefined);
    if (holderName === "" && dogName === "") {
      onChange((current) => ({
        ...withoutGroupHolder(current),
        familyClaim: { dogName: "", holderName: "", leavePending: false },
      }));
      onContinue("/apuntat-hi/pagament");
      return;
    }
    if (holderName === "" || dogName === "") {
      setMessage(t("signup:family.bothFields"));
      return;
    }
    if (lookup?.result === "FOUND") {
      onContinue("/apuntat-hi/pagament");
      return;
    }
    setWorking(true);
    try {
      const result = await client.POST("/signup/family-group-lookups", {
        body: { dogName, holderName },
      });
      if (result.data === undefined) throw new TypeError("Missing family lookup response");
      setLookup(result.data);
      if (result.data.result === "FOUND") {
        // R-04-10: the account holder is the group holder when the group is found.
        onChange((current) => ({
          ...current,
          familyFound: true,
          holderFromGroup: true,
          payment: { ...current.payment, holderName },
        }));
      }
    } catch (error) {
      onApiError(error, "family");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="signup-form signup-family" ref={rootRef}>
      <Progress current={3} label={t("signup:family.title")} total={totalSteps} />
      <button
        aria-label={t("signup:common.back")}
        className="signup-back"
        onClick={() => {
          onContinue("/apuntat-hi/gos");
        }}
        type="button"
      >
        <span aria-hidden="true">‹</span> {t("signup:family.title")}
      </button>
      <aside className="signup-note">{config.texts.familyGroupIntro}</aside>
      <Card className="signup-family__card">
        <h2>{t("signup:family.cardTitle")}</h2>
        {plan?.entryFee === undefined ? null : (
          <p>
            {t("signup:family.cardDescription", {
              entry: formatMoney(plan.entryFee.amountMinor / 100),
            })}
          </p>
        )}
      </Card>
      <section className="signup-family__fields">
        <h2>{t("signup:family.sectionTitle")}</h2>
        <p>{t("signup:family.explanation")}</p>
        <FormField
          error={errors.familyHolder}
          id="signup-family-holder"
          label={t("signup:family.holderName")}
        >
          <Input
            {...invalidProps("signup-family-holder", errors.familyHolder)}
            id="signup-family-holder"
            onChange={(event) => {
              patchClaim("holderName", event.currentTarget.value);
            }}
            value={draft.familyClaim.holderName}
          />
        </FormField>
        <FormField
          error={errors.familyDog}
          id="signup-family-dog"
          label={t("signup:family.holderDog")}
        >
          <Input
            {...invalidProps("signup-family-dog", errors.familyDog)}
            id="signup-family-dog"
            onChange={(event) => {
              patchClaim("dogName", event.currentTarget.value);
            }}
            value={draft.familyClaim.dogName}
          />
        </FormField>
      </section>
      {lookup?.result === "FOUND" ? (
        <aside className="signup-note signup-note--success" role="status">
          {t("signup:family.found", { holder: holderDisplayName })}
        </aside>
      ) : lookup?.result === "NOT_FOUND" ? (
        <aside className="signup-note signup-note--danger" role="alert">
          {t("signup:family.notFound")}
          {/* R-04-12: only with `signup.allowFamilyGroupPending`; otherwise correct or empty the fields. */}
          {config.allowFamilyGroupPending === true ? (
            <>
              {" "}
              <button
                onClick={() => {
                  onChange((current) => ({
                    ...current,
                    familyClaim: { ...current.familyClaim, leavePending: true },
                  }));
                  onContinue("/apuntat-hi/pagament");
                }}
                type="button"
              >
                {t("signup:family.leavePending")}
              </button>
            </>
          ) : null}
        </aside>
      ) : null}
      <StepMessage message={message} />
      <p className="signup-copy">{t("signup:family.validationFooter")}</p>
      <p className="signup-copy signup-copy--center">{t("signup:family.managementFooter")}</p>
      <Button
        className="signup-primary"
        disabled={working}
        loading={working}
        onClick={() => void continueStep()}
        type="button"
      >
        {t("signup:common.continue")}
      </Button>
    </div>
  );
}

/**
 * A claim no longer FOUND (edited or cleared): a holder prefilled from the group goes back to the
 * applicant (R-04-10); a holder the applicant typed stays.
 */
function withoutGroupHolder(draft: SignupDraft): SignupDraft {
  if (!draft.holderFromGroup) return { ...draft, familyFound: false };
  const holderName = applicantName(draft.person);
  return {
    ...draft,
    familyFound: false,
    holderFromGroup: false,
    payment: { ...draft.payment, holderName },
  };
}

function paymentBody(payment: SignupPayment): SignupPayment {
  const base: SignupPayment = {
    type: payment.type,
    ...(payment.firstMonthOption === undefined
      ? {}
      : { firstMonthOption: payment.firstMonthOption }),
  };
  if (payment.type !== "SEPA_DD") return base;
  const iban = normaliseIban(payment.iban ?? "");
  const holderName = (payment.holderName ?? "").trim();
  const holderTaxId = normaliseDocument(payment.holderTaxId ?? "");
  return {
    ...base,
    ...(iban === "" ? {} : { iban }),
    ...(holderName === "" ? {} : { holderName }),
    ...(holderTaxId === "" ? {} : { holderTaxId }),
  };
}

function PaymentStep({
  addDog,
  client,
  config,
  draft,
  onApiError,
  onChange,
  onContinue,
  showCancellation,
  step,
  totalSteps,
}: {
  addDog: boolean;
  client: ApiClient;
  config: EnabledSignupConfig;
  draft: SignupDraft;
  onApiError: (error: unknown, step: SignupStep) => void;
  onChange: DraftUpdate;
  onContinue: (path: string) => void;
  showCancellation: boolean;
  step: number;
  totalSteps: number;
}) {
  const branding = useBranding();
  const profile = countryProfile(branding.countryProfile);
  const { formatMoney, formatPlainDate } = useClubFormats();
  const { i18n, t } = useTranslation(["signup", "errors"]);
  const formRef = useRef<HTMLFormElement>(null);
  const focusFirstError = useFocusFirstError(formRef);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [imageOpen, setImageOpen] = useState(false);
  // R-04-14/15: the api's quote of the selected plan (api E3-T08); the web never computes one.
  const selectedPlan = config.plans.find((plan) => plan.id === draft.planId);
  const quote = config.upfront?.planQuotes.find((candidate) => candidate.planId === draft.planId);
  const chosenOption = addDog ? draft.additionalDogOption : draft.payment.firstMonthOption;
  // An option the quote no longer offers (add-dog after the cut-off day) falls back to the first.
  const selectedOption =
    quote?.options.find((option) => option.option === chosenOption) ?? quote?.options[0];
  const optionLabel = (option: StartChoice): string => {
    const date = formatPlainDate(option.startDate, "dayMonth");
    if (addDog) {
      return option.option === "TODAY"
        ? t("signup:step4.additionalDog.today", { date })
        : t("signup:step4.additionalDog.nextMonth", { date });
    }
    if (option.option === "TODAY") {
      return option.portion === "HALF"
        ? t("signup:step4.firstMonth.todayHalf", { date })
        : t("signup:step4.firstMonth.todayFull", { date });
    }
    return option.portion === "HALF"
      ? t("signup:step4.firstMonth.splitDayHalf", { date })
      : t("signup:step4.firstMonth.nextMonthFull", { date });
  };
  // Every concept has its label; the start concepts (FIRST_MONTH, ADDITIONAL_DOG_FEE) are shown by
  // the start options, or by the frozen start row, never as a second line.
  const conceptLabel = (concept: QuoteLine["concept"]): string | undefined => {
    switch (concept) {
      case "ENTRY_FEE":
        return t("signup:payment.entryLine");
      case "PACK":
        return selectedPlan?.name ?? "";
      case "FIRST_MONTH":
      case "ADDITIONAL_DOG_FEE":
        return undefined;
    }
  };
  const [message, setMessage] = useState<string>();
  const [working, setWorking] = useState(false);
  const [website, setWebsite] = useState("");
  const paymentMethods = config.paymentMethods ?? [];
  const paymentMethod = paymentMethods.find((method) => method.type === draft.payment.type);
  const billing = branding.modules.includes("BILLING");
  const needsConsents = !addDog || config.member?.consentsUpToDate === false;
  const stripe = paymentMethods.some((method) => method.type === "CARD");
  const manualInstructions = paymentMethods.find(
    (method) => method.type === "MANUAL",
  )?.instructions;
  // R-04-26: once the signup exists, 19 shows what was committed and only the checkout is retried.
  const committed = draft.submission?.memberId !== undefined;
  const locked = committed || working;
  // R-04-14, T-04-32: a committed signup shows the amounts the api froze, not the live quote.
  const frozen = committed ? draft.submission?.frozen : undefined;
  const upfrontRows: { amount: Money; key: string; label: string }[] = [];
  const shownLines: readonly QuoteLine[] =
    frozen === undefined
      ? (quote?.lines ?? [])
      : frozen.upfront.lines.filter((line) => line.status !== "CANCELLED" && line.status !== "REFUNDED");
  for (const [index, line] of shownLines.entries()) {
    const label = line.amount.amountMinor > 0 ? conceptLabel(line.concept) : undefined;
    if (label !== undefined) upfrontRows.push({ amount: line.amount, key: `${line.concept}-${String(index)}`, label });
  }
  if (frozen !== undefined) {
    // A public signup has no `additionalDog` (the core sends `null`).
    const additional = frozen.upfront.additionalDog ?? undefined;
    const firstMonth = shownLines.find((line) => line.concept === "FIRST_MONTH");
    if (additional !== undefined) {
      upfrontRows.push({ amount: additional.amountDue, key: "start", label: optionLabel(additional) });
    } else if (firstMonth !== undefined && frozen.start !== undefined) {
      upfrontRows.push({ amount: firstMonth.amount, key: "start", label: optionLabel(frozen.start) });
    }
  }
  const startOptions = frozen === undefined ? (quote?.options ?? []) : [];
  const totalDue: Money = frozen?.upfront.totalDue ??
    selectedOption?.totalDue ??
    quote?.totalDue ?? { amountMinor: 0, currency: branding.currency };
  const hasUpfront =
    (frozen !== undefined || quote !== undefined) &&
    (upfrontRows.length > 0 || startOptions.length > 0 || totalDue.amountMinor > 0);
  const imageConsentText =
    config.texts.imageConsent.trim() === ""
      ? config.legal.imageConsentText
      : config.texts.imageConsent;
  const paths = signupPaths(addDog);

  usePendingError(
    "payment",
    draft.pendingError,
    onChange,
    useCallback(
      (next: { fields: FieldErrors; message?: string | undefined }) => {
        setErrors(next.fields);
        setMessage(next.message);
        focusFirstError();
      },
      [focusFirstError],
    ),
  );

  // R-04-10: the holder is prefilled with the applicant (or the group holder, set at 18).
  useEffect(() => {
    onChange((current) => {
      if ((current.payment.holderName ?? "").trim() !== "") return current;
      const holderName = current.familyFound
        ? current.familyClaim.holderName.trim()
        : applicantName(current.person);
      return holderName === ""
        ? current
        : {
            ...current,
            holderFromGroup: current.familyFound,
            payment: { ...current.payment, holderName },
          };
    });
  }, [onChange]);

  const acceptConsent = (patch: Partial<Pick<SignupDraft, "imageConsent" | "privacyAccepted">>) => {
    if (locked) return;
    const version = config.legal.legalTextsVersion;
    onChange((current) => ({ ...current, ...patch, consentVersion: version }));
  };

  const localErrors = (): Record<string, string> => {
    const next: Record<string, string> = {};
    const iban = normaliseIban(draft.payment.iban ?? "");
    if (billing && !addDog && draft.payment.type === "SEPA_DD" && iban !== "" && !validIban(iban)) {
      next.iban = t("errors:INVALID_IBAN");
    }
    if (
      needsConsents &&
      (!draft.privacyAccepted || draft.consentVersion !== config.legal.legalTextsVersion)
    ) {
      next.privacy = t("signup:common.required");
    }
    return next;
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = committed ? {} : localErrors();
    setErrors(nextErrors);
    setMessage(undefined);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError();
      return;
    }
    setWorking(true);
    // The version sent is the one the applicant accepted (R-04-17), never the current config's.
    const version = draft.consentVersion;
    const consents = {
      imageUse: { granted: draft.imageConsent, version },
      privacyPolicy: { accepted: draft.privacyAccepted, version },
    };
    const { notesToInstructors, ...dogFields } = draft.dog;
    const notes = notesToInstructors?.trim() ?? "";
    const dog: SignupDog = {
      ...dogFields,
      birthMonth: birthMonthToIso(draft.dog.birthMonth) ?? draft.dog.birthMonth,
      chip: normaliseChip(draft.dog.chip),
      ...(notes === "" ? {} : { notesToInstructors: notes }),
    };
    try {
      let submission = draft.submission;
      if (submission?.memberId === undefined) {
        // The option shown selected is the one sent (the total itself is never sent, T-04-32).
        const startOption = selectedOption?.option;
        const body: AddDogSignupRequest | SignupRequest = addDog
          ? {
              additionalDogOption: startOption ?? draft.additionalDogOption,
              dog,
              documents: dog.documents ?? [],
              ...(draft.planId === "" ? {} : { planIdRequested: draft.planId }),
              ...(needsConsents ? { consents } : {}),
            }
          : {
              consents,
              dog,
              ...(draft.familyClaim.holderName === "" ? {} : { familyGroupClaim: draft.familyClaim }),
              locale: i18n.resolvedLanguage ?? branding.defaultLocale,
              ...(billing
                ? {
                    payment: paymentBody(
                      startOption === undefined
                        ? draft.payment
                        : { ...draft.payment, firstMonthOption: startOption },
                    ),
                  }
                : {}),
              person: {
                ...draft.person,
                birthDate: birthDateToIso(draft.person.birthDate) ?? draft.person.birthDate,
                emails: draft.person.emails.filter((email) => email.trim() !== ""),
                gender: draft.person.gender || "OTHER",
                idDocument: identityDocument(draft, profile.code === "ES"),
                phones: draft.person.phones.filter((phone) => phone.number.trim() !== ""),
              },
              ...(draft.planId === "" ? {} : { planId: draft.planId }),
              website,
            };
        // One Idempotency-Key per payload (CONVENCIONS_API §7): a retry of the same payload
        // replays the first 201; any change to the payload gets a new key.
        const fingerprint = await payloadDigest(body);
        const idempotencyKey =
          submission?.fingerprint === fingerprint
            ? submission.idempotencyKey
            : crypto.randomUUID();
        const pending: SignupSubmission = { fingerprint, idempotencyKey };
        onChange((current) => ({ ...current, submission: pending }));
        const header = { "Idempotency-Key": idempotencyKey };
        // The core writes an absent block as `null` (no BILLING: no `upfront`).
        const freeze = (upfront: SignupUpfront | null | undefined): Pick<SignupSubmission, "frozen"> =>
          upfront == null
            ? {}
            : {
                frozen: {
                  ...(selectedOption === undefined
                    ? {}
                    : {
                        start: {
                          option: selectedOption.option,
                          portion: selectedOption.portion,
                          startDate: selectedOption.startDate,
                        },
                      }),
                  upfront,
                },
              };
        if (addDog) {
          const result = await client.POST("/me/dogs/signup", {
            body: body as AddDogSignupRequest,
            params: { header },
          });
          if (result.data === undefined) throw new TypeError("Missing dog-signup response");
          if (!result.data.checkout.required) {
            onContinue(paths.sent ?? "/gossos/nou/enviada");
            return;
          }
          submission = {
            ...pending,
            ...freeze(result.data.upfront),
            memberId: result.data.checkout.memberId,
          };
        } else {
          const result = await client.POST("/signup", {
            body: body as SignupRequest,
            params: { header },
          });
          if (result.data === undefined) throw new TypeError("Missing signup response");
          if (!result.data.checkout.required) {
            onContinue(paths.sent ?? "/apuntat-hi/enviada");
            return;
          }
          submission = {
            ...pending,
            ...freeze(result.data.upfront),
            memberId: result.data.memberId,
            signupToken: result.data.signupToken,
          };
        }
      }
      // The created signup stays in the draft until the checkout resolves (R-04-26): a retry
      // (or `?cs=cancel`) only asks for the checkout again, never for a new signup.
      const checkoutKey = submission.checkoutKey ?? crypto.randomUUID();
      const created: SignupSubmission = { ...submission, checkoutKey };
      onChange((current) => ({ ...current, submission: created }));
      safeSessionSet(CHECKOUT_KEY, "1");
      const origin = window.location.origin;
      const checkout = await client.POST("/checkout-sessions", {
        body: {
          cancelUrl: `${origin}${paths.payment ?? ""}?cs=cancel`,
          memberId: created.memberId ?? "",
          ...(created.signupToken === undefined ? {} : { signupToken: created.signupToken }),
          successUrl: `${origin}${paths.sent ?? ""}?cs=success`,
        },
        params: { header: { "Idempotency-Key": checkoutKey } },
      });
      if (checkout.data === undefined) throw new TypeError("Missing checkout response");
      onContinue(checkout.data.checkoutUrl);
    } catch (error) {
      setWorking(false);
      if (isApiError(error, "CONSENT_VERSION_OUTDATED")) {
        onChange((current) => ({
          ...current,
          consentVersion: "",
          imageConsent: false,
          privacyAccepted: false,
        }));
      }
      onApiError(error, "payment");
    }
  };

  return (
    <form
      className="signup-form signup-payment"
      noValidate
      onSubmit={(event) => void submit(event)}
      ref={formRef}
    >
      <Progress current={step} label={t("signup:progress.payment")} total={totalSteps} />
      {showCancellation ? (
        <p className="signup-message signup-message--warning" role="alert">
          {t("signup:payment.cancelled")}
        </p>
      ) : null}
      {billing ? (
        <section className="signup-payment__monthly">
          <h2>{t("signup:payment.monthlyTitle")}</h2>
          <p>{config.texts.monthlyPaymentIntro}</p>
          {addDog ? (
            <FormField id="signup-current-payment" label={t("signup:payment.currentMethod")}>
              <Input
                id="signup-current-payment"
                readOnly
                value={
                  config.member?.paymentMethodMasked === undefined
                    ? ""
                    : [
                        paymentMethods.find(
                          (method) => method.type === config.member?.paymentMethodMasked?.type,
                        )?.label,
                        fmtMaskedIban(config.member.paymentMethodMasked.maskedAccount),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                }
              />
            </FormField>
          ) : (
            <>
              <div
                className="signup-segment"
                role="group"
                aria-label={t("signup:payment.monthlyTitle")}
              >
                {paymentMethods.map((method) => (
                  <button
                    aria-pressed={draft.payment.type === method.type}
                    disabled={locked}
                    key={method.type}
                    onClick={() => {
                      if (locked) return;
                      onChange((current) => ({
                        ...current,
                        payment: withPaymentType(current.payment, method.type),
                      }));
                    }}
                    type="button"
                  >
                    {method.label}
                  </button>
                ))}
              </div>
              {draft.payment.type === "SEPA_DD" ? (
                <>
                  <FormField error={errors.iban} id="signup-iban" label={t("signup:payment.iban")}>
                    <Input
                      {...invalidProps("signup-iban", errors.iban)}
                      autoComplete="off"
                      id="signup-iban"
                      readOnly={locked}
                      onChange={(event) => {
                        const iban = event.currentTarget.value;
                        onChange((current) => ({
                          ...current,
                          payment: { ...current.payment, iban },
                        }));
                      }}
                      value={draft.payment.iban ?? ""}
                    />
                  </FormField>
                  <FormField
                    error={errors.accountHolder}
                    id="signup-account-holder"
                    label={t("signup:payment.accountHolder")}
                  >
                    <Input
                      {...invalidProps("signup-account-holder", errors.accountHolder)}
                      id="signup-account-holder"
                      onChange={(event) => {
                        const holderName = event.currentTarget.value;
                        onChange((current) => ({
                          ...current,
                          holderFromGroup: false,
                          payment: { ...current.payment, holderName },
                        }));
                      }}
                      readOnly={locked}
                      value={draft.payment.holderName ?? ""}
                    />
                  </FormField>
                  <FormField
                    error={errors.holderTaxId}
                    id="signup-holder-tax-id"
                    label={t("signup:payment.holderTaxId")}
                  >
                    <Input
                      {...invalidProps("signup-holder-tax-id", errors.holderTaxId)}
                      id="signup-holder-tax-id"
                      readOnly={locked}
                      onChange={(event) => {
                        const holderTaxId = event.currentTarget.value;
                        onChange((current) => ({
                          ...current,
                          payment: { ...current.payment, holderTaxId },
                        }));
                      }}
                      value={draft.payment.holderTaxId ?? ""}
                    />
                  </FormField>
                  {paymentMethod?.mandateText === undefined ? null : (
                    <aside className="signup-note signup-note--neutral">
                      {paymentMethod.mandateText}
                    </aside>
                  )}
                  <aside className="signup-note signup-note--neutral">
                    {config.texts.paymentDay}
                  </aside>
                </>
              ) : draft.payment.type === "CARD" ? (
                <aside className="signup-note signup-note--neutral">
                  {t("signup:payment.cardSecure")}
                </aside>
              ) : (
                <aside className="signup-note signup-note--neutral">
                  {config.texts.cashConditions}
                </aside>
              )}
            </>
          )}
        </section>
      ) : null}
      {billing && hasUpfront ? (
        <Card className="signup-upfront">
          <h2>{t("signup:payment.initialTitle")}</h2>
          {upfrontRows.map((row) => (
            <p className="signup-upfront__line" key={row.key}>
              <span>{row.label}</span>
              <strong>{formatMoney(row.amount.amountMinor / 100)}</strong>
            </p>
          ))}
          {startOptions.length === 0 ? null : (
            <fieldset className="signup-upfront__options">
              <legend>{t("signup:payment.chooseStart")}</legend>
              {startOptions.map((option) => (
                <label key={option.option}>
                  <input
                    checked={selectedOption?.option === option.option}
                    disabled={locked}
                    name="signup-start"
                    onChange={() => {
                      if (locked) return;
                      onChange((current) =>
                        addDog
                          ? { ...current, additionalDogOption: option.option }
                          : {
                              ...current,
                              payment: { ...current.payment, firstMonthOption: option.option },
                            },
                      );
                    }}
                    type="radio"
                  />
                  <span>{optionLabel(option)}</span>
                  <strong>{formatMoney(option.amountDue.amountMinor / 100)}</strong>
                </label>
              ))}
            </fieldset>
          )}
          {/* T-04-32: display-only; the club computes and charges the total, it is never sent. */}
          <p className="signup-upfront__total">
            <span>{t("signup:step4.total")}</span>
            <b>{formatMoney(totalDue.amountMinor / 100)}</b>
          </p>
          <p>{stripe ? t("signup:payment.stripeSubmit") : manualInstructions}</p>
        </Card>
      ) : null}
      {needsConsents ? (
        <section className="signup-consents">
          <div className="signup-consent">
            <Checkbox
              {...invalidProps("signup-privacy", errors.privacy)}
              checked={draft.privacyAccepted}
              disabled={locked}
              id="signup-privacy"
              onChange={(event) => {
                acceptConsent({ privacyAccepted: event.currentTarget.checked });
              }}
            />
            <label htmlFor="signup-privacy">{t("signup:payment.privacy")}</label>
            <a href={config.legal.privacyPolicyUrl} rel="noreferrer" target="_blank">
              {t("signup:payment.privacyLink")}
            </a>
          </div>
          {errors.privacy === undefined ? null : (
            <p className="ah-form-field__error" id="signup-privacy-error" role="alert">
              {errors.privacy}
            </p>
          )}
          <div className="signup-consent">
            <Checkbox
              checked={draft.imageConsent}
              disabled={locked}
              id="signup-image-consent"
              onChange={(event) => {
                acceptConsent({ imageConsent: event.currentTarget.checked });
              }}
            />
            <label htmlFor="signup-image-consent">{t("signup:payment.imageUse")}</label>
            <button
              aria-expanded={imageOpen}
              onClick={() => {
                setImageOpen((current) => !current);
              }}
              type="button"
            >
              {t("signup:payment.imageMeaning")}
            </button>
          </div>
          {imageOpen ? (
            <aside className="signup-note signup-note--neutral">{imageConsentText}</aside>
          ) : null}
        </section>
      ) : null}
      <label aria-hidden="true" className="signup-honeypot" htmlFor="signup-website">
        {t("signup:honeypot")}
        <Input
          autoComplete="off"
          id="signup-website"
          name="website"
          onChange={(event) => {
            setWebsite(event.currentTarget.value);
          }}
          tabIndex={-1}
          value={website}
        />
      </label>
      <StepMessage message={message} />
      <Button
        className="signup-primary"
        disabled={working || (!committed && needsConsents && !draft.privacyAccepted)}
        loading={working}
        loadingLabel={t("signup:payment.submitting")}
        type="submit"
      >
        {committed ? t("signup:payment.payNow") : t("signup:payment.submit")}
      </Button>
      <p className="signup-copy signup-copy--center">
        {addDog ? t("signup:payment.addDogReviewFooter") : t("signup:payment.reviewFooter")}
      </p>
    </form>
  );
}

function SuccessStep({ addDog }: { addDog: boolean }) {
  const { t } = useTranslation("signup");
  const [checkout] = useState(
    () =>
      sessionStorage.getItem(CHECKOUT_KEY) === "1" ||
      new URLSearchParams(window.location.search).get("cs") === "success",
  );
  useEffect(() => {
    safeSessionRemove(CHECKOUT_KEY);
  }, []);
  return (
    <section className="signup-success">
      <span aria-hidden="true">✓</span>
      <h2>{t("signup:success.title")}</h2>
      <p>{addDog ? t("signup:payment.addDogReviewFooter") : t("signup:payment.reviewFooter")}</p>
      {checkout ? <p>{t("signup:success.checkout")}</p> : null}
    </section>
  );
}

export function SignupPage({
  addDog = false,
  client,
  onNavigate = (path) => {
    window.location.assign(path);
  },
}: {
  client: ApiClient;
  addDog?: boolean;
  onNavigate?: (path: string) => void;
}) {
  const branding = useBranding();
  const profile = countryProfile(branding.countryProfile);
  const { i18n, t } = useTranslation(["signup", "errors"]);
  const paths = signupPaths(addDog);
  // The `?cs=cancel` marker of Stripe's return is read once, when the document loads, and then
  // removed from the address (below): a reload never cancels a later attempt.
  const [cancelled] = useState(
    () => new URLSearchParams(window.location.search).get("cs") === "cancel",
  );
  const [path, setPath] = useState(() =>
    cancelled &&
    (window.location.pathname === paths.sent || window.location.pathname === "/apuntat-hi/enviada")
      ? (paths.payment ?? window.location.pathname)
      : window.location.pathname,
  );
  // A full page load is on its way: the departing document never renders the next step, so it
  // never shows nor consumes that step's routed error (it stays in the draft for the next page).
  const [leaving, setLeaving] = useState(false);
  const [draft, setDraftState] = useState(() => {
    const saved = readDraft(addDog, profile);
    // A cancelled checkout resolved that attempt: the retry asks for a new checkout session
    // for the signup already created (no new POST /signup).
    if (!cancelled || saved.submission?.checkoutKey === undefined) return saved;
    const submission: SignupSubmission = { ...saved.submission };
    delete submission.checkoutKey;
    return { ...saved, submission };
  });

  useEffect(() => {
    if (!cancelled) return;
    window.history.replaceState(window.history.state, "", paths.payment ?? window.location.pathname);
  }, [cancelled, paths.payment]);
  // The latest draft, updated synchronously: the production navigator is a full page load, so
  // the draft is written to the session before leaving, with every update of the same tick.
  const draftRef = useRef(draft);
  const updateDraft: DraftUpdate = useCallback((update) => {
    const next = typeof update === "function" ? update(draftRef.current) : update;
    draftRef.current = next;
    setDraftState(next);
  }, []);

  // A document restored from the back-forward cache (the browser's Back after a full page load, or
  // a load that never finished) is this page again: it shows the step of its address, with the
  // draft the other pages left in the session, instead of staying on «Carregant el formulari».
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setLeaving(false);
      setPath(window.location.pathname);
      updateDraft(readDraft(addDog, countryProfile(branding.countryProfile)));
    };
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pageshow", restore);
    };
  }, [addDog, branding.countryProfile, updateDraft]);
  const [config, setConfig] = useState<SignupConfig>();
  const [closed, setClosed] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  // A cancelled checkout that came back to the «sent» address starts on 19 (initial path above).
  const sent = path === paths.sent;
  const committed = draft.submission?.memberId !== undefined;

  useEffect(() => {
    if (sent) {
      // The flow ends here: the draft (and the signup capability it holds) is discarded.
      safeSessionRemove(DRAFT_KEY);
      return;
    }
    safeSessionSet(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  }, [draft, sent]);

  useEffect(() => {
    let active = true;
    void client.GET("/signup").then(
      (result) => {
        if (!active) return;
        if (result.data === undefined) {
          setLoadError(true);
          return;
        }
        const data = result.data;
        setConfig(data);
        updateDraft((current) => {
          // The signup exists: its committed choices never change (R-04-26).
          if (current.submission?.memberId !== undefined) return current;
          const plans = data.plans ?? [];
          const memberPlan = addDog ? data.member?.planId : undefined;
          const planAvailable =
            current.planId !== "" &&
            (plans.some((plan) => plan.id === current.planId) || current.planId === memberPlan);
          const planId = planAvailable ? current.planId : (memberPlan ?? plans[0]?.id ?? "");
          const paymentMethods = data.paymentMethods ?? [];
          const method = paymentMethods.some(
            (candidate) => candidate.type === current.payment.type,
          )
            ? current.payment.type
            : paymentMethods[0]?.type;
          // R-04-17: an acceptance of other legal texts is cleared and asked again.
          const version = data.legal?.legalTextsVersion;
          const consentOutdated =
            version !== undefined &&
            (current.privacyAccepted || current.imageConsent) &&
            current.consentVersion !== version;
          return {
            ...current,
            ...(consentOutdated
              ? { consentVersion: "", imageConsent: false, privacyAccepted: false }
              : {}),
            payment:
              method === undefined ? current.payment : withPaymentType(current.payment, method),
            planId,
          };
        });
      },
      () => {
        if (active) setLoadError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [addDog, client, i18n.resolvedLanguage, reload, updateDraft]);

  const navigateTo = (nextPath: string) => {
    if (nextPath === paths.sent) {
      safeSessionRemove(DRAFT_KEY);
    } else {
      safeSessionSet(DRAFT_KEY, JSON.stringify({ ...draftRef.current, savedAt: Date.now() }));
    }
    const target = new URL(nextPath, window.location.href);
    onNavigate(nextPath);
    // A same-document navigator has moved the address already: show the step. The production
    // navigator (`location.assign`) has not: this document keeps its step until it unloads.
    const moved =
      target.origin === window.location.origin &&
      target.pathname === window.location.pathname &&
      target.search === window.location.search;
    if (moved || nextPath === paths.sent) {
      setPath(nextPath);
    } else if (target.origin === window.location.origin) {
      setLeaving(true);
    }
  };

  const go = (nextPath: string) => {
    updateDraft((current) => {
      if (current.pendingError === undefined) return current;
      const next = { ...current };
      delete next.pendingError;
      return next;
    });
    navigateTo(nextPath);
  };

  const handleApiError = (error: unknown, currentStep: SignupStep) => {
    if (isApiError(error, "SIGNUP_CLOSED")) {
      setClosed(true);
      setReload((current) => current + 1);
      return;
    }
    if (isApiError(error, "CONSENT_VERSION_OUTDATED") || isApiError(error, "PLAN_NOT_AVAILABLE")) {
      setReload((current) => current + 1);
    }
    const target = routeApiError(error, currentStep);
    // A step this flow does not have (add-dog), or any step once the signup exists: the
    // message shows on the current step.
    const pending: PendingError =
      paths[target.step] === undefined || (committed && target.step !== currentStep)
        ? {
            code: Object.values(target.fields ?? {})[0] ?? target.code,
            ...(target.retryAfter === undefined ? {} : { retryAfter: target.retryAfter }),
            step: currentStep,
          }
        : target;
    updateDraft((current) => ({ ...current, pendingError: pending }));
    const targetPath = paths[pending.step];
    if (targetPath !== undefined && targetPath !== path) navigateTo(targetPath);
  };

  if (sent) {
    return (
      <Layout>
        <SuccessStep addDog={addDog} />
      </Layout>
    );
  }

  if (leaving) {
    return (
      <Layout>
        <p className="signup-state" role="status">
          {t("signup:common.loading")}
        </p>
      </Layout>
    );
  }

  if (loadError) {
    return (
      <Layout>
        <section className="signup-state" role="alert">
          <p>{t("signup:common.loadError")}</p>
          <Button
            onClick={() => {
              setLoadError(false);
              setReload((current) => current + 1);
            }}
          >
            {t("signup:common.retry")}
          </Button>
        </section>
      </Layout>
    );
  }

  if (config === undefined) {
    return (
      <Layout>
        <p className="signup-state" role="status">
          {t("signup:common.loading")}
        </p>
      </Layout>
    );
  }

  if (closed || !config.enabled || branding.status !== "ACTIVE") {
    return (
      <Layout>
        <p className="signup-state">{config.closedText ?? t("errors:SIGNUP_CLOSED")}</p>
      </Layout>
    );
  }

  if (!isEnabledSignupConfig(config)) {
    return (
      <Layout>
        <section className="signup-state" role="alert">
          <p>{t("signup:common.loadError")}</p>
          <Button
            onClick={() => {
              setLoadError(false);
              setReload((current) => current + 1);
            }}
          >
            {t("signup:common.retry")}
          </Button>
        </section>
      </Layout>
    );
  }

  const steps = addDog ? (["DOG", "PAYMENT"] as const) : config.steps;
  const totalSteps = steps.length;
  const dogStep = addDog ? 1 : 2;
  const paymentStep = totalSteps;
  // S04 §4: «today» is the club's date (the configuration's, else `CLUB.timeZone`).
  const today = config.upfront?.today ?? clubToday(branding.timeZone);

  // Once the signup exists every step path shows 19: only the checkout can be retried.
  const view: SignupStep = committed
    ? "payment"
    : path === "/apuntat-hi"
      ? "person"
      : path === "/apuntat-hi/gos" || path === "/gossos/nou"
        ? "dog"
        : path === "/apuntat-hi/familia" && !addDog
          ? "family"
          : "payment";

  return (
    <Layout>
      {view === "person" ? (
        <PersonStep
          client={client}
          draft={draft}
          onApiError={handleApiError}
          onChange={updateDraft}
          onContinue={go}
          today={today}
          totalSteps={totalSteps}
        />
      ) : view === "dog" ? (
        <DogStep
          addDog={addDog}
          client={client}
          config={config}
          draft={draft}
          onChange={updateDraft}
          onContinue={go}
          step={dogStep}
          today={today}
          totalSteps={totalSteps}
        />
      ) : view === "family" ? (
        <FamilyStep
          client={client}
          config={config}
          draft={draft}
          onApiError={handleApiError}
          onChange={updateDraft}
          onContinue={go}
          totalSteps={totalSteps}
        />
      ) : (
        <PaymentStep
          addDog={addDog}
          client={client}
          config={config}
          draft={draft}
          onApiError={handleApiError}
          onChange={updateDraft}
          onContinue={go}
          showCancellation={cancelled}
          step={paymentStep}
          totalSteps={totalSteps}
        />
      )}
    </Layout>
  );
}
