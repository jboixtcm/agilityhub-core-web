import {
  type ApiClient,
  apiFieldErrors,
  type components,
  isApiError,
  isInProgress,
} from "@agilityhub/api-client";
import { createClubFormats, type Locale, productLocales } from "@agilityhub/i18n";
import { Badge, Button, Card, Chip, FormField, Input, type Tone } from "@agilityhub/ui";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type PlatformClub = components["schemas"]["PlatformClub"];
export type PlatformClubListItem = components["schemas"]["PlatformClubListItem"];
export type OnboardingChecklist = components["schemas"]["OnboardingChecklist"];
export type ClubModule = PlatformClub["modules"][number];
export type ClubStatus = PlatformClub["status"];
export type ConsoleNavigate = (path: string) => void;
type Translate = ReturnType<typeof useTranslation>["t"];

/**
 * S17 §2 row «D19 Fitxa»: the record's tabs, in the spec's order, by their route segment
 * («Dominis» and «Paràmetres» since E10-W03, on E10-T04's domain routes and club parameters read).
 */
export const CONSOLE_TABS = [
  "identitat",
  "localitzacio",
  "dominis",
  "tema",
  "moduls",
  "pagaments",
  "legal",
  "parametres",
  "catalegs",
  "equip",
  "processos",
  "auditoria",
  "us",
  "estat",
] as const;

export type ConsoleTab = (typeof CONSOLE_TABS)[number];

export function isConsoleTab(value: string | undefined): value is ConsoleTab {
  return (CONSOLE_TABS as readonly string[]).includes(value ?? "");
}

/** R-17-06: the checklist's seven model keys, in the spec's order. */
export const CHECKLIST_KEYS = [
  "dns",
  "sepa",
  "branding",
  "templates",
  "faq",
  "legal",
  "firstAdmin",
] as const satisfies readonly (keyof OnboardingChecklist)[];

export const CLUB_STATUSES = [
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
] as const satisfies readonly ClubStatus[];

/** `PlatformClub.modules` of the snapshot, in CATALEG_MODULS order. */
export const CONSOLE_MODULES = [
  "FREE_TRAINING",
  "BILLING",
  "PACKS",
  "SINGLE_CLASS",
  "ACTIVITIES",
  "FAMILY_GROUP",
  "WAITLIST",
  "TASKS",
  "FAQ",
  "SMS",
  "PUSH",
  "INACTIVITY",
  "COURSES",
  "LEARN_LINK",
  "STATS",
  "SOCIAL_LEAGUE",
] as const satisfies readonly ClubModule[];

/** `PlatformClubPatch`'s patterns: the country profiles and the product locales a club may use. */
export const COUNTRY_PROFILES = ["ES", "GENERIC"] as const;
export const CLUB_LOCALES = productLocales;

export function statusTone(status: ClubStatus | undefined): Tone {
  return status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "danger" : "warning";
}

export function StatusBadge({ status }: { status: ClubStatus | undefined }) {
  const { t } = useTranslation("console");
  return status === undefined ? null : (
    <Badge tone={statusTone(status)}>{t(`console:status.${status}`)}</Badge>
  );
}

export function checklistDone(checklist: OnboardingChecklist | undefined): number {
  return checklist === undefined ? 0 : CHECKLIST_KEYS.filter((key) => checklist[key]).length;
}

export function checklistMissing(checklist: OnboardingChecklist | undefined): string[] {
  return checklist === undefined ? [] : CHECKLIST_KEYS.filter((key) => !checklist[key]);
}

/** R-17-06's summary: «5/7 · falten: dns, faq», with the items' own labels. */
export function ChecklistSummary({ checklist }: { checklist: OnboardingChecklist | undefined }) {
  const { t } = useTranslation("console");
  if (checklist === undefined) return null;
  const missing = checklistMissing(checklist);
  return (
    <span className="console-checklist-summary">
      <strong>{t("console:checklist.count", { done: checklistDone(checklist), total: 7 })}</strong>
      {missing.length === 0 ? null : (
        <span className="console-checklist-summary__missing">
          <span aria-hidden="true" className="console-checklist-summary__dot">
            {" · "}
          </span>
          {t("console:checklist.missing", {
            items: missing.map((key) => t(`console:checklist.items.${key}`)).join(", "),
          })}
        </span>
      )}
    </span>
  );
}

