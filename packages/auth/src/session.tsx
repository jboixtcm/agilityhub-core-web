import { isModuleEnabled, type ClubModule, useBranding } from "@agilityhub/ui";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { type AuthClient, type Me, type Role } from "./auth-client";
import { accessPathFor, dropReturnPath, rememberReturnPath } from "./return-path";

/**
 * `impersonationExpired`: this tab's impersonated session has ended (INC-18); the app says so and
 * never falls back to another session.
 */
export type SessionStatus = "anonymous" | "impersonationExpired" | "loading" | "signedIn";

/** The account's global roles (`Me.account.platformRoles`, S01 §3, S17), never a club's. */
export type PlatformRole = Me["account"]["platformRoles"][number];

export interface SessionSnapshot {
  activeProfile: Role | null;
  me: Me | null;
  /**
   * S17 §2: `AGILITYHUB_ADMIN` opens the club console. Global, apart from `roles` (the host's
   * membership): a platform admin may have no membership at all (R-01-17).
   */
  platformRoles: readonly PlatformRole[];
  roles: readonly Role[];
  /**
   * An `anonymous` session that was signed in on this page (a sign-out, or a session that ended):
   * 01 opens plain, with no address to return to (E11-W06 W1). Absent for a visit that never had
   * a session here.
   */
  signedOut?: true;
  status: SessionStatus;
}

export interface SessionProviderProps {
  children: ReactNode;
  client: AuthClient;
}

interface RequireAuthProps {
  children: ReactNode;
  fallback?: ReactNode;
  navigate?: (path: string) => void;
}

interface RequireRoleProps extends RequireAuthProps {
  roles: readonly Role[];
}

interface RequirePlatformRoleProps extends RequireAuthProps {
  /**
   * A signed-in account without the role (S17 §2: «Aquest accés és només per a l'equip
   * AgilityHub»); `fallback` stays the loading state, so the refusal never flashes before `/me`.
   */
  denied?: ReactNode;
  /** The global role required (a prop named `role` would read as an ARIA role). */
  platformRole: PlatformRole;
}

interface RequireModuleProps {
  children: ReactNode;
  module: ClubModule;
}

const anonymousSession: SessionSnapshot = {
  activeProfile: null,
  me: null,
  platformRoles: [],
  roles: [],
  status: "anonymous",
};

const loadingSession: SessionSnapshot = {
  activeProfile: null,
  me: null,
  platformRoles: [],
  roles: [],
  status: "loading",
};

const impersonationExpiredSession: SessionSnapshot = {
  activeProfile: null,
  me: null,
  platformRoles: [],
  roles: [],
  status: "impersonationExpired",
};

const SessionContext = createContext<SessionSnapshot | undefined>(undefined);

function sessionFromMe(me: Me): SessionSnapshot {
  const roles = [...(me.membership?.roles ?? [])];
  const preferredProfile = me.membership?.activeProfile ?? me.membership?.defaultProfile;
  const activeProfile = roles.find((role) => role === preferredProfile) ?? roles[0] ?? null;
  // An impersonation token acts as the member, and a support access token as the club's ADMIN
  // (S17 R-17-10: no `platformRoles` in it), never with the actor's platform roles (S01 R-01-16).
  const platformRoles =
    me.impersonation === undefined && me.support === undefined ? [...me.account.platformRoles] : [];
  return { activeProfile, me, platformRoles, roles, status: "signedIn" };
}

function sessionWithoutMe(client: AuthClient, pending: SessionSnapshot): SessionSnapshot {
  return client.isImpersonationExpired() ? impersonationExpiredSession : pending;
}

function navigateToAccess(path: string): void {
  if (typeof window !== "undefined" && window.location.pathname !== "/entrar") {
    window.location.assign(path);
  }
}

/** The address the visit asked for (path and query), as 01 returns to it after the sign-in. */
function requestedPath(): string {
  return typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
}

export function SessionProvider({ children, client }: SessionProviderProps) {
  const [session, setSession] = useState<SessionSnapshot>(() => {
    const me = client.getMe();
    return me === null ? sessionWithoutMe(client, loadingSession) : sessionFromMe(me);
  });

  useEffect(() => {
    let mounted = true;
    const signedIn = () => {
      const me = client.getMe();
      if (mounted && me !== null) {
        setSession(sessionFromMe(me));
      }
    };
    const signedOut = () => {
      if (mounted) {
        setSession((current) =>
          current.status === "signedIn" ? { ...anonymousSession, signedOut: true } : anonymousSession,
        );
      }
    };
    const impersonationExpired = () => {
      if (mounted) {
        setSession(impersonationExpiredSession);
      }
    };
    const stopSlidingRefresh = client.startSlidingRefresh();

    client.addEventListener("signedIn", signedIn);
    client.addEventListener("signedOut", signedOut);
    client.addEventListener("impersonationExpired", impersonationExpired);
    if (client.getMe() === null) {
      void client.restoreSession().then(
        (me) => {
          if (mounted) {
            setSession(
              me === null ? sessionWithoutMe(client, anonymousSession) : sessionFromMe(me),
            );
          }
        },
        // INC-19: offline or a 5xx: the session is unknown, not gone. It stays `loading` while
        // AuthClient retries; the retry's `signedIn`/`signedOut` event settles it.
        () => undefined,
      );
    }

    return () => {
      mounted = false;
      client.removeEventListener("signedIn", signedIn);
      client.removeEventListener("signedOut", signedOut);
      client.removeEventListener("impersonationExpired", impersonationExpired);
      stopSlidingRefresh();
    };
  }, [client]);

  const value = useMemo(() => session, [session]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionSnapshot {
  const session = useContext(SessionContext);
  if (session === undefined) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return session;
}

export function RequireAuth({
  children,
  fallback = null,
  navigate = navigateToAccess,
}: RequireAuthProps) {
  const { signedOut, status } = useSession();

  useEffect(() => {
    if (status !== "anonymous") {
      return;
    }
    if (signedOut === true) {
      // A sign-out on this page: the next sign-in opens the profile's landing.
      dropReturnPath();
      navigate("/entrar");
      return;
    }
    // E11-W06 W1 (S11 R-11-11): an e-mail's deep link survives the sign-in — `?next=` on 01, and
    // kept for the magic link's own tab.
    const requested = requestedPath();
    rememberReturnPath(requested);
    navigate(accessPathFor(requested));
  }, [navigate, signedOut, status]);

  return status === "signedIn" ? children : fallback;
}

export function RequireRole({ children, fallback = null, navigate, roles }: RequireRoleProps) {
  const session = useSession();
  const allowed = session.roles.some((role) => roles.includes(role));

  return (
    <RequireAuth fallback={fallback} {...(navigate === undefined ? {} : { navigate })}>
      {allowed ? children : fallback}
    </RequireAuth>
  );
}

/** S17 §2: the platform console's guard, by the account's global role (not the membership's). */
export function RequirePlatformRole({
  children,
  denied,
  fallback = null,
  navigate,
  platformRole,
}: RequirePlatformRoleProps) {
  const session = useSession();
  return (
    <RequireAuth fallback={fallback} {...(navigate === undefined ? {} : { navigate })}>
      {session.platformRoles.includes(platformRole) ? children : (denied ?? fallback)}
    </RequireAuth>
  );
}

function ModuleUnavailablePage() {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t("common:unavailable.title")}</h1>
    </main>
  );
}

export function RequireModule({ children, module }: RequireModuleProps) {
  const branding = useBranding();
  return isModuleEnabled(branding.modules, module) ? children : <ModuleUnavailablePage />;
}
