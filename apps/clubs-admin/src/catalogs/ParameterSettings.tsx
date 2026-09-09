import type { ApiClient, components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Button,
  Card,
  Drawer,
  FormField,
  Icon,
  IconButton,
  Input,
  Select,
  Skeleton,
  Switch,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { Fragment, type SyntheticEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { LastChange } from "../audit/LastChange";

import { ClubPagesCard } from "./ClubPagesCard";
import { buildDerivedSettingRows, type DerivedSettingRow } from "./derived-settings";
import { LocaleTabs, LoadFailure, useCatalogError } from "./shared";

type ClubSettings = components["schemas"]["ClubSettings"];
type Holiday = components["schemas"]["Holiday"];
type Level = components["schemas"]["Level"];
type Parameter = components["schemas"]["Parameter"];
type ParameterHistoryEntry = components["schemas"]["ParameterHistoryEntry"];
type Parameters = components["schemas"]["Parameters"];
type Plan = components["schemas"]["Plan"];

const dayKeys = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

type LocalTimeRange = components["schemas"]["LocalTimeRange"];
type OpeningHours = Record<string, LocalTimeRange>;
type Translate = ReturnType<typeof useTranslation>["t"];

interface HistoryItem extends ParameterHistoryEntry {
  key: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function localizedValue(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(objectValue(value)).flatMap(([key, item]) =>
      typeof item === "string" ? [[key, item]] : [],
    ),
  );
}

function parameterType(type: string): string {
  return type.replaceAll("_", "").replaceAll("-", "").toLocaleLowerCase();
}

function constraintNumber(parameter: Parameter, key: string): number | undefined {
  const value = parameter.constraints[key];
  return typeof value === "number" ? value : undefined;
}

function enumValues(parameter: Parameter): string[] {
  for (const key of ["values", "options", "enum"]) {
    const value = parameter.constraints[key];
    if (Array.isArray(value)) {
      return value.flatMap((item) => (typeof item === "string" ? [item] : []));
    }
  }
  return typeof parameter.value === "string" ? [parameter.value] : [];
}

function isOpeningHours(value: unknown): value is OpeningHours {
  return Object.values(objectValue(value)).every((range) => {
    const item = objectValue(range);
    return typeof item.open === "string" && typeof item.close === "string";
  });
}

function holidaysValue(value: unknown): Holiday[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = objectValue(item);
    return typeof record.date === "string" && typeof record.label === "string"
      ? [{ date: record.date, label: record.label }]
      : [];
  });
}

function parameterLabel(t: Translate, key: string): string {
  return t(`admin-settings:param.${key}.label`);
}

function parameterHelp(t: Translate, key: string): string {
  return t(`admin-settings:param.${key}.help`);
}

function enumLabel(t: Translate, key: string, value: string): string {
  return t(`admin-settings:enum.${key}.${value}`, { defaultValue: value });
}

function openingHoursSummary(value: unknown, t: Translate): string {
  if (!isOpeningHours(value)) {
    return t("admin-settings:value.closed");
  }
  const entries = dayKeys.flatMap((day) =>
    value[day] === undefined ? [] : ([[day, value[day]]] as const),
  );
  if (entries.length === 0) {
    return t("admin-settings:value.closed");
  }
  const first = entries[0]?.[1];
  const sameRange =
    first !== undefined &&
    entries.every(([, range]) => range.open === first.open && range.close === first.close);
  if (entries.length === dayKeys.length && sameRange) {
    return t("admin-settings:value.everyDayHours", { close: first.close, open: first.open });
  }
  return entries
    .map(([day, range]) =>
      t("admin-settings:value.dayHours", {
        close: range.close,
        day: t(`admin-settings:days.short.${day}`),
        open: range.open,
      }),
    )
    .join(" · ");
}

