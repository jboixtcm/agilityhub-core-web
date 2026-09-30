import { type ApiClient, isApiError } from "@agilityhub/api-client";
import { useSession } from "@agilityhub/auth";
import { Button, Icon } from "@agilityhub/ui";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Outcome = "done" | "error" | "invalid" | "working";

/**
 * `/comunicats/baixa?t=…` (S11 R-11-08, api E7-T02, no mockup): the «Deixar de rebre aquests
 * comunicats» link of a CLUB_NEWS e-mail. Anonymous; on load it sends the token once to
 * `POST /email-unsubscribes`, which turns the member's CLUB_NEWS e-mail off. The page never shows
 * the token nor the address.
 */
export function UnsubscribePage({ client, logo }: { client: ApiClient; logo: ReactNode }) {
  const { t } = useTranslation("notifications");
  const session = useSession();
  const [token] = useState(() => new URLSearchParams(window.location.search).get("t") ?? "");
  const [outcome, setOutcome] = useState<Outcome>(token === "" ? "invalid" : "working");
  const sent = useRef(false);
  const mounted = useRef(true);

  const send = useCallback(() => {
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
    // Once per visit (StrictMode keeps the ref across its second run of the effect).
    if (!sent.current && token !== "") {
      sent.current = true;
      send();
    }
    return () => {
      mounted.current = false;
    };
  }, [send, token]);

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
            <Button
              onClick={() => {
                setOutcome("working");
                send();
              }}
              variant="secondary"
            >
              {t("notifications:unsubscribe.retry")}
            </Button>
          </>
        ) : null}
      </section>
    </main>
  );
}
