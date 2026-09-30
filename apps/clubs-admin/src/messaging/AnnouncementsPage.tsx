import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  FormField,
  Icon,
  Input,
  Modal,
  Select,
  Skeleton,
  Toast,
  useBranding,
} from "@agilityhub/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AnnouncementSent, SendAnnouncementDialog } from "./SendAnnouncementDialog";
import { CUSTOM_CATEGORIES, TemplateEditor, type TemplateEdits } from "./TemplateEditor";

import "./messaging.css";

type Category = components["schemas"]["NotificationCategory"];
type Detail = components["schemas"]["MessageTemplateDetail"];
type TemplateList = components["schemas"]["MessageTemplateList"];

/** The four rows of «Plantilles per categoria», in mockup D9's order. */
const CATEGORIES = ["OPERATIONAL", "PERSONAL", "CLUB_CHANGES", "CLUB_NEWS"] as const;

type Load<Data> =
  { data: Data; status: "ready" } | { error: unknown; status: "error" } | { status: "loading" };

function without<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));
}

function templateParam(): string | null {
  const value = new URLSearchParams(window.location.search).get("template");
  return value === null || value === "" ? null : value;
}

function writeTemplateParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id === null) url.searchParams.delete("template");
  else url.searchParams.set("template", id);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

/**
 * D9 «Comunicats i plantilles» (`/comunicats?template=`, S11 §2, R-11-12, R-11-13): the counts per
 * category and the templates of `GET /message-templates` (a category row filters the list), the
 * editor of the selected one, «＋ Nova plantilla» and «Enviar comunicat». The admin's unsaved
 * edits are kept per template, so opening another one and coming back keeps them.
 */
