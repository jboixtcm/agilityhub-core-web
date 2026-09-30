import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import {
  Button,
  Checkbox,
  Chip,
  FormField,
  Icon,
  Modal,
  Select,
  useBranding,
} from "@agilityhub/ui";
import { type CSSProperties, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LastChange } from "../audit/LastChange";

import { TemplatePreviewDialog } from "./TemplatePreviewDialog";

type Detail = components["schemas"]["MessageTemplateDetail"];
type Matrix = components["schemas"]["ChannelMatrix"];
type Category = components["schemas"]["NotificationCategory"];
type TemplateColor = components["schemas"]["TemplateColor"];
type TemplateIcon = components["schemas"]["TemplateIcon"];
type Variable = components["schemas"]["TemplateVariable"];
type LocalizedText = Record<string, string>;

export type Audience = "ADMINS" | "INSTRUCTORS" | "MEMBER";
type Channel = "APP" | "EMAIL" | "SMS";

export const AUDIENCES: readonly Audience[] = ["MEMBER", "INSTRUCTORS", "ADMINS"];
const CHANNELS: readonly Channel[] = ["APP", "EMAIL", "SMS"];
/** The whole `TemplateIcon` enum, in the contract's order (the system icon set, never emojis). */
const ICONS: readonly TemplateIcon[] = [
  "check",
  "x",
  "unlock",
  "warn",
  "up",
  "heart",
  "bell",
  "doc",
  "flag",
  "mail",
  "cal",
  "clock",
  "info",
  "paw",
  "cone",
  "lock",
];
const COLORS: readonly TemplateColor[] = ["NEUTRAL", "OK", "WARNING", "ERROR", "ACCENT"];
/** A CUSTOM template's categories (R-11-12). */
export const CUSTOM_CATEGORIES: readonly Category[] = ["PERSONAL", "CLUB_NEWS", "CLUB_CHANGES"];
/** Each colour is a theme token (S11 §3: `text2`, `ok`, `avis`, `error`, `taronja`). */
const COLOR_TOKENS: Readonly<Record<TemplateColor, string>> = {
  ACCENT: "var(--ah-color-primary)",
  ERROR: "var(--ah-color-danger)",
  NEUTRAL: "var(--ah-color-text-muted)",
  OK: "var(--ah-color-success)",
  WARNING: "var(--ah-color-warning)",
};

/** The matrix cells the admin clicked, by audience and channel. */
type MatrixEdits = Partial<Record<Audience, Partial<Record<Channel, boolean>>>>;

/** The admin's unsaved changes of one template: only the fields they touched (rebased on reads). */
export interface TemplateEdits {
  body?: LocalizedText;
  category?: Category;
  color?: TemplateColor;
  icon?: TemplateIcon;
  matrix?: MatrixEdits;
  sms?: LocalizedText;
  title?: LocalizedText;
}

/** The saved matrix with the admin's own cells over it: a reread keeps every other cell as read. */
function editedMatrix(saved: Matrix, cells: MatrixEdits | undefined): Matrix {
  return {
    ADMINS: { ...saved.ADMINS, ...cells?.ADMINS },
    INSTRUCTORS: { ...saved.INSTRUCTORS, ...cells?.INSTRUCTORS },
    MEMBER: { ...saved.MEMBER, ...cells?.MEMBER },
  };
}

const VARIABLE = /\[\[([^\]]*)\]\]/gu;

/**
 * The texts show each variable by its label in the admin's language (`[[persona_nom]]`, mockup D9)
 * and are saved with the code key (`[[member_first_name]]`, S11 §2): the api decides both.
 */
export function withLabels(text: string, variables: readonly Variable[]): string {
  return text.replace(VARIABLE, (whole, raw: string) => {
    const variable = variables.find((item) => item.key === raw.trim());
    return variable === undefined ? whole : `[[${variable.label}]]`;
  });
}

export function withKeys(text: string, variables: readonly Variable[]): string {
  return text.replace(VARIABLE, (whole, raw: string) => {
    const variable = variables.find((item) => item.label === raw.trim());
    return variable === undefined ? whole : `[[${variable.key}]]`;
  });
}

