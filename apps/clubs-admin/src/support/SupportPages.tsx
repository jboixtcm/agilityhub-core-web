import type { AuthClient } from "@agilityhub/auth";
import { useSession } from "@agilityhub/auth";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, Card } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  consoleOrigin,
  SUPPORT_HANDOVER_TIMEOUT_MS,
  SUPPORT_PATH,
  SUPPORT_READY,
  supportAccessFrom,
} from "./support-access";

/** How often the new tab tells the console it is ready, until the access arrives. */
const READY_INTERVAL_MS = 500;

type EntryState = "entering" | "left" | "noOpener" | "refused" | "timeout" | "waiting";

function SupportNotice({ message, title }: { message: string; title: string }) {
  return (
    <main className="access-page">
      <Card className="access-card">
        <h1>{title}</h1>
        <p role="status">{message}</p>
      </Card>
    </main>
  );
}

/**
 * `/suport` (S17 R-17-10, E10-W03): the club's back-office tab that «Entra com a administrador del
 * club» opened. It tells the console (its opener) it is ready, takes the access the console posts
 * from its own origin only, enters it as this tab's session (never refreshed, never the cookie)
 * and opens D1. `?sortit=1` is where the banner's «Surt» lands.
 */
export function SupportEntryPage({ authClient }: { authClient: AuthClient }) {
  const { t } = useTranslation("shell");
  const [state, setState] = useState<EntryState>(() =>
    new URLSearchParams(window.location.search).get("sortit") === "1"
      ? "left"
      : window.opener === null
        ? "noOpener"
        : "waiting",
  );

  useEffect(() => {
    if (state !== "waiting") return undefined;
    const opener = window.opener as Window | null;
    if (opener === null) return undefined;
    const origin = consoleOrigin();
    let settled = false;
    const ready = () => {
      if (!settled) opener.postMessage({ type: SUPPORT_READY }, origin);
    };
    const onMessage = (event: MessageEvent) => {
      const access = supportAccessFrom(event, opener, origin);
      if (access === undefined || settled) return;
      settled = true;
      setState("entering");
      // A session this host's cookie restores meanwhile (the actor may be signed in here too)
      // settles first: the support access replaces it, never the other way round.
      void authClient
        .restoreSession()
        .catch(() => null)
        .then(() => authClient.acceptImpersonation(access.token, access.expiresAt))
        .then(async (me) => {
          if (me.support === undefined) {
            // Not a support access of this club (`/me` without `support`): it is never kept.
            await authClient.logout().catch(() => undefined);
            setState("refused");
            return;
          }
          window.location.replace("/tauler");
        })
        .catch(() => {
          setState("refused");
        });
    };
    window.addEventListener("message", onMessage);
    ready();
    const interval = window.setInterval(ready, READY_INTERVAL_MS);
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setState("timeout");
    }, SUPPORT_HANDOVER_TIMEOUT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [authClient, state]);

  const title = t("shell:support.title");
  switch (state) {
    case "left":
      return <SupportNotice message={t("shell:support.left")} title={title} />;
    case "noOpener":
      return <SupportNotice message={t("shell:support.noOpener")} title={title} />;
    case "refused":
      return <SupportNotice message={t("shell:support.refused")} title={title} />;
    case "timeout":
      return <SupportNotice message={t("shell:support.timeout")} title={title} />;
    case "entering":
    case "waiting":
      return <SupportNotice message={t("shell:support.entering")} title={title} />;
  }
}

/** The support access of this tab has ended: it expired, or the club's ADMIN ended it (R-17-10). */
export function SupportEndedPage() {
  const { t } = useTranslation("shell");
  return <SupportNotice message={t("shell:support.ended")} title={t("shell:support.title")} />;
}

/**
 * R-17-10's persistent banner of a support access (`GET /me` `support {actorName, expiresAt}`):
 * who of the AgilityHub team is in and until when, in the club's time; «Surt» revokes the token.
 */
export function SupportBanner({
  authClient,
  onNavigate,
}: {
  authClient: AuthClient;
  /** The app's in-app navigation: the tab leaves the shell before the token is revoked. */
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation("shell");
  const session = useSession();
  const formats = useClubFormats();
  const [leaving, setLeaving] = useState(false);
  const support = session.me?.support;
  if (support === undefined) return null;
  return (
    <div aria-label={t("shell:support.bannerLabel")} className="admin-support-banner" role="region">
      <p>
        {t("shell:support.banner", {
          name: support.actorName,
          until: formats.formatDateTime(support.expiresAt),
        })}
      </p>
      <Button
        loading={leaving}
        loadingLabel={t("shell:support.leaving")}
        onClick={() => {
          setLeaving(true);
          // `/suport?sortit=1` first: the shell (and its sign-in redirect) is gone when the
          // revoke signs the tab out, so it lands there and never on `/entrar`.
          onNavigate(`${SUPPORT_PATH}?sortit=1`);
          void authClient.logout().catch(() => undefined);
        }}
        variant="secondary"
      >
        {t("shell:support.exit")}
      </Button>
    </div>
  );
}
