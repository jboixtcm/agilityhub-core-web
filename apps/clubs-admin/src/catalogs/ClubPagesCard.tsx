import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import {
  Badge,
  Button,
  Card,
  Drawer,
  FormField,
  Icon,
  Input,
  LimitedMarkdown,
  Modal,
  Skeleton,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { LocaleTabs, useCatalogData, useCatalogError } from "./shared";

type ClubPage = components["schemas"]["ClubPage"];
type ClubPageCreate = components["schemas"]["ClubPageCreate"];
type ClubPagePatch = components["schemas"]["ClubPagePatch"];
type LocalizedText = Record<string, string>;

const fixedKeys = ["RULES", "PRIVACY", "IMAGE_CONSENT", "WELCOME_GUIDE"] as const;
type FixedKey = (typeof fixedKeys)[number];

interface EditingPage {
  item?: ClubPage;
  key: string;
}

function isFixedKey(key: string): key is FixedKey {
  return (fixedKeys as readonly string[]).includes(key);
}

function fixedTitle(t: ReturnType<typeof useTranslation>["t"], key: FixedKey): string {
  switch (key) {
    case "IMAGE_CONSENT":
      return t("admin-settings:clubPages.fixed.IMAGE_CONSENT");
    case "PRIVACY":
      return t("admin-settings:clubPages.fixed.PRIVACY");
    case "RULES":
      return t("admin-settings:clubPages.fixed.RULES");
    case "WELCOME_GUIDE":
      return t("admin-settings:clubPages.fixed.WELCOME_GUIDE");
  }
}

function localizedText(source: LocalizedText, locale: string, fallbackLocale: string): string {
  return source[locale] ?? source[fallbackLocale] ?? Object.values(source)[0] ?? "";
}

function hasProvisionalText(page: ClubPage): boolean {
  return Object.values(page.body).some((body) => /^\s*\[Text pendent\b/iu.test(body));
}

function validationField(error: unknown): string | undefined {
  if (
    !isApiError(error, "VALIDATION_ERROR") ||
    error.details === null ||
    typeof error.details !== "object"
  ) {
    return undefined;
  }
  const fieldErrors = (error.details as Record<string, unknown>).fieldErrors;
  if (!Array.isArray(fieldErrors)) return undefined;
  const field = fieldErrors
    .map((item: unknown) =>
      typeof item === "object" && item !== null ? (item as Record<string, unknown>).field : null,
    )
    .find((item): item is string => typeof item === "string");
  return field;
}

function ClubPageEditor({
  client,
  editing,
  existingKeys,
  onClose,
  onSaved,
}: {
  client: ApiClient;
  editing: EditingPage;
  existingKeys: readonly string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const branding = useBranding();
  const { t } = useTranslation("admin-settings");
  const messageForError = useCatalogError();
  const item = editing.item;
  const [locale, setLocale] = useState(branding.defaultLocale);
  const [key, setKey] = useState(editing.key);
  const [title, setTitle] = useState<LocalizedText>(() =>
    item === undefined
      ? isFixedKey(editing.key)
        ? { [branding.defaultLocale]: fixedTitle(t, editing.key) }
        : {}
      : { ...item.title },
  );
  const [body, setBody] = useState<LocalizedText>(() => ({ ...item?.body }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [bodyError, setBodyError] = useState<string>();
  const [confirmPublish, setConfirmPublish] = useState(false);
  const normalizedKey = key.trim();

  const save = async (action: "deactivate" | "draft" | "publish") => {
    setError(undefined);
    setBodyError(undefined);
    if (
      (title[branding.defaultLocale]?.trim() ?? "") === "" ||
      (body[branding.defaultLocale]?.trim() ?? "") === ""
    ) {
      setBodyError(t("admin-settings:clubPages.defaultLocaleRequired"));
      return;
    }
    if (item === undefined && existingKeys.includes(normalizedKey)) {
      setError(t("admin-settings:clubPages.duplicateKey"));
      return;
    }
    setPending(true);
    try {
      if (item === undefined) {
        const request: ClubPageCreate = {
          active: action === "publish",
          body,
          key: normalizedKey,
          title,
        };
        await client.POST("/club-pages", { body: request });
      } else {
        const request: ClubPagePatch = {
          body,
          title,
          version: item.version,
          ...(action === "publish"
            ? { active: true }
            : action === "deactivate"
              ? { active: false }
              : {}),
        };
        await client.PATCH("/club-pages/{key}", {
          body: request,
          params: { path: { key: item.key } },
        });
      }
      onSaved();
      onClose();
    } catch (cause) {
      if (isApiError(cause, "STALE_VERSION")) {
        setError(t("admin-settings:clubPages.stale"));
      } else if (validationField(cause)?.startsWith("body") === true) {
        setBodyError(t("admin-settings:clubPages.invalidBody"));
      } else {
        setError(messageForError(cause));
      }
    } finally {
      setPending(false);
      setConfirmPublish(false);
    }
  };

  const requestPublish = () => {
    if (isFixedKey(normalizedKey)) {
      setConfirmPublish(true);
    } else {
      void save("publish");
    }
  };

  return (
    <>
      <form
        className="club-page-editor"
        onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
          event.preventDefault();
          void save("draft");
        }}
      >
        {item === undefined && !isFixedKey(editing.key) ? (
          <FormField
            help={t("admin-settings:clubPages.keyHelp")}
            id="club-page-key"
            label={t("admin-settings:clubPages.key")}
          >
            <Input
              id="club-page-key"
              maxLength={40}
              minLength={2}
              onChange={(event) => {
                setKey(event.currentTarget.value);
              }}
              pattern="[a-z0-9-]{2,40}"
              required
              value={key}
            />
          </FormField>
        ) : null}
        <LocaleTabs locale={locale} locales={branding.locales} onChange={setLocale} />
        <FormField id="club-page-title" label={t("admin-settings:clubPages.titleField")}>
          <Input
            id="club-page-title"
            onChange={(event) => {
              const value = event.currentTarget.value;
              setTitle((current) => ({ ...current, [locale]: value }));
            }}
            required={locale === branding.defaultLocale}
            value={title[locale] ?? ""}
          />
        </FormField>
        <div className="club-page-editor__columns">
          <FormField
            help={t("admin-settings:clubPages.markdownHelp")}
            id="club-page-body"
            label={t("admin-settings:clubPages.bodyField")}
            {...(bodyError === undefined ? {} : { error: bodyError })}
          >
            <Textarea
              id="club-page-body"
              maxLength={20_000}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setBody((current) => ({ ...current, [locale]: value }));
              }}
              required={locale === branding.defaultLocale}
              rows={16}
              value={body[locale] ?? ""}
            />
          </FormField>
          <section className="club-page-preview">
            <h3>{t("admin-settings:clubPages.preview")}</h3>
            {(body[locale] ?? "").trim() === "" ? (
              <p>{t("admin-settings:clubPages.previewEmpty")}</p>
            ) : (
              <LimitedMarkdown>{body[locale] ?? ""}</LimitedMarkdown>
            )}
          </section>
        </div>
        {item !== undefined && hasProvisionalText({ ...item, body }) ? (
          <p className="club-page-provisional" role="status">
            <Icon aria-hidden="true" name="warn" />
            {t("admin-settings:clubPages.provisional")}
          </p>
        ) : null}
        {error === undefined ? null : <p role="alert">{error}</p>}
        <div className="club-page-editor__actions">
          {item?.active === true && !isFixedKey(item.key) ? (
            <Button
              loading={pending}
              onClick={() => void save("deactivate")}
              type="button"
              variant="danger"
            >
              {t("admin-settings:clubPages.deactivate")}
            </Button>
          ) : null}
          <Button loading={pending} type="submit" variant="secondary">
            {t("admin-settings:clubPages.saveDraft")}
          </Button>
          <Button loading={pending} onClick={requestPublish} type="button">
            {t("admin-settings:clubPages.publish")}
          </Button>
        </div>
      </form>
      <Modal
        closeLabel={t("admin-settings:common.close")}
        onClose={() => {
          setConfirmPublish(false);
        }}
        open={confirmPublish}
        title={t("admin-settings:clubPages.publishTitle")}
      >
        <p>
          {t("admin-settings:clubPages.publishConfirmation", {
            version: (item?.version ?? 0) + 1,
          })}
        </p>
        <div className="club-page-editor__actions">
          <Button
            onClick={() => {
              setConfirmPublish(false);
            }}
            variant="ghost"
          >
            {t("admin-settings:common.cancel")}
          </Button>
          <Button loading={pending} onClick={() => void save("publish")}>
            {t("admin-settings:clubPages.publish")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export function ClubPagesCard({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const { i18n, t } = useTranslation("admin-settings");
  const [editing, setEditing] = useState<EditingPage>();
  const loadPages = useCallback(async () => {
    const result = await client.GET("/club-pages", {});
    if (result.data === undefined) {
      throw new TypeError("Club page response did not contain data");
    }
    return result.data.items;
  }, [client]);
  const pages = useCatalogData(loadPages, client);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const rows = useMemo(() => {
    const byKey = new Map(pages.items.map((page) => [page.key, page]));
    const fixed = fixedKeys.map((key) => ({ key, page: byKey.get(key) }));
    const free = pages.items
      .filter((page) => !isFixedKey(page.key))
      .map((page) => ({ key: page.key, page }));
    return [...fixed, ...free];
  }, [pages.items]);
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      timeZone: branding.timeZone,
    }).format(new Date(value));

  return (
    <>
      <Card className="settings-card club-pages-card" id="club-pages">
        <div className="club-pages-card__header">
          <h2>{t("admin-settings:blocks.clubPages")}</h2>
          <Button
            onClick={() => {
              setEditing({ key: "" });
            }}
            variant="secondary"
          >
            <Icon aria-hidden="true" name="plus" />
            {t("admin-settings:clubPages.new")}
          </Button>
        </div>
        {pages.loading ? <Skeleton label={t("admin-settings:common.loading")} /> : null}
        {pages.error === undefined ? null : (
          <p role="alert">{t("admin-settings:clubPages.loadError")}</p>
        )}
        {pages.loading || pages.error !== undefined ? null : (
          <ul className="club-pages-list">
            {rows.map(({ key, page }) => (
              <li key={key}>
                <button
                  onClick={() => {
                    setEditing(page === undefined ? { key } : { item: page, key });
                  }}
                  type="button"
                >
                  <span className="club-pages-list__title">
                    <strong>
                      {page === undefined
                        ? fixedTitle(t, key as FixedKey)
                        : localizedText(page.title, locale, branding.defaultLocale)}
                    </strong>
                    {page !== undefined && hasProvisionalText(page) ? (
                      <small className="club-page-provisional">
                        <Icon aria-hidden="true" name="warn" />
                        {t("admin-settings:clubPages.provisional")}
                      </small>
                    ) : null}
                  </span>
                  <span className="club-pages-list__meta">
                    <Badge tone={page?.active === true ? "success" : "neutral"}>
                      {page === undefined
                        ? t("admin-settings:clubPages.noContent")
                        : page.active
                          ? t("admin-settings:clubPages.published")
                          : t("admin-settings:clubPages.draft")}
                    </Badge>
                    {page === undefined
                      ? null
                      : t("admin-settings:clubPages.versionDate", {
                          date: formatDate(page.publishedAt ?? page.lastChange.at),
                          version: page.version,
                        })}
                    <Icon aria-hidden="true" name="edit" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Drawer
        closeLabel={t("admin-settings:common.close")}
        onClose={() => {
          setEditing(undefined);
        }}
        open={editing !== undefined}
        title={t("admin-settings:clubPages.editorTitle")}
      >
        {editing === undefined ? null : (
          <ClubPageEditor
            client={client}
            editing={editing}
            existingKeys={pages.items.map((page) => page.key)}
            onClose={() => {
              setEditing(undefined);
            }}
            onSaved={pages.reload}
          />
        )}
      </Drawer>
    </>
  );
}
