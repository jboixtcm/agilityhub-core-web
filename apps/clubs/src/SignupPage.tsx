import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { LOCALE_STORAGE_KEY, productLocales, useClubFormats } from "@agilityhub/i18n";
import {
  Button,
  Card,
  Checkbox,
  FormField as UiFormField,
  Icon,
  Input,
  resolveBrandingLogo,
  Select,
  useBranding,
} from "@agilityhub/ui";
import { type ChangeEvent, type ReactNode, type SyntheticEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type SignupConfig = components["schemas"]["SignupConfig"];
type SignupPerson = components["schemas"]["SignupPerson"];
type SignupDog = components["schemas"]["SignupDog"];
type SignupPhone = components["schemas"]["SignupPhone"];
type SignupTown = components["schemas"]["SignupTown"];
type SignupFamilyLookup = components["schemas"]["SignupFamilyLookupResponse"];
type SignupIdentityResult = components["schemas"]["SignupIdentityCheckResponse"];
type SignupPayment = components["schemas"]["SignupPayment"];
type SignupDocumentFile = components["schemas"]["SignupDocumentFile"];

type DraftPerson = Omit<SignupPerson, "gender"> & {
  gender: SignupPerson["gender"] | "";
};

interface SignupDraft {
  dog: SignupDog;
  familyClaim: components["schemas"]["SignupFamilyClaim"];
  imageConsent: boolean;
  mode: "add-dog" | "public";
  passport: string;
  payment: SignupPayment;
  person: DraftPerson;
  planId: string;
  privacyAccepted: boolean;
  savedAt: number;
}

type FieldErrors = Readonly<Record<string, string>>;

const DRAFT_KEY = "signup.draft.v1";
const CHECKOUT_KEY = "signup.checkout.v1";
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

function countryProfile(value: unknown): {
  code: string;
  idDocumentTypes: string[];
  phonePrefix: string;
} {
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

function emptyPhone(prefix: string): SignupPhone {
  return { label: "", number: "", prefix };
}

function emptyDraft(addDog: boolean, prefix: string): SignupDraft {
  return {
    dog: {
      birthMonth: "",
      breed: "",
      chip: "",
      documents: [{ files: [], type: "VACCINATION_CARD" }],
      name: "",
      sex: "FEMALE",
    },
    familyClaim: { dogName: "", holderName: "", leavePending: false },
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
      idDocument: { type: "DNI", value: "" },
      lastName1: "",
      lastName2: "",
      phones: [emptyPhone(prefix), emptyPhone(prefix)],
    },
    planId: "",
    privacyAccepted: false,
    savedAt: Date.now(),
  };
}

function readDraft(addDog: boolean, prefix: string): SignupDraft {
  try {
    const serialized = sessionStorage.getItem(DRAFT_KEY);
    if (serialized !== null) {
      const candidate = JSON.parse(serialized) as SignupDraft;
      const mode = addDog ? "add-dog" : "public";
      if (
        candidate.mode === mode &&
        Number.isFinite(candidate.savedAt) &&
        Date.now() - candidate.savedAt <= DRAFT_MAX_AGE_MS
      ) {
        return {
          ...candidate,
          dog: {
            ...candidate.dog,
            birthMonth: legacyMonthToDisplay(candidate.dog.birthMonth),
          },
          person: {
            ...candidate.person,
            birthDate: legacyDateToDisplay(candidate.person.birthDate),
          },
        };
      }
      sessionStorage.removeItem(DRAFT_KEY);
    }
  } catch {
    sessionStorage.removeItem(DRAFT_KEY);
  }
  return emptyDraft(addDog, prefix);
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

function documentField(field: string): string {
  return field === "idDocument.value" || field === "person.idDocument.value"
    ? "idDocument"
    : field.replace(/^person\./u, "");
}

function safeSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Signup still works when storage is unavailable.
  }
}

