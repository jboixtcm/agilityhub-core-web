import { isApiError } from "@agilityhub/api-client";
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
  Avatar,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Icon,
  Input,
  isModuleUiItemEnabled,
  Modal,
  requiredModulesForUiItem,
  Select,
  TabBar,
  type TabBarItem,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, type SyntheticEvent, useEffect, useRef, useState } from "react";
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

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

type CurrentMe = NonNullable<ReturnType<AuthClient["getMe"]>>;

function profileRoles(me: CurrentMe): readonly Role[] {
  return me.membership.profiles ?? me.membership.roles;
}

function routeAfterLogin(me: CurrentMe): string {
  if (profileRoles(me).length > 1 && me.membership.rememberProfile !== true) {
    return "/perfil-acces";
  }
  return me.membership.activeProfile === "INSTRUCTOR" ? "/instructor/avui" : "/inici";
}

function LogoMark({ compact = false }: { compact?: boolean }) {
  const branding = useBranding();
  const darkLogo = branding.theme.logoDarkUrl?.trim();
  const logo =
    branding.theme.mode === "dark" && darkLogo !== undefined && darkLogo !== ""
      ? darkLogo
      : branding.theme.logoUrl?.trim();
  const mark = branding.theme.markUrl?.trim();
  const hasLogo = logo !== undefined && logo !== "";
  const hasMark = mark !== undefined && mark !== "";
  return (
    <div className={compact ? "auth-logo auth-logo--compact" : "auth-logo"}>
      {hasLogo ? (
        <img alt={branding.club.name} className="auth-logo__full" src={logo} />
      ) : hasMark ? (
        <img alt="" className="auth-logo__mark" src={mark} />
      ) : (
        <span aria-hidden="true" className="auth-logo__fallback">
          <Icon aria-hidden="true" name="paw" />
        </span>
      )}
      {hasLogo ? null : <strong className="auth-logo__name">{branding.club.name}</strong>}
    </div>
  );
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

function ImpersonationBanner({ authClient }: { authClient: AuthClient }) {
  const { me } = useSession();
  const { t } = useTranslation("auth");
  const [pending, setPending] = useState(false);
  if (me?.impersonation === undefined) {
    return null;
  }
  return (
    <div className="impersonation-banner" role="status">
      <span>{t("auth:impersonation.banner", { member: me.account.name })}</span>
      <button
        disabled={pending}
        onClick={() => {
          setPending(true);
          void authClient.logout().catch(() => undefined);
        }}
        type="button"
      >
        {t("auth:impersonation.exit")}
      </button>
    </div>
  );
}

function MobileShell({ authClient, children }: { authClient: AuthClient; children: ReactNode }) {
  const branding = useBranding();
  const session = useSession();
  const { t } = useTranslation("shell");
  const logo = branding.theme.logoUrl ?? branding.theme.markUrl;

  return (
    <div className="clubs-shell">
      <div className="clubs-shell__top">
        <ImpersonationBanner authClient={authClient} />
        <AppBar
          className="clubs-shell__header"
          end={
            <div className="clubs-shell__actions">
              <LanguageSelector />
              <a
                aria-label={t("shell:header.userMenu")}
                className="clubs-shell__user"
                href="/perfil"
              >
                <Icon aria-hidden="true" name="user" />
              </a>
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
      </div>
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

function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [seconds]);
  return { seconds, start: setSeconds };
}

function accessError(
  error: unknown,
  club: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (isApiError(error, "INVALID_CREDENTIALS")) {
    return t("auth:access.invalidCredentials");
  }
  if (isApiError(error, "NO_MEMBERSHIP")) {
    return t("auth:access.noMembership", { club });
  }
  if (isApiError(error, "MEMBERSHIP_SUSPENDED") || isApiError(error, "ACCOUNT_BLOCKED")) {
    return t("auth:access.accessDisabled");
  }
  return t("auth:access.genericError");
}

export function AccessPage({ authClient }: { authClient: AuthClient }) {
  const branding = useBranding();
  const { t } = useTranslation("auth");
  const footerCity = branding.club.city?.trim();
  const [email, setEmail] = useState(
    () => new URLSearchParams(window.location.search).get("email") ?? "",
  );
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"login" | "magic" | "reset" | null>(null);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const countdown = useCountdown();

  const requireEmail = (): boolean => {
    if (email.trim() !== "") {
      return true;
    }
    setError(t("auth:access.emailRequired"));
    document.querySelector<HTMLInputElement>("#access-email")?.focus();
    return false;
  };

  const requestLink = async (purpose: "LOGIN" | "RESET") => {
    if (!requireEmail()) {
      return;
    }
    setError(undefined);
    setMessage(undefined);
    setPending(purpose === "LOGIN" ? "magic" : "reset");
    try {
      await authClient.requestMagicLink(email, purpose);
      setMessage(t("auth:access.neutralSuccess"));
    } catch (requestError) {
      if (isApiError(requestError) && requestError.status === 429) {
        countdown.start(requestError.retryAfter ?? 60);
      } else {
        setError(accessError(requestError, branding.club.name, t));
      }
    } finally {
      setPending(null);
    }
  };

  const login = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireEmail()) {
      return;
    }
    setError(undefined);
    setMessage(undefined);
    setPending("login");
    try {
      const me = await authClient.login(email, password);
      window.location.assign(routeAfterLogin(me));
    } catch (loginError) {
      if (isApiError(loginError) && loginError.status === 429) {
        countdown.start(loginError.retryAfter ?? 60);
      } else {
        setError(accessError(loginError, branding.club.name, t));
      }
      setPending(null);
    }
  };

  return (
    <main className="auth-page">
      <section aria-labelledby="access-title" className="auth-panel">
        <h1 className="ah-sr-only" id="access-title">
          {t("auth:access.title")}
        </h1>
        <LogoMark />
        <form className="auth-form" noValidate onSubmit={(event) => void login(event)}>
          <label className="ah-sr-only" htmlFor="access-email">
            {t("auth:access.emailLabel")}
          </label>
          <Input
            autoComplete="email"
            id="access-email"
            onChange={(event) => {
              setEmail(event.currentTarget.value);
            }}
            placeholder={t("auth:access.emailPlaceholder")}
            type="email"
            value={email}
          />
          <label className="ah-sr-only" htmlFor="access-password">
            {t("auth:access.passwordLabel")}
          </label>
          <Input
            autoComplete="current-password"
            id="access-password"
            onChange={(event) => {
              setPassword(event.currentTarget.value);
            }}
            placeholder={t("auth:access.passwordPlaceholder")}
            required
            type="password"
            value={password}
          />
          <Button
            className="auth-form__primary"
            disabled={pending !== null || countdown.seconds > 0}
            loading={pending === "login"}
            loadingLabel={t("auth:access.entering")}
            type="submit"
          >
            {t("auth:access.enter")}
          </Button>
          <Button
            disabled={pending !== null || countdown.seconds > 0}
            loading={pending === "magic"}
            onClick={() => void requestLink("LOGIN")}
            type="button"
            variant="secondary"
          >
            <Icon aria-hidden="true" name="mail" />
            {t("auth:access.passwordlessLink")}
          </Button>
          <button
            className="auth-text-action"
            disabled={pending !== null || countdown.seconds > 0}
            onClick={() => void requestLink("RESET")}
            type="button"
          >
            {t("auth:access.forgot")}
          </button>
          {countdown.seconds > 0 ? (
            <p className="auth-message auth-message--error" role="alert">
              {t("auth:access.countdown", { seconds: countdown.seconds })}
            </p>
          ) : null}
          {error === undefined ? null : (
            <p className="auth-message auth-message--error" id="access-error" role="alert">
              {error}
            </p>
          )}
          {message === undefined ? null : (
            <p className="auth-message auth-message--success" role="status">
              {message}
            </p>
          )}
        </form>
        {branding.signup.enabled ? (
          <div className="auth-signup">
            <a href="/apuntat-hi">{t("auth:access.signup")}</a>
          </div>
        ) : null}
      </section>
      <footer className="auth-footer">
        {footerCity
          ? t("auth:access.footerWithLocation", {
              club: branding.club.name,
              city: footerCity,
            })
          : t("auth:access.footer", { club: branding.club.name })}
      </footer>
    </main>
  );
}

