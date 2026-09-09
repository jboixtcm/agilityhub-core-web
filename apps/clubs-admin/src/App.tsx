import {
  type AuthClient,
  createAuthenticatedApiClient,
  OnboardingExperience,
  RequireAuth,
  RequireModule,
  RequireRole,
  useSession,
} from "@agilityhub/auth";
import type { Role } from "@agilityhub/auth";
import { LOCALE_STORAGE_KEY, productLocales } from "@agilityhub/i18n";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Icon,
  Input,
  isModuleUiItemEnabled,
  requiredModulesForUiItem,
  resolveBrandingLogo,
  Sidebar,
  type SidebarEntry,
  type SidebarGroup,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AuditPage, MemberAuditPage } from "./audit/AuditPage";
import { ExportJobsProvider, useExportsDrawer } from "./audit/ExportsDrawer";
import { PlansPage } from "./catalogs/PlansPage";
import { RingsPage } from "./catalogs/RingsPage";
import { SettingsPage } from "./catalogs/SettingsPage";
import { TeamPage } from "./catalogs/TeamPage";
import { DogsPage, MembersPage } from "./census/CensusListPage";
import { DogRecordPage, MemberRecordPage } from "./census/CensusRecordPage";
import { Gallery } from "./dev/gallery";

interface AdminRouteDefinition {
  path: string;
  platformOnly?: boolean;
  roles?: readonly Role[];
}

export const ADMIN_ROUTES: readonly AdminRouteDefinition[] = [
  // Screen D1.
  { path: "/tauler", roles: ["ADMIN", "INSTRUCTOR"] },
  // Screen D2.
  { path: "/preinscripcions/:id", roles: ["ADMIN"] },
  // Screens D3 and D3b.
  { path: "/plantilles", roles: ["ADMIN"] },
  // Screens D4, D4b and D4c.
  { path: "/calendari", roles: ["ADMIN"] },
  // Screens D5 and D10.
  { path: "/abonats", roles: ["ADMIN"] },
  { path: "/abonats/:id", roles: ["ADMIN"] },
  { path: "/abonats/:id/auditoria", roles: ["ADMIN"] },
  // Screen D15.
  { path: "/gossos", roles: ["ADMIN"] },
  { path: "/gossos/:id", roles: ["ADMIN"] },
  // Screen D6.
  { path: "/facturacio", roles: ["ADMIN"] },
  { path: "/facturacio/remeses", roles: ["ADMIN"] },
  // Screen D7.
  { path: "/activitats", roles: ["ADMIN"] },
  // Screen D8.
  { path: "/modalitats", roles: ["ADMIN"] },
  // Screen D9.
  { path: "/comunicats", roles: ["ADMIN"] },
  // Screen D11.
  { path: "/parametres", roles: ["ADMIN"] },
  // Screen D12.
  { path: "/agenda", roles: ["INSTRUCTOR", "ADMIN"] },
  // Screen D13.
  { path: "/alumnes/:id", roles: ["INSTRUCTOR", "ADMIN"] },
  // Screen D14.
  { path: "/seguiment", roles: ["ADMIN"] },
  // Screen D16.
  { path: "/pistes", roles: ["ADMIN"] },
  // Screen D17.
  { path: "/equip", roles: ["ADMIN"] },
  // Screen D18.
  { path: "/recorreguts", roles: ["INSTRUCTOR", "ADMIN"] },
  // New inactivity page from S13.
  { path: "/inactivitats", roles: ["ADMIN"] },
  // Role-gated entry without a mockup.
  { path: "/auditoria", roles: ["ADMIN"] },
  // Screen D19.
  { path: "/consola/*", platformOnly: true },
];

function matchesPath(pathname: string, pattern: string): boolean {
  if (pattern.endsWith("/*") && pathname === pattern.slice(0, -2)) {
    return true;
  }
  const expression = pattern
    .split("/")
    .map((segment) => (segment === "*" ? ".*" : segment.startsWith(":") ? "[^/]+" : segment))
    .join("/");
  return new RegExp(`^${expression}/?$`).test(pathname);
}

function currentRoute(pathname: string): AdminRouteDefinition | undefined {
  const exact = ADMIN_ROUTES.find(
    (route) => !route.path.includes("*") && matchesPath(pathname, route.path),
  );
  return exact ?? ADMIN_ROUTES.find((route) => matchesPath(pathname, route.path));
}

