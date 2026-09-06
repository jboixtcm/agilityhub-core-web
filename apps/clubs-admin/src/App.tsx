import {
  type AuthClient,
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
  Sidebar,
  type SidebarEntry,
  type SidebarGroup,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";

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
  // Screen D15.
  { path: "/gossos", roles: ["ADMIN"] },
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

function routePlaceholder(route: AdminRouteDefinition): ReactNode {
  let content: ReactNode = <Placeholder />;
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
  const { t } = useTranslation("shell");
  const logo = branding.theme.logoUrl ?? branding.theme.markUrl;

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="admin-shell__brand">
          {logo === undefined ? (
            <span aria-hidden="true" className="admin-shell__mark">
              {branding.club.name.charAt(0)}
            </span>
          ) : (
            <img alt={branding.club.name} src={logo} />
          )}
          <strong>{branding.club.name}</strong>
        </div>
        <div className="admin-shell__actions">
          <LanguageSelector />
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
  const { t } = useTranslation("shell");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    setFailed(false);
    setPending(true);
    try {
      await authClient.login(email, password);
      window.location.assign("/tauler");
    } catch {
      setFailed(true);
      setPending(false);
    }
  };

  return (
    <main className="access-page">
      <Card className="access-card">
        <h1>{t("shell:login.title")}</h1>
        <form onSubmit={(event) => void submit(event)}>
          <FormField id="access-email" label={t("shell:login.email")}>
            <Input
              autoComplete="email"
              id="access-email"
              onChange={(event) => {
                setEmail(event.currentTarget.value);
              }}
              required
              type="email"
              value={email}
            />
          </FormField>
          <FormField id="access-password" label={t("shell:login.password")}>
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
          {failed ? <p role="alert">{t("shell:login.error")}</p> : null}
          <Button disabled={pending} type="submit">
            {pending ? t("shell:login.submitting") : t("shell:login.submit")}
          </Button>
        </form>
      </Card>
    </main>
  );
}

export function App({ authClient }: { authClient: AuthClient }) {
  if (import.meta.env.DEV && window.location.pathname === "/_gallery") {
    return <Gallery />;
  }
  if (window.location.pathname === "/acces") {
    return <AccessPage authClient={authClient} />;
  }

  const route = currentRoute(window.location.pathname) ?? currentRoute("/tauler");
  return route === undefined ? null : <AdminShell>{routePlaceholder(route)}</AdminShell>;
}
