import { isApiError } from "@agilityhub/api-client";
import { type AccountSession, type AuthClient, useSession } from "@agilityhub/auth";
import {
  LOCALE_STORAGE_KEY,
  productLocales,
  type Locale,
} from "@agilityhub/i18n";
import { Badge, Button, Card, Icon, Input, Select } from "@agilityhub/ui";
import { type ReactNode, type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Navigate = (destination: string) => void;
type Translate = ReturnType<typeof useTranslation>["t"];

interface PageProps {
  authClient: AuthClient;
  navigate: Navigate;
}

function defaultNavigate(destination: string): void {
  window.location.assign(destination);
}

function authorizeUrl(search = window.location.search): URL | null {
  const raw = new URLSearchParams(search).get("continue");
  if (raw === null || raw.trim() === "") {
    return null;
  }

  try {
    const destination = new URL(raw, window.location.origin);
    if (
      destination.origin !== window.location.origin ||
      destination.pathname !== "/oauth2/authorize"
    ) {
      return null;
    }
    return destination;
  } catch {
    return null;
  }
}

export function oidcContinuation(search = window.location.search): string | null {
  const destination = authorizeUrl(search);
  return destination === null
    ? null
    : `${destination.pathname}${destination.search}${destination.hash}`;
}

function authorizationParameter(name: "login_hint" | "ui_locales"): string | null {
  const direct = new URLSearchParams(window.location.search).get(name);
  return direct ?? authorizeUrl()?.searchParams.get(name) ?? null;
}

function initialLoginEmail(): string {
  return authorizationParameter("login_hint") ?? "";
}

function preferredLocale(): Locale | null {
  const requested = authorizationParameter("ui_locales")?.toLowerCase().split(/\s+/u) ?? [];
  if (requested.length === 0) {
    return null;
  }
  return (
    requested.find((locale): locale is Locale =>
      productLocales.includes(locale as Locale),
    ) ?? "en"
  );
}

function loginError(error: unknown, t: Translate): string {
  if (isApiError(error, "INVALID_CREDENTIALS")) {
    return t("errors:INVALID_CREDENTIALS");
  }
  if (isApiError(error, "ACCOUNT_BLOCKED")) {
    return t("errors:ACCOUNT_BLOCKED");
  }
  if (isApiError(error, "LOGIN_LOCKED")) {
    return t("errors:LOGIN_LOCKED");
  }
  if (isApiError(error, "RATE_LIMITED")) {
    return t("errors:RATE_LIMITED");
  }
  return t("id:errors.generic");
}

function passwordError(error: unknown, t: Translate): string {
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
  return t("id:errors.generic");
}

function Brand() {
  const { t } = useTranslation("id");
  return (
    <a className="id-brand" href="/products">
      <span aria-hidden="true" className="id-brand__mark">
        {t("id:brand.mark")}
      </span>
      <span>
        <strong>{t("id:brand.name")}</strong>
        <small>{t("id:brand.subtitle")}</small>
      </span>
    </a>
  );
}

function LanguageSelector({ authClient }: { authClient: AuthClient }) {
  const session = useSession();
  const { i18n, t } = useTranslation("id");
  const [pending, setPending] = useState(false);

  return (
    <label className="id-language">
      <span className="ah-sr-only">{t("id:language.label")}</span>
      <Icon aria-hidden="true" name="globe" />
      <Select
        aria-label={t("id:language.label")}
        disabled={pending}
        onChange={(event) => {
          const locale = event.currentTarget.value;
          setPending(true);
          const update =
            session.status === "signedIn"
              ? authClient.updateLocale(locale).then(() => undefined)
              : Promise.resolve();
          void update
            .then(async () => {
              localStorage.setItem(LOCALE_STORAGE_KEY, locale);
              await i18n.changeLanguage(locale);
            })
            .catch(() => undefined)
            .finally(() => {
              setPending(false);
            });
        }}
        value={i18n.resolvedLanguage ?? "ca"}
      >
        <option value="ca">{t("id:language.ca")}</option>
        <option value="es">{t("id:language.es")}</option>
        <option value="en">{t("id:language.en")}</option>
      </Select>
    </label>
  );
}

function IdShell({ authClient, children }: { authClient: AuthClient; children: ReactNode }) {
  const session = useSession();
  const { t } = useTranslation("id");
  return (
    <div className="id-shell">
      <header className="id-header">
        <Brand />
        <div className="id-header__actions">
          {session.status === "signedIn" ? (
            <nav aria-label={t("id:navigation.label")} className="id-navigation">
              <a href="/products">{t("id:navigation.products")}</a>
              <a href="/account">{t("id:navigation.account")}</a>
              <a href="/logout">{t("id:navigation.logout")}</a>
            </nav>
          ) : null}
          <LanguageSelector authClient={authClient} />
        </div>
      </header>
      {children}
      <footer className="id-footer">{t("id:footer.security")}</footer>
    </div>
  );
}

function PageIntro({ description, title }: { description: string; title: string }) {
  return (
    <div className="id-page__intro">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function ProtectedPage({ children, navigate }: { children: ReactNode; navigate: Navigate }) {
  const { status } = useSession();
  const { t } = useTranslation("id");

  useEffect(() => {
    if (status === "anonymous") {
      navigate("/login");
    }
  }, [navigate, status]);

  if (status !== "signedIn") {
    return (
      <main className="id-page id-page--centered">
        <p aria-live="polite">{t("id:status.loadingAccount")}</p>
      </main>
    );
  }
  return children;
}

function LoginPage({ authClient, navigate }: PageProps) {
  const { t } = useTranslation(["id", "errors"]);
  const [email, setEmail] = useState(initialLoginEmail);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"login" | "magic" | "reset" | null>(null);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const continuation = oidcContinuation();

  const requireEmail = (): boolean => {
    if (email.trim() !== "") {
      return true;
    }
    setError(t("id:login.emailRequired"));
    document.querySelector<HTMLInputElement>("#id-email")?.focus();
    return false;
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireEmail()) {
      return;
    }
    setError(undefined);
    setMessage(undefined);
    setPending("login");
    try {
      await authClient.login(email, password);
      navigate(continuation ?? "/account");
    } catch (loginFailure) {
      setError(loginError(loginFailure, t));
      setPending(null);
    }
  };

  const requestLink = async (purpose: "LOGIN" | "RESET") => {
    if (!requireEmail()) {
      return;
    }
    setError(undefined);
    setMessage(undefined);
    setPending(purpose === "LOGIN" ? "magic" : "reset");
    try {
      const redirectUri =
        continuation === null ? undefined : new URL(continuation, location.origin).href;
      await authClient.requestMagicLink(email, purpose, redirectUri);
      setMessage(t("id:login.magicSent"));
    } catch (requestFailure) {
      setError(loginError(requestFailure, t));
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="id-page id-page--login">
      <Card className="id-auth-card">
        <PageIntro description={t("id:login.description")} title={t("id:login.title")} />
        <form className="id-form" noValidate onSubmit={(event) => void submit(event)}>
          <label htmlFor="id-email">{t("id:login.email")}</label>
          <Input
            autoComplete="email"
            id="id-email"
            onChange={(event) => {
              setEmail(event.currentTarget.value);
            }}
            placeholder={t("id:login.emailPlaceholder")}
            type="email"
            value={email}
          />
          <label htmlFor="id-password">{t("id:login.password")}</label>
          <Input
            autoComplete="current-password"
            id="id-password"
            onChange={(event) => {
              setPassword(event.currentTarget.value);
            }}
            type="password"
            value={password}
          />
          <Button
            className="id-form__submit"
            loading={pending === "login"}
            loadingLabel={t("id:login.entering")}
            type="submit"
          >
            {t("id:login.submit")}
          </Button>
          <Button
            loading={pending === "magic"}
            onClick={() => void requestLink("LOGIN")}
            type="button"
            variant="secondary"
          >
            <Icon aria-hidden="true" name="mail" />
            {t("id:login.magic")}
          </Button>
          <button
            className="id-text-button"
            disabled={pending !== null}
            onClick={() => void requestLink("RESET")}
            type="button"
          >
            {t("id:login.forgot")}
          </button>
          {error === undefined ? null : <p role="alert">{error}</p>}
          {message === undefined ? null : <p role="status">{message}</p>}
        </form>
      </Card>
    </main>
  );
}

function MagicLinkPage({ authClient, navigate }: PageProps) {
  const { t } = useTranslation("id");
  const token = new URLSearchParams(window.location.search).get("t");
  const [failure, setFailure] = useState(token === null || token === "");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    if (token === null || token === "") {
      return;
    }
    void authClient.exchangeMagicLink(token).then(
      () => {
        navigate(oidcContinuation() ?? "/account");
      },
      () => {
        setFailure(true);
      },
    );
  }, [authClient, navigate, token]);

  return (
    <main className="id-page id-page--centered">
      <Card className="id-status-card">
        <Icon aria-hidden="true" name={failure ? "warn" : "link"} />
        <PageIntro
          description={failure ? t("id:magic.invalidDescription") : t("id:magic.description")}
          title={failure ? t("id:magic.invalidTitle") : t("id:magic.title")}
        />
        {failure ? (
          <a className="ah-button ah-button--primary" href="/login">
            {t("id:magic.tryAgain")}
          </a>
        ) : (
          <p aria-live="polite">{t("id:magic.validating")}</p>
        )}
      </Card>
    </main>
  );
}

function PasswordForm({ authClient, navigate }: PageProps) {
  const { me } = useSession();
  const { t } = useTranslation(["id", "errors"]);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  if (me === null) {
    return null;
  }

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      await authClient.updatePassword({
        ...(me.account.hasPassword ? { current } : {}),
        new: next,
        repeat,
      });
      setSaved(true);
    } catch (updateFailure) {
      setError(passwordError(updateFailure, t));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="id-page id-page--narrow">
      <Card className="id-content-card">
        <PageIntro description={t("id:password.description")} title={t("id:password.title")} />
        {saved ? (
          <div className="id-success" role="status">
            <Icon aria-hidden="true" name="check" />
            <p>{t("id:password.saved")}</p>
            <Button
              onClick={() => {
                navigate("/account");
              }}
            >
              {t("id:password.back")}
            </Button>
          </div>
        ) : (
          <form className="id-form" onSubmit={(event) => void submit(event)}>
            {me.account.hasPassword ? (
              <>
                <label htmlFor="id-current-password">{t("id:password.current")}</label>
                <Input
                  autoComplete="current-password"
                  id="id-current-password"
                  onChange={(event) => {
                    setCurrent(event.currentTarget.value);
                  }}
                  required
                  type="password"
                  value={current}
                />
              </>
            ) : null}
            <label htmlFor="id-new-password">{t("id:password.next")}</label>
            <Input
              autoComplete="new-password"
              id="id-new-password"
              minLength={8}
              onChange={(event) => {
                setNext(event.currentTarget.value);
              }}
              required
              type="password"
              value={next}
            />
            <label htmlFor="id-repeat-password">{t("id:password.repeat")}</label>
            <Input
              autoComplete="new-password"
              id="id-repeat-password"
              minLength={8}
              onChange={(event) => {
                setRepeat(event.currentTarget.value);
              }}
              required
              type="password"
              value={repeat}
            />
            {error === undefined ? null : <p role="alert">{error}</p>}
            <Button loading={pending} type="submit">
              {t("id:password.save")}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}

function SetPasswordPage(props: PageProps) {
  return (
    <ProtectedPage navigate={props.navigate}>
      <PasswordForm {...props} />
    </ProtectedPage>
  );
}

function roleLabel(role: "ADMIN" | "INSTRUCTOR" | "MEMBER", t: Translate): string {
  if (role === "ADMIN") {
    return t("id:roles.admin");
  }
  if (role === "INSTRUCTOR") {
    return t("id:roles.instructor");
  }
  return t("id:roles.member");
}

function AccountContent({ authClient }: { authClient: AuthClient }) {
  const { me } = useSession();
  const { i18n, t } = useTranslation(["id", "errors"]);
  const [name, setName] = useState(me?.account.name ?? "");
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [pendingSession, setPendingSession] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void authClient.listSessions().then(
      (items) => {
        if (active) {
          setSessions(items);
          setSessionsLoading(false);
        }
      },
      () => {
        if (active) {
          setError(t("id:account.sessionsError"));
          setSessionsLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [authClient, t]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.resolvedLanguage],
  );

  if (me === null) {
    return null;
  }

  const saveAccount = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);
    setSaving(true);
    try {
      await authClient.updateAccount({ name: name.trim() });
      setMessage(t("id:account.saved"));
    } catch {
      setError(t("id:errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  const closeSession = async (session: AccountSession) => {
    setPendingSession(session.id);
    setError(undefined);
    try {
      await authClient.revokeSession(session.id);
      setSessions((items) => items.filter((item) => item.id !== session.id));
    } catch {
      setError(t("id:account.sessionsError"));
    } finally {
      setPendingSession(undefined);
    }
  };

  return (
    <main className="id-page">
      <div className="id-page__wide">
        <PageIntro description={t("id:account.description")} title={t("id:account.title")} />
        <div className="id-account-grid">
          <Card className="id-content-card">
            <h2>{t("id:account.personalTitle")}</h2>
            <form className="id-form" onSubmit={(event) => void saveAccount(event)}>
              <label htmlFor="id-account-name">{t("id:account.name")}</label>
              <Input
                autoComplete="name"
                id="id-account-name"
                onChange={(event) => {
                  setName(event.currentTarget.value);
                }}
                required
                value={name}
              />
              <label htmlFor="id-account-email">{t("id:account.email")}</label>
              <Input disabled id="id-account-email" type="email" value={me.account.email} />
              <label htmlFor="id-account-locale">{t("id:account.locale")}</label>
              <Select
                id="id-account-locale"
                onChange={(event) => {
                  const locale = event.currentTarget.value;
                  setSaving(true);
                  setError(undefined);
                  void authClient.updateLocale(locale).then(
                    async () => {
                      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
                      await i18n.changeLanguage(locale);
                      setSaving(false);
                    },
                    (localeFailure: unknown) => {
                      setError(
                        isApiError(localeFailure, "LOCALE_NOT_SUPPORTED")
                          ? t("errors:LOCALE_NOT_SUPPORTED")
                          : t("id:errors.generic"),
                      );
                      setSaving(false);
                    },
                  );
                }}
                value={me.account.locale}
              >
                <option value="ca">{t("id:language.ca")}</option>
                <option value="es">{t("id:language.es")}</option>
                <option value="en">{t("id:language.en")}</option>
              </Select>
              <Button loading={saving} type="submit">
                {t("id:account.save")}
              </Button>
              {message === undefined ? null : <p role="status">{message}</p>}
              {error === undefined ? null : <p role="alert">{error}</p>}
            </form>
            <a className="id-inline-link" href="/set-password">
              <Icon aria-hidden="true" name="lock" />
              {t("id:account.password")}
            </a>
          </Card>

          <Card className="id-content-card">
            <h2>{t("id:account.membershipsTitle")}</h2>
            <div className="id-membership">
              <span aria-hidden="true" className="id-product-icon">
                <Icon aria-hidden="true" name="paw" />
              </span>
              <div>
                <strong>{t("id:products.clubsTitle")}</strong>
                <div className="id-badges">
                  {me.membership.roles.map((role) => (
                    <Badge key={role}>{roleLabel(role, t)}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <a className="id-inline-link" href="/products">
              <Icon aria-hidden="true" name="grid" />
              {t("id:account.products")}
            </a>
          </Card>
        </div>

        <Card className="id-content-card id-sessions">
          <h2>{t("id:account.sessionsTitle")}</h2>
          <p>{t("id:account.sessionsDescription")}</p>
          {sessionsLoading ? <p aria-live="polite">{t("id:account.sessionsLoading")}</p> : null}
          {!sessionsLoading && sessions.length === 0 ? <p>{t("id:account.noSessions")}</p> : null}
          <ul>
            {sessions.map((session) => (
              <li key={session.id}>
                <span aria-hidden="true" className="id-session-icon">
                  <Icon aria-hidden="true" name="user" />
                </span>
                <span>
                  <strong>{session.deviceLabel}</strong>
                  <small>
                    {t("id:account.lastUsed", {
                      date: dateFormatter.format(new Date(session.lastUsedAt)),
                    })}
                  </small>
                </span>
                {session.current ? <Badge tone="success">{t("id:account.current")}</Badge> : null}
                <Button
                  loading={pendingSession === session.id}
                  onClick={() => void closeSession(session)}
                  variant="ghost"
                >
                  {t("id:account.revoke")}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}

function AccountPage({ authClient, navigate }: PageProps) {
  return (
    <ProtectedPage navigate={navigate}>
      <AccountContent authClient={authClient} />
    </ProtectedPage>
  );
}

function ProductCard({
  description,
  href,
  icon,
  link,
  title,
}: {
  description: string;
  href: string;
  icon: "grid" | "paw";
  link: string;
  title: string;
}) {
  return (
    <Card className="id-product-card">
      <span aria-hidden="true" className="id-product-icon">
        <Icon aria-hidden="true" name={icon} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <a className="ah-button ah-button--primary" href={href}>
        {link}
        <Icon aria-hidden="true" name="chev" />
      </a>
    </Card>
  );
}

function ProductsPage({ navigate }: PageProps) {
  const { t } = useTranslation("id");
  return (
    <ProtectedPage navigate={navigate}>
      <main className="id-page">
        <div className="id-page__wide">
          <PageIntro description={t("id:products.description")} title={t("id:products.title")} />
          <div className="id-products">
            <ProductCard
              description={t("id:products.learnDescription")}
              href="https://learn.agilitydoghub.com"
              icon="grid"
              link={t("id:products.openLearn")}
              title={t("id:products.learnTitle")}
            />
            <ProductCard
              description={t("id:products.clubsDescription")}
              href="https://clubs.agilitydoghub.com"
              icon="paw"
              link={t("id:products.openClubs")}
              title={t("id:products.clubsTitle")}
            />
          </div>
        </div>
      </main>
    </ProtectedPage>
  );
}

function LogoutPage({ authClient, navigate }: PageProps) {
  const { t } = useTranslation("id");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    void authClient.logout().finally(() => {
      const returnTo = new URL("/login", window.location.origin).href;
      navigate(`/connect/logout?post_logout_redirect_uri=${encodeURIComponent(returnTo)}`);
    });
  }, [authClient, navigate]);

  return (
    <main className="id-page id-page--centered">
      <Card className="id-status-card">
        <Icon aria-hidden="true" name="unlock" />
        <PageIntro description={t("id:logout.description")} title={t("id:logout.title")} />
      </Card>
    </main>
  );
}

function NotFoundPage() {
  const { t } = useTranslation("id");
  return (
    <main className="id-page id-page--centered">
      <Card className="id-status-card">
        <Icon aria-hidden="true" name="info" />
        <PageIntro description={t("id:notFound.description")} title={t("id:notFound.title")} />
        <a className="ah-button ah-button--primary" href="/login">
          {t("id:notFound.back")}
        </a>
      </Card>
    </main>
  );
}

export function App({
  authClient,
  navigate = defaultNavigate,
}: {
  authClient: AuthClient;
  navigate?: Navigate;
}) {
  const { i18n } = useTranslation();
  const { me } = useSession();
  const pathname = window.location.pathname;
  const language = i18n.resolvedLanguage ?? "ca";

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = i18n.t("id:brand.name");
  }, [i18n, language]);

  useEffect(() => {
    const locale = preferredLocale();
    if (locale !== null && locale !== i18n.resolvedLanguage) {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      void i18n.changeLanguage(locale);
    }
  }, [i18n]);

  useEffect(() => {
    if (me === null || pathname === "/" || pathname === "/login") {
      return;
    }
    const accountLocale = productLocales.find((locale) => locale === me.account.locale) ?? "en";
    if (accountLocale !== i18n.resolvedLanguage) {
      localStorage.setItem(LOCALE_STORAGE_KEY, accountLocale);
      void i18n.changeLanguage(accountLocale);
    }
  }, [i18n, me, pathname]);

  let page: ReactNode;
  if (pathname === "/" || pathname === "/login") {
    page = <LoginPage authClient={authClient} navigate={navigate} />;
  } else if (pathname === "/magic-link" || pathname === "/magic") {
    page = <MagicLinkPage authClient={authClient} navigate={navigate} />;
  } else if (pathname === "/set-password") {
    page = <SetPasswordPage authClient={authClient} navigate={navigate} />;
  } else if (pathname === "/account") {
    page = <AccountPage authClient={authClient} navigate={navigate} />;
  } else if (pathname === "/products") {
    page = <ProductsPage authClient={authClient} navigate={navigate} />;
  } else if (pathname === "/logout") {
    page = <LogoutPage authClient={authClient} navigate={navigate} />;
  } else {
    page = <NotFoundPage />;
  }

  return <IdShell authClient={authClient}>{page}</IdShell>;
}
