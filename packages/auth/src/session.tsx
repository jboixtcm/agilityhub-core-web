import { isModuleEnabled, type ClubModule, useBranding } from "@agilityhub/ui";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { type AuthClient, type Me, type Role } from "./auth-client";

export type SessionStatus = "anonymous" | "loading" | "signedIn";

export interface SessionSnapshot {
  activeProfile: Role | null;
  me: Me | null;
  roles: readonly Role[];
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

interface RequireModuleProps {
  children: ReactNode;
  module: ClubModule;
}

const anonymousSession: SessionSnapshot = {
  activeProfile: null,
  me: null,
  roles: [],
  status: "anonymous",
};

const loadingSession: SessionSnapshot = {
  activeProfile: null,
  me: null,
  roles: [],
  status: "loading",
};

const SessionContext = createContext<SessionSnapshot | undefined>(undefined);

function sessionFromMe(me: Me): SessionSnapshot {
  const roles = [...me.membership.roles];
  const rememberedProfile = me.membership.defaultProfile;
  const activeProfile = roles.find((role) => role === rememberedProfile) ?? roles[0] ?? null;
  return { activeProfile, me, roles, status: "signedIn" };
}

function navigateToAccess(): void {
  if (typeof window !== "undefined" && window.location.pathname !== "/acces") {
    window.location.assign("/acces");
  }
}

export function SessionProvider({ children, client }: SessionProviderProps) {
  const [session, setSession] = useState<SessionSnapshot>(() => {
    const me = client.getMe();
    return me === null ? loadingSession : sessionFromMe(me);
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
        setSession(anonymousSession);
      }
    };

    client.addEventListener("signedIn", signedIn);
    client.addEventListener("signedOut", signedOut);
    if (client.getMe() === null) {
      void client.restoreSession().then(
        (me) => {
          if (mounted) {
            setSession(me === null ? anonymousSession : sessionFromMe(me));
          }
        },
        () => {
          if (mounted) {
            setSession(anonymousSession);
          }
        },
      );
    }

    return () => {
      mounted = false;
      client.removeEventListener("signedIn", signedIn);
      client.removeEventListener("signedOut", signedOut);
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
  const { status } = useSession();

  useEffect(() => {
    if (status === "anonymous") {
      navigate("/acces");
    }
  }, [navigate, status]);

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