function Layout({ children }: { children: ReactNode }) {
  const branding = useBranding();
  const { i18n, t } = useTranslation("signup");
  const logo = resolveBrandingLogo(branding.theme, { placement: "compact" });
  const locales = productLocales.filter((locale) => branding.locales.includes(locale));
  const city = branding.club.city?.trim();

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
      <footer className="signup-footer">
        {city === undefined || city === ""
          ? t("signup:common.footer", { club: branding.club.name })
          : t("signup:common.footerWithCity", { city, club: branding.club.name })}
      </footer>
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

function inputError(code: string, t: ReturnType<typeof useTranslation>["t"]): string {
  if (code === "INVALID_EMAIL") return t("signup:common.invalidEmail");
  if (code === "INVALID_PHONE") return t("signup:common.invalidPhone");
  if (code === "INVALID_ID_DOCUMENT") return t("errors:INVALID_ID_DOCUMENT");
  return t("signup:common.required");
}

function PersonStep({
  client,
  draft,
  onChange,
  onContinue,
  totalSteps,
}: {
  client: ApiClient;
  draft: SignupDraft;
  onChange: (next: SignupDraft) => void;
  onContinue: (path: string) => void;
  totalSteps: number;
}) {
  const branding = useBranding();
  const profile = countryProfile(branding.countryProfile);
  const { t } = useTranslation(["signup", "errors"]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [towns, setTowns] = useState<SignupTown[]>([]);
  const [recognition, setRecognition] = useState<SignupIdentityResult>();
  const [message, setMessage] = useState<string>();
  const [working, setWorking] = useState(false);
  const isSpanishProfile = profile.code === "ES";

  const patchPerson = <Key extends keyof DraftPerson>(key: Key, value: DraftPerson[Key]) => {
    onChange({ ...draft, person: { ...draft.person, [key]: value } });
  };

  const patchAddress = (key: keyof SignupPerson["address"], value: string) => {
    patchPerson("address", {
      ...draft.person.address,
      [key]: value,
    });
  };

  const patchPhone = (index: number, key: keyof SignupPhone, value: string) => {
    const phones = draft.person.phones.map((phone, phoneIndex) =>
      phoneIndex === index ? { ...phone, [key]: value } : phone,
    );
    patchPerson("phones", phones);
  };

  const patchEmail = (index: number, value: string) => {
    const emails = draft.person.emails.map((email, emailIndex) =>
      emailIndex === index ? value : email,
    );
    patchPerson("emails", emails);
  };

  const identityDocument = (): components["schemas"]["SignupIdentityDocument"] => {
    if (isSpanishProfile && draft.person.idDocument.value.trim() === "") {
      return { type: "PASSPORT", value: draft.passport.trim() };
    }
    const value = draft.person.idDocument.value.trim().toUpperCase().replaceAll(/[-\s]/gu, "");
    return {
      type:
        isSpanishProfile && /^[XYZ]/u.test(value)
          ? "NIE"
          : isSpanishProfile
            ? "DNI"
            : draft.person.idDocument.type,
      value,
    };
  };

  const localErrors = (): Record<string, string> => {
    const next: Record<string, string> = {};
    const required = t("signup:common.required");
    if (identityDocument().value === "") next.idDocument = required;
    for (const key of ["firstName", "lastName1"] as const) {
      if (draft.person[key].trim() === "") next[key] = required;
    }
    if (draft.person.birthDate.trim() === "") {
      next.birthDate = required;
    } else if (birthDateToIso(draft.person.birthDate) === undefined) {
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
    const primaryPhone = draft.person.phones[0];
    const secondPhone = draft.person.phones[1];
    if (
      primaryPhone === undefined ||
      primaryPhone.prefix.trim() === "" ||
      (isSpanishProfile
        ? !/^\d{9}$/u.test(primaryPhone.number.replaceAll(/\D/gu, ""))
        : !/^\d{7,15}$/u.test(primaryPhone.number.replaceAll(/\D/gu, "")))
    ) {
      next.phones0 = t("signup:common.invalidPhone");
    }
    if (secondPhone?.number.trim() !== "" && secondPhone?.label.trim() === "") {
      next.phones1label = required;
    }
    if (draft.person.address.street.trim() === "") next.street = required;
    if (draft.person.address.postalCode.trim() === "") next.postalCode = required;
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
          idDocument: identityDocument(),
        },
      });
      if (response.data === undefined) throw new TypeError("Missing identity-check response");
      setRecognition(response.data);
      if (response.data.result === "NEW") onContinue("/apuntat-hi/gos");
    } catch (error) {
      const backend = apiFieldErrors(error);
      if (backend.length > 0) {
        setErrors(
          Object.fromEntries(
            backend.map((entry) => [documentField(entry.field), inputError(entry.code, t)]),
          ),
        );
      } else if (isApiError(error) && error.status === 429) {
        setMessage(t("signup:common.rateLimited", { seconds: error.retryAfter ?? 60 }));
      } else {
        setMessage(t("signup:common.genericError"));
      }
    } finally {
      setWorking(false);
    }
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = localErrors();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    void checkIdentity();
  };

  const lookupTowns = async () => {
    if (!isSpanishProfile || draft.person.address.postalCode.length !== 5) return;
    try {
      const result = await client.GET("/signup/towns", {
        params: { query: { postalCode: draft.person.address.postalCode } },
      });
      if (result.data === undefined) return;
      setTowns(result.data);
      if (result.data[0] !== undefined) patchAddress("town", result.data[0].name);
    } catch (error) {
      if (isApiError(error) && error.status === 429) {
        setMessage(t("signup:common.rateLimited", { seconds: error.retryAfter ?? 60 }));
      }
    }
  };

  return (
    <form className="signup-form" noValidate onSubmit={submit}>
      <Progress current={1} label={t("signup:progress.person")} total={totalSteps} />
      {isSpanishProfile ? (
        <div className="signup-grid signup-grid--identity">
          <FormField error={errors.idDocument} id="signup-id" label={t("signup:person.idDniNie")}>
            <Input
              aria-invalid={errors.idDocument === undefined ? undefined : true}
              id="signup-id"
              onChange={(event) => {
                patchPerson("idDocument", {
                  ...draft.person.idDocument,
                  value: event.currentTarget.value,
                });
                if (event.currentTarget.value.trim() !== "") {
                  onChange({
                    ...draft,
                    passport: "",
                    person: {
                      ...draft.person,
                      idDocument: { ...draft.person.idDocument, value: event.currentTarget.value },
                    },
                  });
                }
              }}
              value={draft.person.idDocument.value}
            />
          </FormField>
          <FormField id="signup-passport" label={t("signup:person.passport")}>
            <Input
              disabled={draft.person.idDocument.value.trim() !== ""}
              id="signup-passport"
              onChange={(event) => {
                onChange({ ...draft, passport: event.currentTarget.value });
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
              <option value="PASSPORT">{t("signup:person.passportType")}</option>
              <option value="OTHER">{t("signup:person.otherType")}</option>
            </Select>
          </FormField>
          <FormField
            error={errors.idDocument}
            id="signup-id"
            label={t("signup:person.documentValue")}
          >
            <Input
              aria-invalid={errors.idDocument === undefined ? undefined : true}
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
          aria-invalid={errors.firstName === undefined ? undefined : true}
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
            aria-invalid={errors.lastName1 === undefined ? undefined : true}
            autoComplete="family-name"
            id="signup-last-name-1"
            onChange={(event) => {
              patchPerson("lastName1", event.currentTarget.value);
            }}
            value={draft.person.lastName1}
          />
        </FormField>
        <FormField id="signup-last-name-2" label={t("signup:person.lastName2")}>
          <Input
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
          aria-invalid={errors.birthDate === undefined ? undefined : true}
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
        className="signup-chips"
        aria-invalid={errors.gender === undefined ? undefined : true}
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
        {errors.gender === undefined ? null : <span role="alert">{errors.gender}</span>}
      </fieldset>
      <FormField error={errors.emails0} id="signup-email" label={t("signup:person.email")}>
        <Input
          aria-invalid={errors.emails0 === undefined ? undefined : true}
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
          aria-invalid={errors.emails1 === undefined ? undefined : true}
          id="signup-second-email"
          onChange={(event) => {
            patchEmail(1, event.currentTarget.value);
          }}
          type="email"
          value={draft.person.emails[1] ?? ""}
        />
      </FormField>
      {[0, 1].map((index) => (
        <div className="signup-grid signup-grid--phone" key={index}>
          <FormField
            id={`signup-phone-prefix-${String(index)}`}
            label={t("signup:person.phonePrefix")}
          >
            <Select
              id={`signup-phone-prefix-${String(index)}`}
              onChange={(event) => {
                patchPhone(index, "prefix", event.currentTarget.value);
              }}
              value={draft.person.phones[index]?.prefix ?? profile.phonePrefix}
            >
              <option value={draft.person.phones[index]?.prefix ?? profile.phonePrefix}>
                {draft.person.phones[index]?.prefix ?? profile.phonePrefix}
              </option>
            </Select>
          </FormField>
          <FormField
            error={index === 0 ? errors.phones0 : undefined}
            id={`signup-phone-${String(index)}`}
            label={index === 0 ? t("signup:person.phone") : t("signup:person.secondPhone")}
          >
            <Input
              aria-invalid={index === 0 && errors.phones0 !== undefined ? true : undefined}
              id={`signup-phone-${String(index)}`}
              inputMode="tel"
              onChange={(event) => {
                patchPhone(index, "number", event.currentTarget.value);
              }}
              value={draft.person.phones[index]?.number ?? ""}
            />
          </FormField>
          <FormField
            error={index === 1 ? errors.phones1label : undefined}
            id={`signup-phone-label-${String(index)}`}
            label={t("signup:person.phoneDescription")}
          >
            <Input
              aria-invalid={index === 1 && errors.phones1label !== undefined ? true : undefined}
              id={`signup-phone-label-${String(index)}`}
              onChange={(event) => {
                patchPhone(index, "label", event.currentTarget.value);
              }}
              value={draft.person.phones[index]?.label ?? ""}
            />
          </FormField>
        </div>
      ))}
      <FormField error={errors.street} id="signup-street" label={t("signup:person.street")}>
        <Input
          aria-invalid={errors.street === undefined ? undefined : true}
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
            aria-invalid={errors.postalCode === undefined ? undefined : true}
            autoComplete="postal-code"
            id="signup-postal-code"
            onBlur={() => void lookupTowns()}
            onChange={(event) => {
              setTowns([]);
              patchAddress("postalCode", event.currentTarget.value);
            }}
            value={draft.person.address.postalCode}
          />
        </FormField>
        <FormField error={errors.town} id="signup-town" label={t("signup:person.town")}>
          {towns.length > 1 ? (
            <Select
              aria-invalid={errors.town === undefined ? undefined : true}
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
              aria-invalid={errors.town === undefined ? undefined : true}
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
      <aside className="signup-note signup-note--neutral">
        {t("signup:person.existingDogNote")}
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
      {message === undefined ? null : (
        <p className="signup-message signup-message--error" role="alert">
          {message}
        </p>
      )}
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
  totalSteps,
}: {
  addDog: boolean;
  client: ApiClient;
  config: SignupConfig;
  draft: SignupDraft;
  onChange: (next: SignupDraft) => void;
  onContinue: (path: string) => void;
  step: number;
  totalSteps: number;
}) {
  const { formatMoney } = useClubFormats();
  const { t } = useTranslation(["signup", "errors"]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const files = draft.dog.documents[0]?.files ?? [];

  const patchDog = <Key extends keyof SignupDog>(key: Key, value: SignupDog[Key]) => {
    onChange({ ...draft, dog: { ...draft.dog, [key]: value } });
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
        const put = await fetch(response.data.uploadUrl, {
          body: file,
          headers: { "Content-Type": file.type },
          method: "PUT",
        });
        if (!put.ok) throw new TypeError("Signed upload failed");
        uploaded.push({ fileKey: response.data.fileKey, name: proposed });
      }
      patchDog("documents", [{ files: [...files, ...uploaded], type: "VACCINATION_CARD" }]);
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
    for (const key of ["name", "breed", "chip"] as const) {
      if (draft.dog[key].trim() === "") next[key] = t("signup:common.required");
    }
    if (draft.dog.birthMonth.trim() === "") {
      next.birthMonth = t("signup:common.required");
    } else if (birthMonthToIso(draft.dog.birthMonth) === undefined) {
      next.birthMonth = t("signup:common.invalidMonth");
    }
    if (config.requireDogDocumentAtSignup && files.length === 0) {
      next.documents = t("errors:DOG_DOCUMENT_REQUIRED");
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onContinue(
      addDog
        ? "/gossos/nou/pagament"
        : config.steps.includes("FAMILY")
          ? "/apuntat-hi/familia"
          : "/apuntat-hi/pagament",
    );
  };

  return (
    <form className="signup-form" noValidate onSubmit={submit}>
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
            aria-invalid={errors.birthMonth === undefined ? undefined : true}
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
          id="signup-dog-chip"
          onChange={(event) => {
            patchDog("chip", event.currentTarget.value);
          }}
          value={draft.dog.chip}
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
          accept="application/pdf,image/*"
          aria-invalid={errors.documents === undefined ? undefined : true}
          className="signup-file-input"
          disabled={uploading}
          id="signup-dog-document"
          multiple
          onChange={(event) => void upload(event)}
          type="file"
        />
        {errors.documents === undefined ? null : (
          <div className="ah-form-field__error" role="alert">
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
      {!config.requireDogDocumentAtSignup ? (
        <aside className="signup-note signup-note--neutral">
          {t("signup:dog.optionalDocument")}
        </aside>
      ) : null}
      {config.texts.freeTrainingConditions === "" ? null : (
        <p className="signup-copy">{config.texts.freeTrainingConditions}</p>
      )}
      {config.texts.therapyIntro === "" ? null : (
        <p className="signup-copy">{config.texts.therapyIntro}</p>
      )}
      {config.plans.length === 0 ? null : (
        <section className="signup-plans" aria-labelledby="signup-plans-title">
          <h2 id="signup-plans-title">{t("signup:dog.planTitle")}</h2>
          <div className="signup-plans__grid">
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
                      onChange({ ...draft, planId: plan.id });
                    }}
                    type="button"
                  >
                    <span className="signup-plan__head">
                      <strong>{plan.name}</strong>
                      {plan.maintenanceFee !== undefined && plan.description !== undefined ? (
                        <small>{plan.description}</small>
                      ) : plan.price === undefined || plan.type === "PACK" ? null : (
                        <b>
                          {t("signup:dog.monthlyPrice", {
                            price: formatMoney(plan.price.amountMinor / 100),
                          })}
                        </b>
                      )}
                    </span>
                    {plan.type !== "PACK" || plan.price === undefined ? null : (
                      <small className="signup-plan__pack-price">
                        {t("signup:dog.packPrice", {
                          months: plan.pack?.months ?? 1,
                          price: formatMoney(plan.price.amountMinor / 100),
                        })}
                      </small>
                    )}
                    {plan.entryFee === undefined || plan.maintenanceFee !== undefined ? null : (
                      <small>
                        {t("signup:dog.entryFee", {
                          price: formatMoney(plan.entryFee.amountMinor / 100),
                        })}
                      </small>
                    )}
                    {plan.description === undefined || plan.maintenanceFee !== undefined ? null : (
                      <small>{plan.description}</small>
                    )}
                    {plan.conditions === undefined ? null : <small>{plan.conditions}</small>}
                    {plan.pack?.discountLabel === undefined ? null : (
                      <small>{plan.pack.discountLabel}</small>
                    )}
                    {plan.maintenanceFee === undefined || plan.entryFee === undefined ? null : (
                      <small>
                        {t("signup:dog.maintenance", {
                          entry: formatMoney(plan.entryFee.amountMinor / 100),
                          fee: formatMoney(plan.maintenanceFee.amountMinor / 100),
                        })}
                      </small>
                    )}
                    {plan.offerLabel === undefined ? null : <small>{plan.offerLabel}</small>}
                    {draft.planId === plan.id ? (
                      <span className="signup-plan__activate">{t("signup:dog.activate")}</span>
                    ) : null}
                  </button>
                </Card>
              );
            })}
          </div>
        </section>
      )}
      {message === undefined ? null : (
        <p className="signup-message signup-message--error" role="alert">
          {message}
        </p>
      )}
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
  onChange,
  onContinue,
  totalSteps,
}: {
  client: ApiClient;
  config: SignupConfig;
  draft: SignupDraft;
  onChange: (next: SignupDraft) => void;
  onContinue: (path: string) => void;
  totalSteps: number;
}) {
  const { formatMoney } = useClubFormats();
  const { t } = useTranslation("signup");
  const [lookup, setLookup] = useState<SignupFamilyLookup>();
  const [message, setMessage] = useState<string>();
  const [working, setWorking] = useState(false);
  const plan = config.plans.find((candidate) => candidate.id === draft.planId);

  const continueStep = async () => {
    const holderName = draft.familyClaim.holderName.trim();
    const dogName = draft.familyClaim.dogName.trim();
    setMessage(undefined);
    if (holderName === "" && dogName === "") {
      onChange({ ...draft, familyClaim: { dogName: "", holderName: "", leavePending: false } });
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
    } catch {
      setMessage(t("signup:common.genericError"));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="signup-form signup-family">
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
        <FormField id="signup-family-holder" label={t("signup:family.holderName")}>
          <Input
            id="signup-family-holder"
            onChange={(event) => {
              setLookup(undefined);
              onChange({
                ...draft,
                familyClaim: { ...draft.familyClaim, holderName: event.currentTarget.value },
              });
            }}
            value={draft.familyClaim.holderName}
          />
        </FormField>
        <FormField id="signup-family-dog" label={t("signup:family.holderDog")}>
          <Input
            id="signup-family-dog"
            onChange={(event) => {
              setLookup(undefined);
              onChange({
                ...draft,
                familyClaim: { ...draft.familyClaim, dogName: event.currentTarget.value },
              });
            }}
            value={draft.familyClaim.dogName}
          />
        </FormField>
      </section>
      {lookup?.result === "FOUND" ? (
        <aside className="signup-note signup-note--success" role="status">
          {t("signup:family.found", { holder: lookup.holderDisplayName ?? "" })}
        </aside>
      ) : lookup?.result === "NOT_FOUND" ? (
        <aside className="signup-note signup-note--danger" role="alert">
          {t("signup:family.notFound")}{" "}
          {config.allowFamilyGroupPending ? (
            <button
              onClick={() => {
                onChange({ ...draft, familyClaim: { ...draft.familyClaim, leavePending: true } });
                onContinue("/apuntat-hi/pagament");
              }}
              type="button"
            >
              {t("signup:family.leavePending")}
            </button>
          ) : null}
        </aside>
      ) : null}
      {message === undefined ? null : (
        <p className="signup-message signup-message--error" role="alert">
          {message}
        </p>
      )}
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

function PaymentStep({
  addDog,
  client,
  config,
  draft,
  onChange,
  onContinue,
  onReloadConfiguration,
  showCancellation,
  step,
  totalSteps,
}: {
  addDog: boolean;
  client: ApiClient;
  config: SignupConfig;
  draft: SignupDraft;
  onChange: (next: SignupDraft) => void;
  onContinue: (path: string) => void;
  onReloadConfiguration: () => void;
  showCancellation: boolean;
  step: number;
  totalSteps: number;
}) {
  const branding = useBranding();
  const { formatMoney } = useClubFormats();
  const { i18n, t } = useTranslation(["signup", "errors"]);
  const [imageOpen, setImageOpen] = useState(false);
  const [message, setMessage] = useState<string>();
  const [working, setWorking] = useState(false);
  const [website, setWebsite] = useState("");
  const paymentMethod = config.paymentMethods.find((method) => method.type === draft.payment.type);
  const billing = branding.modules.includes("BILLING");
  const needsConsents = !addDog || config.member?.consentsUpToDate === false;
  const stripe = config.paymentMethods.some((method) => method.type === "CARD");
  const manualInstructions = config.paymentMethods.find(
    (method) => method.type === "MANUAL",
  )?.instructions;

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (needsConsents && !draft.privacyAccepted) return;
    setWorking(true);
    setMessage(undefined);
    const version = config.legal.legalTextsVersion;
    const consents = {
      imageUse: { granted: draft.imageConsent, version },
      privacyPolicy: { accepted: draft.privacyAccepted, version },
    };
    try {
      const dog = {
        ...draft.dog,
        birthMonth: birthMonthToIso(draft.dog.birthMonth) ?? draft.dog.birthMonth,
        documents: draft.dog.documents,
      };
      if (addDog) {
        const memberResult = await client.POST("/me/dogs/signup", {
          body: {
            dog,
            documents: dog.documents,
            planIdRequested: draft.planId,
            ...(needsConsents ? { consents } : {}),
          },
        });
        if (memberResult.data === undefined) throw new TypeError("Missing dog-signup response");
        safeSessionRemove(DRAFT_KEY);
        onContinue("/apuntat-hi/enviada");
        return;
      }
      const result = await client.POST("/signup", {
        body: {
          consents,
          dog,
          ...(draft.familyClaim.holderName === "" ? {} : { familyGroupClaim: draft.familyClaim }),
          locale: i18n.resolvedLanguage ?? branding.defaultLocale,
          ...(billing ? { payment: draft.payment } : {}),
          person: {
            ...draft.person,
            birthDate: birthDateToIso(draft.person.birthDate) ?? draft.person.birthDate,
            gender: draft.person.gender || "OTHER",
          },
          planId: draft.planId === "" ? null : draft.planId,
          website,
        },
      });
      if (result.data === undefined) throw new TypeError("Missing signup response");
      safeSessionRemove(DRAFT_KEY);
      if (result.data.checkout.required) {
        sessionStorage.setItem(CHECKOUT_KEY, "1");
        const checkout = await client.POST("/checkout-sessions", {
          body: {
            cancelUrl: `${window.location.origin}/apuntat-hi/enviada?cs=cancel`,
            memberId: result.data.memberId,
            signupToken: result.data.signupToken,
            successUrl: `${window.location.origin}/apuntat-hi/enviada?cs=success`,
          },
        });
        if (checkout.data === undefined) throw new TypeError("Missing checkout response");
        onContinue(checkout.data.checkoutUrl);
      } else {
        onContinue("/apuntat-hi/enviada");
      }
    } catch (error) {
      if (isApiError(error, "CONSENT_VERSION_OUTDATED")) {
        onChange({ ...draft, privacyAccepted: false });
        onReloadConfiguration();
        setMessage(t("signup:payment.consentOutdated"));
      } else if (isApiError(error) && error.status === 429) {
        setMessage(t("signup:common.rateLimited", { seconds: error.retryAfter ?? 60 }));
      } else if (isApiError(error, "SIGNUP_CLOSED")) {
        setMessage(t("errors:SIGNUP_CLOSED"));
      } else if (isApiError(error, "SIGNUP_ALREADY_PENDING")) {
        setMessage(t("errors:SIGNUP_ALREADY_PENDING"));
      } else if (isApiError(error, "DOG_CHIP_ALREADY_REGISTERED")) {
        setMessage(t("errors:DOG_CHIP_ALREADY_REGISTERED"));
      } else {
        setMessage(t("signup:common.genericError"));
      }
      setWorking(false);
    }
  };

  return (
    <form
      className="signup-form signup-payment"
      noValidate
      onSubmit={(event) => void submit(event)}
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
                value={config.member?.paymentMethodMasked ?? ""}
              />
            </FormField>
          ) : (
            <>
              <div
                className="signup-segment"
                role="group"
                aria-label={t("signup:payment.monthlyTitle")}
              >
                {config.paymentMethods.map((method) => (
                  <button
                    aria-pressed={draft.payment.type === method.type}
                    key={method.type}
                    onClick={() => {
                      onChange({ ...draft, payment: { ...draft.payment, type: method.type } });
                    }}
                    type="button"
                  >
                    {method.label}
                  </button>
                ))}
              </div>
              {draft.payment.type === "SEPA_DD" ? (
                <>
                  <FormField id="signup-iban" label={t("signup:payment.iban")}>
                    <Input
                      id="signup-iban"
                      onChange={(event) => {
                        onChange({
                          ...draft,
                          payment: { ...draft.payment, iban: event.currentTarget.value },
                        });
                      }}
                      value={draft.payment.iban ?? ""}
                    />
                  </FormField>
                  <FormField id="signup-account-holder" label={t("signup:payment.accountHolder")}>
                    <Input
                      id="signup-account-holder"
                      onChange={(event) => {
                        onChange({
                          ...draft,
                          payment: { ...draft.payment, holderName: event.currentTarget.value },
                        });
                      }}
                      value={draft.payment.holderName ?? ""}
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
                <>
                  <aside className="signup-note signup-note--neutral">
                    {t("signup:payment.cardSecure")}
                  </aside>
                  <aside className="signup-note signup-note--neutral">
                    {config.texts.paymentDay}
                  </aside>
                </>
              ) : (
                <aside className="signup-note signup-note--neutral">
                  {config.texts.cashConditions}
                </aside>
              )}
            </>
          )}
        </section>
      ) : null}
      {billing && config.upfront !== undefined ? (
        <Card className="signup-upfront">
          <h2>{t("signup:payment.initialTitle")}</h2>
          {config.upfront.lines.map((line) => (
            <p className="signup-upfront__line" key={line.type}>
              <span>{line.label}</span>
              <strong>{formatMoney(line.amount.amountMinor / 100)}</strong>
            </p>
          ))}
          {config.upfront.firstMonthOptions.length === 0 ? null : (
            <fieldset className="signup-upfront__options">
              <legend>{t("signup:payment.chooseStart")}</legend>
              {config.upfront.firstMonthOptions.map((option) => (
                <label key={option.option}>
                  <input
                    checked={draft.payment.firstMonthOption === option.option}
                    name="signup-start"
                    onChange={() => {
                      onChange({
                        ...draft,
                        payment: { ...draft.payment, firstMonthOption: option.option },
                      });
                    }}
                    type="radio"
                  />
                  <span>{option.label}</span>
                  <strong>{formatMoney(option.amountDue.amountMinor / 100)}</strong>
                </label>
              ))}
            </fieldset>
          )}
          <div className="signup-upfront__total">
            <strong>{t("signup:payment.total")}</strong>
            <b>{formatMoney(config.upfront.totalDue.amountMinor / 100)}</b>
          </div>
          <p>{stripe ? t("signup:payment.stripeSubmit") : manualInstructions}</p>
        </Card>
      ) : null}
      {needsConsents ? (
        <section className="signup-consents">
          <div className="signup-consent">
            <Checkbox
              checked={draft.privacyAccepted}
              id="signup-privacy"
              onChange={(event) => {
                onChange({ ...draft, privacyAccepted: event.currentTarget.checked });
              }}
            />
            <label htmlFor="signup-privacy">{t("signup:payment.privacy")}</label>
            <a href={config.legal.privacyPolicyUrl} rel="noreferrer" target="_blank">
              {t("signup:payment.privacyLink")}
            </a>
          </div>
          <div className="signup-consent">
            <Checkbox
              checked={draft.imageConsent}
              id="signup-image-consent"
              onChange={(event) => {
                onChange({ ...draft, imageConsent: event.currentTarget.checked });
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
            <aside className="signup-note signup-note--neutral">
              {config.legal.imageConsentText}
            </aside>
          ) : null}
        </section>
      ) : null}
      <label className="signup-honeypot" htmlFor="signup-website">
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
      {message === undefined ? null : (
        <p className="signup-message signup-message--error" role="alert">
          {message}
        </p>
      )}
      <Button
        className="signup-primary"
        disabled={working || (needsConsents && !draft.privacyAccepted)}
        loading={working}
        loadingLabel={t("signup:payment.submitting")}
        type="submit"
      >
        {t("signup:payment.submit")}
      </Button>
      <p className="signup-copy signup-copy--center">{t("signup:payment.reviewFooter")}</p>
    </form>
  );
}

