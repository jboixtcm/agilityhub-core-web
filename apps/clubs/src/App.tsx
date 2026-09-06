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
  AppBar,
  Button,
  Card,
  EmptyState,
  FormField,
  Icon,
  Input,
  isModuleUiItemEnabled,
  requiredModulesForUiItem,
  TabBar,
  type TabBarItem,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";

interface RouteDefinition {
  path: string;
  public?: boolean;
  roles?: readonly Role[];
}

export const MOBILE_ROUTES: readonly RouteDefinition[] = [
  // Screens 01 and 02.
  { path: "/entrar", public: true },
  { path: "/activacio", public: true },
  // Screen 03b.
  { path: "/perfil-acces" },
  // Screen 03.
  { path: "/inici" },
  // Screens 04, 06, 29 and 07.
  { path: "/reservar" },
  { path: "/reservar/confirmar" },
  { path: "/reserves/:id" },
  // Screen 08.
  { path: "/entrenaments" },
  // Screen 10.
  { path: "/avui" },
  // Screen 11.
  { path: "/notificacions" },
  // Screens 12, 13 and 28.
  { path: "/perfil" },
  { path: "/gossos" },
  { path: "/dades" },
  // Screens 14 and 15.
  { path: "/inactivitat" },
  { path: "/baixa" },
  // Screens 16–19.
  { path: "/apuntat-hi/*", public: true },
  // Screens 20, 21, 22, 24 and 26.
  { path: "/instructor/pistes/:ringId/reservar", roles: ["INSTRUCTOR"] },
  { path: "/instructor/tasques", roles: ["INSTRUCTOR"] },
  { path: "/instructor/*", roles: ["INSTRUCTOR"] },
  // Screen 23. Kept before the wildcard for exact route resolution.
  { path: "/instructor/avui", roles: ["INSTRUCTOR"] },
  // Screen 25.
  { path: "/historic" },
  // Screen 30.
  { path: "/info" },
  // New course screens from S16.
  { path: "/recorreguts/muntat/:ringId" },
  { path: "/instructor/pistes/:ringId/muntat", roles: ["INSTRUCTOR"] },
  { path: "/instructor/muntatge/:sessionId", roles: ["INSTRUCTOR"] },
  // Screens 27 and 27b (reserved for R2).
  { path: "/estadistiques" },
  { path: "/estadistiques/lliga" },
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

function currentRoute(pathname: string): RouteDefinition | undefined {
  const exact = MOBILE_ROUTES.find(
    (route) => !route.path.includes("*") && matchesPath(pathname, route.path),
  );
  return exact ?? MOBILE_ROUTES.find((route) => matchesPath(pathname, route.path));
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

export function MobileNavigation({
  modules,
  pathname,
  roles,
}: {
  modules: readonly string[];
  pathname: string;
  roles: readonly Role[];
}) {
  const { t } = useTranslation("shell");
  const definitions: (TabBarItem & { id: string; roles?: readonly Role[] })[] = [
    { href: "/inici", icon: "home", id: "home", label: t("shell:nav.home") },
    { href: "/reservar", icon: "cal", id: "reserve", label: t("shell:nav.reserve") },
    {
      href: "/entrenaments",
      icon: "cone",
      id: "training",
      label: t("shell:nav.training"),
    },
    {
      href: "/instructor/avui",
      icon: "day",
      id: "today",
      label: t("shell:nav.today"),
      roles: ["INSTRUCTOR"],
    },
    { href: "/perfil", icon: "user", id: "profile", label: t("shell:nav.profile") },
    { href: "/info", icon: "info", id: "info", label: t("shell:nav.info") },
  ];
  const items = definitions
    .filter((item) => isModuleUiItemEnabled(modules, "tabs", item.id))
    .filter((item) => item.roles === undefined || item.roles.some((role) => roles.includes(role)))
    .map((item) => ({
      active: matchesPath(pathname, item.href),
      href: item.href,
      icon: item.icon,
      label: item.label,
    }));

  return <TabBar items={items} label={t("shell:nav.main")} />;
}

function MobileShell({ children }: { children: ReactNode }) {
  const branding = useBranding();
  const session = useSession();
  const { t } = useTranslation("shell");
  const logo = branding.theme.logoUrl ?? branding.theme.markUrl;

  return (
    <div className="clubs-shell">
      <AppBar
        className="clubs-shell__header"
        end={
          <div className="clubs-shell__actions">
            <LanguageSelector />
            <button
              aria-label={t("shell:header.userMenu")}
              className="clubs-shell__user"
              type="button"
            >
              <Icon aria-hidden="true" name="user" />
            </button>
          </div>
        }
        start={
          logo === undefined ? (
            <span aria-hidden="true" className="clubs-shell__mark">
              {branding.club.name.charAt(0)}
            </span>
          ) : (
            <img alt={branding.club.name} className="clubs-shell__logo" src={logo} />
          )
        }
        title={branding.club.name}
      />
      <main className="clubs-shell__content">{children}</main>
      <MobileNavigation
        modules={branding.modules}
        pathname={window.location.pathname}
        roles={session.roles}
      />
    </div>
  );
}

function routePlaceholder(route: RouteDefinition): ReactNode {
  let content: ReactNode = <Placeholder />;
  const requiredModules = requiredModulesForUiItem("routes", route.path);

  requiredModules.forEach((module) => {
    content = <RequireModule module={module}>{content}</RequireModule>;
  });
  if (route.roles !== undefined) {
    content = <RequireRole roles={route.roles}>{content}</RequireRole>;
  } else if (route.public !== true) {
    content = <RequireAuth>{content}</RequireAuth>;
  }

  return content;
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
      window.location.assign("/inici");
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
  const pathname = window.location.pathname;
  if (pathname === "/acces") {
    return <AccessPage authClient={authClient} />;
  }

  const route = currentRoute(pathname) ?? currentRoute("/inici");
  if (route === undefined) {
    return null;
  }

  if (route.public === true) {
    return routePlaceholder(route);
  }

  return <MobileShell>{routePlaceholder(route)}</MobileShell>;
}