function passwordError(error: unknown, t: ReturnType<typeof useTranslation>["t"]): string {
  if (isApiError(error, "PASSWORD_TOO_SHORT")) {
    return t("errors:PASSWORD_TOO_SHORT");
  }
  if (isApiError(error, "PASSWORD_MISMATCH")) {
    return t("errors:PASSWORD_MISMATCH");
  }
  if (isApiError(error, "PASSWORD_COMPROMISED")) {
    return t("errors:PASSWORD_COMPROMISED");
  }
  if (isApiError(error, "INVALID_CREDENTIALS")) {
    return t("errors:INVALID_CREDENTIALS");
  }
  return t("auth:access.genericError");
}

function ActivationPage({ authClient }: { authClient: AuthClient }) {
  const { t } = useTranslation(["auth", "errors"]);
  const parameters = new URLSearchParams(window.location.search);
  const purpose = parameters.get("purpose")?.toUpperCase();
  const token = parameters.get("token") ?? parameters.get("t");
  const started = useRef(false);
  const [me, setMe] = useState<CurrentMe>();
  const [invalid, setInvalid] = useState(token === null || token === "");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string>();
  const [passwordFailure, setPasswordFailure] = useState<string>();

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    if (token === null || token === "") {
      return;
    }
    void authClient.exchangeMagicLink(token).then(setMe, () => {
      setInvalid(true);
    });
  }, [authClient, token]);

  if (invalid) {
    return (
      <main className="auth-page">
        <section className="auth-panel auth-panel--centered">
          <LogoMark compact />
          <Icon aria-hidden="true" className="activation-error__icon" name="warn" />
          <h1>{t("auth:activation.invalidTitle")}</h1>
          <p>{t("auth:activation.invalidDescription")}</p>
          <Button
            onClick={() => {
              window.location.assign("/entrar");
            }}
            type="button"
          >
            {t("auth:activation.resend")}
          </Button>
        </section>
      </main>
    );
  }

  if (me === undefined) {
    return (
      <main className="auth-page auth-page--loading">
        <p role="status">{t("auth:activation.loading")}</p>
      </main>
    );
  }

  const savePassword = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordPending(true);
    setPasswordFailure(undefined);
    setPasswordMessage(undefined);
    try {
      await authClient.updatePassword({ new: newPassword, repeat: repeatPassword });
      setPasswordMessage(t("auth:activation.passwordSaved"));
    } catch (error) {
      setPasswordFailure(passwordError(error, t));
    } finally {
      setPasswordPending(false);
    }
  };

  const gender = me.account.gender === "FEMALE" ? "female" : "other";
  return (
    <main className="auth-page">
      <section className="auth-panel activation-panel">
        <LogoMark compact />
        <h1>
          {purpose === "RESET"
            ? t("auth:activation.resetTitle")
            : t("auth:activation.welcome", { gender, name: firstName(me.account.name) })}
        </h1>
        <p className="activation-panel__description">{t("auth:activation.description")}</p>
        {purpose === "RESET" ? null : (
          <p className="activation-success" role="status">
            <Icon aria-hidden="true" name="check" />
            {t("auth:activation.activated")}
          </p>
        )}
        <Button
          className="auth-form__primary"
          onClick={() => {
            window.location.assign(routeAfterLogin(me));
          }}
          type="button"
        >
          {t("auth:activation.continue")}
        </Button>
        <form className="activation-password" onSubmit={(event) => void savePassword(event)}>
          <h2>{t("auth:activation.passwordPrompt")}</h2>
          <label className="ah-sr-only" htmlFor="activation-password">
            {t("auth:activation.newPassword")}
          </label>
          <Input
            autoComplete="new-password"
            id="activation-password"
            onChange={(event) => {
              setNewPassword(event.currentTarget.value);
            }}
            placeholder={t("auth:activation.newPassword")}
            required
            type="password"
            value={newPassword}
          />
          <label className="ah-sr-only" htmlFor="activation-password-repeat">
            {t("auth:activation.repeatPassword")}
          </label>
          <Input
            autoComplete="new-password"
            id="activation-password-repeat"
            onChange={(event) => {
              setRepeatPassword(event.currentTarget.value);
            }}
            placeholder={t("auth:activation.repeatPassword")}
            required
            type="password"
            value={repeatPassword}
          />
          <Button
            loading={passwordPending}
            loadingLabel={t("auth:activation.savingPassword")}
            type="submit"
            variant="secondary"
          >
            {t("auth:activation.savePassword")}
          </Button>
          {passwordFailure === undefined ? null : <p role="alert">{passwordFailure}</p>}
          {passwordMessage === undefined ? null : <p role="status">{passwordMessage}</p>}
        </form>
        <p className="activation-panel__footnote">{t("auth:activation.optionalPassword")}</p>
      </section>
    </main>
  );
}