function valueSummary(
  parameter: Parameter,
  locale: string,
  formats: ReturnType<typeof useClubFormats>,
  t: Translate,
): string {
  const value = parameter.value;
  const type = parameterType(parameter.type);
  if (parameter.key === "club.openingHours") {
    return openingHoursSummary(value, t);
  }
  if (parameter.key === "club.holidays") {
    const count = holidaysValue(value).length;
    return count === 0
      ? t("admin-settings:value.noHolidays")
      : t("admin-settings:value.holidayCount", { count });
  }
  if (parameter.key === "bookings.weekOpensAt") {
    const item = objectValue(value);
    if (typeof item.dayOfWeek === "string" && typeof item.time === "string") {
      return t("admin-settings:value.weekOpensAt", {
        day: t(`admin-settings:days.long.${item.dayOfWeek}`),
        time: item.time,
      });
    }
  }
  if (parameter.key === "training.bookingWindowDays" && typeof value === "number") {
    return t("admin-settings:value.todayPlusDays", { count: value });
  }
  if (parameter.key === "bookings.showInstructorHoursBefore" && typeof value === "number") {
    return value === 0
      ? t("admin-settings:value.always")
      : value === 24
        ? t("admin-settings:value.dayBefore")
        : formats.formatDuration(value * 60, { before: true });
  }
  if (parameter.key === "coverage.thresholds") {
    const thresholds = objectValue(value);
    if (
      typeof thresholds.ok === "number" &&
      typeof thresholds.tight === "number" &&
      typeof thresholds.short === "number"
    ) {
      return t("admin-settings:value.coverageSummary", {
        ok: thresholds.ok,
        short: thresholds.short,
        tight: thresholds.tight,
      });
    }
  }
  if (parameter.key === "billing.invoiceSeriesPattern" && typeof value === "string") {
    return t("admin-settings:value.invoiceSeries", {
      year: value.replace("{YYYY}", String(new Date().getFullYear())),
    });
  }
  if (type === "duration" && typeof value === "number") {
    return formats.formatDuration(value, { before: parameter.constraints.before === true });
  }
  if (type === "money") {
    const item = objectValue(value);
    return typeof item.amountMinor === "number"
      ? formats.formatMoney(item.amountMinor / 100)
      : t("admin-settings:value.notConfigured");
  }
  if (["bool", "boolean"].includes(type) && typeof value === "boolean") {
    return value ? t("admin-settings:value.yes") : t("admin-settings:value.no");
  }
  if (type === "enum" && typeof value === "string") {
    return enumLabel(t, parameter.key, value);
  }
  if (["localizedtext", "text"].includes(type)) {
    const values = localizedValue(value);
    return values[locale] ?? Object.values(values)[0] ?? t("admin-settings:value.notConfigured");
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? t("admin-settings:value.notConfigured")
      : value
          .map((item) => {
            if (typeof item === "number") {
              return formats.formatDuration(item);
            }
            if (typeof item === "string") {
              return item;
            }
            const record = objectValue(item);
            const labels = localizedValue(record.label);
            return (
              labels[locale] ??
              (typeof record.label === "string" ? record.label : undefined) ??
              JSON.stringify(item)
            );
          })
          .join(" · ");
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([key, item]) => `${key} ${String(item)}`)
      .join(" · ");
  }
  if (value === undefined || value === null) {
    return t("admin-settings:value.notConfigured");
  }
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : t("admin-settings:value.notConfigured");
}

function validateOpeningHours(value: OpeningHours): boolean {
  return Object.values(value).every(({ close, open }) => {
    const [openHour = -1, openMinute = -1] = open.split(":").map(Number);
    const [closeHour = -1, closeMinute = -1] = close.split(":").map(Number);
    const openTotal = openHour * 60 + openMinute;
    const closeTotal = closeHour * 60 + closeMinute;
    return openMinute % 5 === 0 && closeMinute % 5 === 0 && openTotal < closeTotal;
  });
}

