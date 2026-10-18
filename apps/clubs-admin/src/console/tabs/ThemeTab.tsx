import {
  apiFieldErrors,
  type components,
  isApiError,
  putSignedFile,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import {
  Badge,
  type BrandingTheme,
  brandingThemeStyle,
  Button,
  Card,
  contrastRatio,
  FormField,
  Icon,
  IconButton,
  Input,
  Select,
} from "@agilityhub/ui";
import { type CSSProperties, type SyntheticEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  consoleErrorMessage,
  FormMessage,
  type PlatformClub,
  SectionCard,
  useRebasedDraft,
  useWriteState,
} from "../shared";

type Colors = components["schemas"]["Colors"];
type ColorKey = keyof Colors;
type ThemeRequest = components["schemas"]["PlatformThemeRequest"];

export const COLOR_KEYS = [
  "primary",
  "onPrimary",
  "background",
  "surface",
  "surfaceAlt",
  "text",
  "textMuted",
  "border",
  "success",
  "warning",
  "danger",
  "info",
] as const satisfies readonly ColorKey[];

/**
 * WCAG AA (4.5:1) on the pairs the shells read text on (S17 §2 «contrast AA validat»): the text on
 * the primary button, and the text on the page and on the cards. The api refuses the same with
 * `422 THEME_CONTRAST {field}`.
 */
export const CONTRAST_PAIRS = [
  ["onPrimary", "primary"],
  ["text", "background"],
  ["text", "surface"],
] as const satisfies readonly (readonly [ColorKey, ColorKey])[];

export const AA_RATIO = 4.5;

export function contrastFailures(
  colors: Colors,
): { background: ColorKey; foreground: ColorKey; ratio: number }[] {
  return CONTRAST_PAIRS.flatMap(([foreground, background]) => {
    const ratio = contrastRatio(colors[foreground], colors[background]) ?? 0;
    return ratio < AA_RATIO ? [{ background, foreground, ratio }] : [];
  });
}

/** Each AA pair with its ratio, as the draft stands (the theme tab and the wizard's step 5). */
export function ContrastChecks({ colors }: { colors: Colors }) {
  const { t } = useTranslation("console");
  return (
    <ul aria-label={t("console:theme.contrastTitle")} className="console-contrast">
      {CONTRAST_PAIRS.map(([foreground, background]) => {
        const ratio = contrastRatio(colors[foreground], colors[background]) ?? 0;
        const values = { ratio: ratio.toFixed(2) };
        return (
          <li key={`${foreground}-${background}`}>
            <span>
              {t("console:theme.contrastPair", {
                background: t(`console:theme.colors.${background}`),
                foreground: t(`console:theme.colors.${foreground}`),
              })}
            </span>
            {ratio >= AA_RATIO ? (
              <Badge tone="success">{t("console:theme.contrastPass", values)}</Badge>
            ) : (
              <Badge tone="danger">{t("console:theme.contrastFail", values)}</Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const LOGO_SLOTS = ["logo", "logoDark", "mark"] as const;
type LogoSlot = (typeof LOGO_SLOTS)[number];
const LOGO_REQUEST_FIELD = {
  logo: "logoFileKey",
  logoDark: "logoDarkFileKey",
  mark: "markFileKey",
} as const satisfies Record<LogoSlot, keyof ThemeRequest>;
const LOGO_URL_FIELD = {
  logo: "logoUrl",
  logoDark: "logoDarkUrl",
  mark: "markUrl",
} as const satisfies Record<LogoSlot, keyof PlatformClub["theme"]>;

/** A logo change not yet published: a granted upload (its key and local preview) or a removal. */
type LogoChange = { fileKey: string; name: string; preview: string } | { remove: true };

function themeValues(club: PlatformClub) {
  return {
    colors: { ...club.theme.colors },
    fontFamily: club.theme.fontFamily,
    mode: club.theme.mode,
    radius: club.theme.radius,
    ringPalette: [...club.theme.ringPalette],
  };
}

type ThemeValues = ReturnType<typeof themeValues>;

/**
 * The live preview (S17 §2 «previsualització en viu de la shell de `clubs` i `clubs-admin`»): the
 * draft's tokens scoped to the preview, so the page keeps its own theme. Not interactive.
 */
export function ThemePreview({
  clubName,
  logos,
  theme,
}: {
  clubName: string;
  logos: { logo?: string | undefined; logoDark?: string | undefined; mark?: string | undefined };
  theme: BrandingTheme;
}) {
  const { t } = useTranslation("console");
  const style = brandingThemeStyle(theme) as CSSProperties;
  const mark =
    logos.mark === undefined ? (
      <span aria-hidden="true" className="console-preview__initial">
        {clubName.charAt(0)}
      </span>
    ) : (
      <img alt="" src={logos.mark} />
    );
  const fullLogo = theme.mode === "dark" ? (logos.logoDark ?? logos.logo) : logos.logo;
  return (
    <div className="console-preview">
      <figure className="console-preview__frame" data-testid="theme-preview-clubs">
        <figcaption>{t("console:theme.preview.clubs")}</figcaption>
        <div className="console-preview__app" data-theme={theme.mode} inert style={style}>
          <div className="console-preview__appbar">
            {mark}
            <strong>{clubName}</strong>
          </div>
          <div className="console-preview__body">
            {fullLogo === undefined ? null : (
              <img alt="" className="console-preview__logo" src={fullLogo} />
            )}
            <Card className="console-preview__card">
              <strong>{t("console:theme.preview.nextClass")}</strong>
              <span className="console-preview__muted">{t("console:theme.preview.when")}</span>
              <span className="console-preview__badges">
                <Badge tone="success">{t("console:theme.preview.booked")}</Badge>
                <Badge tone="warning">{t("console:theme.preview.waitlist")}</Badge>
                <Badge tone="danger">{t("console:theme.preview.full")}</Badge>
              </span>
              <Button>{t("console:theme.preview.book")}</Button>
            </Card>
          </div>
          <div className="console-preview__tabbar">
            <span aria-current="page">
              <Icon aria-hidden="true" name="home" />
              {t("console:theme.preview.home")}
            </span>
            <span>
              <Icon aria-hidden="true" name="cal" />
              {t("console:theme.preview.classes")}
            </span>
            <span>
              <Icon aria-hidden="true" name="user" />
              {t("console:theme.preview.profile")}
            </span>
          </div>
        </div>
      </figure>
      <figure className="console-preview__frame" data-testid="theme-preview-clubs-admin">
        <figcaption>{t("console:theme.preview.clubsAdmin")}</figcaption>
        <div className="console-preview__admin" data-theme={theme.mode} inert style={style}>
          <div className="console-preview__header">
            {mark}
            <strong>{clubName}</strong>
          </div>
          <div className="console-preview__admin-body">
            <div className="console-preview__sidebar">
              <span aria-current="page">{t("console:theme.preview.dashboard")}</span>
              <span>{t("console:theme.preview.members")}</span>
              <span>{t("console:theme.preview.calendar")}</span>
            </div>
            <Card className="console-preview__card">
              <strong>{t("console:theme.preview.dashboard")}</strong>
              <span className="console-preview__muted">{t("console:theme.preview.kpi")}</span>
              <span className="console-preview__ring-palette">
                {(theme.ringPalette ?? []).map((color, index) => (
                  <span
                    className="console-preview__ring"
                    key={`${color}-${String(index)}`}
                    style={
                      {
                        "--console-ring": `var(--ah-color-ring-${String(index + 1)})`,
                      } as CSSProperties
                    }
                  />
                ))}
              </span>
              <span className="console-preview__actions">
                <Button>{t("console:theme.preview.primary")}</Button>
                <Button variant="secondary">{t("console:theme.preview.secondary")}</Button>
              </span>
            </Card>
          </div>
        </div>
      </figure>
    </div>
  );
}

/** S17 §2 «Tema»: the token editor, the logos (the one upload route) and the live preview. */
export function ThemeTab({ client, club, onReload }: ConsoleTabProps) {
  const { t } = useTranslation(["console", "errors", "common"]);
  const form = useRebasedDraft<ThemeValues>(
    themeValues(club),
    `${club.id}:${String(club.version)}`,
  );
  const write = useWriteState();
  const uploadKeys = useSubmissionKeys();
  const [logos, setLogos] = useState<Partial<Record<LogoSlot, LogoChange>>>({});
  const [uploading, setUploading] = useState<LogoSlot>();
  const [uploadError, setUploadError] = useState<{ message: string; slot: LogoSlot }>();
  const { draft } = form;
  const failures = contrastFailures(draft.colors);
  const failing = new Set<ColorKey>(failures.map((failure) => failure.foreground));
  const apiField = apiFieldErrors(write.error)[0]?.field.replace(/^colors\./u, "");
  const logosChanged = Object.keys(logos).length > 0;
  const dirty = form.changed.length > 0 || logosChanged;

  // The previews of picked files are released when the tab goes (a replaced one at once).
  const previews = useRef(new Set<string>());
  const fileInputs = useRef<Partial<Record<LogoSlot, HTMLInputElement | null>>>({});
  useEffect(() => {
    const created = previews.current;
    return () => {
      for (const preview of created) URL.revokeObjectURL(preview);
      created.clear();
    };
  }, []);
  const replaceLogo = (slot: LogoSlot, change: LogoChange | undefined) => {
    setLogos((current) => {
      const previous = current[slot];
      if (previous !== undefined && "preview" in previous) {
        URL.revokeObjectURL(previous.preview);
        previews.current.delete(previous.preview);
      }
      const others = Object.fromEntries(
        Object.entries(current).filter(([candidate]) => candidate !== slot),
      ) as Partial<Record<LogoSlot, LogoChange>>;
      return change === undefined ? others : { ...others, [slot]: change };
    });
  };

  const logoUrl = (slot: LogoSlot): string | undefined => {
    const change = logos[slot];
    if (change === undefined) return club.theme[LOGO_URL_FIELD[slot]] ?? undefined;
    return "remove" in change ? undefined : change.preview;
  };

  const upload = async (slot: LogoSlot, file: File) => {
    setUploading(slot);
    setUploadError(undefined);
    const body = {
      fileName: file.name,
      mimeType: file.type === "" ? "application/octet-stream" : file.type,
      sizeBytes: file.size,
    };
    try {
      const signed = await uploadKeys.send(
        JSON.stringify({ ...body, lastModified: file.lastModified, slot }),
        async (key) => {
          const result = await client.POST("/platform/clubs/{id}/theme/upload-url", {
            body,
            params: { header: { "Idempotency-Key": key }, path: { id: club.id } },
          });
          if (result.data === undefined) throw new TypeError("Upload grant without data");
          return result.data;
        },
      );
      await putSignedFile(signed, file);
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      replaceLogo(slot, { fileKey: signed.fileKey, name: file.name, preview });
    } catch (error) {
      setUploadError({
        message: isApiError(error)
          ? consoleErrorMessage(t, error)
          : t("console:theme.uploadFailed"),
        slot,
      });
    } finally {
      setUploading(undefined);
    }
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || failures.length > 0) return;
    const body: ThemeRequest = {
      colors: draft.colors,
      fontFamily: draft.fontFamily.trim(),
      mode: draft.mode,
      radius: draft.radius.trim(),
      ringPalette: draft.ringPalette,
      version: club.version,
    };
    for (const slot of LOGO_SLOTS) {
      const change = logos[slot];
      // Omitted keeps the published logo; `""` removes it (PlatformThemeRequest).
      if (change !== undefined)
        body[LOGO_REQUEST_FIELD[slot]] = "remove" in change ? "" : change.fileKey;
    }
    const saved = await write.run(async () => {
      const result = await client.PUT("/platform/clubs/{id}/theme", {
        body,
        params: { path: { id: club.id } },
      });
      if (result.data === undefined) throw new TypeError("Theme without data");
      return result.data;
    }, onReload);
    if (saved !== undefined) {
      for (const slot of LOGO_SLOTS) replaceLogo(slot, undefined);
      // The answer is the theme, not the record: the record (its version, the checklist's
      // «branding») is read again before the next write.
      await onReload();
    }
  };

  const previewTheme: BrandingTheme = {
    colors: draft.colors,
    fontFamily: draft.fontFamily,
    mode: draft.mode,
    radius: draft.radius,
    ringPalette: draft.ringPalette,
  };

  return (
    <form className="console-form console-theme" onSubmit={(event) => void submit(event)}>
      <div className="console-theme__layout">
        <fieldset className="console-fieldset" disabled={write.pending}>
          <SectionCard
            description={t("console:theme.colorsHelp")}
            title={t("console:theme.colorsTitle")}
          >
            <div className="console-color-grid">
              {COLOR_KEYS.map((key) => {
                const error = failing.has(key)
                  ? t("console:theme.contrastFailure", {
                      background: t(
                        `console:theme.colors.${failures.find((item) => item.foreground === key)?.background ?? "background"}`,
                      ),
                      ratio: (failures.find((item) => item.foreground === key)?.ratio ?? 0).toFixed(
                        2,
                      ),
                    })
                  : apiField === key
                    ? consoleErrorMessage(t, write.error)
                    : undefined;
                return (
                  <FormField
                    id={`console-theme-${key}`}
                    key={key}
                    label={t(`console:theme.colors.${key}`)}
                    {...(error === undefined ? {} : { error })}
                  >
                    <span className="console-color-input">
                      <Input
                        aria-invalid={error === undefined ? undefined : true}
                        id={`console-theme-${key}`}
                        onChange={(event) => {
                          form.setField("colors", {
                            ...draft.colors,
                            [key]: event.currentTarget.value,
                          });
                        }}
                        type="color"
                        value={draft.colors[key]}
                      />
                      <code>{draft.colors[key].toLocaleUpperCase()}</code>
                    </span>
                  </FormField>
                );
              })}
            </div>
            <ContrastChecks colors={draft.colors} />
          </SectionCard>
          <SectionCard title={t("console:theme.typographyTitle")}>
            <div className="console-grid">
              <FormField id="console-theme-font" label={t("console:theme.fontFamily")}>
                <Input
                  id="console-theme-font"
                  onChange={(event) => {
                    form.setField("fontFamily", event.currentTarget.value);
                  }}
                  required
                  value={draft.fontFamily}
                />
              </FormField>
              <FormField
                help={t("console:theme.radiusHelp")}
                id="console-theme-radius"
                label={t("console:theme.radius")}
                {...(apiField === "radius"
                  ? { error: t("console:fieldErrors.INVALID_VALUE") }
                  : {})}
              >
                <Input
                  id="console-theme-radius"
                  onChange={(event) => {
                    form.setField("radius", event.currentTarget.value);
                  }}
                  pattern="\d+(\.\d+)?px"
                  required
                  value={draft.radius}
                />
              </FormField>
              <FormField id="console-theme-mode" label={t("console:theme.mode")}>
                <Select
                  id="console-theme-mode"
                  onChange={(event) => {
                    form.setField("mode", event.currentTarget.value as ThemeValues["mode"]);
                  }}
                  value={draft.mode}
                >
                  {(["auto", "light", "dark"] as const).map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`console:theme.modes.${mode}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <fieldset className="console-ring-palette">
              <legend>{t("console:theme.ringPalette")}</legend>
              {draft.ringPalette.map((color, index) => (
                <span className="console-color-input" key={`ring-${String(index)}`}>
                  <Input
                    aria-label={t("console:theme.ringColor", { index: index + 1 })}
                    onChange={(event) => {
                      const next = [...draft.ringPalette];
                      next[index] = event.currentTarget.value;
                      form.setField("ringPalette", next);
                    }}
                    type="color"
                    value={color}
                  />
                  <IconButton
                    icon="x"
                    label={t("console:theme.removeRingColor", { index: index + 1 })}
                    onClick={() => {
                      form.setField(
                        "ringPalette",
                        draft.ringPalette.filter((_, candidate) => candidate !== index),
                      );
                    }}
                  />
                </span>
              ))}
              <Button
                onClick={() => {
                  form.setField("ringPalette", [...draft.ringPalette, draft.colors.primary]);
                }}
                variant="secondary"
              >
                <Icon aria-hidden="true" name="plus" />
                {t("console:theme.addRingColor")}
              </Button>
            </fieldset>
          </SectionCard>
          <SectionCard
            description={t("console:theme.logosHelp")}
            title={t("console:theme.logosTitle")}
          >
            {LOGO_SLOTS.map((slot) => {
              const current = logoUrl(slot);
              const change = logos[slot];
              return (
                <div className="console-logo-row" key={slot}>
                  <span className="console-logo-row__preview">
                    {current === undefined ? (
                      <span className="console-muted">{t("console:theme.noLogo")}</span>
                    ) : (
                      <img alt={t(`console:theme.logoAlt.${slot}`)} src={current} />
                    )}
                  </span>
                  <FormField
                    id={`console-theme-${slot}`}
                    label={t(`console:theme.logos.${slot}`)}
                    {...(uploadError?.slot === slot ? { error: uploadError.message } : {})}
                    {...(change !== undefined && "name" in change
                      ? { help: t("console:theme.logoPending", { name: change.name }) }
                      : {})}
                  >
                    {/* The browser's own picker text is never translated: a labelled button opens
                        the hidden input (round 2 #8). */}
                    <input
                      accept="image/*"
                      className="ah-sr-only"
                      disabled={uploading !== undefined}
                      id={`console-theme-${slot}`}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file !== undefined) void upload(slot, file);
                      }}
                      ref={(input) => {
                        fileInputs.current[slot] = input;
                      }}
                      tabIndex={-1}
                      type="file"
                    />
                    <Button
                      // The visible control: it carries the field's help (the pending file) and
                      // its upload error, which a screen reader would otherwise never reach.
                      aria-describedby={
                        [
                          change !== undefined && "name" in change
                            ? `console-theme-${slot}-help`
                            : undefined,
                          uploadError?.slot === slot ? `console-theme-${slot}-error` : undefined,
                        ]
                          .filter((value) => value !== undefined)
                          .join(" ") || undefined
                      }
                      aria-label={t("console:theme.chooseLogoLabel", {
                        logo: t(`console:theme.logos.${slot}`),
                      })}
                      disabled={uploading !== undefined}
                      onClick={() => fileInputs.current[slot]?.click()}
                      variant="secondary"
                    >
                      {t("console:theme.chooseLogo")}
                    </Button>
                  </FormField>
                  <Button
                    disabled={current === undefined || uploading !== undefined}
                    onClick={() => {
                      replaceLogo(slot, { remove: true });
                    }}
                    variant="ghost"
                  >
                    {t("console:theme.removeLogo")}
                  </Button>
                </div>
              );
            })}
            {uploading === undefined ? null : (
              <p className="console-muted" role="status">
                {t("console:theme.uploading")}
              </p>
            )}
          </SectionCard>
        </fieldset>
        <div className="console-theme__preview">
          <h2>{t("console:theme.previewTitle")}</h2>
          <ThemePreview
            clubName={club.name}
            logos={{ logo: logoUrl("logo"), logoDark: logoUrl("logoDark"), mark: logoUrl("mark") }}
            theme={previewTheme}
          />
        </div>
      </div>
      {failures.length > 0 ? (
        <FormMessage message={t("console:theme.contrastBlocked")} tone="danger" />
      ) : null}
      <FormMessage
        message={write.error === undefined ? undefined : consoleErrorMessage(t, write.error)}
        tone="danger"
      />
      <FormMessage message={write.done ? t("console:common.saved") : undefined} tone="success" />
      <div className="console-actions">
        <Button
          disabled={!dirty}
          onClick={() => {
            form.reset();
            for (const slot of LOGO_SLOTS) replaceLogo(slot, undefined);
          }}
          variant="ghost"
        >
          {t("console:common.discard")}
        </Button>
        <Button
          disabled={!dirty || failures.length > 0 || uploading !== undefined}
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