function Placeholder() {
  const { t } = useTranslation("shell");
  return (
    <EmptyState
      description={t("shell:placeholder.description")}
      title={t("shell:placeholder.title")}
    />
  );
}

function LanguageSelector() {
  const branding = useBranding();
  const { i18n, t } = useTranslation("shell");
  const locales = productLocales.filter((locale) => branding.locales.includes(locale));

  return (
    <label className="shell-language">
      <span className="ah-sr-only">{t("shell:header.language")}</span>
      <select
        aria-label={t("shell:header.language")}
        onChange={(event) => {
          localStorage.setItem(LOCALE_STORAGE_KEY, event.currentTarget.value);
          void i18n.changeLanguage(event.currentTarget.value);
        }}
        value={i18n.resolvedLanguage ?? branding.defaultLocale}
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {locale === "ca"
              ? t("shell:language.ca")
              : locale === "es"
                ? t("shell:language.es")
                : t("shell:language.en")}
          </option>
        ))}
      </select>
    </label>
  );
}

interface GatedSidebarEntry extends SidebarEntry {
  id: string;
  platformOnly?: boolean;
  roles?: readonly Role[];
}

interface GatedSidebarGroup {
  entries: GatedSidebarEntry[];
  label: string;
  roles?: readonly Role[];
}

export function AdminNavigation({
  modules,
  pathname,
  roles,
}: {
  modules: readonly string[];
  pathname: string;
  roles: readonly Role[];
}) {
  const { t } = useTranslation("shell");
  const hasPlatformRole = (roles as readonly string[]).includes("AGILITYHUB_ADMIN");
  const definitions: GatedSidebarGroup[] = [
    {
      label: t("shell:nav.dashboard"),
      entries: [
        { href: "/tauler", icon: "grid", id: "dashboard", label: t("shell:nav.dashboard") },
      ],
    },
    {
      label: t("shell:nav.people"),
      roles: ["ADMIN"],
      entries: [
        {
          count: 3,
          href: "/preinscripcions/nova",
          icon: "user",
          id: "pre-registrations",
          label: t("shell:nav.preRegistrations"),
        },
        { href: "/abonats", icon: "user", id: "members", label: t("shell:nav.members") },
        { href: "/gossos", icon: "paw", id: "dogs", label: t("shell:nav.dogs") },
        {
          count: 1,
          href: "/inactivitats",
          icon: "palm",
          id: "inactivity",
          label: t("shell:nav.inactivity"),
        },
        {
          count: 5,
          href: "/seguiment",
          icon: "list",
          id: "student-follow-up",
          label: t("shell:nav.studentFollowUp"),
        },
      ],
    },
    {
      label: t("shell:nav.field"),
      entries: [
        {
          href: "/plantilles",
          icon: "cal",
          id: "weekly-template",
          label: t("shell:nav.weeklyTemplate"),
          roles: ["ADMIN"],
        },
        {
          href: "/calendari",
          icon: "day",
          id: "class-calendar",
          label: t("shell:nav.classCalendar"),
          roles: ["ADMIN"],
        },
        {
          href: "/agenda",
          icon: "cone",
          id: "training",
          label: t("shell:nav.training"),
          roles: ["INSTRUCTOR", "ADMIN"],
        },
        {
          href: "/activitats",
          icon: "flag",
          id: "activities",
          label: t("shell:nav.activities"),
          roles: ["ADMIN"],
        },
        {
          href: "/recorreguts",
          icon: "grid",
          id: "courses",
          label: t("shell:nav.courses"),
          roles: ["INSTRUCTOR", "ADMIN"],
        },
      ],
    },
    {
      label: t("shell:nav.management"),
      roles: ["ADMIN"],
      entries: [
        {
          href: "/facturacio",
          icon: "doc",
          id: "billing",
          label: t("shell:nav.billing"),
        },
        {
          href: "/modalitats",
          icon: "list",
          id: "modalities",
          label: t("shell:nav.modalities"),
        },
        {
          href: "/comunicats",
          icon: "mail",
          id: "announcements",
          label: t("shell:nav.announcements"),
        },
      ],
    },
    {
      label: t("shell:nav.configuration"),
      roles: ["ADMIN"],
      entries: [
        { href: "/pistes", icon: "grid", id: "rings", label: t("shell:nav.rings") },
        { href: "/equip", icon: "user", id: "team", label: t("shell:nav.team") },
        {
          href: "/parametres",
          icon: "edit",
          id: "settings",
          label: t("shell:nav.settings"),
        },
        {
          href: "/auditoria",
          icon: "list",
          id: "audit",
          label: t("shell:nav.audit"),
          roles: ["ADMIN"],
        },
        {
          href: "/consola",
          icon: "globe",
          id: "console",
          label: t("shell:nav.console"),
          platformOnly: true,
        },
      ],
    },
  ];

  const groups: SidebarGroup[] = definitions
    .filter(
      (group) =>
        group.roles === undefined ||
        group.roles.some((requiredRole) => roles.includes(requiredRole)),
    )
    .map((group) => ({
      label: group.label,
      entries: group.entries
        .filter((entry) => isModuleUiItemEnabled(modules, "menuEntries", entry.id))
        .filter(
          (entry) =>
            (entry.roles === undefined || entry.roles.some((role) => roles.includes(role))) &&
            (entry.platformOnly !== true || hasPlatformRole),
        )
        .map((entry) => ({
          active: matchesPath(pathname, entry.href),
          ...(entry.count === undefined ? {} : { count: entry.count }),
          href: entry.href,
          icon: entry.icon,
          label: entry.label,
        })),
    }))
    .filter((group) => group.entries.length > 0);

  return <Sidebar groups={groups} label={t("shell:nav.admin")} />;
}

