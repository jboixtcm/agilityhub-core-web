import { type ApiClient, type components, isApiError, isInProgress } from "@agilityhub/api-client";
import { Button, Checkbox, FormField, Modal, Select, Skeleton, Toast } from "@agilityhub/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Template = components["schemas"]["MessageTemplateListItem"];
type Recipients = components["schemas"]["AnnouncementRecipients"];

/** Who receives it: the selected members (D5, or D15's dogs' owners) or the list's query. */
export type AnnouncementAudience =
  | { dogs?: number; kind: "selection"; memberIds: readonly string[] }
  | { filters: readonly string[]; kind: "filters"; q: string };

const SENDABLE_CATEGORIES = new Set(["PERSONAL", "CLUB_NEWS", "CLUB_CHANGES"]);

/** R-11-13: N-24 or a CUSTOM template of a sendable category. */
function sendable(template: Template): boolean {
  return (
    template.enabled &&
    (template.code === "N-24" ||
      (template.kind === "CUSTOM" && SENDABLE_CATEGORIES.has(template.category)))
  );
}

function recipientsOf(audience: AnnouncementAudience) {
  return audience.kind === "selection"
    ? { memberIds: [...audience.memberIds] }
    : { filters: [...audience.filters], ...(audience.q === "" ? {} : { q: audience.q }) };
}

type Count = { count: number } | { error: string } | undefined;

/** «Comunicat enviat a {n} abonats» with «Avisos enviats ›», shown by the page that sent it. */
export function AnnouncementSent({
  count,
  onDismiss,
  onNavigate,
}: {
  count: number;
  onDismiss: () => void;
  onNavigate?: ((path: string) => void) | undefined;
}) {
  const { t } = useTranslation("admin-messaging");
  return (
    <Toast dismissLabel={t("admin-messaging:send.close")} onDismiss={onDismiss} tone="success">
      <span className="messaging-sent">
        {t("admin-messaging:send.done", { count })}{" "}
        <a
          href="/notificacions"
          onClick={(event) => {
            if (onNavigate === undefined) return;
            event.preventDefault();
            onNavigate("/notificacions");
          }}
        >
          {t("admin-messaging:log.link")}
        </a>
      </span>
    </Toast>
  );
}

/**
 * The keys of the sends that got no answer, by payload: a retry reuses its key even after the
 * dialog was closed and opened again, and an answer retires it (CONVENCIONS_API §7). In memory only.
 */
const unansweredSends = new Map<string, string>();

/**
 * «Enviar comunicat» (S11 §2 D9, R-11-13), from D9 or from a D5/D15 selection or filter set: the
 * sendable templates, the recipients as the admin chose them, and «S'enviarà a {n} abonats» from
 * the api's `dryRun` — never from the rows on screen. [ENVIA] waits for that count and the
 * explicit confirmation; changing the template or the recipients clears both. One
 * `Idempotency-Key` per submission (CONVENCIONS_API §7).
 */