/** The list's module chips: the first ones, then «+k» naming the rest (the cell keeps its width). */
export const MODULE_CHIPS_SHOWN = 3;

export function ModuleChips({ modules }: { modules: readonly string[] | undefined }) {
  const { t } = useTranslation("console");
  if (modules === undefined || modules.length === 0) {
    return <span className="console-muted">{t("console:list.noModules")}</span>;
  }
  const ordered = inCatalogOrder(modules, CONSOLE_MODULES);
  const label = (module: string) => t(`console:modules.${module}.label`);
  const rest = ordered.slice(MODULE_CHIPS_SHOWN);
  return (
    <span className="console-chips">
      {ordered.slice(0, MODULE_CHIPS_SHOWN).map((module) => (
        <Chip key={module}>{label(module)}</Chip>
      ))}
      {rest.length === 0 ? null : (
        <Chip
          aria-label={t("console:list.moreModulesLabel", {
            count: rest.length,
            modules: rest.map(label).join(", "),
          })}
          className="console-chips__more"
          role="img"
          title={rest.map(label).join(", ")}
        >
          {t("console:list.moreModules", { count: rest.length })}
        </Chip>
      )}
    </span>
  );
}

function asLocale(value: string | undefined): Locale {
  return productLocales.find((locale) => locale === value) ?? "ca";
}

/**
 * The formats of one club (its own time zone and currency, never the device's or the product
 * host's): the console lists clubs of several zones (S02 §3, «Time» of the review checklist).
 */
export function useConsoleFormats(timeZone: string | undefined, currency = "EUR") {
  const { i18n } = useTranslation();
  const locale = asLocale(i18n.resolvedLanguage ?? i18n.language);
  return useMemo(
    () => createClubFormats(locale, timeZone ?? "UTC", currency),
    [currency, locale, timeZone],
  );
}

export function formatClubDateTime(
  value: string | null | undefined,
  timeZone: string | undefined,
  locale: string | undefined,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return createClubFormats(asLocale(locale), timeZone ?? "UTC", "EUR").formatDateTime(value);
}

/** «1,2 GB»: storage in the reader's locale (binary units, as the api counts bytes). */
export function formatBytes(bytes: number | undefined, locale: string | undefined): string {
  if (bytes === undefined) return "";
  const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(asLocale(locale), {
    maximumFractionDigits: unit === 0 ? 0 : 1,
    style: "unit",
    unit: units[unit] ?? "byte",
    unitDisplay: "short",
  }).format(value);
}

export function formatCount(value: number | undefined, locale: string | undefined): string {
  return value === undefined ? "" : new Intl.NumberFormat(asLocale(locale)).format(value);
}

/**
 * Message of an api error by its `code` (never its `message`, CONVENCIONS_API §6), with the
 * details the console's codes carry: `MODULE_DEPENDENCY {module, requires}`, `PROVIDER_IN_USE
 * {count}`, `CATALOG_NOT_EMPTY {part}`, `FILE_TOO_LARGE {maxSizeMb}`.
 */
