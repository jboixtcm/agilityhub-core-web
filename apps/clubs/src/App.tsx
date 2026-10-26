import { apiClient as defaultApiClient, isApiError, type ApiClient } from "@agilityhub/api-client";
import {
  type AuthClient,
  dropReturnPath,
  keepReturnPath,
  type Me,
  OnboardingExperience,
  RequireAuth,
  RequireModule,
  RequireRole,
  type SessionSnapshot,
  takeReturnPath,
  useAccountLocale,
  useSession,
} from "@agilityhub/auth";
import type { Role } from "@agilityhub/auth";
import { LOCALE_STORAGE_KEY, productLocales } from "@agilityhub/i18n";
import { clubsNamespaces } from "@agilityhub/i18n/clubs";
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
  resolveBrandingLogo,
  Select,
  Skeleton,
  TabBar,
  ToastProvider,
  type TabBarItem,
  useBranding,
  useBrandingLogo,
} from "@agilityhub/ui";
import {
  lazy,
  type ReactNode,
  Suspense,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getI18n, useTranslation } from "react-i18next";

import { safeDecode } from "./activities/shared";
import { navigateInApp } from "./booking/shared";
import type { CourseScreen as CourseScreenModel } from "./courses/CoursesRoute";
import { logoutWithPush } from "./notifications/push";
import { DataExportCard, dataExportJobFromUrl } from "./profile/DataExportCard";
import { NoticesCard } from "./profile/NoticesCard";
import { ProfileLifecycleSection } from "./profile/ProfileLifecycleSection";
import { PublicFooter } from "./PublicFooter";
import {
  navigate as navigateTo,
  type NavigationKind,
  takeNavigation,
  useInAppLinks,
} from "./router";
import { ScreenBoundary } from "./ScreenBoundary";
import { useDocumentScroll } from "./scroll";
import { useTrainingCacheIdentity, useTrainingTab } from "./training/shared";

/** The screens' chunk (`./screens`): loaded once, the first time a screen behind the access opens. */
/**
 * The screens' chunk, and with it the app's namespaces not loaded yet (A38): a screen of the chunk
 * shows with every namespace, so what it mounts with its data (04's, 25's, the receipts' rows, 07's
 * course lines) never suspends and hides it again under the shell's loading state. They load
 * alongside the chunk; one that fails only leaves its keys, as before.
 */
const screens = () =>
  Promise.all([
    import("./screens"),
    getI18n()
      .loadNamespaces([...clubsNamespaces])
      .catch(() => undefined),
  ]).then(([module]) => module);
const ActivityDetailPage = lazy(() =>
  screens().then((module) => ({ default: module.ActivityDetailPage })),
);
const HistoryRowsPreview = lazy(() =>
  screens().then((module) => ({ default: module.HistoryRowsPreview })),
);
const InvoicesPage = lazy(() => screens().then((module) => ({ default: module.InvoicesPage })));
const BookingDetailPage = lazy(() =>
  screens().then((module) => ({ default: module.BookingDetailPage })),
);
const BookPage = lazy(() => screens().then((module) => ({ default: module.BookPage })));
const ConfirmPage = lazy(() => screens().then((module) => ({ default: module.ConfirmPage })));
const HomePage = lazy(() => screens().then((module) => ({ default: module.HomePage })));
const WaitlistDetailPage = lazy(() =>
  screens().then((module) => ({ default: module.WaitlistDetailPage })),
);
const HistoryPage = lazy(() => screens().then((module) => ({ default: module.HistoryPage })));
const InactivityPage = lazy(() => screens().then((module) => ({ default: module.InactivityPage })));
const InfoPage = lazy(() => screens().then((module) => ({ default: module.InfoPage })));
const AttendancePage = lazy(() => screens().then((module) => ({ default: module.AttendancePage })));
const DayPage = lazy(() => screens().then((module) => ({ default: module.DayPage })));
const RingBlockPage = lazy(() => screens().then((module) => ({ default: module.RingBlockPage })));
const StudentCardPage = lazy(() =>
  screens().then((module) => ({ default: module.StudentCardPage })),
);
const StudentSearchPage = lazy(() =>
  screens().then((module) => ({ default: module.StudentSearchPage })),
);
const TasksPage = lazy(() => screens().then((module) => ({ default: module.TasksPage })));
const LeavePage = lazy(() => screens().then((module) => ({ default: module.LeavePage })));
const NotificationsPage = lazy(() =>
  screens().then((module) => ({ default: module.NotificationsPage })),
);
const CheckoutReturn = lazy(() => screens().then((module) => ({ default: module.CheckoutReturn })));
const MyDataPage = lazy(() => screens().then((module) => ({ default: module.MyDataPage })));
const MyDogsPage = lazy(() => screens().then((module) => ({ default: module.MyDogsPage })));
const SignupPage = lazy(() => screens().then((module) => ({ default: module.SignupPage })));
const OverviewPage = lazy(() => screens().then((module) => ({ default: module.OverviewPage })));
const TodayPage = lazy(() => screens().then((module) => ({ default: module.TodayPage })));
const TrainingDetailPage = lazy(() =>
  screens().then((module) => ({ default: module.TrainingDetailPage })),
);
const TrainingPage = lazy(() => screens().then((module) => ({ default: module.TrainingPage })));
const UnsubscribePage = lazy(() =>
  screens().then((module) => ({ default: module.UnsubscribePage })),
);

interface RouteDefinition {
  path: string;
  public?: boolean;
  roles?: readonly Role[];
}

