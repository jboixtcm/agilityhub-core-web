import type { components } from "@agilityhub/api-client";
import { Badge, Button, Drawer, FormField, IconButton, Skeleton, Textarea } from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ParameterControl, valueSummary } from "../../catalogs/ParameterSettings";
import { useCatalogData } from "../../catalogs/shared";
import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  consoleErrorMessage,
  FormMessage,
  LoadError,
  SectionCard,
  useConsoleFormats,
  useWriteState,
} from "../shared";

type ParameterDefinition = components["schemas"]["ParameterDefinition"];
type Parameter = components["schemas"]["Parameter"];

/** The D11 editor's special keys: their control builds the value itself (no JSON text). */
const STRUCTURED_KEYS: readonly string[] = [
  "bookings.weekOpensAt",
  "club.openingHours",
  "club.holidays",
  "coverage.thresholds",
];

function normalizedType(type: string): string {
  return type.replaceAll("_", "").replaceAll("-", "").toLocaleLowerCase();
}

/**
 * A catalog row as D11's `Parameter`: the value this console last saved for the club, or the
 * product default. The contract publishes no read of a club's parameters for the platform (only
 * `GET /platform/parameter-catalog` and the write): see the task report's contract question.
 */
export function parameterRow(
  definition: ParameterDefinition,
  saved: Parameter | undefined,
): Parameter {
  return {
    block: definition.block,
    constraints: definition.constraints,
    default: definition.default,
    editableBy: definition.editableBy,
    help: definition.help,
    history: saved?.history ?? [],
    isOverride: saved?.isOverride ?? false,
    key: definition.key,
    label: definition.label,
    type: definition.type,
    value: saved === undefined ? definition.default : saved.value,
    version: saved?.version ?? 0,
  };
}

function ParameterEditor({
  client,
  clubId,
  defaultLocale,
  label,
  locales,
  onClose,
  onSaved,
  parameter,
}: {
  client: ConsoleTabProps["client"];
  clubId: string;
  defaultLocale: string;
  label: string;
  locales: readonly string[];
  onClose: () => void;
  onSaved: (parameter: Parameter) => void;
  parameter: Parameter;
}) {
  const { t } = useTranslation(["console", "admin-settings", "errors", "common"]);
  const write = useWriteState();
  const [draft, setDraft] = useState<unknown>(() => structuredClone(parameter.value));
  const [jsonText, setJsonText] = useState(() => JSON.stringify(parameter.value, null, 2));
  const [locale, setLocale] = useState(defaultLocale);
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState<string>();

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInvalid(undefined);
    let value = draft;
    if (
      ["json", "list"].includes(normalizedType(parameter.type)) &&
      !STRUCTURED_KEYS.includes(parameter.key)
    ) {
      try {
        value = JSON.parse(jsonText) as unknown;
      } catch {
        setInvalid(t("admin-settings:editor.invalidJson"));
        return;
      }
    }
    const saved = await write.run(async () => {
      const result = await client.PUT("/platform/clubs/{id}/parameters/{key}", {
        body: {
          ...(reason.trim() === "" ? {} : { reason: reason.trim() }),
          value,
          version: parameter.version,
        },
        params: { path: { id: clubId, key: parameter.key } },
      });
      if (result.data === undefined) throw new TypeError("Parameter without data");
      return result.data;
    });
    if (saved !== undefined) {
      onSaved(saved);
      onClose();
    }
  };

  return (
    <form className="settings-editor" onSubmit={(event) => void submit(event)}>
      <p className="settings-editor__help">
        {t(`admin-settings:param.${parameter.key}.help`, { defaultValue: parameter.help })}
      </p>
      <p className="settings-editor__future">{t("admin-settings:editor.appliesFromNow")}</p>
      <fieldset className="console-fieldset" disabled={write.pending}>
        <ParameterControl
          defaultLocale={defaultLocale}
          draft={draft}
          jsonText={jsonText}
          label={label}
          locale={locale}
          locales={locales}
          onDraftChange={setDraft}
          onJsonTextChange={setJsonText}
          onLocaleChange={setLocale}
          parameter={parameter}
        />
        <FormField id="console-parameter-reason" label={t("admin-settings:editor.reason")}>
          <Textarea
            id="console-parameter-reason"
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
            value={reason}
          />
        </FormField>
      </fieldset>
      <FormMessage
        message={
          invalid ?? (write.error === undefined ? undefined : consoleErrorMessage(t, write.error))
        }
        tone="danger"
      />
      <div className="settings-editor__actions">
        <Button onClick={onClose} variant="ghost">
          {t("console:common.cancel")}
        </Button>
        <Button loading={write.pending} loadingLabel={t("console:common.saving")} type="submit">
          {t("console:common.save")}
        </Button>
      </div>
    </form>
  );
}