function PlatformRoleGuard({ children }: { children: ReactNode }) {
  const session = useSession();
  const allowed = (session.roles as readonly string[]).includes("AGILITYHUB_ADMIN");
  return <RequireAuth>{allowed ? children : null}</RequireAuth>;
}

function routeContent(
  route: AdminRouteDefinition,
  client: ReturnType<typeof createAuthenticatedApiClient>,
) {
  if (route.path === "/abonats") {
    return <MembersPage client={client} />;
  }
  if (route.path === "/gossos") {
    return <DogsPage client={client} />;
  }
  if (route.path === "/abonats/:id") {
    return <MemberRecordPage client={client} />;
  }
  if (route.path === "/abonats/:id/auditoria") {
    return <MemberAuditPage client={client} />;
  }
  if (route.path === "/gossos/:id") {
    return <DogRecordPage client={client} />;
  }
  if (route.path === "/pistes") {
    return <RingsPage client={client} />;
  }
  if (route.path === "/equip") {
    return <TeamPage client={client} />;
  }
  if (route.path === "/parametres") {
    return <SettingsPage client={client} />;
  }
  if (route.path === "/modalitats") {
    return <PlansPage client={client} />;
  }
  if (route.path === "/auditoria") {
    return <AuditPage client={client} />;
  }
  return <Placeholder />;
}

function gatedRoute(route: AdminRouteDefinition, content: ReactNode): ReactNode {
  requiredModulesForUiItem("routes", route.path).forEach((module) => {
    content = <RequireModule module={module}>{content}</RequireModule>;
  });
  if (route.platformOnly === true) {
    return <PlatformRoleGuard>{content}</PlatformRoleGuard>;
  }
  return <RequireRole roles={route.roles ?? ["ADMIN"]}>{content}</RequireRole>;
}

function AdminShell({ children }: { children: ReactNode }) {
  const branding = useBranding();
  const session = useSession();
  const { t } = useTranslation(["shell", "admin-audit"]);
  const { openExports } = useExportsDrawer();
  const logo = resolveBrandingLogo(branding.theme, { placement: "compact" });

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="admin-shell__brand">
          {logo.kind === "initial" ? (
            <span aria-hidden="true" className="admin-shell__mark">
              {branding.club.name.charAt(0)}
            </span>
          ) : (
            <img alt="" src={logo.src} />
          )}
          <strong>{branding.club.name}</strong>
        </div>
        <div className="admin-shell__actions">
          <LanguageSelector />
          <button
            aria-label={t("admin-audit:exports.open")}
            onClick={() => {
              openExports();
            }}
            type="button"
          >
            <Icon aria-hidden="true" name="export" />
          </button>
          <button aria-label={t("shell:header.userMenu")} type="button">
            <Icon aria-hidden="true" name="user" />
          </button>
        </div>
      </header>
      <AdminNavigation
        modules={branding.modules}
        pathname={window.location.pathname}
        roles={session.roles}
      />
      <main className="admin-shell__content">{children}</main>
    </div>
  );
}