function SuccessStep() {
  const { t } = useTranslation("signup");
  const checkout =
    sessionStorage.getItem(CHECKOUT_KEY) === "1" ||
    new URLSearchParams(window.location.search).get("cs") === "success";
  useEffect(() => {
    safeSessionRemove(DRAFT_KEY);
    safeSessionRemove(CHECKOUT_KEY);
  }, []);
  return (
    <section className="signup-success">
      <span aria-hidden="true">✓</span>
      <h2>{t("signup:success.title")}</h2>
      <p>{t("signup:payment.reviewFooter")}</p>
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
  const { i18n, t } = useTranslation("signup");
  const cancelled = new URLSearchParams(window.location.search).get("cs") === "cancel";
  const initialPath =
    cancelled && window.location.pathname === "/apuntat-hi/enviada"
      ? addDog
        ? "/gossos/nou/pagament"
        : "/apuntat-hi/pagament"
      : window.location.pathname;
  const [path, setPath] = useState(initialPath);
  const [draft, setDraft] = useState(() => readDraft(addDog, profile.phonePrefix));
  const [config, setConfig] = useState<SignupConfig>();
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
    } catch {
      // Signup still works when storage is unavailable.
    }
  }, [draft]);

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
        setDraft((current) => {
          const planId =
            current.planId === ""
              ? addDog
                ? (data.member?.planId ?? data.plans[0]?.id ?? "")
                : (data.plans[0]?.id ?? "")
              : current.planId;
          const method = data.paymentMethods.some(
            (candidate) => candidate.type === current.payment.type,
          )
            ? current.payment.type
            : data.paymentMethods[0]?.type;
          const holderName =
            (current.payment.holderName?.trim() ?? "") === ""
              ? addDog
                ? data.member?.fullName
                : [current.person.firstName, current.person.lastName1, current.person.lastName2]
                    .filter((part) => part !== "")
                    .join(" ")
              : current.payment.holderName;
          return {
            ...current,
            payment: {
              ...current.payment,
              ...(method === undefined ? {} : { type: method }),
              ...(holderName === undefined ? {} : { holderName }),
            },
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
  }, [addDog, client, i18n.resolvedLanguage, reload]);

  const go = (nextPath: string) => {
    setPath(nextPath);
    onNavigate(nextPath);
  };

  if (path === "/apuntat-hi/enviada" && !cancelled) {
    return (
      <Layout>
        <SuccessStep />
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

  if (!config.enabled || branding.status !== "ACTIVE") {
    return (
      <Layout>
        <p className="signup-state">{config.closedText}</p>
      </Layout>
    );
  }

  const steps = addDog ? (["DOG", "PAYMENT"] as const) : config.steps;
  const totalSteps = steps.length;
  const dogStep = addDog ? 1 : 2;
  const paymentStep = totalSteps;

  return (
    <Layout>
      {path === "/apuntat-hi" ? (
        <PersonStep
          client={client}
          draft={draft}
          onChange={setDraft}
          onContinue={go}
          totalSteps={totalSteps}
        />
      ) : path === "/apuntat-hi/gos" || path === "/gossos/nou" ? (
        <DogStep
          addDog={addDog}
          client={client}
          config={config}
          draft={draft}
          onChange={setDraft}
          onContinue={go}
          step={dogStep}
          totalSteps={totalSteps}
        />
      ) : path === "/apuntat-hi/familia" && !addDog ? (
        <FamilyStep
          client={client}
          config={config}
          draft={draft}
          onChange={setDraft}
          onContinue={go}
          totalSteps={totalSteps}
        />
      ) : (
        <PaymentStep
          addDog={addDog}
          client={client}
          config={config}
          draft={draft}
          onChange={setDraft}
          onContinue={go}
          onReloadConfiguration={() => {
            setReload((current) => current + 1);
          }}
          showCancellation={cancelled}
          step={paymentStep}
          totalSteps={totalSteps}
        />
      )}
    </Layout>
  );
}
