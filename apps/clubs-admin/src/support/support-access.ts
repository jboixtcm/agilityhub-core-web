import type { components } from "@agilityhub/api-client";

type PlatformClub = components["schemas"]["PlatformClub"];
type SupportAccess = components["schemas"]["SupportAccess"];

/**
 * S17 R-17-10 (E10-W03): how «Entra com a administrador del club» opens the club's back office.
 * `POST /platform/clubs/{id}/support-access` answers `{token, expiresAt}` — a clubs-admin access
 * token of the club, without refresh. The token never travels in an address (E47): the console
 * opens the club's back-office host at `/suport` in a new tab, the tab says it is ready to the
 * console (`window.opener`), and the console posts the token to that tab only (its exact origin).
 * The tab keeps it in its own session storage, as an impersonation, and never refreshes it.
 */
export const SUPPORT_PATH = "/suport";
export const SUPPORT_READY = "agilityhub:support-ready";
export const SUPPORT_ACCESS = "agilityhub:support-access";
/** How long the new tab waits for the console's answer before it says the access did not arrive. */
export const SUPPORT_HANDOVER_TIMEOUT_MS = 60_000;

interface SupportAccessMessage {
  expiresAt: string;
  token: string;
  type: typeof SUPPORT_ACCESS;
}

function environment(): Record<string, string | undefined> {
  return import.meta.env;
}

function mockMode(): boolean {
  return import.meta.env.VITE_MOCK === "1";
}

/**
 * The origin of the product host the console runs on: the only sender a `/suport` tab accepts.
 * `VITE_CONSOLE_ORIGIN` sets it for another deployment (the e2e stacks); the mock world serves
 * every app from one origin.
 */
export function consoleOrigin(): string {
  const configured = environment().VITE_CONSOLE_ORIGIN;
  if (configured !== undefined && configured !== "") return configured;
  return mockMode() ? window.location.origin : "https://clubsadmin.agilitydoghub.com";
}

/**
 * The origin that serves a club's back-office host: `https://{host}`, or the one
 * `VITE_CLUB_ADMIN_ORIGINS` (`{"host": "origin"}`) maps it to (the e2e stacks, whose hosts are
 * proxies on local ports); the mock world serves every host from the console's own origin.
 */
export function clubAdminOrigin(host: string): string {
  const configured = environment().VITE_CLUB_ADMIN_ORIGINS;
  if (configured !== undefined && configured !== "") {
    try {
      const mapped = (JSON.parse(configured) as Record<string, unknown>)[host];
      if (typeof mapped === "string" && mapped !== "") return mapped;
    } catch {
      // A malformed map is no map: the host's own origin.
    }
  }
  return mockMode() ? window.location.origin : `https://${host}`;
}

/**
 * The club's back-office host a support access opens: its primary verified `clubs-admin` domain
 * (R-17-03), else another verified one. Without any, there is no back office to open.
 */
export function supportAdminHost(club: Pick<PlatformClub, "domains">): string | undefined {
  const verified = club.domains.filter(
    (domain) => domain.app === "clubs-admin" && domain.status === "VERIFIED",
  );
  return (verified.find((domain) => domain.primary) ?? verified[0])?.host;
}

/**
 * The console's side: answers every «ready» of `target` (the tab it opened, at `targetOrigin`)
 * with the access once it is known. Returns the access's setter and the cleanup.
 */
export function handOverSupportAccess(
  target: Window,
  targetOrigin: string,
  options: { onDelivered?: () => void } = {},
) {
  let access: SupportAccess | undefined;
  let ready = false;
  const post = () => {
    if (access === undefined || !ready || target.closed) return;
    const message: SupportAccessMessage = {
      expiresAt: access.expiresAt,
      token: access.token,
      type: SUPPORT_ACCESS,
    };
    target.postMessage(message, targetOrigin);
    options.onDelivered?.();
  };
  const listener = (event: MessageEvent) => {
    if (event.source !== target || event.origin !== targetOrigin) return;
    if ((event.data as { type?: unknown } | null)?.type !== SUPPORT_READY) return;
    ready = true;
    post();
  };
  window.addEventListener("message", listener);
  return {
    deliver: (value: SupportAccess) => {
      access = value;
      post();
    },
    stop: () => {
      window.removeEventListener("message", listener);
    },
  };
}

/** The `/suport` tab's side: the access the console posted, from its exact origin only. */
export function supportAccessFrom(
  event: MessageEvent,
  opener: Window | null,
  origin: string,
): { expiresAt: string; token: string } | undefined {
  if (opener === null || event.source !== opener || event.origin !== origin) return undefined;
  const data = event.data as Partial<SupportAccessMessage> | null;
  if (
    data?.type !== SUPPORT_ACCESS ||
    typeof data.token !== "string" ||
    data.token === "" ||
    typeof data.expiresAt !== "string"
  ) {
    return undefined;
  }
  return { expiresAt: data.expiresAt, token: data.token };
}