export function SendAnnouncementDialog({
  audience,
  client,
  initialTemplateId,
  onClose,
  onSent,
}: {
  audience: AnnouncementAudience;
  client: ApiClient;
  initialTemplateId?: string | undefined;
  onClose: () => void;
  /** The api accepted it (202): how many members it reaches. */
  onSent: (recipientCount: number) => void;
}) {
  const { t } = useTranslation(["admin-messaging", "errors", "common"]);
  const [templates, setTemplates] = useState<Template[] | { error: string }>();
  const [templateId, setTemplateId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const countRequest = useRef(0);
  const recipientsKey = JSON.stringify(recipientsOf(audience));
  // The count belongs to the latest dry run: another template or other recipients drop it at once,
  // and none shows until the new `dryRun` answers (E7-W04). The tick belongs to the one dry run it
  // confirmed (its request number): coming back to a template after another one asks again, and
  // the new count needs a new tick (E7-W01 round 2 #2).
  const question = `${templateId}|${recipientsKey}`;
  const [answer, setAnswer] = useState<{ count: Count; question: string; request: number }>();
  const [confirmedRequest, setConfirmedRequest] = useState<number>();
  const count = answer?.question === question ? answer.count : undefined;
  const confirmed = answer?.question === question && confirmedRequest === answer.request;

  const errorText = (cause: unknown, fallback: string) =>
    isApiError(cause) && cause.status !== 0
      ? t(`errors:${cause.code}`, { defaultValue: fallback })
      : fallback;

  useEffect(() => {
    let current = true;
    client.GET("/message-templates", { params: { query: { includeArchived: false } } }).then(
      ({ data }) => {
        if (!current) return;
        const items = (data?.items ?? []).filter(sendable);
        setTemplates(items);
        const preferred =
          items.find((item) => item.id === initialTemplateId) ??
          items.find((item) => item.code === "N-24") ??
          items[0];
        setTemplateId(preferred?.id ?? "");
      },
      (cause: unknown) => {
        if (current) {
          setTemplates({ error: errorText(cause, t("admin-messaging:send.loadError")) });
        }
      },
    );
    return () => {
      current = false;
    };
    // `errorText` only reads `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, initialTemplateId]);

  // The count of the current template and recipients (`dryRun`); an older answer is dropped.
  useEffect(() => {
    countRequest.current += 1;
    const current = countRequest.current;
    if (templateId === "") return undefined;
    const asked = `${templateId}|${recipientsKey}`;
    client
      .POST("/message-templates/{id}/send", {
        body: { dryRun: true, recipients: JSON.parse(recipientsKey) as Recipients },
        params: {
          header: { "Idempotency-Key": crypto.randomUUID() },
          path: { id: templateId },
        },
      })
      .then(
        ({ data }) => {
          if (current === countRequest.current && data !== undefined) {
            setAnswer({ count: { count: data.recipientCount }, question: asked, request: current });
          }
        },
        (cause: unknown) => {
          if (current === countRequest.current) {
            setAnswer({
              count: { error: errorText(cause, t("admin-messaging:send.countError")) },
              question: asked,
              request: current,
            });
          }
        },
      );
    return () => {
      // Another template or other recipients (E7-W04): this dry run's count, and a tick on it, are
      // gone at once — coming back to them later asks again, and nothing can be sent until the
      // newest dry run answers.
      setAnswer(undefined);
    };
    // `errorText` only reads `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, recipientsKey, templateId]);

  const send = async () => {
    if (count === undefined || "error" in count || !confirmed || sending) return;
    const body = { dryRun: false, recipients: JSON.parse(recipientsKey) as Recipients };
    const signature = JSON.stringify({ body, templateId });
    const key = unansweredSends.get(signature) ?? crypto.randomUUID();
    unansweredSends.set(signature, key);
    setSending(true);
    setSendError(undefined);
    try {
      const { data } = await client.POST("/message-templates/{id}/send", {
        body,
        params: { header: { "Idempotency-Key": key }, path: { id: templateId } },
      });
      unansweredSends.delete(signature);
      onSent(data?.recipientCount ?? count.count);
    } catch (cause) {
      // An answer retires the key; a request that got none keeps it for the retry, and so does
      // `IN_PROGRESS` (the first request is still running, E79): the next [ENVIA] sends the same
      // key, and the admin reads the shared text of a write still in progress (E80).
      if (isApiError(cause) && cause.status !== 0 && !isInProgress(cause)) {
        unansweredSends.delete(signature);
      }
      setSendError(
        isInProgress(cause)
          ? t("common:inProgress")
          : errorText(cause, t("admin-messaging:send.error")),
      );
    } finally {
      setSending(false);
    }
  };

  const summary =
    audience.kind === "filters"
      ? audience.filters.length === 0 && audience.q === ""
        ? t("admin-messaging:send.allMembers")
        : t("admin-messaging:send.filters")
      : audience.dogs === undefined
        ? t("admin-messaging:send.selection", { count: audience.memberIds.length })
        : t("admin-messaging:send.fromDogs", {
            dogs: audience.dogs,
            members: audience.memberIds.length,
          });

  return (
    <Modal
      closeLabel={t("admin-messaging:send.close")}
      onClose={onClose}
      open
      title={t("admin-messaging:send.title")}
    >
      {templates === undefined ? (
        <Skeleton height="6rem" label={t("admin-messaging:send.loading")} />
      ) : "error" in templates ? (
        <p className="messaging-editor__error" role="alert">
          {templates.error}
        </p>
      ) : templates.length === 0 ? (
        <p>{t("admin-messaging:send.noTemplates")}</p>
      ) : (
        <div className="messaging-send">
          <FormField id="announcement-template" label={t("admin-messaging:send.template")}>
            <Select
              disabled={sending}
              id="announcement-template"
              onChange={(event) => {
                setConfirmedRequest(undefined);
                setTemplateId(event.currentTarget.value);
              }}
              value={templateId}
            >
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code == null
                    ? item.name
                    : `${item.name} ${t("admin-messaging:templates.code", { code: item.code })}`}
                </option>
              ))}
            </Select>
          </FormField>
          <p className="messaging-send__summary">{summary}</p>
          {count === undefined ? (
            <p aria-live="polite" className="messaging-send__count">
              {t("admin-messaging:send.counting")}
            </p>
          ) : "error" in count ? (
            <p className="messaging-editor__error" role="alert">
              {count.error}
            </p>
          ) : (
            <>
              <p aria-live="polite" className="messaging-send__count">
                {t("admin-messaging:send.recipients", { count: count.count })}
              </p>
              <label className="messaging-send__confirm">
                <Checkbox
                  checked={confirmed}
                  disabled={sending}
                  onChange={(event) => {
                    setConfirmedRequest(event.currentTarget.checked ? answer?.request : undefined);
                  }}
                />
                <span>{t("admin-messaging:send.confirm", { count: count.count })}</span>
              </label>
            </>
          )}
          {sendError === undefined ? null : (
            <p className="messaging-editor__error" role="alert">
              {sendError}
            </p>
          )}
        </div>
      )}
      <div className="messaging-dialog__actions">
        <Button disabled={sending} onClick={onClose} variant="ghost">
          {t("admin-messaging:send.cancel")}
        </Button>
        <Button
          disabled={count === undefined || "error" in count || !confirmed}
          loading={sending}
          loadingLabel={t("admin-messaging:send.sending")}
          onClick={() => void send()}
        >
          {t("admin-messaging:send.submit")}
        </Button>
      </div>
    </Modal>
  );
}
