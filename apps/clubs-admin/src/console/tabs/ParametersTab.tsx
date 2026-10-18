import { type components, isApiError } from "@agilityhub/api-client";
import { Badge, Button, Drawer, FormField, IconButton, Skeleton, Textarea } from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ParameterControl, valueSummary } from "../../catalogs/ParameterSettings";
import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  consoleErrorMessage,
  FormMessage,
  LoadError,
  SectionCard,
  useConsoleFormats,
  useWriteState,
} from "../shared";

type Parameter = components["schemas"]["Parameter"];
type Parameters = components["schemas"]["Parameters"];
type Formats = ReturnType<typeof useConsoleFormats>;

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
 * `PUT /platform/clubs/{id}/parameters/{key}`'s body (E10-T04): the value, and the `version` of
 * the row as `GET …/parameters` answered it — the club's override's, or 0 for a key the club has
 * not overridden (the contract's value; the api refuses anything else with `409 STALE_VERSION`).
 */
export function parameterWrite(parameter: Parameter, value: unknown, reason: string) {
  return {
    ...(reason.trim() === "" ? {} : { reason: reason.trim() }),
    value,
    version: parameter.isOverride ? parameter.version : 0,
  };
}

/** `GET /platform/clubs/{id}/parameters`: the club's own values, read again after each write. */
function useClubParameters(client: ConsoleTabProps["client"], clubId: string) {
  const [state, setState] = useState<{ data?: Parameters; error?: unknown; loading: boolean }>({
    loading: true,
  });
  const request = useRef(0);
  const load = useCallback(async () => {
    request.current += 1;
    const current = request.current;
    setState((previous) => ({ ...previous, loading: true }));
    try {
      const result = await client.GET("/platform/clubs/{id}/parameters", {
        params: { path: { id: clubId } },
      });
      if (result.data === undefined) throw new TypeError("Club parameters without data");
      if (current === request.current) setState({ data: result.data, loading: false });
      return result.data;
    } catch (error) {
      if (current === request.current)
        setState((previous) => ({ ...previous, error, loading: false }));
      return undefined;
    }
  }, [client, clubId]);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}

function ParameterEditor({
  client,
  clubId,
  defaultLocale,
  formats,
  label,
  locales,
  onClose,
  onSaved,
  onStale,
  parameter,
  rereadError,
  rereadPending,
  retryReread,
}: {
  client: ConsoleTabProps["client"];
  clubId: string;
  defaultLocale: string;
  formats: Formats;
  label: string;
  locales: readonly string[];
  onClose: () => void;
  onSaved: (parameter: Parameter) => void;
  onStale: () => Promise<unknown>;
  /** The row as last read: after a `STALE_VERSION` reread, the fresh one (the draft is kept). */
  parameter: Parameter;
  rereadError: unknown;
  rereadPending: boolean;
  retryReread: () => void;
}) {
  const { i18n, t } = useTranslation(["console", "admin-settings", "auth", "errors", "common"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const write = useWriteState();
  const [draft, setDraft] = useState<unknown>(() => structuredClone(parameter.value));
  const [jsonText, setJsonText] = useState(() => JSON.stringify(parameter.value, null, 2));
  const [editLocale, setEditLocale] = useState(defaultLocale);
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState<string>();
  const stale = isApiError(write.error, "STALE_VERSION");

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
    // The version is the row's as read now: after a `STALE_VERSION` the reread one, with the
    // user's own value (the only thing this editor changes) on top.
    const saved = await write.run(async () => {
      const result = await client.PUT("/platform/clubs/{id}/parameters/{key}", {
        body: parameterWrite(parameter, value, reason),
        params: { path: { id: clubId, key: parameter.key } },
      });
      if (result.data === undefined) throw new TypeError("Parameter without data");
      return result.data;
    }, onStale);
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
      {rereadError === undefined ? null : <LoadError error={rereadError} onRetry={retryReread} />}
      <fieldset
        className="console-fieldset"
        disabled={write.pending || rereadPending || rereadError !== undefined}
      >
        <ParameterControl
          defaultLocale={defaultLocale}
          draft={draft}
          jsonText={jsonText}
          label={label}
          locale={editLocale}
          locales={locales}
          onDraftChange={setDraft}
          onJsonTextChange={setJsonText}
          onLocaleChange={setEditLocale}
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
          rereadError === undefined
            ? (invalid ??
              (stale
                ? t("console:parameters.stale", {
                    value: valueSummary(parameter, locale, formats, t),
                  })
                : write.error === undefined
                  ? undefined
                  : consoleErrorMessage(t, write.error)))
            : undefined
        }
        tone="danger"
      />
      <div className="settings-editor__actions">
        <Button disabled={write.pending} onClick={onClose} variant="ghost">
          {t("console:common.cancel")}
        </Button>
        <Button
          disabled={rereadPending || rereadError !== undefined}
          loading={write.pending}
          loadingLabel={t("console:common.saving")}
          type="submit"
        >
          {t("console:common.save")}
        </Button>
      </div>
    </form>
  );
}

/**
 * S17 §2 «Paràmetres» (E118, E10-T04): D11's typed editor over the club's own values and versions
 * (`GET /platform/clubs/{id}/parameters`), the `PLATFORM_ONLY` keys editable too (S17 §9).
 */
export function ParametersTab({ client, club }: ConsoleTabProps) {
  const { i18n, t } = useTranslation(["console", "admin-settings", "auth", "errors", "common"]);
  const formats = useConsoleFormats(club.timeZone, club.currency);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const parameters = useClubParameters(client, club.id);
  const [editingKey, setEditingKey] = useState<string>();
  const [done, setDone] = useState<string>();

  const label = (parameter: { key: string; label: string }) =>
    t(`admin-settings:param.${parameter.key}.label`, { defaultValue: parameter.label });

  // A parameter of a module the club has off is refused (`404 MODULE_DISABLED`): not listed.
  const blocks = useMemo(
    () =>
      (parameters.data?.blocks ?? [])
        .map((block) => ({
          ...block,
          rows: block.rows.filter((parameter) => {
            const module: unknown = parameter.module;
            return (
              typeof module !== "string" || (club.modules as readonly string[]).includes(module)
            );
          }),
        }))
        .filter((block) => block.rows.length > 0),
    [club.modules, parameters.data?.blocks],
  );
  const editing = blocks
    .flatMap((block) => block.rows)
    .find((parameter) => parameter.key === editingKey);
  const rereadBlocked = parameters.loading || parameters.error !== undefined;

  if (parameters.error !== undefined && parameters.data === undefined)
    return <LoadError error={parameters.error} onRetry={() => void parameters.reload()} />;
  if (parameters.data === undefined) return <Skeleton label={t("console:common.loading")} />;

  return (
    <div className="console-form">
      <p className="console-message console-message--info" role="note">
        {t("console:parameters.note")}
      </p>
      {parameters.error === undefined ? null : (
        <LoadError error={parameters.error} onRetry={() => void parameters.reload()} />
      )}
      <FormMessage message={done} tone="success" />
      {blocks.map((block) => (
        <SectionCard
          key={block.key}
          title={t(`admin-settings:blocks.${block.key}`, { defaultValue: block.title })}
        >
          <div className="settings-parameters">
            {block.rows.map((parameter) => {
              const name = label(parameter);
              return (
                <div className="settings-parameter console-parameter" key={parameter.key}>
                  <button
                    className="settings-parameter__main"
                    disabled={rereadBlocked}
                    onClick={() => {
                      setDone(undefined);
                      setEditingKey(parameter.key);
                    }}
                    type="button"
                  >
                    <span>
                      {name}
                      {parameter.editableBy === "PLATFORM" ? (
                        <Badge tone="info">{t("console:parameters.platformOnly")}</Badge>
                      ) : null}
                      <Badge tone={parameter.isOverride ? "success" : "neutral"}>
                        {parameter.isOverride
                          ? t("console:parameters.override")
                          : t("console:parameters.defaultValue")}
                      </Badge>
                    </span>
                    <strong>{valueSummary(parameter, locale, formats, t)}</strong>
                    {parameter.isOverride ? (
                      <small className="console-muted">
                        {t("console:parameters.default", {
                          value: valueSummary(
                            { ...parameter, value: parameter.default },
                            locale,
                            formats,
                            t,
                          ),
                        })}
                      </small>
                    ) : null}
                  </button>
                  <IconButton
                    disabled={rereadBlocked}
                    icon="edit"
                    label={t("admin-settings:editor.open", { label: name })}
                    onClick={() => {
                      setDone(undefined);
                      setEditingKey(parameter.key);
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
          setEditingKey(undefined);
        }}
        open={editing !== undefined}
        title={editing === undefined ? "" : label(editing)}
      >
        {editing === undefined ? null : (
          <ParameterEditor
            client={client}
            clubId={club.id}
            defaultLocale={club.defaultLocale}
            formats={formats}
            key={editing.key}
            label={label(editing)}
            locales={club.locales}
            onClose={() => {
              setEditingKey(undefined);
            }}
            onSaved={(parameter) => {
              setDone(t("console:parameters.saved", { label: label(parameter) }));
              void parameters.reload();
            }}
            onStale={parameters.reload}
            parameter={editing}
            rereadError={parameters.error}
            rereadPending={parameters.loading}
            retryReread={() => void parameters.reload()}
          />
        )}
      </Drawer>
    </div>
  );
}
