import { type ApiClient, isApiError } from "@agilityhub/api-client";
import { useSession } from "@agilityhub/auth";
import { Button, Icon } from "@agilityhub/ui";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Outcome = "done" | "error" | "invalid" | "ready" | "working";

/**
 * `/comunicats/baixa?t=…` (S11 R-11-08, api E7-T02, no mockup): the «Deixar de rebre aquests
 * comunicats» link of a CLUB_NEWS e-mail. Anonymous. COMM-08 (decision of 13 Nov 2026): the page
 * asks first and sends the token to `POST /email-unsubscribes` only when the member presses
 * «Deixa de rebre'ls», so a link scanner or a forwarded copy opening the page unsubscribes nobody
 * (the mailbox providers' one-click POST is the api's own route). The page never shows the token
 * nor the address.
 */
export function UnsubscribePage({ client, logo }: { client: ApiClient; logo: ReactNode }) {
  const { t } = useTranslation("notifications");
  const session = useSession();
  const [token] = useState(() => new URLSearchParams(window.location.search).get("t") ?? "");
  const [outcome, setOutcome] = useState<Outcome>(token === "" ? "invalid" : "ready");
  const mounted = useRef(true);

  const send = useCallback(() => {
    setOutcome("working");
    client.POST("/email-unsubscribes", { body: { token } }).then(
      () => {
        if (mounted.current) setOutcome("done");
      },
      (cause: unknown) => {
        if (!mounted.current) return;
        // 422 UNSUBSCRIBE_TOKEN_INVALID (expired, tampered, another club's) and a malformed token
        // (400) cannot succeed on a retry; anything else (the network, a 5xx) can.
        setOutcome(
          isApiError(cause) && (cause.status === 422 || cause.status === 400) ? "invalid" : "error",
        );
      },
    );
  }, [client, token]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const preferences = (
    <a className="unsubscribe-page__link" href="/perfil#avisos">
      {t("notifications:unsubscribe.toPreferences")}
    </a>
  );

  return (
    <main className="auth-page">
      <section
        aria-busy={outcome === "working" || undefined}
        className="auth-panel auth-panel--centered"
      >
        {logo}
        <h1>{t("notifications:unsubscribe.title")}</h1>
        {outcome === "ready" || outcome === "working" ? (
          <>
            <p>{t("notifications:unsubscribe.intro")}</p>
            <Button
              disabled={outcome === "working"}
              loading={outcome === "working"}
              onClick={() => {
                if (outcome === "ready") send();
              }}
            >
              {t("notifications:unsubscribe.confirm")}
            </Button>
          </>
        ) : null}
        {outcome === "working" ? (
          <p role="status">{t("notifications:unsubscribe.working")}</p>
        ) : null}
        {outcome === "done" ? (
          <>
            <p role="status">
              <Icon aria-hidden="true" className="unsubscribe-page__icon" name="check" />{" "}
              {t("notifications:unsubscribe.done")}
            </p>
            {session.status === "signedIn" ? preferences : null}
          </>
        ) : null}
        {outcome === "invalid" ? (
          <>
            <p role="alert">{t("notifications:unsubscribe.invalid")}</p>
            {preferences}
          </>
        ) : null}
        {outcome === "error" ? (
          <>
            <p role="alert">{t("notifications:unsubscribe.error")}</p>
            <Button onClick={send} variant="secondary">
              {t("notifications:unsubscribe.retry")}
            </Button>
          </>
        ) : null}
      </section>
    </main>
  );
}