function AccessPage({ authClient }: { authClient: AuthClient }) {
  const { t } = useTranslation("auth");
  const handoff = new URLSearchParams(window.location.search).get("handoff");
  const handoffStarted = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, setPending] = useState<"handoff" | "login" | "magic" | null>(
    handoff === null ? null : "handoff",
  );
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (handoff === null || handoffStarted.current) {
      return;
    }
    handoffStarted.current = true;
    void authClient.exchangeHandoff(handoff).then(
      () => {
        window.location.assign("/tauler");
      },
      () => {
        setError(t("auth:admin.handoffError"));
        setPending(null);
      },
    );
  }, [authClient, handoff, t]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setPending("login");
    try {
      await authClient.login(email, password);
      window.location.assign("/tauler");
    } catch {
      setError(t("auth:access.genericError"));
      setPending(null);
    }
  };

  const requestMagicLink = async () => {
    if (email.trim() === "") {
      setError(t("auth:access.emailRequired"));
      document.querySelector<HTMLInputElement>("#access-email")?.focus();
      return;
    }
    setError(undefined);
    setMessage(undefined);
    setPending("magic");
    try {
      await authClient.requestMagicLink(email, "LOGIN");
      setMessage(t("auth:access.neutralSuccess"));
    } catch {
      setError(t("auth:access.genericError"));
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="access-page">
      <Card className="access-card">
        <h1>{t("auth:admin.title")}</h1>
        {pending === "handoff" ? <p role="status">{t("auth:admin.handoffLoading")}</p> : null}
        <form onSubmit={(event) => void submit(event)}>
          <FormField id="access-email" label={t("auth:access.emailLabel")}>
            <Input
              autoComplete="email"
              id="access-email"
              onChange={(event) => {
                setEmail(event.currentTarget.value);
              }}
              type="email"
              value={email}
            />
          </FormField>
          <Button disabled={pending !== null} onClick={() => void requestMagicLink()} type="button">
            <Icon aria-hidden="true" name="mail" />
            {t("auth:access.magicLink")}
          </Button>
          {passwordVisible ? (
            <>
              <FormField id="access-password" label={t("auth:access.passwordLabel")}>
                <Input
                  autoComplete="current-password"
                  id="access-password"
                  onChange={(event) => {
                    setPassword(event.currentTarget.value);
                  }}
                  required
                  type="password"
                  value={password}
                />
              </FormField>
              <Button disabled={pending !== null} type="submit">
                {pending === "login" ? t("auth:access.entering") : t("auth:access.enter")}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                setPasswordVisible(true);
              }}
              type="button"
              variant="secondary"
            >
              <Icon aria-hidden="true" name="lock" />
              {t("auth:access.passwordReveal")}
            </Button>
          )}
          {error === undefined ? null : <p role="alert">{error}</p>}
          {message === undefined ? null : <p role="status">{message}</p>}
        </form>
      </Card>
    </main>
  );
}

export function App({ authClient }: { authClient: AuthClient }) {
  const client = useMemo(
    () =>
      createAuthenticatedApiClient(authClient, {
        baseUrl: "/api/v1",
      }),
    [authClient],
  );
  if (import.meta.env.DEV && window.location.pathname === "/_gallery") {
    return <Gallery />;
  }
  if (window.location.pathname === "/acces") {
    window.location.replace("/entrar");
    return null;
  }
  if (window.location.pathname === "/entrar") {
    return <AccessPage authClient={authClient} />;
  }

  const route = currentRoute(window.location.pathname) ?? currentRoute("/tauler");
  return route === undefined ? null : (
    <OnboardingExperience authClient={authClient} presentation="modal">
      <ExportJobsProvider client={client}>
        <AdminShell>{gatedRoute(route, routeContent(route, client))}</AdminShell>
      </ExportJobsProvider>
    </OnboardingExperience>
  );
}
