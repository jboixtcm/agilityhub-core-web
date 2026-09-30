import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { Button, Modal, Skeleton } from "@agilityhub/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Preview = components["schemas"]["TemplatePreview"];
type Draft = components["schemas"]["TemplateDraft"];

/**
 * [Vista prèvia] (S11 §2, R-11-12): the unsaved draft rendered by the api with the fictional data
 * of each club locale — one tab per locale, each read again — the title and body, the e-mail in a
 * sandboxed frame (never injected into the page), the SMS with its length, segments and the
 * truncation note, and the api's warnings as delivered. «Envia'm una prova» sends the same draft
 * to the acting admin only.
 */
export function TemplatePreviewDialog({
  client,
  draftFor,
  initialLocale,
  locales,
  onClose,
  templateId,
}: {
  client: ApiClient;
  draftFor: (locale: string) => Draft;
  initialLocale: string;
  locales: readonly string[];
  onClose: () => void;
  templateId: string;
}) {
  const { t } = useTranslation(["admin-messaging", "errors"]);
  const [testSent, setTestSent] = useState(false);
  const [locale, setLocale] = useState(initialLocale);
  const [state, setState] = useState<
    { locale: string; preview: Preview } | { error: string; locale: string } | undefined
  >();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const request = useRef(0);
  // The draft of the moment the tab was opened: the dialog is modal, nothing edits it meanwhile.
  const draft = useRef(draftFor);

  const errorText = (cause: unknown) =>
    isApiError(cause) && cause.status !== 0
      ? t(`errors:${cause.code}`, { defaultValue: t("admin-messaging:preview.error") })
      : t("admin-messaging:preview.error");

  useEffect(() => {
    request.current += 1;
    const current = request.current;
    client
      .POST("/message-templates/{id}/preview", {
        body: { draft: draft.current(locale), locale },
        params: { path: { id: templateId } },
      })
      .then(
        ({ data }) => {
          // A tab answered after another was opened is dropped.
          if (current !== request.current || data === undefined) return;
          setState({ locale, preview: data });
        },
        (cause: unknown) => {
          if (current === request.current) setState({ error: errorText(cause), locale });
        },
      );
    // `errorText` only reads `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, locale, templateId]);

  const sendTest = async () => {
    if (sending) return;
    setSending(true);
    setSendError(undefined);
    setTestSent(false);
    try {
      await client.POST("/message-templates/{id}/preview", {
        body: { draft: draft.current(locale), locale, sendTest: true },
        params: { path: { id: templateId } },
      });
      setTestSent(true);
    } catch (cause) {
      setSendError(errorText(cause));
    } finally {
      setSending(false);
    }
  };

  const shown = state?.locale === locale ? state : undefined;
  return (
    <Modal
      closeLabel={t("admin-messaging:preview.close")}
      onClose={onClose}
      open
      title={t("admin-messaging:preview.title")}
    >
      <div
        aria-label={t("admin-messaging:preview.locales")}
        className="messaging-preview__tabs"
        role="tablist"
      >
        {locales.map((item) => (
          <button
            aria-selected={item === locale}
            className="messaging-preview__tab"
            key={item}
            onClick={() => {
              setLocale(item);
            }}
            role="tab"
            type="button"
          >
            {item.toLocaleUpperCase()}
          </button>
        ))}
      </div>
      <div className="messaging-preview" role="tabpanel">
        {shown === undefined ? (
          <Skeleton height="16rem" label={t("admin-messaging:preview.loading")} />
        ) : "error" in shown ? (
          <p className="messaging-editor__error" role="alert">
            {shown.error}
          </p>
        ) : (
          <>
            <section className="messaging-preview__app">
              <h3>{t("admin-messaging:preview.app")}</h3>
              <strong>{shown.preview.title}</strong>
              <p>{shown.preview.body}</p>
            </section>
            <section className="messaging-preview__email">
              <h3>{t("admin-messaging:preview.email")}</h3>
              <p className="messaging-preview__subject">{shown.preview.emailSubject}</p>
              <iframe
                className="messaging-preview__frame"
                sandbox=""
                srcDoc={shown.preview.emailHtml}
                title={t("admin-messaging:preview.emailFrame")}
              />
            </section>
            {shown.preview.sms == null ? null : (
              <section className="messaging-preview__sms">
                <h3>{t("admin-messaging:preview.sms")}</h3>
                <p>«{shown.preview.sms.text}»</p>
                <p className="messaging-preview__meta">
                  {t("admin-messaging:preview.smsMeta", {
                    length: shown.preview.sms.length,
                    segments: shown.preview.sms.segments,
                  })}
                </p>
                {shown.preview.sms.truncated ? (
                  <p className="messaging-preview__warning">
                    {t("admin-messaging:preview.truncated")}
                  </p>
                ) : null}
              </section>
            )}
            {shown.preview.warnings.length === 0 ? null : (
              <ul
                aria-label={t("admin-messaging:preview.warnings")}
                className="messaging-preview__warnings"
              >
                {shown.preview.warnings.map((warning, index) => (
                  <li
                    className="messaging-preview__warning"
                    key={`${warning.code}-${String(index)}`}
                  >
                    {warning.variable == null
                      ? t(`errors:${warning.code}`, { defaultValue: warning.code })
                      : t("admin-messaging:preview.warning", {
                          message: t(`errors:${warning.code}`, { defaultValue: warning.code }),
                          variable: warning.variable,
                        })}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {sendError === undefined ? null : (
        <p className="messaging-editor__error" role="alert">
          {sendError}
        </p>
      )}
      {testSent ? (
        <p className="messaging-preview__sent" role="status">
          {t("admin-messaging:preview.testSent")}
        </p>
      ) : null}
      <div className="messaging-dialog__actions">
        <Button
          disabled={shown === undefined || "error" in shown}
          loading={sending}
          loadingLabel={t("admin-messaging:preview.sending")}
          onClick={() => void sendTest()}
          variant="secondary"
        >
          {t("admin-messaging:preview.sendTest")}
        </Button>
      </div>
    </Modal>
  );
}