function ParameterControl({
  draft,
  jsonText,
  locale,
  onDraftChange,
  onJsonTextChange,
  onLocaleChange,
  parameter,
}: {
  draft: unknown;
  jsonText: string;
  locale: string;
  onDraftChange: (value: unknown) => void;
  onJsonTextChange: (value: string) => void;
  onLocaleChange: (locale: string) => void;
  parameter: Parameter;
}) {
  const branding = useBranding();
  const { t } = useTranslation("admin-settings");
  const label = parameterLabel(t, parameter.key);
  const type = parameterType(parameter.type);

  if (parameter.key === "club.openingHours") {
    const hours = isOpeningHours(draft) ? draft : {};
    return (
      <fieldset className="settings-editor__fieldset">
        <legend>{label}</legend>
        {dayKeys.map((day) => {
          const range = hours[day];
          const enabled = range !== undefined;
          return (
            <div className="settings-hours-row" key={day}>
              <Switch
                checked={enabled}
                label={t(`admin-settings:days.long.${day}`)}
                onCheckedChange={(checked) => {
                  const next = checked
                    ? { ...hours, [day]: { close: "22:00", open: "07:00" } }
                    : Object.fromEntries(Object.entries(hours).filter(([key]) => key !== day));
                  onDraftChange(next);
                }}
              />
              <span>{t(`admin-settings:days.long.${day}`)}</span>
              <Input
                aria-label={t("admin-settings:editor.opens", {
                  day: t(`admin-settings:days.long.${day}`),
                })}
                disabled={!enabled}
                onChange={(event) => {
                  onDraftChange({
                    ...hours,
                    [day]: { close: range?.close ?? "22:00", open: event.currentTarget.value },
                  });
                }}
                step={300}
                type="time"
                value={range?.open ?? "07:00"}
              />
              <Input
                aria-label={t("admin-settings:editor.closes", {
                  day: t(`admin-settings:days.long.${day}`),
                })}
                disabled={!enabled}
                onChange={(event) => {
                  onDraftChange({
                    ...hours,
                    [day]: { close: event.currentTarget.value, open: range?.open ?? "07:00" },
                  });
                }}
                step={300}
                type="time"
                value={range?.close ?? "22:00"}
              />
            </div>
          );
        })}
      </fieldset>
    );
  }

  if (parameter.key === "club.holidays") {
    const holidays = holidaysValue(draft);
    return (
      <fieldset className="settings-editor__fieldset">
        <legend>{label}</legend>
        <div className="settings-holidays">
          {holidays.length === 0 ? (
            <p>{t("admin-settings:editor.noHolidays")}</p>
          ) : (
            holidays.map((holiday, index) => (
              <div className="settings-holiday-row" key={`${holiday.date}-${String(index)}`}>
                <Input
                  aria-label={t("admin-settings:editor.holidayDate", { index: index + 1 })}
                  onChange={(event) => {
                    const next = [...holidays];
                    next[index] = { ...holiday, date: event.currentTarget.value };
                    onDraftChange(next);
                  }}
                  required
                  type="date"
                  value={holiday.date}
                />
                <Input
                  aria-label={t("admin-settings:editor.holidayLabel", { index: index + 1 })}
                  onChange={(event) => {
                    const next = [...holidays];
                    next[index] = { ...holiday, label: event.currentTarget.value };
                    onDraftChange(next);
                  }}
                  required
                  value={holiday.label}
                />
                <IconButton
                  icon="x"
                  label={t("admin-settings:editor.removeHoliday", { index: index + 1 })}
                  onClick={() => {
                    onDraftChange(holidays.filter((_, candidate) => candidate !== index));
                  }}
                />
              </div>
            ))
          )}
          <Button
            onClick={() => {
              onDraftChange([...holidays, { date: "", label: "" }]);
            }}
            variant="secondary"
          >
            <Icon aria-hidden="true" name="plus" />
            {t("admin-settings:editor.addHoliday")}
          </Button>
        </div>
      </fieldset>
    );
  }

  if (parameter.key === "bookings.weekOpensAt") {
    const value = objectValue(draft);
    return (
      <div className="settings-editor__grid">
        <FormField id="parameter-week-day" label={t("admin-settings:editor.dayOfWeek")}>
          <Select
            id="parameter-week-day"
            onChange={(event) => {
              onDraftChange({ ...value, dayOfWeek: event.currentTarget.value });
            }}
            value={typeof value.dayOfWeek === "string" ? value.dayOfWeek : "SUNDAY"}
          >
            {dayKeys.map((day) => (
              <option key={day} value={day}>
                {t(`admin-settings:days.long.${day}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="parameter-week-time" label={t("admin-settings:editor.time")}>
          <Input
            id="parameter-week-time"
            onChange={(event) => {
              onDraftChange({ ...value, time: event.currentTarget.value });
            }}
            required
            step={300}
            type="time"
            value={typeof value.time === "string" ? value.time : "20:00"}
          />
        </FormField>
      </div>
    );
  }

  if (parameter.key === "coverage.thresholds") {
    const value = objectValue(draft);
    return (
      <div className="settings-editor__grid settings-editor__grid--three">
        {(["ok", "tight", "short"] as const).map((key) => (
          <FormField
            id={`parameter-coverage-${key}`}
            key={key}
            label={t(`admin-settings:editor.coverage.${key}`)}
          >
            <Input
              id={`parameter-coverage-${key}`}
              min={0}
              onChange={(event) => {
                onDraftChange({ ...value, [key]: event.currentTarget.valueAsNumber });
              }}
              required
              type="number"
              value={typeof value[key] === "number" ? value[key] : 0}
            />
          </FormField>
        ))}
      </div>
    );
  }

  if (["bool", "boolean"].includes(type)) {
    return (
      <label className="catalog-switch-row">
        <span>{label}</span>
        <Switch checked={draft === true} label={label} onCheckedChange={onDraftChange} />
      </label>
    );
  }

  if (type === "enum") {
    return (
      <FormField id="parameter-value" label={label}>
        <Select
          id="parameter-value"
          onChange={(event) => {
            onDraftChange(event.currentTarget.value);
          }}
          value={typeof draft === "string" ? draft : ""}
        >
          {enumValues(parameter).map((value) => (
            <option key={value} value={value}>
              {enumLabel(t, parameter.key, value)}
            </option>
          ))}
        </Select>
      </FormField>
    );
  }

  if (["localizedtext", "text"].includes(type)) {
    const values = localizedValue(draft);
    return (
      <div className="settings-editor__localized">
        <LocaleTabs locale={locale} locales={branding.locales} onChange={onLocaleChange} />
        <FormField id="parameter-value" label={label}>
          <Textarea
            id="parameter-value"
            onChange={(event) => {
              onDraftChange({ ...values, [locale]: event.currentTarget.value });
            }}
            required={locale === branding.defaultLocale}
            value={values[locale] ?? ""}
          />
        </FormField>
      </div>
    );
  }

  if (type === "money") {
    const money = objectValue(draft);
    return (
      <FormField id="parameter-value" label={label}>
        <div className="settings-editor__money">
          <Input
            id="parameter-value"
            min={constraintNumber(parameter, "min") ?? 0}
            onChange={(event) => {
              onDraftChange({
                amountMinor: Math.round(event.currentTarget.valueAsNumber * 100),
                currency: typeof money.currency === "string" ? money.currency : branding.currency,
              });
            }}
            required
            step="0.01"
            type="number"
            value={typeof money.amountMinor === "number" ? money.amountMinor / 100 : 0}
          />
          <span>{typeof money.currency === "string" ? money.currency : branding.currency}</span>
        </div>
      </FormField>
    );
  }

  if (["int", "integer", "duration", "decimal", "number"].includes(type)) {
    return (
      <FormField id="parameter-value" label={label}>
        <Input
          id="parameter-value"
          max={constraintNumber(parameter, "max")}
          min={constraintNumber(parameter, "min")}
          onChange={(event) => {
            onDraftChange(event.currentTarget.valueAsNumber);
          }}
          required
          step={constraintNumber(parameter, "step") ?? (type === "decimal" ? "any" : 1)}
          type="number"
          value={typeof draft === "number" ? draft : 0}
        />
      </FormField>
    );
  }

  if (type === "time") {
    return (
      <FormField id="parameter-value" label={label}>
        <Input
          id="parameter-value"
          onChange={(event) => {
            onDraftChange(event.currentTarget.value);
          }}
          required
          step={300}
          type="time"
          value={typeof draft === "string" ? draft : ""}
        />
      </FormField>
    );
  }

  if (["json", "list"].includes(type)) {
    return (
      <FormField id="parameter-value" label={label}>
        <Textarea
          id="parameter-value"
          onChange={(event) => {
            onJsonTextChange(event.currentTarget.value);
          }}
          required
          rows={10}
          value={jsonText}
        />
      </FormField>
    );
  }

  return (
    <FormField id="parameter-value" label={label}>
      <Input
        id="parameter-value"
        onChange={(event) => {
          onDraftChange(event.currentTarget.value);
        }}
        required
        value={typeof draft === "string" ? draft : ""}
      />
    </FormField>
  );
}

function ParameterEditor({
  client,
  onClose,
  onSaved,
  parameter,
}: {
  client: ApiClient;
  onClose: () => void;
  onSaved: () => void;
  parameter: Parameter;
}) {
  const branding = useBranding();
  const { t } = useTranslation("admin-settings");
  const messageForError = useCatalogError();
  const [draft, setDraft] = useState<unknown>(() => structuredClone(parameter.value));
  const [jsonText, setJsonText] = useState(() => JSON.stringify(parameter.value, null, 2));
  const [locale, setLocale] = useState(branding.defaultLocale);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    let value = draft;
    if (
      ["json", "list"].includes(parameterType(parameter.type)) &&
      ![
        "bookings.weekOpensAt",
        "club.openingHours",
        "club.holidays",
        "coverage.thresholds",
      ].includes(parameter.key)
    ) {
      try {
        value = JSON.parse(jsonText) as unknown;
      } catch {
        setError(t("admin-settings:editor.invalidJson"));
        return;
      }
    }
    if (parameter.key === "club.openingHours") {
      const hours = isOpeningHours(value) ? value : {};
      if (!validateOpeningHours(hours)) {
        setError(t("admin-settings:editor.invalidOpeningHours"));
        return;
      }
    }
    if (parameter.key === "coverage.thresholds") {
      const thresholds = objectValue(value);
      if (
        typeof thresholds.ok !== "number" ||
        typeof thresholds.tight !== "number" ||
        typeof thresholds.short !== "number" ||
        !(thresholds.ok > thresholds.tight && thresholds.tight > thresholds.short)
      ) {
        setError(t("admin-settings:editor.invalidCoverage"));
        return;
      }
    }
    if (["localizedtext", "text"].includes(parameterType(parameter.type))) {
      const localized = localizedValue(value);
      if ((localized[branding.defaultLocale] ?? "").trim() === "") {
        setError(t("admin-settings:editor.defaultLocaleRequired"));
        return;
      }
    }
    setPending(true);
    try {
      if (parameter.key === "club.openingHours") {
        await client.PUT("/club/opening-hours", {
          body: {
            ...(reason.trim() === "" ? {} : { reason: reason.trim() }),
            value: value as OpeningHours,
            version: parameter.version,
          },
        });
      } else if (parameter.key === "club.holidays") {
        await client.PUT("/club/holidays", {
          body: {
            ...(reason.trim() === "" ? {} : { reason: reason.trim() }),
            value: holidaysValue(value),
            version: parameter.version,
          },
        });
      } else {
        await client.PUT("/parameters/{key}", {
          body: {
            ...(reason.trim() === "" ? {} : { reason: reason.trim() }),
            ...(parameter.scopeRef === undefined ? {} : { scopeRef: parameter.scopeRef }),
            value,
            version: parameter.version,
          },
          params: { path: { key: parameter.key } },
        });
      }
      onSaved();
      onClose();
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setPending(false);
    }
  };

  const reset = async () => {
    setPending(true);
    setError(undefined);
    try {
      await client.DELETE("/parameters/{key}", {
        params: {
          path: { key: parameter.key },
          query: parameter.scopeRef === undefined ? {} : { scopeRef: parameter.scopeRef },
        },
      });
      onSaved();
      onClose();
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="settings-editor" onSubmit={(event) => void submit(event)}>
      <p className="settings-editor__help">{parameterHelp(t, parameter.key)}</p>
      <p className="settings-editor__future">{t("admin-settings:editor.appliesFromNow")}</p>
      <ParameterControl
        draft={draft}
        jsonText={jsonText}
        locale={locale}
        onDraftChange={setDraft}
        onJsonTextChange={setJsonText}
        onLocaleChange={setLocale}
        parameter={parameter}
      />
      <FormField id="parameter-reason" label={t("admin-settings:editor.reason")}>
        <Textarea
          id="parameter-reason"
          onChange={(event) => {
            setReason(event.currentTarget.value);
          }}
          value={reason}
        />
      </FormField>
      {error === undefined ? null : <p role="alert">{error}</p>}
      <div className="settings-editor__actions">
        <Button disabled={pending} onClick={() => void reset()} variant="ghost">
          {t("admin-settings:editor.reset")}
        </Button>
        <Button onClick={onClose} variant="ghost">
          {t("admin-settings:common.cancel")}
        </Button>
        <Button loading={pending} loadingLabel={t("admin-settings:common.saving")} type="submit">
          {t("admin-settings:common.save")}
        </Button>
      </div>
    </form>
  );
}

function HistoryDrawer({
  error,
  items,
  loading,
  onClose,
  open,
  title,
}: {
  error: string | undefined;
  items: HistoryItem[];
  loading: boolean;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const formats = useClubFormats();
  const { t } = useTranslation("admin-settings");
  return (
    <Drawer
      closeLabel={t("admin-settings:common.close")}
      onClose={onClose}
      open={open}
      title={title}
    >
      {loading ? (
        <Skeleton label={t("admin-settings:common.loading")} />
      ) : error === undefined ? (
        <ol className="settings-history">
          {items.map((item, index) => (
            <li key={`${item.key}-${item.changedAt}-${String(index)}`}>
              <strong>{parameterLabel(t, item.key)}</strong>
              <span>{formats.formatDateTime(item.changedAt)}</span>
              <span>{item.changedByAccountId}</span>
              {item.reason === undefined ? null : <p>{item.reason}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p role="alert">{error}</p>
      )}
    </Drawer>
  );
}

function ModulesCard({
  client,
  modules,
  onModulesChange,
}: {
  client: ApiClient;
  modules: readonly string[];
  onModulesChange: (modules: string[]) => void;
}) {
  const { t } = useTranslation("admin-settings");
  const messageForError = useCatalogError();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const selfServiceModules = ["FAQ", "PUSH", "LEARN_LINK"] as const;

  const toggle = async (module: (typeof selfServiceModules)[number], enabled: boolean) => {
    setPending(module);
    setError(undefined);
    try {
      const result = await client.PUT("/club/modules/{module}", {
        body: { enabled },
        params: { path: { module } },
      });
      if (result.data !== undefined) {
        onModulesChange(result.data.modules);
      }
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setPending(undefined);
    }
  };

  return (
    <Card className="settings-card settings-modules" id="modules">
      <h2>{t("admin-settings:blocks.modules")}</h2>
      {selfServiceModules.map((module) => (
        <div className="catalog-switch-row" key={module}>
          <span>
            <strong>{t(`admin-settings:modules.${module}.label`)}</strong>
            <small>{t(`admin-settings:modules.${module}.help`)}</small>
          </span>
          <Switch
            checked={modules.includes(module)}
            disabled={pending === module}
            label={t(`admin-settings:modules.${module}.label`)}
            onCheckedChange={(enabled) => void toggle(module, enabled)}
          />
        </div>
      ))}
      {error === undefined ? null : <p role="alert">{error}</p>}
    </Card>
  );
}

function DerivedSetting({ row }: { row: DerivedSettingRow }) {
  const { t } = useTranslation("admin-settings");
  const label =
    row.key === "packExpiry"
      ? t("admin-settings:derived.packExpiry.label", { plans: row.planNames })
      : t(`admin-settings:derived.${row.key}.label`);
  const value =
    row.key === "packExpiry"
      ? row.validityMonths.length === 0
        ? t("admin-settings:value.notConfigured")
        : row.validityMonths
            .map((count) => t("admin-settings:derived.packExpiry.months", { count }))
            .join(" · ")
      : row.key === "sepaCreditor"
        ? t(
            row.configured
              ? "admin-settings:derived.sepaCreditor.configured"
              : "admin-settings:derived.sepaCreditor.notConfigured",
          )
        : row.summary || t("admin-settings:value.notConfigured");
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  );

  return (
    <div className="settings-parameter settings-parameter--derived" data-derived-setting={row.key}>
      {"href" in row ? (
        <a className="settings-parameter__main" href={row.href}>
          {content}
        </a>
      ) : (
        <div className="settings-parameter__main settings-parameter__main--read-only">
          {content}
        </div>
      )}
    </div>
  );
}

export function ParameterSettings({
  client,
  clubSettings,
  levels,
  modules,
  onModulesChange,
  plans,
}: {
  client: ApiClient;
  clubSettings?: ClubSettings | undefined;
  levels: readonly Level[];
  modules: readonly string[];
  onModulesChange: (modules: string[]) => void;
  plans: readonly Plan[];
}) {
  const formats = useClubFormats();
  const { i18n, t } = useTranslation("admin-settings");
  const messageForError = useCatalogError();
  const [data, setData] = useState<Parameters>();
  const [error, setError] = useState<unknown>();
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Parameter>();
  const [history, setHistory] = useState<{
    error?: string;
    items: HistoryItem[];
    loading: boolean;
    title: string;
  }>();

  useEffect(() => {
    let current = true;
    void client.GET("/parameters", {}).then(
      (result) => {
        if (!current) {
          return;
        }
        if (result.data === undefined) {
          setError(new TypeError("Parameter response did not contain data"));
          return;
        }
        setData(result.data);
        setError(undefined);
      },
      (cause: unknown) => {
        if (current) {
          setError(cause);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [client, reloadKey]);

  const blocks = useMemo(
    () =>
      (data?.blocks ?? [])
        .map((block) => ({
          ...block,
          rows: block.rows.filter(
            (parameter) => parameter.module === undefined || modules.includes(parameter.module),
          ),
        }))
        .filter((block) => block.key !== "system" && block.rows.length > 0),
    [data?.blocks, modules],
  );
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const derivedRows = useMemo(
    () => buildDerivedSettingRows({ clubSettings, levels, locale, modules, plans }),
    [clubSettings, levels, locale, modules, plans],
  );

  const openHistory = async (parameter: Parameter) => {
    setHistory({
      items: [],
      loading: true,
      title: t("admin-settings:history.parameterTitle", {
        label: parameterLabel(t, parameter.key),
      }),
    });
    try {
      const result = await client.GET("/parameters/{key}/history", {
        params: {
          path: { key: parameter.key },
          query: parameter.scopeRef === undefined ? {} : { scopeRef: parameter.scopeRef },
        },
      });
      setHistory({
        items: (result.data ?? []).map((item) => ({ ...item, key: parameter.key })),
        loading: false,
        title: t("admin-settings:history.parameterTitle", {
          label: parameterLabel(t, parameter.key),
        }),
      });
    } catch (cause) {
      setHistory({
        error: messageForError(cause),
        items: [],
        loading: false,
        title: t("admin-settings:history.parameterTitle", {
          label: parameterLabel(t, parameter.key),
        }),
      });
    }
  };

  const lastChange = data?.lastChange;

  return (
    <>
      <header className="catalog-page__header settings-page__header">
        <h1>{t("admin-settings:title")}</h1>
        <LastChange entityType="Parameter" value={lastChange} />
      </header>
      {error === undefined ? null : (
        <LoadFailure
          onRetry={() => {
            setReloadKey((value) => value + 1);
          }}
        />
      )}
      {data === undefined && error === undefined ? (
        <Card className="settings-card">
          <Skeleton label={t("admin-settings:common.loading")} />
        </Card>
      ) : (
        <div className="settings-grid">
          {blocks.map((block) => (
            <Card className="settings-card" key={block.key}>
              <h2>{t(`admin-settings:blocks.${block.key}`, { defaultValue: block.title })}</h2>
              <div className="settings-parameters">
                {block.rows.map((parameter) => {
                  const label = parameterLabel(t, parameter.key);
                  return (
                    <Fragment key={`${parameter.key}-${parameter.scopeRef ?? "club"}`}>
                      <div className="settings-parameter">
                        <button
                          className="settings-parameter__main"
                          disabled={parameter.editableBy !== "CLUB"}
                          onClick={() => {
                            setEditing(parameter);
                          }}
                          type="button"
                        >
                          <span>{label}</span>
                          <strong>{valueSummary(parameter, locale, formats, t)}</strong>
                        </button>
                        <IconButton
                          icon="list"
                          label={t("admin-settings:history.open", { label })}
                          onClick={() => void openHistory(parameter)}
                        />
                        {parameter.editableBy === "CLUB" ? (
                          <IconButton
                            icon="edit"
                            label={t("admin-settings:editor.open", { label })}
                            onClick={() => {
                              setEditing(parameter);
                            }}
                          />
                        ) : null}
                      </div>
                      {derivedRows
                        .filter((row) => row.block === block.key && row.afterKey === parameter.key)
                        .map((row) => (
                          <DerivedSetting key={row.key} row={row} />
                        ))}
                    </Fragment>
                  );
                })}
                {derivedRows
                  .filter(
                    (row) =>
                      row.block === block.key &&
                      !block.rows.some((parameter) => parameter.key === row.afterKey),
                  )
                  .map((row) => (
                    <DerivedSetting key={row.key} row={row} />
                  ))}
              </div>
            </Card>
          ))}
          <ModulesCard client={client} modules={modules} onModulesChange={onModulesChange} />
          <ClubPagesCard client={client} />
          <Card className="settings-card settings-card--placeholder">
            <h2>{t("admin-settings:blocks.automatedProcesses")}</h2>
          </Card>
        </div>
      )}
      <Drawer
        closeLabel={t("admin-settings:common.close")}
        onClose={() => {
          setEditing(undefined);
        }}
        open={editing !== undefined}
        title={editing === undefined ? "" : parameterLabel(t, editing.key)}
      >
        {editing === undefined ? null : (
          <ParameterEditor
            client={client}
            key={`${editing.key}-${String(editing.version)}`}
            onClose={() => {
              setEditing(undefined);
            }}
            onSaved={() => {
              setReloadKey((value) => value + 1);
            }}
            parameter={editing}
          />
        )}
      </Drawer>
      <HistoryDrawer
        error={history?.error}
        items={history?.items ?? []}
        loading={history?.loading ?? false}
        onClose={() => {
          setHistory(undefined);
        }}
        open={history !== undefined}
        title={history?.title ?? ""}
      />
    </>
  );
}