export function AnnouncementsPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["admin-messaging", "enums", "errors"]);
  const branding = useBranding();
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(templateParam);
  const [list, setList] = useState<Load<TemplateList>>({ status: "loading" });
  const [detail, setDetail] = useState<Load<Detail>>({ status: "loading" });
  const [listReload, setListReload] = useState(0);
  const [detailReload, setDetailReload] = useState(0);
  const [drafts, setDrafts] = useState<Readonly<Record<string, TemplateEdits>>>({});
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<number>();
  const listRequest = useRef(0);
  // The template open now, for the answers of writes sent from another one (E7-W01 round 2 #3).
  const selectedRef = useRef<string | null>(selectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const errorText = useCallback(
    (cause: unknown, fallback: string) =>
      isApiError(cause) && cause.status !== 0
        ? t(`errors:${cause.code}`, { defaultValue: fallback })
        : fallback,
    [t],
  );

  useEffect(() => {
    listRequest.current += 1;
    const current = listRequest.current;
    client
      .GET("/message-templates", {
        params: {
          query: { includeArchived: false, ...(category === null ? {} : { category }) },
        },
      })
      .then(
        ({ data }) => {
          if (current === listRequest.current && data !== undefined) {
            setList({ data, status: "ready" });
          }
        },
        (error: unknown) => {
          if (current === listRequest.current) setList({ error, status: "error" });
        },
      );
  }, [category, client, listReload]);

  useEffect(() => {
    if (selectedId === null) return undefined;
    let current = true;
    client.GET("/message-templates/{id}", { params: { path: { id: selectedId } } }).then(
      ({ data }) => {
        if (current && data !== undefined) setDetail({ data, status: "ready" });
      },
      (error: unknown) => {
        if (current) setDetail({ error, status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [client, detailReload, selectedId]);

  const select = (id: string | null) => {
    if (id === selectedId) return;
    selectedRef.current = id;
    setDetail({ status: "loading" });
    setSelectedId(id);
    writeTemplateParam(id);
  };

  const shownDetail =
    detail.status === "ready" && detail.data.id === selectedId ? detail.data : undefined;

  return (
    <section className="messaging-page">
      <header className="messaging-page__header">
        <h1>{t("admin-messaging:title")}</h1>
        <a
          className="messaging-page__link"
          href="/notificacions"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/notificacions");
          }}
        >
          {t("admin-messaging:log.link")}
        </a>
        <Button
          onClick={() => {
            setSending(true);
          }}
          variant="secondary"
        >
          <Icon aria-hidden="true" name="send" /> {t("admin-messaging:send.open")}
        </Button>
        <Button
          onClick={() => {
            setCreating(true);
          }}
        >
          <Icon aria-hidden="true" name="plus" /> {t("admin-messaging:templates.new")}
        </Button>
      </header>
      {sent === undefined ? null : (
        <AnnouncementSent
          count={sent}
          onDismiss={() => {
            setSent(undefined);
          }}
          onNavigate={onNavigate}
        />
      )}
      <div className="messaging-page__grid">
        <Card className="messaging-templates">
          <h2 className="messaging-templates__title">
            {t("admin-messaging:templates.byCategory")}
          </h2>
          {list.status === "loading" ? (
            <Skeleton height="16rem" label={t("admin-messaging:templates.loading")} />
          ) : list.status === "error" ? (
            <Toast tone="danger">
              <span className="messaging-page__error">
                {errorText(list.error, t("admin-messaging:templates.loadError"))}
                <Button
                  onClick={() => {
                    setListReload((value) => value + 1);
                  }}
                  variant="secondary"
                >
                  {t("admin-messaging:templates.retry")}
                </Button>
              </span>
            </Toast>
          ) : (
            <>
              <ul className="messaging-categories">
                {CATEGORIES.map((item) => (
                  <li key={item}>
                    <button
                      aria-pressed={category === item}
                      className="messaging-categories__row"
                      onClick={() => {
                        setCategory((current) => (current === item ? null : item));
                      }}
                      type="button"
                    >
                      <span>
                        <strong>{t(`enums:notificationCategory.${item}`)}</strong>{" "}
                        <span className="messaging-categories__hint">
                          {t(`admin-messaging:templates.categoryHint.${item}`)}
                        </span>
                      </span>
                      <span className="messaging-categories__count">
                        {list.data.countsByCategory[item]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {list.data.items.length === 0 ? (
                <p className="messaging-templates__empty">{t("admin-messaging:templates.empty")}</p>
              ) : (
                <ul aria-label={t("admin-messaging:templates.list")} className="messaging-list">
                  {list.data.items.map((item) => (
                    <li key={item.id}>
                      <button
                        aria-current={item.id === selectedId || undefined}
                        className="messaging-list__row"
                        onClick={() => {
                          select(item.id);
                        }}
                        type="button"
                      >
                        <Icon aria-hidden="true" name={item.icon} />
                        <span className="messaging-list__name">
                          {item.name}
                          {item.code === null
                            ? null
                            : ` ${t("admin-messaging:templates.code", { code: item.code })}`}
                        </span>
                        {item.enabled ? null : (
                          <Chip tone="neutral">{t("enums:templateStatus.DISABLED")}</Chip>
                        )}
                        {item.id === selectedId ? (
                          <span className="messaging-list__editing">
                            {t("admin-messaging:templates.editing")}
                          </span>
                        ) : null}
                        {drafts[item.id] === undefined ? null : (
                          <span className="messaging-list__draft">
                            {t("admin-messaging:templates.unsaved")}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
        <Card className="messaging-page__editor">
          {selectedId === null ? (
            <EmptyState
              description={t("admin-messaging:templates.chooseDescription")}
              icon="mail"
              title={t("admin-messaging:templates.choose")}
            />
          ) : detail.status === "error" ? (
            <Toast tone="danger">
              <span className="messaging-page__error">
                {errorText(detail.error, t("admin-messaging:templates.loadError"))}
                <Button
                  onClick={() => {
                    setDetail({ status: "loading" });
                    setDetailReload((value) => value + 1);
                  }}
                  variant="secondary"
                >
                  {t("admin-messaging:templates.retry")}
                </Button>
              </span>
            </Toast>
          ) : shownDetail === undefined ? (
            <Skeleton height="28rem" label={t("admin-messaging:templates.loading")} />
          ) : (
            <TemplateEditor
              client={client}
              detail={shownDetail}
              edits={drafts[shownDetail.id] ?? {}}
              key={shownDetail.id}
              onDeleted={() => {
                const deleted = shownDetail.id;
                setDrafts((current) => without(current, deleted));
                // Another template opened meanwhile stays open.
                if (selectedRef.current === deleted) select(null);
                setListReload((value) => value + 1);
              }}
              onEdits={(edits) => {
                setDrafts((current) => ({ ...current, [shownDetail.id]: edits }));
              }}
              onReload={() => {
                setDetailReload((value) => value + 1);
              }}
              onSaved={(saved, options) => {
                // The answer of a template no longer open never replaces the one shown; reopening
                // it reads it again.
                if (selectedRef.current === saved.id) setDetail({ data: saved, status: "ready" });
                if (options?.keepEdits !== true) {
                  // Only the draft that write carried: one written after it (the template was
                  // reopened meanwhile) stays.
                  setDrafts((current) =>
                    current[saved.id] === options?.savedEdits
                      ? without(current, saved.id)
                      : current,
                  );
                }
                setListReload((value) => value + 1);
              }}
            />
          )}
        </Card>
      </div>
      {creating ? (
        <NewTemplateDialog
          client={client}
          defaultLocale={branding.defaultLocale}
          onClose={() => {
            setCreating(false);
          }}
          onCreated={(created) => {
            setCreating(false);
            selectedRef.current = created.id;
            setDetail({ data: created, status: "ready" });
            setSelectedId(created.id);
            writeTemplateParam(created.id);
            setListReload((value) => value + 1);
          }}
        />
      ) : null}
      {sending ? (
        <SendAnnouncementDialog
          audience={{ filters: [], kind: "filters", q: "" }}
          client={client}
          initialTemplateId={selectedId ?? undefined}
          onClose={() => {
            setSending(false);
          }}
          onSent={(count) => {
            setSending(false);
            setSent(count);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * [＋ Nova plantilla] (R-11-12): a CUSTOM template of a sendable category, created with its title
 * as a first text in the club's default language (the api needs a body; the admin writes it next,
 * in the editor), the neutral bell and the member's App + Correu.
 */
function NewTemplateDialog({
  client,
  defaultLocale,
  onClose,
  onCreated,
}: {
  client: ApiClient;
  defaultLocale: string;
  onClose: () => void;
  onCreated: (detail: Detail) => void;
}) {
  const { t } = useTranslation(["admin-messaging", "enums", "errors"]);
  const [category, setCategory] = useState<Category>("CLUB_NEWS");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const create = async () => {
    if (busy || title.trim() === "") return;
    setBusy(true);
    setError(undefined);
    try {
      const text = { [defaultLocale]: title.trim() };
      const { data } = await client.POST("/message-templates", {
        body: {
          body: text,
          category,
          color: "NEUTRAL",
          icon: "bell",
          matrix: {
            ADMINS: { APP: false, EMAIL: false, SMS: false },
            INSTRUCTORS: { APP: false, EMAIL: false, SMS: false },
            MEMBER: { APP: true, EMAIL: true, SMS: false },
          },
          title: text,
        },
      });
      if (data === undefined) throw new TypeError("The created template had no data");
      onCreated(data);
    } catch (cause) {
      setError(
        isApiError(cause) && cause.status !== 0
          ? t(`errors:${cause.code}`, { defaultValue: t("admin-messaging:templates.genericError") })
          : t("admin-messaging:templates.genericError"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      closeLabel={t("admin-messaging:templates.close")}
      onClose={onClose}
      open
      title={t("admin-messaging:templates.newTitle")}
    >
      <form
        className="messaging-send"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <FormField id="new-template-category" label={t("admin-messaging:templates.category")}>
          <Select
            disabled={busy}
            id="new-template-category"
            onChange={(event) => {
              setCategory(event.currentTarget.value as Category);
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
        <FormField id="new-template-title" label={t("admin-messaging:templates.newName")}>
          <Input
            id="new-template-title"
            maxLength={120}
            onChange={(event) => {
              setTitle(event.currentTarget.value);
            }}
            readOnly={busy}
            value={title}
          />
        </FormField>
        {error === undefined ? null : (
          <p className="messaging-editor__error" role="alert">
            {error}
          </p>
        )}
        <div className="messaging-dialog__actions">
          <Button disabled={busy} onClick={onClose} variant="ghost">
            {t("admin-messaging:templates.cancel")}
          </Button>
          <Button
            disabled={title.trim() === ""}
            loading={busy}
            loadingLabel={t("admin-messaging:templates.saving")}
            type="submit"
          >
            {t("admin-messaging:templates.create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