/** The texts of a template as the editor shows them, the admin's edits over the api's. */
export function shownTexts(detail: Detail, edits: TemplateEdits) {
  const labels = (texts: LocalizedText | null | undefined): LocalizedText =>
    Object.fromEntries(
      Object.entries(texts ?? {}).map(([locale, text]) => [
        locale,
        withLabels(text, detail.variables),
      ]),
    );
  return {
    body: { ...labels(detail.bodyI18n), ...edits.body },
    sms: { ...labels(detail.smsBodyI18n), ...edits.sms },
    title: { ...labels(detail.titleI18n), ...edits.title },
  };
}

/** A locale map for the api: the code keys back, the empty locales left out. */
function forApi(texts: LocalizedText, variables: readonly Variable[]): LocalizedText {
  return Object.fromEntries(
    Object.entries(texts)
      .filter(([, text]) => text.trim() !== "")
      .map(([locale, text]) => [locale, withKeys(text, variables)]),
  );
}

type Refusal =
  | { field: "body" | "sms" | "title"; message: string }
  | { field: "delete" | "matrix" | "reset" | "state" | "top"; message: string; stale?: boolean };

interface Props {
  client: ApiClient;
  detail: Detail;
  edits: TemplateEdits;
  onDeleted: () => void;
  onEdits: (edits: TemplateEdits) => void;
  onReload: () => void;
  /**
   * A write the api accepted: its answer (the list and the counts are read again). `savedEdits` are
   * the edits that write carried: the page drops the draft only if it is still that one.
   */
  onSaved: (detail: Detail, options?: { keepEdits?: boolean; savedEdits?: TemplateEdits }) => void;
}

/**
 * D9's editor (S11 §2, R-11-12): the title and the body per club locale, with the variables of the
 * code as chips, the icon and the colour, the category (editable on CUSTOM only), the «SMS (text
 * curt)» when an SMS cell may be active, the channel × audience matrix within `caps` (the Push
 * column is informative), [Vista prèvia] and [DESA], and the secondary actions. Everything the api
 * decides — caps, push, variables, mandatory — is rendered as delivered.
 */