export function consoleErrorMessage(t: Translate, error: unknown): string {
  if (isInProgress(error)) return t("common:inProgress");
  if (!isApiError(error)) return t("console:errors.generic");
  const details =
    typeof error.details === "object" && error.details !== null
      ? (error.details as Record<string, unknown>)
      : {};
  if (error.code === "STALE_VERSION") return t("console:errors.stale");
  if (
    error.code === "MODULE_DEPENDENCY" &&
    typeof details.module === "string" &&
    typeof details.requires === "string"
  ) {
    return t("console:errors.moduleDependency", {
      module: t(`console:modules.${details.module}.label`, { defaultValue: details.module }),
      requires: t(`console:modules.${details.requires}.label`, { defaultValue: details.requires }),
    });
  }
  if (error.code === "PROVIDER_IN_USE" && typeof details.count === "number") {
    return t("console:errors.providerInUse", { count: details.count });
  }
  if (error.code === "CATALOG_NOT_EMPTY" && typeof details.part === "string") {
    return t("console:errors.catalogNotEmpty", {
      part: t(`console:catalogs.parts.${details.part}`, { defaultValue: details.part }),
    });
  }
  if (error.code === "FILE_TOO_LARGE" && typeof details.maxSizeMb === "number") {
    return t("console:errors.fileTooLarge", { maxSizeMb: details.maxSizeMb });
  }
  // S17 §6 (E123): the primary domain of its app is removed only once another one is primary.
  if (error.code === "INVALID_STATE" && details.primary === true) {
    return t("console:errors.primaryDomain");
  }
  // R-17-03: `{status}` of a domain that is not (or is already) VERIFIED.
  if (error.code === "INVALID_STATE" && typeof details.status === "string") {
    return t("console:errors.domainState", {
      status: t(`console:domains.status.${details.status}`, { defaultValue: details.status }),
    });
  }
  return t(`errors:${error.code}`, { defaultValue: t("console:errors.generic") });
}

export function useConsoleError() {
  const { t } = useTranslation(["console", "errors", "common"]);
  return useCallback((error: unknown) => consoleErrorMessage(t, error), [t]);
}

/**
 * `details.fieldErrors[{field, code}]` (and the single `details.field`) by the form's own field
 * name (CONVENCIONS_API §6): `prefix` strips the request's path (`club.` of a definition) and
 * `aliases` maps an api path to the form field that edits it.
 */
export function fieldErrorMap(
  t: Translate,
  error: unknown,
  {
    aliases = {},
    prefix = "",
  }: { aliases?: Readonly<Record<string, string>>; prefix?: string } = {},
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of apiFieldErrors(error)) {
    const path =
      prefix !== "" && entry.field.startsWith(prefix)
        ? entry.field.slice(prefix.length)
        : entry.field;
    const field = aliases[path] ?? path;
    map[field] ??=
      entry.code === "REQUIRED" || entry.code === "INVALID_VALUE"
        ? t(`console:fieldErrors.${entry.code}`)
        : t(`errors:${entry.code}`, { defaultValue: t("console:fieldErrors.INVALID_VALUE") });
  }
  return map;
}

/** A refusal's message for the whole form, unless its fields already say it. */
export function formErrorMessage(t: Translate, error: unknown, fields: Record<string, string>) {
  return Object.keys(fields).length > 0 && isApiError(error, "VALIDATION_ERROR")
    ? t("errors:VALIDATION_ERROR")
    : consoleErrorMessage(t, error);
}

/**
 * A form over a versioned record (S17 §6 `version`). The draft starts from the record; when the
 * record is read again (after `STALE_VERSION`, or another tab's write), the fresh values replace
 * the draft except the fields the user changed, which are kept on top (optimistic locking: a fresh
 * `version` is never sent with stale values, and the user's own edits are never lost).
 */
export function useRebasedDraft<Values extends Record<string, unknown>>(
  source: Values,
  sourceKey: string,
) {
  const [state, setState] = useState(() => ({ base: source, draft: source, key: sourceKey }));
  if (state.key !== sourceKey) {
    const edited = Object.fromEntries(
      Object.keys(state.draft)
        .filter((field) => !sameValue(state.draft[field], state.base[field]))
        .map((field) => [field, state.draft[field]]),
    );
    setState({ base: source, draft: { ...source, ...edited }, key: sourceKey });
  }
  const setField = useCallback(<Field extends keyof Values>(field: Field, value: Values[Field]) => {
    setState((current) => ({ ...current, draft: { ...current.draft, [field]: value } }));
  }, []);
  const changed = (Object.keys(state.draft) as (keyof Values)[]).filter(
    (field) => !sameValue(state.draft[field], state.base[field]),
  );
  return {
    base: state.base,
    changed,
    draft: state.draft,
    reset: () => {
      setState((current) => ({ ...current, draft: current.base }));
    },
    setField,
  };
}

/**
 * A set (`modules`, `locales`) in its catalog's order, unknown values last: the order the api
 * answers in never makes a form dirty, and toggling a value on and off leaves it clean.
 */