/**
 * S17 §2 «Paràmetres»: D11's typed editor over the S02 catalog, with the `PLATFORM_ONLY` keys
 * editable too (S17 §9: the platform writes any parameter of the club).
 */
export function ParametersTab({ client, club }: ConsoleTabProps) {
  const { i18n, t } = useTranslation(["console", "admin-settings", "auth", "errors", "common"]);
  const formats = useConsoleFormats(club.timeZone, club.currency);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const load = useCallback(async () => {
    const result = await client.GET("/platform/parameter-catalog");
    if (result.data === undefined) throw new TypeError("Parameter catalog without data");
    return result.data;
  }, [client]);
  const catalog = useCatalogData(load, club.id);
  const [saved, setSaved] = useState<Record<string, Parameter>>({});
  const [editing, setEditing] = useState<Parameter>();
  const [done, setDone] = useState<string>();

  const label = (definition: { key: string; label: string }) =>
    t(`admin-settings:param.${definition.key}.label`, { defaultValue: definition.label });

  // A parameter of a module the club has off is refused (`404 MODULE_DISABLED`): not listed.
  const blocks = useMemo(() => {
    const visible = catalog.items.filter((definition) =>
      definition.modules.every((module) => (club.modules as readonly string[]).includes(module)),
    );
    const keys = [...new Set(visible.map((definition) => definition.block))];
    return keys.map((block) => ({
      block,
      rows: visible.filter((definition) => definition.block === block),
    }));
  }, [catalog.items, club.modules]);

  if (catalog.error !== undefined)
    return <LoadError error={catalog.error} onRetry={catalog.reload} />;
  if (catalog.loading && catalog.items.length === 0)
    return <Skeleton label={t("console:common.loading")} />;

  return (
    <div className="console-form">
      <p className="console-message console-message--info" role="note">
        {t("console:parameters.note")}
      </p>
      <FormMessage message={done} tone="success" />
      {blocks.map(({ block, rows }) => (
        <SectionCard
          key={block}
          title={t(`admin-settings:blocks.${block}`, { defaultValue: block })}
        >
          <div className="settings-parameters">
            {rows.map((definition) => {
              const parameter = parameterRow(definition, saved[definition.key]);
              const name = label(definition);
              return (
                <div className="settings-parameter console-parameter" key={definition.key}>
                  <button
                    className="settings-parameter__main"
                    onClick={() => {
                      setEditing(parameter);
                    }}
                    type="button"
                  >
                    <span>
                      {name}
                      {definition.editableBy === "PLATFORM" ? (
                        <Badge tone="info">{t("console:parameters.platformOnly")}</Badge>
                      ) : null}
                      {saved[definition.key] === undefined ? null : (
                        <Badge tone="success">{t("console:parameters.savedNow")}</Badge>
                      )}
                    </span>
                    <strong>{valueSummary(parameter, locale, formats, t)}</strong>
                    <small className="console-muted">
                      {t("console:parameters.default", {
                        value: valueSummary(
                          { ...parameter, value: definition.default },
                          locale,
                          formats,
                          t,
                        ),
                      })}
                    </small>
                  </button>
                  <IconButton
                    icon="edit"
                    label={t("admin-settings:editor.open", { label: name })}
                    onClick={() => {
                      setEditing(parameter);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </SectionCard>
      ))}
      <Drawer
        closeLabel={t("console:common.close")}
        onClose={() => {
          setEditing(undefined);
        }}
        open={editing !== undefined}
        title={editing === undefined ? "" : label(editing)}
      >
        {editing === undefined ? null : (
          <ParameterEditor
            client={client}
            clubId={club.id}
            defaultLocale={club.defaultLocale}
            key={`${editing.key}-${String(editing.version)}`}
            label={label(editing)}
            locales={club.locales}
            onClose={() => {
              setEditing(undefined);
            }}
            onSaved={(parameter) => {
              setSaved((current) => ({ ...current, [parameter.key]: parameter }));
              setDone(t("console:parameters.saved", { label: label(parameter) }));
            }}
            parameter={editing}
          />
        )}
      </Drawer>
    </div>
  );
}