export function TemplateEditor({
  client,
  detail,
  edits,
  onDeleted,
  onEdits,
  onReload,
  onSaved,
}: Props) {
  const { t } = useTranslation(["admin-messaging", "enums", "errors"]);
  const branding = useBranding();
  const smsModule = branding.modules.includes("SMS");
  const pushModule = branding.modules.includes("PUSH");
  const locales = branding.locales.length > 0 ? branding.locales : [branding.defaultLocale];
  const [locale, setLocale] = useState(branding.defaultLocale);
  const [busy, setBusy] = useState<"delete" | "reset" | "save" | "state">();
  const [refusal, setRefusal] = useState<Refusal>();
  const [cellRefused, setCellRefused] = useState<string>();
  const [confirm, setConfirm] = useState<"delete" | "reset">();
  const [preview, setPreview] = useState(false);
  const focused = useRef<"body" | "sms" | "title">("body");
  const bodyField = useRef<HTMLTextAreaElement>(null);
  const smsField = useRef<HTMLTextAreaElement>(null);
  const titleField = useRef<HTMLInputElement>(null);

  const texts = shownTexts(detail, edits);
  const icon = edits.icon ?? detail.icon;
  const color = edits.color ?? detail.color;
  const matrix = editedMatrix(detail.matrix, edits.matrix);
  const category = edits.category ?? detail.category;
  const custom = detail.kind === "CUSTOM";
  const dirty = Object.keys(edits).length > 0;
  const smsActivatable =
    smsModule && AUDIENCES.some((audience) => detail.caps[audience].includes("SMS"));
  const smsOn = AUDIENCES.some((audience) => matrix[audience].SMS);
  const others = locales.filter(
    (candidate) => candidate !== locale && (texts.body[candidate] ?? "").trim() !== "",
  );

  // While a write is on its way the editor is read-only: its answer replaces the draft, so nothing
  // typed meanwhile could be kept.
  const locked = busy !== undefined;
  const edit = (change: TemplateEdits) => {
    if (locked) return;
    setRefusal(undefined);
    onEdits({ ...edits, ...change });
  };
  const setText = (field: "body" | "sms" | "title", value: string) => {
    edit({ [field]: { ...edits[field], [locale]: value } });
  };

  const insertVariable = (variable: Variable) => {
    const field = focused.current === "sms" && !smsActivatable ? "body" : focused.current;
    const element =
      field === "title"
        ? titleField.current
        : field === "sms"
          ? smsField.current
          : bodyField.current;
    const current = texts[field][locale] ?? "";
    const token = `[[${variable.label}]]`;
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    setText(field, `${current.slice(0, start)}${token}${current.slice(end)}`);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  /** Where the api's refusal is said: under the field or the action it belongs to (step 4). */
  const refuse = (cause: unknown, action: "delete" | "reset" | "save" | "state") => {
    if (!isApiError(cause) || cause.status === 0) {
      setRefusal({ field: "top", message: t("admin-messaging:templates.genericError") });
      return;
    }
    const details = (cause.details ?? {}) as {
      audience?: string;
      channel?: string;
      field?: string;
      missingVariables?: string[];
    };
    const message = t(`errors:${cause.code}`, {
      defaultValue: t("admin-messaging:templates.genericError"),
    });
    const fieldLocale = details.field?.split(".")[1];
    if (fieldLocale !== undefined && locales.includes(fieldLocale)) setLocale(fieldLocale);
    switch (cause.code) {
      case "STALE_VERSION":
        setRefusal({ field: "top", message: t("admin-messaging:templates.stale"), stale: true });
        return;
      case "CHANNEL_NOT_ALLOWED":
        setCellRefused(
          details.audience === undefined
            ? undefined
            : `${details.audience}.${details.channel ?? ""}`,
        );
        setRefusal({ field: "matrix", message });
        return;
      case "TEMPLATE_SYNTAX_ERROR":
      case "TEMPLATE_UNKNOWN_VARIABLE":
        setRefusal({
          field: details.field?.startsWith("title")
            ? "title"
            : details.field?.startsWith("smsBody")
              ? "sms"
              : "body",
          message,
        });
        return;
      case "SMS_BODY_REQUIRED":
      case "SMS_BODY_TOO_LONG":
        setRefusal({ field: "sms", message });
        return;
      case "TEMPLATE_MANDATORY":
        setRefusal({ field: "state", message });
        return;
      case "TEMPLATE_NOT_CATALOG":
        setRefusal({ field: "reset", message });
        return;
      case "TEMPLATE_NOT_CUSTOM":
        setRefusal({ field: "delete", message });
        return;
      default:
        if (cause.code === "VALIDATION_ERROR" && details.missingVariables !== undefined) {
          const labels = details.missingVariables.map(
            (key) => detail.variables.find((variable) => variable.key === key)?.label ?? key,
          );
          setRefusal({
            field: "body",
            message: t("admin-messaging:templates.missingVariables", {
              vars: labels.map((label) => `[[${label}]]`).join(", "),
            }),
          });
          return;
        }
        setRefusal({ field: action === "save" ? "top" : action, message });
    }
  };

  const write = async (
    action: "delete" | "reset" | "save" | "state",
    request: () => Promise<Detail | undefined>,
    options: { keepEdits?: boolean; savedEdits?: TemplateEdits } = { savedEdits: edits },
  ) => {
    if (busy !== undefined) return;
    setBusy(action);
    setRefusal(undefined);
    setCellRefused(undefined);
    try {
      const answer = await request();
      if (answer === undefined) onDeleted();
      else onSaved(answer, options);
      setConfirm(undefined);
    } catch (cause) {
      refuse(cause, action);
    } finally {
      setBusy(undefined);
    }
  };

  const save = () =>
    write("save", async () => {
      const sms = forApi(texts.sms, detail.variables);
      const { data } = await client.PUT("/message-templates/{id}", {
        body: {
          body: forApi(texts.body, detail.variables),
          ...(custom ? { category } : {}),
          color,
          enabled: detail.enabled,
          icon,
          matrix,
          smsBody: Object.keys(sms).length === 0 ? null : sms,
          title: forApi(texts.title, detail.variables),
          // The version of the template as last read: the edits are the admin's own, rebased.
          version: detail.version,
        },
        params: { path: { id: detail.id } },
      });
      return data;
    });

  /** [Desactiva] / [Activa]: the saved template with `enabled` flipped; the edits wait, rebased. */
  const toggle = () =>
    write(
      "state",
      async () => {
        const { data } = await client.PUT("/message-templates/{id}", {
          body: {
            body: detail.bodyI18n,
            ...(custom ? { category: detail.category } : {}),
            color: detail.color,
            enabled: !detail.enabled,
            icon: detail.icon,
            matrix: detail.matrix,
            smsBody: detail.smsBodyI18n ?? null,
            title: detail.titleI18n,
            version: detail.version,
          },
          params: { path: { id: detail.id } },
        });
        return data;
      },
      { keepEdits: true },
    );

  /** A text field the api's refusal belongs to: marked invalid and described by its message. */
  const refusedField = (field: "body" | "sms" | "title", id: string) =>
    refusal?.field === field
      ? { "aria-describedby": `${id}-error`, "aria-invalid": true as const }
      : {};

  const said = (field: Refusal["field"]) =>
    refusal?.field === field ? (
      <p className="messaging-editor__error" role="alert">
        {refusal.message}
        {"stale" in refusal && refusal.stale ? (
          <Button
            onClick={() => {
              setRefusal(undefined);
              onReload();
            }}
            variant="secondary"
          >
            {t("admin-messaging:templates.reload")}
          </Button>
        ) : null}
      </p>
    ) : null;

  /**
   * The draft of one language for [Vista prèvia]. A field without text in that language is the
   * one a notification would carry (R-11-01): the club's default language, then the first that has
   * it — so a member of that language is previewed with what they would receive.
   */
  const draftFor = (candidate: string) => {
    const text = (field: "body" | "sms" | "title") =>
      [candidate, branding.defaultLocale, ...locales]
        .map((item) => texts[field][item])
        .find((value): value is string => value !== undefined && value.trim() !== "");
    const sms = text("sms");
    return {
      body: withKeys(text("body") ?? "", detail.variables),
      smsBody: sms === undefined ? null : withKeys(sms, detail.variables),
      title: withKeys(text("title") ?? "", detail.variables),
    };
  };

  return (
    <section aria-label={t("admin-messaging:templates.editorLabel")} className="messaging-editor">
      {said("top")}
      <div className="messaging-editor__head">
        <FormField
          id="template-title"
          label={t("admin-messaging:templates.titleField")}
          {...(refusal?.field === "title" ? { error: refusal.message } : {})}
        >
          <input
            {...refusedField("title", "template-title")}
            className="ah-input"
            id="template-title"
            maxLength={120}
            onChange={(event) => {
              setText("title", event.currentTarget.value);
            }}
            onFocus={() => {
              focused.current = "title";
            }}
            readOnly={locked}
            ref={titleField}
            value={texts.title[locale] ?? ""}
          />
        </FormField>
        {custom ? (
          <FormField id="template-category" label={t("admin-messaging:templates.category")}>
            <Select
              disabled={locked}
              id="template-category"
              onChange={(event) => {
                edit({ category: event.currentTarget.value as Category });
              }}
              value={category}
            >
              {CUSTOM_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {t(`enums:notificationCategory.${item}`)}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <Chip className="messaging-editor__category" tone="warning">
            {t(`enums:notificationCategory.${detail.category}`)}
          </Chip>
        )}
      </div>
      <div className="messaging-editor__row">
        <span className="messaging-editor__label" id="template-icons">
          {t("admin-messaging:templates.icon")}
        </span>
        <div aria-labelledby="template-icons" className="messaging-editor__chips" role="group">
          {ICONS.map((item) => (
            <button
              aria-label={t(`enums:templateIcon.${item}`)}
              aria-pressed={item === icon}
              className="messaging-editor__chip"
              disabled={locked}
              key={item}
              onClick={() => {
                edit({ icon: item });
              }}
              type="button"
            >
              <Icon aria-hidden="true" name={item} />
            </button>
          ))}
        </div>
        <label className="messaging-editor__locale">
          <span>{t("admin-messaging:templates.locale")}</span>
          <select
            aria-label={t("admin-messaging:templates.localeLabel")}
            onChange={(event) => {
              setLocale(event.currentTarget.value);
            }}
            value={locale}
          >
            {locales.map((item) => (
              <option key={item} value={item}>
                {item.toLocaleUpperCase()}
              </option>
            ))}
          </select>
          {others.length === 0 ? null : (
            <span>
              {t("admin-messaging:templates.localeVersions", {
                others: others.map((item) => item.toLocaleUpperCase()).join(", "),
              })}
            </span>
          )}
        </label>
      </div>
      <div className="messaging-editor__row">
        <span className="messaging-editor__label" id="template-colors">
          {t("admin-messaging:templates.color")}
        </span>
        <div aria-labelledby="template-colors" className="messaging-editor__chips" role="group">
          {COLORS.map((item) => (
            <button
              aria-label={t(`enums:templateColor.${item}`)}
              aria-pressed={item === color}
              className="messaging-editor__swatch"
              disabled={locked}
              key={item}
              onClick={() => {
                edit({ color: item });
              }}
              style={{ "--template-color": COLOR_TOKENS[item] } as CSSProperties}
              type="button"
            />
          ))}
        </div>
      </div>
      <FormField
        id="template-body"
        label={t("admin-messaging:templates.body")}
        {...(refusal?.field === "body" ? { error: refusal.message } : {})}
      >
        <textarea
          {...refusedField("body", "template-body")}
          className="ah-input ah-textarea messaging-editor__body"
          id="template-body"
          maxLength={2000}
          onChange={(event) => {
            setText("body", event.currentTarget.value);
          }}
          onFocus={() => {
            focused.current = "body";
          }}
          readOnly={locked}
          ref={bodyField}
          rows={6}
          value={texts.body[locale] ?? ""}
        />
      </FormField>
      <div className="messaging-editor__variables">
        <span className="messaging-editor__label">{t("admin-messaging:templates.variables")}</span>
        {detail.variables.map((variable) => (
          <button
            aria-label={t("admin-messaging:templates.insertVariable", { label: variable.label })}
            className="messaging-editor__variable"
            disabled={locked}
            key={variable.key}
            onClick={() => {
              insertVariable(variable);
            }}
            onMouseDown={(event) => {
              // Keep the caret in the field the admin is typing in.
              event.preventDefault();
            }}
            type="button"
          >
            {`[[${variable.label}]]`}
          </button>
        ))}
      </div>
      {smsActivatable || (smsModule && smsOn) ? (
        <FormField
          help={t("admin-messaging:templates.smsCounter", {
            count: (texts.sms[locale] ?? "").length,
          })}
          id="template-sms"
          label={t("admin-messaging:templates.smsBody")}
          {...(refusal?.field === "sms" ? { error: refusal.message } : {})}
        >
          <textarea
            {...refusedField("sms", "template-sms")}
            className="ah-input ah-textarea"
            id="template-sms"
            onChange={(event) => {
              setText("sms", event.currentTarget.value);
            }}
            onFocus={() => {
              focused.current = "sms";
            }}
            readOnly={locked}
            ref={smsField}
            rows={2}
            value={texts.sms[locale] ?? ""}
          />
        </FormField>
      ) : null}
      <p className="messaging-editor__note">{t("admin-messaging:templates.staffNote")}</p>
      <h3 className="messaging-editor__title">{t("admin-messaging:matrix.title")}</h3>
      <table className="messaging-matrix">
        <thead>
          <tr>
            <td />
            {CHANNELS.filter((channel) => channel !== "SMS" || smsModule).map((channel) => (
              <th key={channel} scope="col">
                {t(`enums:notificationChannel.${channel}`)}
              </th>
            ))}
            {pushModule ? <th scope="col">{t("enums:notificationChannel.PUSH")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {AUDIENCES.map((audience) => (
            <tr key={audience}>
              <th scope="row">{t(`enums:notificationAudience.${audience}`)}</th>
              {CHANNELS.filter((channel) => channel !== "SMS" || smsModule).map((channel) => {
                const cell = `${t(`enums:notificationAudience.${audience}`)} · ${t(`enums:notificationChannel.${channel}`)}`;
                return (
                  <td
                    className={
                      cellRefused === `${audience}.${channel}`
                        ? "messaging-matrix__refused"
                        : undefined
                    }
                    key={channel}
                  >
                    {detail.caps[audience].includes(channel) ? (
                      <label className="messaging-matrix__cell">
                        <Checkbox
                          aria-label={cell}
                          checked={matrix[audience][channel]}
                          disabled={locked}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            edit({
                              matrix: {
                                ...edits.matrix,
                                [audience]: { ...edits.matrix?.[audience], [channel]: checked },
                              },
                            });
                          }}
                        />
                        {audience === "MEMBER" && channel === "EMAIL" ? (
                          <span className="messaging-matrix__hint">
                            {t("admin-messaging:matrix.byPreference")}
                          </span>
                        ) : null}
                      </label>
                    ) : (
                      // Outside `caps`: the mockup's inert «—», not a control (never a disabled
                      // checkbox the admin could think of enabling).
                      <span
                        aria-checked="false"
                        aria-disabled="true"
                        aria-label={t("admin-messaging:matrix.notAvailable", { cell })}
                        className="messaging-matrix__none"
                        role="checkbox"
                      >
                        —
                      </span>
                    )}
                  </td>
                );
              })}
              {pushModule ? (
                <td>
                  <span
                    aria-label={
                      detail.push.includes(audience)
                        ? t("admin-messaging:matrix.pushOn", {
                            audience: t(`enums:notificationAudience.${audience}`),
                          })
                        : t("admin-messaging:matrix.pushOff", {
                            audience: t(`enums:notificationAudience.${audience}`),
                          })
                    }
                    className="messaging-matrix__push"
                    role="img"
                  >
                    {detail.push.includes(audience) ? "✓" : "—"}
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {said("matrix")}
      <p className="messaging-editor__note">{t("admin-messaging:matrix.footnote")}</p>
      <div className="messaging-editor__actions">
        <div className="messaging-editor__secondary">
          {detail.customized && detail.kind === "CATALOG" ? (
            <Button
              disabled={busy !== undefined}
              onClick={() => {
                setConfirm("reset");
              }}
              variant="ghost"
            >
              {t("admin-messaging:templates.reset")}
            </Button>
          ) : null}
          {said("reset")}
          {detail.mandatory ? null : (
            <Button
              disabled={busy !== undefined}
              loading={busy === "state"}
              loadingLabel={t("admin-messaging:templates.saving")}
              onClick={() => void toggle()}
              variant="ghost"
            >
              {detail.enabled
                ? t("admin-messaging:templates.disable")
                : t("admin-messaging:templates.enable")}
            </Button>
          )}
          {said("state")}
          {custom ? (
            <Button
              disabled={busy !== undefined}
              onClick={() => {
                setConfirm("delete");
              }}
              variant="ghost"
            >
              {t("admin-messaging:templates.delete")}
            </Button>
          ) : null}
          {said("delete")}
        </div>
        <LastChange entityId={detail.id} entityType="MessageTemplate" value={detail.lastChange} />
        <Button
          disabled={busy !== undefined}
          onClick={() => {
            setPreview(true);
          }}
          variant="secondary"
        >
          {t("admin-messaging:templates.preview")}
        </Button>
        <Button
          disabled={!dirty || (busy !== undefined && busy !== "save")}
          loading={busy === "save"}
          loadingLabel={t("admin-messaging:templates.saving")}
          onClick={() => void save()}
        >
          {t("admin-messaging:templates.save")}
        </Button>
      </div>
      <Modal
        closeLabel={t("admin-messaging:templates.close")}
        onClose={() => {
          setConfirm(undefined);
        }}
        open={confirm !== undefined}
        title={
          confirm === "delete"
            ? t("admin-messaging:templates.deleteConfirm")
            : t("admin-messaging:templates.resetConfirm")
        }
      >
        {said(confirm === "delete" ? "delete" : "reset")}
        <div className="messaging-dialog__actions">
          <Button
            disabled={busy !== undefined}
            onClick={() => {
              setConfirm(undefined);
            }}
            variant="ghost"
          >
            {t("admin-messaging:templates.cancel")}
          </Button>
          <Button
            loading={busy === confirm}
            loadingLabel={t("admin-messaging:templates.saving")}
            onClick={() => {
              if (confirm === "delete") {
                void write("delete", async () => {
                  await client.DELETE("/message-templates/{id}", {
                    params: { path: { id: detail.id } },
                  });
                  return undefined;
                });
              } else {
                void write("reset", async () => {
                  const { data } = await client.POST("/message-templates/{id}/reset", {
                    params: { path: { id: detail.id } },
                  });
                  return data;
                });
              }
            }}
            variant={confirm === "delete" ? "danger" : "primary"}
          >
            {confirm === "delete"
              ? t("admin-messaging:templates.deleteAction")
              : t("admin-messaging:templates.resetAction")}
          </Button>
        </div>
      </Modal>
      {preview ? (
        <TemplatePreviewDialog
          client={client}
          draftFor={draftFor}
          initialLocale={locale}
          locales={locales}
          onClose={() => {
            setPreview(false);
          }}
          templateId={detail.id}
        />
      ) : null}
    </section>
  );
}