export function inCatalogOrder<Value extends string>(
  values: readonly Value[],
  catalog: readonly string[],
): Value[] {
  const rank = (value: string) => {
    const index = catalog.indexOf(value);
    return index === -1 ? catalog.length : index;
  };
  return [...values].sort((left, right) => rank(left) - rank(right));
}

export function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * One write of a tab: its pending state (the action is disabled meanwhile), its refusal (shown in
 * the tab, where the user is) and its success. A `409 STALE_VERSION` reads the record again
 * (`onStale`): the form rebases the user's edits on it (`useRebasedDraft`) and says so.
 */
export function useWriteState() {
  const [state, setState] = useState<{ done: boolean; error?: unknown; pending: boolean }>({
    done: false,
    pending: false,
  });
  const run = useCallback(
    async <Result,>(
      write: () => Promise<Result>,
      onStale?: () => Promise<unknown>,
    ): Promise<Result | undefined> => {
      setState({ done: false, pending: true });
      try {
        const result = await write();
        setState({ done: true, pending: false });
        return result;
      } catch (error) {
        setState({ done: false, error, pending: false });
        if (isApiError(error, "STALE_VERSION") && onStale !== undefined) await onStale();
        return undefined;
      }
    },
    [],
  );
  const clear = useCallback(() => {
    setState({ done: false, pending: false });
  }, []);
  return { ...state, clear, run };
}

/** `GET /platform/clubs/{id}`: the record every tab reads; a write's answer or a reread replaces it. */
export function usePlatformClub(client: ApiClient, id: string) {
  const [state, setState] = useState<{ club?: PlatformClub; error?: unknown; loading: boolean }>({
    loading: true,
  });
  const request = useRef(0);
  const load = useCallback(async () => {
    request.current += 1;
    const current = request.current;
    setState((previous) => ({ ...previous, loading: true }));
    try {
      const result = await client.GET("/platform/clubs/{id}", { params: { path: { id } } });
      if (result.data === undefined) throw new TypeError("Platform club without data");
      if (current === request.current) setState({ club: result.data, loading: false });
      return result.data;
    } catch (error) {
      if (current === request.current)
        setState((previous) => ({ ...previous, error, loading: false }));
      return undefined;
    }
  }, [client, id]);
  useEffect(() => {
    void load();
  }, [load]);
  const replace = useCallback((club: PlatformClub) => {
    request.current += 1;
    setState({ club, loading: false });
  }, []);
  return { ...state, reload: load, replace };
}

/** A labelled text input whose api field error shows under it (CONVENCIONS_API §6). */
export function TextField({
  autoComplete,
  error,
  help,
  id,
  label,
  onChange,
  placeholder,
  required = false,
  type = "text",
  value,
}: {
  autoComplete?: string;
  error?: string | undefined;
  help?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "email" | "password" | "tel" | "text" | "url";
  value: string;
}) {
  return (
    <FormField
      id={id}
      label={label}
      {...(error === undefined ? {} : { error })}
      {...(help === undefined ? {} : { help })}
    >
      <Input
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        aria-invalid={error === undefined ? undefined : true}
        {...(autoComplete === undefined ? {} : { autoComplete })}
        id={id}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        {...(placeholder === undefined ? {} : { placeholder })}
        required={required}
        type={type}
        value={value}
      />
    </FormField>
  );
}

/** `""` is «no value» in a form; the api's nullable strings take `null` (S02 §3). */
export function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function SectionCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <Card className="console-card">
      <h2>{title}</h2>
      {description === undefined ? null : <p className="console-muted">{description}</p>}
      {children}
    </Card>
  );
}

export function FormMessage({
  message,
  tone,
}: {
  message: string | undefined;
  tone: "danger" | "success";
}) {
  return message === undefined ? null : (
    <p
      className={`console-message console-message--${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation(["console", "errors", "common"]);
  return (
    <Card className="console-card" role="alert">
      <p>{consoleErrorMessage(t, error)}</p>
      <Button onClick={onRetry} variant="secondary">
        {t("console:common.retry")}
      </Button>
    </Card>
  );
}