function roleCopy(
  role: Role,
  gender: "female" | "other",
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (role === "MEMBER") {
    return {
      description: t("auth:profileChoice.memberDescription"),
      icon: "paw" as const,
      label: t("auth:profileChoice.member", { gender }),
    };
  }
  if (role === "INSTRUCTOR") {
    return {
      description: t("auth:profileChoice.instructorDescription"),
      icon: "list" as const,
      label: t("auth:profileChoice.instructor", { gender }),
    };
  }
  return {
    description: t("auth:profileChoice.adminDescription"),
    icon: "globe" as const,
    label: t("auth:profileChoice.admin", { gender }),
  };
}

function ProfileChoicePage({ authClient }: { authClient: AuthClient }) {
  const { me } = useSession();
  const { t } = useTranslation("auth");
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState<Role>();
  const [error, setError] = useState(false);
  if (me === null) {
    return null;
  }
  const roles = profileRoles(me);
  const gender = me.account.gender === "FEMALE" ? "female" : "other";

  const selectProfile = async (role: Role) => {
    setPending(role);
    setError(false);
    try {
      await authClient.updateProfile(role, remember);
      if (role === "ADMIN") {
        const handoff = await authClient.createHandoff("clubs-admin");
        window.location.assign(handoff.url);
      } else {
        window.location.assign(role === "INSTRUCTOR" ? "/instructor/avui" : "/inici");
      }
    } catch {
      setError(true);
      setPending(undefined);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel profile-choice">
        <LogoMark compact />
        <h1>{t("auth:profileChoice.greeting", { name: firstName(me.account.name) })}</h1>
        <p>{t("auth:profileChoice.prompt")}</p>
        <div className="profile-choice__cards">
          {roles.map((role) => {
            const copy = roleCopy(role, gender, t);
            return (
              <button
                aria-busy={pending === role || undefined}
                className="profile-choice__card"
                disabled={pending !== undefined}
                key={role}
                onClick={() => void selectProfile(role)}
                type="button"
              >
                <Icon aria-hidden="true" name={copy.icon} />
                <span>
                  <strong>{pending === role ? t("auth:profileChoice.saving") : copy.label}</strong>
                  <small>{copy.description}</small>
                </span>
                <Icon aria-hidden="true" name="chev" />
              </button>
            );
          })}
        </div>
        <label className="profile-choice__remember">
          <Checkbox
            checked={remember}
            onChange={(event) => {
              setRemember(event.currentTarget.checked);
            }}
          />
          <span>{t("auth:profileChoice.remember")}</span>
        </label>
        {error ? <p role="alert">{t("auth:profileChoice.error")}</p> : null}
        <p className="profile-choice__footnote">{t("auth:profileChoice.footer")}</p>
      </section>
    </main>
  );
}

function PasswordModal({
  authClient,
  hasPassword,
  onClose,
  open,
}: {
  authClient: AuthClient;
  hasPassword: boolean;
  onClose: () => void;
  open: boolean;
}) {
  const { t } = useTranslation(["auth", "errors"]);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await authClient.updatePassword({
        ...(hasPassword ? { current } : {}),
        new: next,
        repeat,
      });
      setSaved(true);
    } catch (updateError) {
      setError(passwordError(updateError, t));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      closeLabel={t("auth:profile.close")}
      onClose={onClose}
      open={open}
      title={t("auth:profile.passwordTitle")}
    >
      {saved ? (
        <p className="auth-message auth-message--success" role="status">
          {t("auth:profile.passwordSaved")}
        </p>
      ) : (
        <form className="profile-modal-form" onSubmit={(event) => void submit(event)}>
          {hasPassword ? (
            <>
              <label htmlFor="profile-current-password">{t("auth:profile.currentPassword")}</label>
              <Input
                autoComplete="current-password"
                id="profile-current-password"
                onChange={(event) => {
                  setCurrent(event.currentTarget.value);
                }}
                required
                type="password"
                value={current}
              />
            </>
          ) : null}
          <label htmlFor="profile-new-password">{t("auth:profile.newPassword")}</label>
          <Input
            autoComplete="new-password"
            id="profile-new-password"
            onChange={(event) => {
              setNext(event.currentTarget.value);
            }}
            required
            type="password"
            value={next}
          />
          <label htmlFor="profile-repeat-password">{t("auth:profile.repeatPassword")}</label>
          <Input
            autoComplete="new-password"
            id="profile-repeat-password"
            onChange={(event) => {
              setRepeat(event.currentTarget.value);
            }}
            required
            type="password"
            value={repeat}
          />
          {error === undefined ? null : <p role="alert">{error}</p>}
          <Button disabled={pending} type="submit">
            {t("auth:profile.savePassword")}
          </Button>
        </form>
      )}
    </Modal>
  );
}