export const MOBILE_ROUTES: readonly RouteDefinition[] = [
  // Screens 01 and 02.
  { path: "/entrar", public: true },
  { path: "/activacio", public: true },
  { path: "/benvinguda" },
  // Screen 03b.
  { path: "/perfil-acces" },
  // Screen 03.
  { path: "/inici" },
  // Screens 04, 06, 29 and 07.
  { path: "/reservar" },
  { path: "/reservar/confirmar" },
  { path: "/reserves/:id" },
  // S08 §2: the detail of a waiting entry (07's card, WAITLIST).
  { path: "/espera/:id" },
  // Screen 08 (S09 §2 writes `/training`) and the training booking detail (07 pattern).
  { path: "/entrenaments" },
  { path: "/entrenaments/:id" },
  // Screen 10.
  { path: "/avui" },
  // Screen 11.
  { path: "/notificacions" },
  // The e-mail unsubscribe page of CLUB_NEWS (S11 R-11-08, api E7-T02; no mockup), anonymous.
  { path: "/comunicats/baixa", public: true },
  // Screens 12, 13 and 28.
  { path: "/perfil" },
  { path: "/gossos" },
  { path: "/dades" },
  { path: "/rebuts", roles: ["MEMBER"] },
  { path: "/rebuts/:id", roles: ["MEMBER"] },
  // Screens 14 and 15.
  { path: "/inactivitat", roles: ["MEMBER"] },
  { path: "/baixa", roles: ["MEMBER"] },
  // Screens 16–19.
  { path: "/apuntat-hi/*", public: true },
  { path: "/gossos/nou*" },
  // Screens 20, 21, 22 and the student search (S10 §2, E6-W01; R-10-01: instructors and admins).
  { path: "/instructor/dia", roles: ["INSTRUCTOR", "ADMIN"] },
  { path: "/instructor/classes/:id", roles: ["INSTRUCTOR", "ADMIN"] },
  { path: "/instructor/alumnes", roles: ["INSTRUCTOR", "ADMIN"] },
  { path: "/instructor/alumnes/:dogId", roles: ["INSTRUCTOR", "ADMIN"] },
  // Screen 24 (S09 §2 writes it as `/instructor/ring-blocks/new`).
  { path: "/instructor/pistes/:ringId/reservar", roles: ["INSTRUCTOR", "ADMIN"] },
  // Screen 26 (S10 §2, E6-W02; TASKS through `modules.ts`, off → back to 22 with a note).
  { path: "/instructor/alumnes/:dogId/tasques", roles: ["INSTRUCTOR", "ADMIN"] },
  { path: "/instructor/*", roles: ["INSTRUCTOR", "ADMIN"] },
  // Screen 23 (S06 §2 writes `/instructor/visio-global`; the shell keeps PLA_FRONTEND's path).
  { path: "/instructor/avui", roles: ["INSTRUCTOR", "ADMIN"] },
  // Screen 25 (S10 §2, E6-W02): MEMBER and impersonated sessions (`MemberHistoryRoute`).
  { path: "/historic" },
  // Activity detail (S07 §2, no mockup; ACTIVITIES through `moduleUi`): MEMBER and impersonated
  // sessions only (`MemberActivityRoute`).
  { path: "/activitats/:id" },
  // Screen 30.
  { path: "/info" },
  // S16 §2 (E9-W04): the viewer (by ring, or by setup from 08/07/10/23 and N-31), and the
  // instructors' «Registra què hi ha muntat» and build session (INSTRUCTOR · ADMIN).
  { path: "/recorreguts/muntat/:ringId" },
  { path: "/recorreguts/:setupId" },
  { path: "/instructor/pistes/:ringId/muntat", roles: ["INSTRUCTOR", "ADMIN"] },
  { path: "/instructor/muntatge/:sessionId", roles: ["INSTRUCTOR", "ADMIN"] },
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

function BookingCheckoutRoute({ bookingId, client }: { bookingId: string; client: ApiClient }) {
  const [bookingRefresh, setBookingRefresh] = useState(0);
  return (
    <>
      <CheckoutReturn
        client={client}
        onPaid={() => {
          setBookingRefresh((current) => current + 1);
        }}
        onRetry={() => {
          navigateTo("/reservar");
        }}
      />
      <BookingDetailPage bookingId={bookingId} client={client} refresh={bookingRefresh} />
    </>
  );
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

type CurrentMe = Me & {
  membership: NonNullable<Me["membership"]>;
};

function isCurrentClubMe(me: Me): me is CurrentMe {
  return me.membership !== undefined;
}

function profileRoles(me: CurrentMe): readonly Role[] {
  return me.membership.profiles;
}

/**
 * Where a profile lands after 01/03b: an instructor on 20 «Grups del dia» (mockup 20, V6 note;
 * ruling E71), a member on 03. An administrator's landing is the back office (S01 R-01-07,
 * R-01-13; E11-W06 W2): 03b opens it with the handoff and its pending and error states, so the
 * app never shows an ADMIN 03, whose reads need MEMBER (E41). A profile the membership no longer
 * has goes back to 03b.
 */
function profileLanding(profile: Role | null | undefined, roles: readonly Role[]): string {
  if (profile === "INSTRUCTOR" && roles.includes("INSTRUCTOR")) {
    return "/instructor/dia";
  }
  if (
    (profile === "MEMBER" || profile === undefined || profile === null) &&
    roles.includes("MEMBER")
  ) {
    return "/inici";
  }
  return "/perfil-acces";
}

/** R-01-07: the profile the access opens without asking (one role, or «Recorda la meva tria»). */
function directProfile(me: CurrentMe): Role | undefined {
  return profileRoles(me).length > 1 && !me.membership.rememberProfile
    ? undefined
    : (me.membership.activeProfile ?? profileRoles(me)[0]);
}

function routeAfterOnboarding(me: Me): string {
  if (!isCurrentClubMe(me)) {
    throw new TypeError("The club session did not contain a membership");
  }
  const profile = directProfile(me);
  return profile === undefined ? "/perfil-acces" : profileLanding(profile, me.membership.roles);
}

/**
 * Screens whose reads are the member's own (`/me/home`, `/me/bookable-classes`, the member's
 * history, activities and training): MEMBER, or an impersonation (E41). A booking's detail (07)
 * is not one: staff open it too (S16 R-16-13, «Recorregut previst»).
 */
const MEMBER_PATHS: readonly string[] = [
  "/inici",
  "/reservar",
  "/reservar/confirmar",
  "/entrenaments",
  "/entrenaments/:id",
  "/historic",
  "/activitats/:id",
];

/** The screens 01–03b and the public ones route themselves; the dev gallery is not a screen. */
const SELF_ROUTED_PATHS: readonly string[] = [
  "/entrar",
  "/acces",
  "/activacio",
  "/benvinguda",
  "/perfil-acces",
  "/comunicats/baixa",
];

/**
 * E11-W06 W13 (AGENTS rule 3): a signed-in session on a screen its roles cannot open (an
 * instructor on 03, a member on 20) or on an unknown path is sent to its profile's landing, as the
 * back office does, instead of an empty shell. Never an impersonated session (it acts as the member).
 */
function strayLanding(session: SessionSnapshot, pathname: string): string | undefined {
  const { me } = session;
  if (session.status !== "signedIn" || me === null || me.impersonation !== undefined) {
    return undefined;
  }
  if (
    !isCurrentClubMe(me) ||
    SELF_ROUTED_PATHS.includes(pathname) ||
    pathname.startsWith("/apuntat-hi") ||
    pathname.startsWith("/gossos/nou") ||
    pathname.startsWith("/_gallery")
  ) {
    return undefined;
  }
  const route = currentRoute(pathname);
  const allowed =
    route === undefined
      ? false
      : route.roles !== undefined
        ? route.roles.some((role) => session.roles.includes(role))
        : !MEMBER_PATHS.includes(route.path) || session.roles.includes("MEMBER");
  return allowed ? undefined : profileLanding(session.activeProfile, session.roles);
}

async function routeAfterLogin(me: Me, authClient: AuthClient): Promise<string> {
  if (me.account.onboardingPending) {
    try {
      const onboarding = await authClient.getOnboarding();
      if (onboarding.pending && onboarding.postponeRemaining === 0) {
        return "/benvinguda";
      }
    } catch {
      return "/benvinguda";
    }
  }
  return routeAfterOnboarding(me);
}

/**
 * E11-W06 W1 (S11 R-11-11, S01 §2 01/02): the address a signed-out visit asked for opens instead of
 * the profile's landing, consumed once. Onboarding and 03b come first and keep it for their own
 * «continua» and profile choice.
 */
function withReturnPath(path: string): string {
  if (path === "/benvinguda" || path === "/perfil-acces") {
    return path;
  }
  return takeReturnPath() ?? path;
}

function LogoMark({ compact = false }: { compact?: boolean }) {
  const branding = useBranding();
  const logo = useBrandingLogo("full");
  return (
    <div className={compact ? "auth-logo auth-logo--compact" : "auth-logo"}>
      {logo.kind === "initial" ? (
        <span aria-hidden="true" className="auth-logo__fallback">
          {branding.club.name.charAt(0)}
        </span>
      ) : (
        <img
          alt={logo.kind === "full" ? branding.club.name : ""}
          className={logo.kind === "full" ? "auth-logo__full" : "auth-logo__mark"}
          src={logo.src}
        />
      )}
      {logo.showName ? <strong className="auth-logo__name">{branding.club.name}</strong> : null}
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

function LanguageSelector({ authClient }: { authClient: AuthClient }) {
  const branding = useBranding();
  const { me } = useSession();
  const { i18n, t } = useTranslation("shell");
  const borrowed = me?.impersonation !== undefined || me?.support !== undefined;
  const locales = productLocales.filter(
    (locale) => branding.locales.includes(locale) || (borrowed && locale === me.account.locale),
  );

  return (
    <label className="shell-language">
      <span className="ah-sr-only">{t("shell:header.language")}</span>
      <select
        aria-label={t("shell:header.language")}
        disabled={borrowed}
        onChange={(event) => {
          if (borrowed) return;
          const locale = event.currentTarget.value;
          localStorage.setItem(LOCALE_STORAGE_KEY, locale);
          void i18n.changeLanguage(locale);
          // CONVENCIONS_I18N §1 (E11-W06 W5): the choice is the account's (`PATCH /me`), so the
          // next sign-in keeps it; an impersonated session cannot write it (403).
          if (me !== null && me.account.locale !== locale) {
            void authClient.updateLocale(locale).catch(() => undefined);
          }
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
  activeProfile = null,
  impersonated = false,
  modules,
  pathname,
  roles,
  trainingTab = true,
}: {
  activeProfile?: Role | null;
  /** An impersonated session never shows the instructor's tabs (S10 §6: the api refuses it). */
  impersonated?: boolean;
  modules: readonly string[];
  pathname: string;
  roles: readonly Role[];
  /** S09 §2 row 08: the tab exists only when the member has a dog with the right (T-09-37). */
  trainingTab?: boolean;
}) {
  const { t } = useTranslation("shell");
  if (activeProfile === "INSTRUCTOR" && !impersonated && roles.includes("INSTRUCTOR")) {
    // Mockups 20, 21 and 22 (E6-W01): «El meu dia · Visió global · Alumnes · Perfil».
    const tabs: TabBarItem[] = [
      {
        active: ["/instructor/dia", "/instructor/classes/:id"].some((path) =>
          matchesPath(pathname, path),
        ),
        href: "/instructor/dia",
        icon: "day",
        label: t("shell:nav.myDay"),
      },
      {
        active: matchesPath(pathname, "/instructor/avui"),
        href: "/instructor/avui",
        icon: "globe",
        label: t("shell:nav.globalView"),
      },
      {
        active: ["/instructor/alumnes", "/instructor/alumnes/*"].some((path) =>
          matchesPath(pathname, path),
        ),
        href: "/instructor/alumnes",
        icon: "list",
        label: t("shell:nav.students"),
      },
      {
        active: ["/perfil", "/gossos", "/dades"].some((path) => matchesPath(pathname, path)),
        href: "/perfil",
        icon: "user",
        label: t("shell:nav.profile"),
      },
    ];
    return <TabBar items={tabs} label={t("shell:nav.main")} />;
  }
  const staffProfile = activeProfile === "INSTRUCTOR" || activeProfile === "ADMIN";
  const definitions: (TabBarItem & { id: string; roles?: readonly Role[] })[] = [
    { href: "/inici", icon: "home", id: "home", label: t("shell:nav.home") },
    { href: "/reservar", icon: "cal", id: "reserve", label: t("shell:nav.reserve") },
    {
      href: "/entrenaments",
      icon: "cone",
      id: "training",
      label: t("shell:nav.training"),
    },
    // Mockup 10: «Avui» for the member profile; mockup 23: the same slot is «Visió global».
    staffProfile
      ? {
          href: "/instructor/avui",
          icon: "globe",
          id: "globalView",
          label: t("shell:nav.globalView"),
          roles: ["INSTRUCTOR", "ADMIN"],
        }
      : { href: "/avui", icon: "day", id: "today", label: t("shell:nav.today") },
    { href: "/perfil", icon: "user", id: "profile", label: t("shell:nav.profile") },
    { href: "/info", icon: "info", id: "info", label: t("shell:nav.info") },
  ];
  const items = definitions
    .filter((item) => isModuleUiItemEnabled(modules, "tabs", item.id))
    .filter((item) => item.roles === undefined || item.roles.some((role) => roles.includes(role)))
    .filter((item) => item.id !== "training" || trainingTab)
    .map((item) => ({
      active:
        item.id === "profile"
          ? ["/perfil", "/gossos", "/dades"].some((path) => matchesPath(pathname, path))
          : item.id === "home"
            ? // Mockups 25 and 11: the history and the notifications are reached from 03, and
              // «Inici» stays lit.
              ["/inici", "/historic", "/notificacions"].some((path) => matchesPath(pathname, path))
            : item.id === "training"
              ? ["/entrenaments", "/entrenaments/:id"].some((path) => matchesPath(pathname, path))
              : item.id === "reserve"
                ? // Mockups 06, 29 and 07: the confirmation and the booking detail belong to «Reservar».
                  ["/reservar", "/reservar/confirmar", "/reserves/:id", "/espera/:id"].some(
                    (path) => matchesPath(pathname, path),
                  )
                : matchesPath(pathname, item.href),
      href: item.href,
      icon: item.icon,
      label: item.label,
    }));

  return <TabBar items={items} label={t("shell:nav.main")} />;
}

/**
 * INC-18 (R-01-09, E47): this tab's impersonated session has expired. It says so and offers to
 * close the tab; it never becomes another session (not even the admin's own as a member).
 */
function ImpersonationExpiredPage() {
  const { t } = useTranslation("auth");
  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--centered">
        <LogoMark compact />
        <Icon aria-hidden="true" className="activation-error__icon" name="warn" />
        <h1>{t("auth:impersonation.expired")}</h1>
        <Button
          onClick={() => {
            window.close();
          }}
          type="button"
        >
          {t("auth:impersonation.close")}
        </Button>
      </section>
    </main>
  );
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
      {/* The member the admin opened (ruling E73), not the account: a family group's differ. */}
      <span>{t("auth:impersonation.banner", { member: me.impersonation.memberName })}</span>
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

/** The screen the app shows (A38): its address, how the app came to it, and which visit it is. */
interface AppLocation {
  kind: NavigationKind;
  /** The address's path and query, as the app last read them. */
  path: string;
  /** Counts the screens shown: a new one remounts the screen and sets the document's scroll. */
  visit: number;
}

function MobileShell({
  authClient,
  children,
  client,
  detail = false,
  location,
  pathname,
}: {
  authClient: AuthClient;
  children: ReactNode;
  client: ApiClient;
  detail?: boolean;
  /** The screen shown and how the app came to it (`AppContent`'s location). */
  location: AppLocation;
  pathname: string;
}) {
  const branding = useBranding();
  const session = useSession();
  const { t } = useTranslation("shell");
  // A38: the shell stays mounted from one screen to the next; the document's scroll follows them.
  useDocumentScroll(location.visit, location.kind);
  const logo = resolveBrandingLogo(branding.theme, { placement: "compact" });
  // `GET /me/training-summary` is the member's (also impersonated): no call for staff-only roles.
  const trainingTab = useTrainingTab(
    client,
    session.status === "signedIn" &&
      branding.modules.includes("FREE_TRAINING") &&
      (session.roles.includes("MEMBER") || session.me?.impersonation !== undefined),
  );

  return (
    <div className="clubs-shell">
      <div className="clubs-shell__top">
        <ImpersonationBanner authClient={authClient} />
        {detail ? null : (
          <AppBar
            className="clubs-shell__header"
            end={
              <div className="clubs-shell__actions">
                <LanguageSelector authClient={authClient} />
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
              logo.kind === "initial" ? (
                <span aria-hidden="true" className="clubs-shell__mark">
                  {branding.club.name.charAt(0)}
                </span>
              ) : (
                <img alt="" className="clubs-shell__logo" src={logo.src} />
              )
            }
            title={branding.club.name}
          />
        )}
      </div>
      <main className="clubs-shell__content">
        {/* A38: one boundary per screen shown. A screen the user left unmounts at once, as when
            the screens were static: under a shared boundary it would stay mounted, hidden, while
            the next screen's chunk loads, and a late answer could still take the user back
            (R-16-11). Keyed by the visit, not the route: the same screen opened at another
            address (`/historic?tipus=…` → `/historic`) reads that address again (round 2). */}
        <ScreenBoundary key={location.visit}>{children}</ScreenBoundary>
      </main>
      <MobileNavigation
        activeProfile={session.activeProfile}
        impersonated={session.me?.impersonation !== undefined}
        modules={branding.modules}
        pathname={pathname}
        roles={session.roles}
        trainingTab={trainingTab}
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

export function AccessPage({
  authClient,
  navigate = (path) => {
    navigateTo(path);
  },
}: {
  authClient: AuthClient;
  navigate?: (path: string) => void;
}) {
  const branding = useBranding();
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState(
    () => new URLSearchParams(window.location.search).get("email") ?? "",
  );
  // R-01-13 and «Entra com l'abonat» (S01 D10, E47): a one-time code for this app. The back
  // office's consumer is the model (`clubs-admin` AccessPage).
  const [handoff] = useState(() => new URLSearchParams(window.location.search).get("handoff"));
  const handoffStarted = useRef(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"handoff" | "login" | "magic" | "reset" | null>(
    handoff === null || handoff === "" ? null : "handoff",
  );
  const [message, setMessage] = useState<string>();
  // E4-W18 round 2: the tab was reloaded while a code was being exchanged. The code has left the
  // address and may already be redeemed (it is single-use), so it cannot be sent again: the link
  // is no longer valid, and the admin opens «Entra com l'abonat» again.
  const [error, setError] = useState<string | undefined>(() =>
    (handoff === null || handoff === "") && authClient.wasHandoffInterrupted()
      ? t("auth:activation.invalidTitle")
      : undefined,
  );
  // The code was redeemed but `/me` keeps failing: the tab holds that session (never another
  // one) and offers a retry (E47).
  const [handoffUnconfirmed, setHandoffUnconfirmed] = useState(false);
  const emailLoginEnabled = import.meta.env.VITE_EMAIL_LOGIN_ENABLED !== "false";
  const countdown = useCountdown();

  // E11-W06 W1: 01 opened with `?next=` keeps it for the steps that leave this address (the magic
  // link's tab, onboarding, 03b).
  useEffect(() => {
    keepReturnPath();
  }, []);

  const enterHandoff = useCallback(
    async (me: Me) => {
      // «Entra com l'abonat» opens the member's 03, never a path kept by the admin's own visit.
      navigate(
        me.impersonation === undefined
          ? withReturnPath(await routeAfterLogin(me, authClient))
          : "/inici",
      );
    },
    [authClient, navigate],
  );
  const failHandoff = useCallback(
    (cause: unknown) => {
      if (authClient.hasPendingHandoff()) {
        setHandoffUnconfirmed(true);
      } else if (isApiError(cause) && (cause.status === 0 || cause.status >= 500)) {
        // E4-W18 step 1: the code went unanswered (5xx, offline): the tab stays anonymous (no
        // cookie), and the retry sends the same code again.
        setHandoffUnconfirmed(true);
      } else {
        setHandoffUnconfirmed(false);
        setError(t("auth:activation.invalidTitle"));
      }
      setPending(null);
    },
    [authClient, t],
  );

  useEffect(() => {
    if (handoff === null || handoff === "" || handoffStarted.current) {
      return;
    }
    handoffStarted.current = true;
    // The code is single-use: it leaves the address (and the history) before it is redeemed.
    const address = new URL(window.location.href);
    address.searchParams.delete("handoff");
    window.history.replaceState(null, "", `${address.pathname}${address.search}${address.hash}`);
    void authClient.exchangeHandoff(handoff).then(enterHandoff, failHandoff);
  }, [authClient, enterHandoff, failHandoff, handoff]);

  // The client keeps asking `/me` in the background: its answer enters the session as well.
  useEffect(() => {
    if (!handoffUnconfirmed) {
      return;
    }
    const signedIn = () => {
      const me = authClient.getMe();
      if (me !== null) {
        void enterHandoff(me);
      }
    };
    authClient.addEventListener("signedIn", signedIn);
    // A recovery that signed in before this listener was attached is entered as well.
    signedIn();
    return () => {
      authClient.removeEventListener("signedIn", signedIn);
    };
  }, [authClient, enterHandoff, handoffUnconfirmed]);

  if (pending === "handoff") {
    return (
      <main className="auth-page auth-page--loading">
        <p role="status">{t("auth:activation.loading")}</p>
      </main>
    );
  }

  if (handoffUnconfirmed) {
    return (
      <main className="auth-page auth-page--loading">
        <p role="alert">{t("auth:access.genericError")}</p>
        <Button
          onClick={() => {
            setPending("handoff");
            // `/me` of a redeemed code, or the code itself when the token endpoint went unanswered.
            const retry =
              authClient.hasPendingHandoff() || handoff === null || handoff === ""
                ? authClient.retryHandoff()
                : authClient.exchangeHandoff(handoff);
            void retry.then(enterHandoff, failHandoff);
          }}
          type="button"
        >
          {t("auth:activation.retry")}
        </Button>
      </main>
    );
  }

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
      navigate(withReturnPath(await routeAfterLogin(me, authClient)));
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
          {emailLoginEnabled ? (
            <>
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
                {/* INC-11 (mockup 01): the question in grey, «Recupera-la» as a link. */}
                {t("auth:access.forgot.question")}{" "}
                <span className="auth-link">{t("auth:access.forgot.action")}</span>
              </button>
            </>
          ) : null}
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
            <a href="/apuntat-hi">
              {t("auth:access.signup.question")}{" "}
              <span className="auth-link">{t("auth:access.signup.action")}</span>
            </a>
          </div>
        ) : null}
      </section>
      <PublicFooter className="auth-footer" />
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
  const [resetLinkUsed, setResetLinkUsed] = useState(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    if (token === null || token === "") {
      return;
    }
    void authClient.exchangeMagicLink(token).then(
      (result) => {
        if (isCurrentClubMe(result)) {
          setMe(result);
        } else {
          setInvalid(true);
        }
      },
      () => {
        setInvalid(true);
      },
    );
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
              navigateTo("/entrar");
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
    setResetLinkUsed(false);
    setPasswordMessage(undefined);
    try {
      // R-01-05 (E49): the session of a RESET link sets the new password once, without `current`.
      await authClient.updatePassword({ new: newPassword, repeat: repeatPassword });
      setPasswordMessage(t("auth:activation.passwordSaved"));
    } catch (error) {
      if (purpose === "RESET" && isApiError(error, "INVALID_CREDENTIALS")) {
        // The one-time mark of the link has been used (or has expired): ask for another link.
        setResetLinkUsed(true);
      } else {
        setPasswordFailure(passwordError(error, t));
      }
    } finally {
      setPasswordPending(false);
    }
  };

  const gender = icuGender(me.membership.gender);
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
            void routeAfterLogin(me, authClient).then((path) => {
              navigateTo(withReturnPath(path));
            });
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
          {resetLinkUsed ? (
            <p role="alert">
              {t("auth:activation.resetLinkUsed")}{" "}
              <a href="/entrar">{t("auth:activation.recover")}</a>
            </p>
          ) : null}
          {passwordMessage === undefined ? null : <p role="status">{passwordMessage}</p>}
        </form>
        <p className="activation-panel__footnote">{t("auth:activation.optionalPassword")}</p>
      </section>
    </main>
  );
}

/**
 * The api's gender as the ICU `select` of the gendered strings reads it (E11-W05 step 4): `FEMALE`,
 * `OTHER` (the slash forms) and `MALE`; `other` (the masculine) when the membership has none.
 */
type IcuGender = "FEMALE" | "MALE" | "OTHER" | "other";

function icuGender(gender: "FEMALE" | "MALE" | "OTHER" | null | undefined): IcuGender {
  return gender ?? "other";
}

function roleCopy(role: Role, gender: IcuGender, t: ReturnType<typeof useTranslation>["t"]) {
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

/**
 * E160 #1: the history entry of an explicit visit to 03b («Canviar de perfil» on the profile), as
 * opposed to the landing the sign-in or the app's entry opens. It survives a reload of that entry.
 */
const PROFILE_CHANGE_STATE = { profileChange: true } as const;

function isProfileChange(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { profileChange?: unknown }).profileChange === true
  );
}

function ProfileChoicePage({
  authClient,
  navigate,
}: {
  authClient: AuthClient;
  navigate: (path: string) => void;
}) {
  const { me } = useSession();
  const { t } = useTranslation("auth");
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState<Role>();
  const [error, setError] = useState(false);
  // E160 #1: one automatic handoff per entry, never on «Canviar de perfil» (the account changes a
  // remembered choice there) and never again once a card was chosen.
  const backofficeStarted = useRef(isProfileChange(window.history.state));
  // R-01-07, R-01-13 (E11-W06 W2): an ADMIN the access opens without asking (one role, or the
  // remembered choice) goes to the back office at once, with 03b's pending and error states; on an
  // error the cards stay to try again or to choose another profile.
  const directAdmin =
    me !== null &&
    isCurrentClubMe(me) &&
    directProfile(me) === "ADMIN" &&
    profileRoles(me).includes("ADMIN");
  useEffect(() => {
    if (!directAdmin || backofficeStarted.current) {
      return;
    }
    backofficeStarted.current = true;
    setPending("ADMIN");
    authClient.createHandoff("clubs-admin").then(
      (handoff) => {
        dropReturnPath();
        window.location.assign(handoff.url);
      },
      () => {
        setError(true);
        setPending(undefined);
      },
    );
  }, [authClient, directAdmin]);
  if (me === null || !isCurrentClubMe(me)) {
    return null;
  }
  const roles = profileRoles(me);
  const gender = icuGender(me.membership.gender);

  const selectProfile = async (role: Role) => {
    // The choice saved below may make ADMIN the remembered profile: it opens its own handoff.
    backofficeStarted.current = true;
    setPending(role);
    setError(false);
    try {
      await authClient.updateProfile(role, remember);
      if (role === "ADMIN") {
        const handoff = await authClient.createHandoff("clubs-admin");
        // The members' app paths mean nothing to the back office (E11-W06 W1).
        dropReturnPath();
        window.location.assign(handoff.url);
      } else {
        navigate(takeReturnPath() ?? profileLanding(role, me.membership.roles));
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

/** «Canviar de perfil · {perfil}», with the ICU gender of the membership as on 03b (R-01-07). */
function activeProfileLabel(
  role: Role | undefined,
  gender: IcuGender,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (role === "INSTRUCTOR") {
    return t("auth:profile.instructorProfile", { gender });
  }
  if (role === "ADMIN") {
    return t("auth:profile.adminProfile", { gender });
  }
  return t("auth:profile.memberProfile", { gender });
}

function ProfilePage({ authClient, client }: { authClient: AuthClient; client: ApiClient }) {
  const branding = useBranding();
  const { me } = useSession();
  const { i18n, t } = useTranslation(["auth", "shell"]);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [working, setWorking] = useState(false);
  if (me === null || !isCurrentClubMe(me)) {
    return null;
  }
  const profiles = profileRoles(me);
  const localeOptions = productLocales.filter((locale) => branding.locales.includes(locale));
  // S11 §13-11: «Aprèn amb AgilityHub» after «Els meus gossos», only with LEARN_LINK.
  const learnLink = isModuleUiItemEnabled(branding.modules, "menuEntries", "learn");
  // INC-73 (S01 §6, E11-T09): the password and the language are the person's own account, which
  // an impersonation token cannot change (`403` to `PUT /me/password` and `PATCH /me`).
  const impersonated = me.impersonation !== undefined;
  // N-50's card (`OPEN_EXPORT`) opens `/perfil?jobId={id}` (S14 R-14-13).
  const exportJobId = dataExportJobFromUrl(window.location.search);

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
        {learnLink ? (
          <a href="https://learn.agilitydoghub.com" rel="noopener noreferrer" target="_blank">
            <Icon aria-hidden="true" name="link" />
            <span>{t("auth:profile.learnLink")}</span>
            <Icon aria-hidden="true" name="chev" />
          </a>
        ) : null}
        {impersonated ? null : (
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
        )}
        {profiles.length > 1 ? (
          <a
            href="/perfil-acces"
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              navigateTo("/perfil-acces", { state: PROFILE_CHANGE_STATE });
            }}
          >
            <Icon aria-hidden="true" name="user" />
            <span>{t("auth:profile.changeProfile")}</span>
            <small>
              {activeProfileLabel(me.membership.activeProfile, icuGender(me.membership.gender), t)}
            </small>
            <Icon aria-hidden="true" name="chev" />
          </a>
        ) : null}
      </Card>
      <NoticesCard client={client} />
      {impersonated ? null : (
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
          {/* R-11-15: only the notifications created from now on come in the new language. */}
          <small className="profile-language__help">{t("auth:profile.languageHelp")}</small>
        </Card>
      )}
      {me.impersonation === undefined && me.membership.roles.includes("MEMBER") ? (
        <DataExportCard
          accountId={me.account.id}
          client={client}
          key={`${me.account.id}:${exportJobId ?? ""}`}
          {...(exportJobId === undefined ? {} : { initialJobId: exportJobId })}
        />
      ) : null}
      <ProfileLifecycleSection
        client={client}
        logoutDisabled={working}
        memberAccess={me.impersonation !== undefined || me.membership.roles.includes("MEMBER")}
        onLogout={() => {
          setWorking(true);
          // R-11-07: this device's push subscription goes first, never blocking the logout. An
          // impersonated session never subscribed (IMPERSONATION_DENIED): the stored id is the
          // admin's own device's and stays.
          void (
            me.impersonation === undefined
              ? logoutWithPush(client, () => authClient.logout())
              : authClient.logout()
          ).catch(() => undefined);
        }}
        {...(me.paymentMethod === undefined ? {} : { paymentMethod: me.paymentMethod })}
      />
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

/**
 * `/activitats/:id` (S07 §6): `/me/activities/*` is MEMBER only, and an impersonation token acts
 * as the member (MATRIU_PERMISOS). Any other session takes the usual `RequireRole` path; the
 * module gate follows (AGENTS rule 3).
 */
function MemberActivityRoute({ activityId, client }: { activityId: string; client: ApiClient }) {
  const { me } = useSession();
  const impersonated = me?.impersonation !== undefined;
  const page = (
    <RequireModule module="ACTIVITIES">
      <ActivityDetailPage activityId={activityId} client={client} impersonated={impersonated} />
    </RequireModule>
  );
  return impersonated ? (
    <RequireAuth>{page}</RequireAuth>
  ) : (
    <RequireRole roles={["MEMBER"]}>{page}</RequireRole>
  );
}

/**
 * S10's instructor screens (20, 21, 22, the student search): INSTRUCTOR or ADMIN, never an
 * impersonated session (the api answers `403 IMPERSONATION_DENIED`, E6-T01), which reads that
 * refusal where it lands.
 */
function InstructorRoute({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const { t } = useTranslation("errors");
  if (me?.impersonation !== undefined) {
    return (
      <RequireAuth>
        <Card role="alert">
          <p>{t("errors:IMPERSONATION_DENIED")}</p>
        </Card>
      </RequireAuth>
    );
  }
  return <RequireRole roles={["INSTRUCTOR", "ADMIN"]}>{children}</RequireRole>;
}

/**
 * Screen 25 (S10 §6): `/me/history` is MEMBER only, and an impersonation token acts as the member
 * (the banner stays in the shell). Any other session takes the usual `RequireRole` path.
 */
function MemberHistoryRoute({ client }: { client: ApiClient }) {
  const { me } = useSession();
  return me?.impersonation !== undefined ? (
    <RequireAuth>
      <HistoryPage client={client} />
    </RequireAuth>
  ) : (
    <RequireRole roles={["MEMBER"]}>
      <HistoryPage client={client} />
    </RequireRole>
  );
}

/** Member-only self-service routes remain available to an admin impersonating that member. */
function MemberSelfServiceRoute({ children }: { children: ReactNode }) {
  const { me } = useSession();
  return me?.impersonation !== undefined ? (
    <RequireAuth>{children}</RequireAuth>
  ) : (
    <RequireRole roles={["MEMBER"]}>{children}</RequireRole>
  );
}

/**
 * Screen 26 (S10 §9): without TASKS the page does not exist, so an authorised caller goes back to
 * 22 with the `errors:MODULE_DISABLED` note (no dead page).
 */
function TasksRoute({ client, dogId }: { client: ApiClient; dogId: string }) {
  const branding = useBranding();
  const enabled = branding.modules.includes("TASKS");
  const cardPath = `/instructor/alumnes/${encodeURIComponent(dogId)}`;
  useEffect(() => {
    if (enabled) return undefined;
    // On a direct load this effect runs in the App's first commit, before the App's own effect
    // listens to `popstate`: the redirect waits for that commit to finish.
    const timer = window.setTimeout(() => {
      navigateInApp(cardPath, { notice: { code: "MODULE_DISABLED", tone: "danger" } }, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [cardPath, enabled]);
  return enabled ? <TasksPage client={client} dogId={dogId} /> : null;
}

/** S16 (E9-W04): the course screens load on demand, out of the members' app start. */
const CoursesRoute = lazy(() => import("./courses/CoursesRoute"));

function CourseScreen({ client, screen }: { client: ApiClient; screen: CourseScreenModel }) {
  const { t } = useTranslation("courses");
  return (
    <Suspense fallback={<Skeleton height="12rem" label={t("courses:loading")} />}>
      <CoursesRoute client={client} screen={screen} />
    </Suspense>
  );
}

/**
 * The steps of the signup flows (16–19 and the add-dog flow) keep their own full page loads (A38):
 * they were built for them (E3-W06, E3-W08: the draft in session storage, the back-forward cache).
 */
function loadSignupStep(path: string): void {
  window.location.assign(path);
}

function LegacyAccessRedirect() {
  useEffect(() => {
    navigateTo("/entrar", { replace: true });
  }, []);
  return null;
}

interface AppProps {
  apiClient?: ApiClient;
  authClient: AuthClient;
  navigate?: (path: string, replace: boolean) => void;
  publicApiClient?: ApiClient;
}

export function App(props: AppProps) {
  const { t } = useTranslation("common");
  return (
    <ToastProvider dismissLabel={t("gallery.close")}>
      <AppContent {...props} />
    </ToastProvider>
  );
}

function AppContent({
  apiClient = defaultApiClient,
  authClient,
  navigate = (path, replace) => {
    navigateTo(path, { replace });
  },
  publicApiClient = defaultApiClient,
}: AppProps) {
  useInAppLinks();
  // E11-W06 W5 (CONVENCIONS_I18N §1): the signed-in account's language.
  useAccountLocale();
  const [location, setLocation] = useState<AppLocation>(() => ({
    kind: "load",
    path: `${window.location.pathname}${window.location.search}`,
    visit: 0,
  }));
  useEffect(() => {
    const handlePopState = () => {
      const { from, kind } = takeNavigation();
      const path = `${window.location.pathname}${window.location.search}`;
      setLocation((current) => {
        // A screen rewrites its query in place (`writeParam`), leaving `current.path` behind the
        // document's: a navigation away from the address the document showed is a new visit too.
        const moved = path !== current.path || (from !== undefined && from !== path);
        // A jump to a hash of the same page (the browser's own) keeps the screen and its scroll.
        return moved || kind !== "pop"
          ? { kind, path, visit: current.visit + (moved ? 1 : 0) }
          : current;
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);
  // The offline copy of 08 belongs to one club and person: a change of identity drops it.
  useTrainingCacheIdentity();
  const session = useSession();
  const address = new URL(location.path, window.location.origin);
  const pathname = address.pathname;
  // E11-W06 W13: a screen the session's roles cannot open is replaced by its profile's landing.
  const strayTarget = strayLanding(session, pathname);
  const strayReplaced = useRef<string>(undefined);
  useEffect(() => {
    const replacement = strayTarget === undefined ? undefined : `${pathname} → ${strayTarget}`;
    if (replacement === strayReplaced.current) {
      return;
    }
    strayReplaced.current = replacement;
    if (strayTarget !== undefined) {
      navigate(strayTarget, true);
    }
  }, [navigate, pathname, strayTarget]);
  if (
    session.status === "impersonationExpired" &&
    !(pathname === "/entrar" && address.searchParams.has("handoff"))
  ) {
    return <ImpersonationExpiredPage />;
  }
  if (pathname === "/acces") {
    return <LegacyAccessRedirect />;
  }
  if (pathname === "/entrar") {
    return (
      <AccessPage
        authClient={authClient}
        navigate={(path) => {
          navigate(path, false);
        }}
      />
    );
  }
  if (pathname === "/activacio") {
    return <ActivationPage authClient={authClient} />;
  }
  if (pathname === "/comunicats/baixa") {
    // S11 R-11-08: the «Deixar de rebre aquests comunicats» link of a CLUB_NEWS e-mail.
    return (
      <ScreenBoundary>
        <UnsubscribePage client={publicApiClient} logo={<LogoMark compact />} />
      </ScreenBoundary>
    );
  }
  if (pathname === "/benvinguda") {
    return (
      <RequireAuth>
        <OnboardingExperience
          authClient={authClient}
          onAccepted={() => {
            const me = authClient.getMe();
            if (me !== null) {
              navigate(withReturnPath(routeAfterOnboarding(me)), false);
            }
          }}
          presentation="page"
        />
      </RequireAuth>
    );
  }
  if (pathname === "/perfil-acces") {
    return (
      <OnboardingExperience
        authClient={authClient}
        onBlockingRequired={() => {
          navigate("/benvinguda", true);
        }}
        presentation="modal"
      >
        <RequireAuth>
          <ProfileChoicePage
            authClient={authClient}
            navigate={(path) => {
              navigate(path, false);
            }}
          />
        </RequireAuth>
      </OnboardingExperience>
    );
  }
  if (pathname === "/apuntat-hi" || pathname.startsWith("/apuntat-hi/")) {
    return (
      <ScreenBoundary>
        <SignupPage
          authenticated={session.status === "signedIn"}
          client={publicApiClient}
          onNavigate={loadSignupStep}
        />
      </ScreenBoundary>
    );
  }
  if (pathname === "/gossos/nou" || pathname.startsWith("/gossos/nou/")) {
    return (
      <OnboardingExperience
        authClient={authClient}
        onBlockingRequired={() => {
          navigate("/benvinguda", true);
        }}
        presentation="modal"
      >
        <RequireAuth>
          <ScreenBoundary>
            <SignupPage addDog client={apiClient} onNavigate={loadSignupStep} />
          </ScreenBoundary>
        </RequireAuth>
      </OnboardingExperience>
    );
  }

  const route = currentRoute(pathname) ?? currentRoute("/inici");
  if (route === undefined || strayTarget !== undefined) {
    return null;
  }

  const content =
    pathname === "/perfil" ? (
      <RequireAuth>
        <ProfilePage authClient={authClient} client={apiClient} />
      </RequireAuth>
    ) : pathname === "/notificacions" ? (
      // Screen 11 (S11 §2): any session of the club, the impersonated member's included.
      <RequireAuth>
        <NotificationsPage client={apiClient} />
      </RequireAuth>
    ) : pathname === "/gossos" ? (
      <RequireAuth>
        <MyDogsPage client={apiClient} />
      </RequireAuth>
    ) : pathname === "/dades" ? (
      <RequireAuth>
        <MyDataPage client={apiClient} />
      </RequireAuth>
    ) : pathname === "/rebuts" ? (
      <MemberSelfServiceRoute>
        <RequireModule module="BILLING">
          <InvoicesPage
            client={apiClient}
            {...(session.me?.paymentMethod === undefined
              ? {}
              : { paymentMethod: session.me.paymentMethod })}
          />
        </RequireModule>
      </MemberSelfServiceRoute>
    ) : route.path === "/rebuts/:id" ? (
      <MemberSelfServiceRoute>
        <RequireModule module="BILLING">
          <InvoicesPage client={apiClient} invoiceId={safeDecode(pathname.split("/")[2] ?? "")} />
        </RequireModule>
      </MemberSelfServiceRoute>
    ) : pathname === "/inactivitat" ? (
      <MemberSelfServiceRoute>
        <RequireModule module="INACTIVITY">
          <InactivityPage client={apiClient} />
        </RequireModule>
      </MemberSelfServiceRoute>
    ) : pathname === "/baixa" ? (
      <MemberSelfServiceRoute>
        <LeavePage client={apiClient} />
      </MemberSelfServiceRoute>
    ) : pathname === "/info" ? (
      <RequireAuth>
        <InfoPage client={apiClient} />
      </RequireAuth>
    ) : pathname === "/avui" ? (
      <RequireAuth>
        <TodayPage client={apiClient} />
      </RequireAuth>
    ) : pathname === "/instructor/avui" ? (
      <RequireRole roles={["INSTRUCTOR", "ADMIN"]}>
        <OverviewPage client={apiClient} />
      </RequireRole>
    ) : pathname === "/instructor/dia" ? (
      // Screen 20 (S10 §2).
      <InstructorRoute>
        <DayPage client={apiClient} />
      </InstructorRoute>
    ) : route.path === "/instructor/classes/:id" ? (
      // Screen 21 (S10 §2).
      <InstructorRoute>
        <AttendancePage
          classId={safeDecode(pathname.split("/")[3] ?? "")}
          client={apiClient}
          key={pathname}
        />
      </InstructorRoute>
    ) : pathname === "/instructor/alumnes" ? (
      <InstructorRoute>
        <StudentSearchPage client={apiClient} />
      </InstructorRoute>
    ) : route.path === "/instructor/alumnes/:dogId" ? (
      // Screen 22 (S10 §2).
      <InstructorRoute>
        <StudentCardPage
          client={apiClient}
          dogId={safeDecode(pathname.split("/")[3] ?? "")}
          key={pathname}
        />
      </InstructorRoute>
    ) : route.path === "/instructor/alumnes/:dogId/tasques" ? (
      // Screen 26 (S10 §2).
      <InstructorRoute>
        <TasksRoute
          client={apiClient}
          dogId={safeDecode(pathname.split("/")[3] ?? "")}
          key={pathname}
        />
      </InstructorRoute>
    ) : pathname === "/historic" ? (
      // Screen 25 (S10 §2).
      <MemberHistoryRoute client={apiClient} />
    ) : route.path === "/activitats/:id" ? (
      <MemberActivityRoute
        activityId={safeDecode(pathname.split("/")[2] ?? "")}
        client={apiClient}
        key={pathname}
      />
    ) : pathname === "/reservar" ? (
      // Screen 04 (S08 §2): dog chips, pack, the S07 activities block and the classes.
      <RequireAuth>
        <BookPage client={apiClient} />
      </RequireAuth>
    ) : pathname === "/reservar/confirmar" ? (
      // Screens 06 and 29: painted from the seat hold in the history entry.
      <RequireAuth>
        <ConfirmPage client={apiClient} />
      </RequireAuth>
    ) : route.path === "/reserves/:id" ? (
      <RequireAuth>
        <BookingCheckoutRoute
          bookingId={safeDecode(pathname.split("/")[2] ?? "")}
          client={apiClient}
          key={pathname}
        />
      </RequireAuth>
    ) : route.path === "/espera/:id" ? (
      <RequireAuth>
        <RequireModule module="WAITLIST">
          <WaitlistDetailPage
            client={apiClient}
            entryId={safeDecode(pathname.split("/")[2] ?? "")}
            key={pathname}
          />
        </RequireModule>
      </RequireAuth>
    ) : pathname === "/entrenaments" ? (
      // Screen 08 (S09 §2): the page itself goes back to 03 without a dog with the right.
      <RequireAuth>
        <RequireModule module="FREE_TRAINING">
          <TrainingPage client={apiClient} />
        </RequireModule>
      </RequireAuth>
    ) : route.path === "/entrenaments/:id" ? (
      <RequireAuth>
        <RequireModule module="FREE_TRAINING">
          <TrainingDetailPage
            bookingId={safeDecode(pathname.split("/")[2] ?? "")}
            client={apiClient}
            key={pathname}
          />
        </RequireModule>
      </RequireAuth>
    ) : route.path === "/instructor/pistes/:ringId/reservar" ? (
      // Screen 24 (S09 §2): not module-gated, blocks exist without FREE_TRAINING (§9).
      <RequireRole roles={["INSTRUCTOR", "ADMIN"]}>
        <RingBlockPage
          client={apiClient}
          key={pathname}
          ringId={safeDecode(pathname.split("/")[3] ?? "")}
        />
      </RequireRole>
    ) : route.path === "/recorreguts/muntat/:ringId" || route.path === "/recorreguts/:setupId" ? (
      // S16 §2 «visor mòbil»: MEMBER (an impersonated session too) and INSTRUCTOR; the api
      // projects the setup by role (R-16-09) and applies `courses.showSetupToMembers`.
      <RequireAuth>
        <RequireModule module="COURSES">
          <CourseScreen
            client={apiClient}
            key={pathname}
            screen={
              route.path === "/recorreguts/:setupId"
                ? { kind: "setup", setupId: safeDecode(pathname.split("/")[2] ?? "") }
                : { kind: "ring", ringId: safeDecode(pathname.split("/")[3] ?? "") }
            }
          />
        </RequireModule>
      </RequireAuth>
    ) : route.path === "/instructor/pistes/:ringId/muntat" ||
      route.path === "/instructor/muntatge/:sessionId" ? (
      // S16 §2 «Registra què hi ha muntat» and «Sessió de muntatge»: INSTRUCTOR · ADMIN.
      <InstructorRoute>
        <RequireModule module="COURSES">
          <CourseScreen
            client={apiClient}
            key={pathname}
            screen={
              route.path === "/instructor/muntatge/:sessionId"
                ? { kind: "session", sessionId: safeDecode(pathname.split("/")[3] ?? "") }
                : { kind: "register", ringId: safeDecode(pathname.split("/")[3] ?? "") }
            }
          />
        </RequireModule>
      </InstructorRoute>
    ) : import.meta.env.DEV && pathname === "/_gallery/historic-activitats" ? (
      // Development-only evidence of the screen 25 activity rows (S10/E6 owns `/historic`).
      <RequireAuth>
        <HistoryRowsPreview />
      </RequireAuth>
    ) : pathname === "/inici" ? (
      // Screen 03 (S08 §2): «Les meves reserves» of `/me/home`, with E4-W04's activity rows.
      <RequireAuth>
        <HomePage client={apiClient} />
      </RequireAuth>
    ) : (
      routePlaceholder(route)
    );

  return route.public === true ? (
    content
  ) : (
    <OnboardingExperience
      authClient={authClient}
      onBlockingRequired={() => {
        navigate("/benvinguda", true);
      }}
      presentation="modal"
    >
      <MobileShell
        authClient={authClient}
        client={apiClient}
        location={location}
        pathname={pathname}
        detail={
          [
            "/gossos",
            "/dades",
            "/rebuts",
            "/inactivitat",
            "/baixa",
            "/info",
            "/avui",
            "/instructor/avui",
            "/instructor/dia",
            "/instructor/alumnes",
            "/inici",
            "/notificacions",
            "/reservar",
            "/reservar/confirmar",
            "/entrenaments",
            "/historic",
            // Mockup 12 has no shell header: its own «Idioma» card is the screen's only selector
            // (E11-W02 round 2, INC-41: two language selectors).
            "/perfil",
          ].includes(pathname) ||
          [
            "/activitats/:id",
            "/rebuts/:id",
            "/reserves/:id",
            "/espera/:id",
            "/entrenaments/:id",
            "/instructor/pistes/:ringId/reservar",
            "/instructor/classes/:id",
            "/instructor/alumnes/:dogId",
            "/instructor/alumnes/:dogId/tasques",
            "/recorreguts/muntat/:ringId",
            "/recorreguts/:setupId",
            "/instructor/pistes/:ringId/muntat",
            "/instructor/muntatge/:sessionId",
          ].includes(route.path)
        }
      >
        {content}
      </MobileShell>
    </OnboardingExperience>
  );
}