function activeProfileLabel(
  role: Role | undefined,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (role === "INSTRUCTOR") {
    return t("auth:profile.instructorProfile");
  }
  if (role === "ADMIN") {
    return t("auth:profile.adminProfile");
  }
  return t("auth:profile.memberProfile");
}

function ProfilePage({ authClient }: { authClient: AuthClient }) {
  const branding = useBranding();
  const { me } = useSession();
  const { i18n, t } = useTranslation(["auth", "shell"]);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [working, setWorking] = useState(false);
  if (me === null) {
    return null;
  }
  const profiles = profileRoles(me);
  const localeOptions = productLocales.filter((locale) => branding.locales.includes(locale));

  return (
    <div className="profile-page">
      <h1>{t("auth:profile.title")}</h1>
      <Card className="profile-account">
        <a href="/dades">
          <Avatar name={me.account.name} />
          <strong>{me.account.name}</strong>
          <Icon aria-hidden="true" name="chev" />
        </a>
        <small>{t("auth:profile.accountHelp")}</small>
      </Card>
      <Card className="profile-list">
        <a href="/gossos">
          <Icon aria-hidden="true" name="paw" />
          <span>{t("auth:profile.dogs")}</span>
          <Icon aria-hidden="true" name="chev" />
        </a>
        <button
          onClick={() => {
            setPasswordOpen(true);
          }}
          type="button"
        >
          <Icon aria-hidden="true" name="lock" />
          <span>{t("auth:profile.password")}</span>
          <Icon aria-hidden="true" name="chev" />
        </button>
        {profiles.length > 1 ? (
          <a href="/perfil-acces">
            <Icon aria-hidden="true" name="user" />
            <span>{t("auth:profile.changeProfile")}</span>
            <small>{activeProfileLabel(me.membership.activeProfile, t)}</small>
            <Icon aria-hidden="true" name="chev" />
          </a>
        ) : null}
      </Card>
      <Card aria-disabled="true" className="profile-notices">
        <div className="profile-notices__header">
          <h2>{t("auth:profile.notices")}</h2>
          <small>{t("auth:profile.appChannel")}</small>
          <small>{t("auth:profile.emailChannel")}</small>
        </div>
        <div className="profile-notices__row">
          <span>{t("auth:profile.operationalNotices")}</span>
          <Icon aria-label={t("auth:profile.appAlwaysOn")} name="check" />
          <span aria-hidden="true" className="profile-notices__toggle" />
        </div>
        <div className="profile-notices__row">
          <span>{t("auth:profile.personalNotices")}</span>
          <Icon aria-label={t("auth:profile.appAlwaysOn")} name="check" />
          <span
            aria-hidden="true"
            className="profile-notices__toggle profile-notices__toggle--on"
          />
        </div>
        <div className="profile-notices__row">
          <span>{t("auth:profile.clubChanges")}</span>
          <span className="profile-notices__app-state">
            <Icon aria-label={t("auth:profile.appAlwaysOn")} name="check" />
            <small>{t("auth:profile.smsIncluded")}</small>
          </span>
          <span
            aria-hidden="true"
            className="profile-notices__toggle profile-notices__toggle--on"
          />
        </div>
        <div className="profile-notices__reminder">
          <span>{t("auth:profile.classReminder")}</span>
          <span>{t("auth:profile.never")}</span>
        </div>
        <div className="profile-notices__mobile">
          <span>{t("auth:profile.mobileNotices")}</span>
          <span
            aria-hidden="true"
            className="profile-notices__toggle profile-notices__toggle--on"
          />
        </div>
      </Card>
      <Card className="profile-language-card">
        <label className="profile-language">
          <Icon aria-hidden="true" name="globe" />
          <span>{t("auth:profile.language")}</span>
          <Select
            aria-label={t("auth:profile.language")}
            disabled={working}
            onChange={(event) => {
              const locale = event.currentTarget.value;
              setWorking(true);
              void authClient.updateLocale(locale).then(
                async () => {
                  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
                  await i18n.changeLanguage(locale);
                  setWorking(false);
                },
                () => {
                  setWorking(false);
                },
              );
            }}
            value={me.account.locale}
          >
            {localeOptions.map((locale) => (
              <option key={locale} value={locale}>
                {locale === "ca"
                  ? t("shell:language.ca")
                  : locale === "es"
                    ? t("shell:language.es")
                    : t("shell:language.en")}
              </option>
            ))}
          </Select>
        </label>
      </Card>
      <Card className="profile-list profile-list--final">
        <a href="/inactivitat">
          <Icon aria-hidden="true" name="palm" />
          <span>{t("auth:profile.inactivity")}</span>
          <Icon aria-hidden="true" name="chev" />
        </a>
        <a className="profile-list__muted" href="/baixa">
          <Icon aria-hidden="true" name="ban" />
          <span>{t("auth:profile.leave")}</span>
          <Icon aria-hidden="true" name="chev" />
        </a>
        <button
          className="profile-list__logout"
          disabled={working}
          onClick={() => {
            setWorking(true);
            void authClient.logout().catch(() => undefined);
          }}
          type="button"
        >
          <Icon aria-hidden="true" name="unlock" />
          <span>{t("auth:profile.logout")}</span>
          <Icon aria-hidden="true" name="chev" />
        </button>
      </Card>
      {working ? <p role="status">{t("auth:profile.working")}</p> : null}
      <PasswordModal
        authClient={authClient}
        hasPassword={me.account.hasPassword}
        onClose={() => {
          setPasswordOpen(false);
        }}
        open={passwordOpen}
      />
    </div>
  );
}

function LegacyAccessRedirect() {
  useEffect(() => {
    window.location.replace("/entrar");
  }, []);
  return null;
}

export function App({ authClient }: { authClient: AuthClient }) {
  const pathname = window.location.pathname;
  if (pathname === "/acces") {
    return <LegacyAccessRedirect />;
  }
  if (pathname === "/entrar") {
    return <AccessPage authClient={authClient} />;
  }
  if (pathname === "/activacio") {
    return <ActivationPage authClient={authClient} />;
  }
  if (pathname === "/perfil-acces") {
    return (
      <RequireAuth>
        <ProfileChoicePage authClient={authClient} />
      </RequireAuth>
    );
  }

  const route = currentRoute(pathname) ?? currentRoute("/inici");
  if (route === undefined) {
    return null;
  }

  const content =
    pathname === "/perfil" ? (
      <RequireAuth>
        <ProfilePage authClient={authClient} />
      </RequireAuth>
    ) : (
      routePlaceholder(route)
    );

  return route.public === true ? (
    content
  ) : (
    <MobileShell authClient={authClient}>{content}</MobileShell>
  );
}
