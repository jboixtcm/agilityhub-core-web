import { type components, isApiError } from "@agilityhub/api-client";
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
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { I18nContext, useTranslation } from "react-i18next";

import { ActivitiesPage } from "./activities/ActivitiesPage";
import { ActivityRegistrantsPage } from "./activities/ActivityRegistrantsPage";
import { AuditPage, MemberAuditPage } from "./audit/AuditPage";
import { ExportJobsProvider, useExportsDrawer } from "./audit/ExportsDrawer";
import { BillingPage } from "./billing/BillingPage";
import { RemittancesPage } from "./billing/RemittancesPage";
import { PlansPage } from "./catalogs/PlansPage";
import { RingsPage } from "./catalogs/RingsPage";
import { SettingsPage } from "./catalogs/SettingsPage";
import { TeamPage } from "./catalogs/TeamPage";
import { DogsPage, MembersPage } from "./census/CensusListPage";
import { DogRecordPage, MemberRecordPage } from "./census/CensusRecordPage";
import { CountersRefreshContext } from "./dashboard/counters";
import { DashboardPage } from "./dashboard/DashboardPage";
import { SignupReviewPage } from "./dashboard/SignupReviewPage";
import { Gallery } from "./dev/gallery";
import { FollowUpPage } from "./followup/FollowUpPage";
import {
  FollowUpReadFailureNotice,
  UnreadFollowUpContext,
  useUnreadFollowUp,
} from "./followup/unread";
import { StudentRecordPage } from "./instructor/StudentRecordPage";
import { StudentsPage } from "./instructor/StudentsPage";
import { WeekAgendaPage } from "./instructor/WeekAgendaPage";
import { AnnouncementsPage } from "./messaging/AnnouncementsPage";
import { NotificationLogPage } from "./messaging/NotificationLogPage";
import { isIsoDate } from "./planning/calendar-shared";
import { CalendarDayPage } from "./planning/CalendarDayPage";
import { CalendarPage } from "./planning/CalendarPage";
import { parseDay } from "./planning/shared";
import { TemplateDayPage } from "./planning/TemplateDayPage";
import { TemplatesPage } from "./planning/TemplatesPage";
import { TrainingRegisterPage } from "./training/TrainingRegisterPage";

interface AdminRouteDefinition {
  path: string;
  platformOnly?: boolean;
  roles?: readonly Role[];
}

export const ADMIN_ROUTES: readonly AdminRouteDefinition[] = [
  // Screen D1.
  { path: "/tauler", roles: ["ADMIN"] },
  // Screen D2.
  { path: "/preinscripcions/:id", roles: ["ADMIN"] },
  // Screens D3 and D3b (INSTRUCTOR reads them without actions, S06 §13-10).
  { path: "/plantilles", roles: ["INSTRUCTOR", "ADMIN"] },
  { path: "/plantilles/:templateId/dia/:dayOfWeek", roles: ["INSTRUCTOR", "ADMIN"] },
  // Screens D4, D4b and D4c + the D4 day view (INSTRUCTOR reads them without actions, A22 c).
  { path: "/calendari", roles: ["INSTRUCTOR", "ADMIN"] },
  { path: "/calendari/dia/:date", roles: ["INSTRUCTOR", "ADMIN"] },
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
  // Screen D7 + registrants (INSTRUCTOR reads them without actions nor internal notes, S07 §2).
  { path: "/activitats", roles: ["INSTRUCTOR", "ADMIN"] },
  { path: "/activitats/:id", roles: ["INSTRUCTOR", "ADMIN"] },
  { path: "/activitats/:id/inscrits", roles: ["INSTRUCTOR", "ADMIN"] },
  // Screen D8.
  { path: "/modalitats", roles: ["ADMIN"] },
  // Screen D9.
  { path: "/comunicats", roles: ["ADMIN"] },
  // «Avisos enviats», the notification log (S11 §2, no mockup): reached from D9 and D10, with no
  // sidebar entry of its own (it keeps «Comunicats» lit).
  { path: "/notificacions", roles: ["ADMIN"] },
  // Screen D11.
  { path: "/parametres", roles: ["ADMIN"] },
  // Screen D12.
  { path: "/agenda", roles: ["INSTRUCTOR", "ADMIN"] },
  // «Entrenaments» (menú Camp): the ring-usage register, no mockup (S09 §2 writes `/admin/training`;
  // the admin app's paths are Catalan and unprefixed). Gated by FREE_TRAINING through `modules.ts`.
  { path: "/entrenaments", roles: ["INSTRUCTOR", "ADMIN"] },
  // «Alumnes» of the D12/D13/D14 sidebar (no mockup, S10 §13-9) and screen D13 (E6-W02).
  { path: "/alumnes", roles: ["INSTRUCTOR", "ADMIN"] },
  { path: "/alumnes/:id", roles: ["INSTRUCTOR", "ADMIN"] },
  // Screen D14 (S10 §2: INSTRUCTOR and ADMIN).
  { path: "/seguiment", roles: ["INSTRUCTOR", "ADMIN"] },
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

/** The S10 entries an impersonated session never reaches (the api answers IMPERSONATION_DENIED). */
const INSTRUCTOR_ONLY_ENTRIES: readonly string[] = ["weekly-agenda", "student-follow-up"];

export function AdminNavigation({
  counters,
  followUpUnread,
  instructorEntriesDenied = false,
  modules,
  pathname,
  roles,
}: {
  counters?: components["schemas"]["DashboardCounters"];
  /** `GET /followup/unread-count` (E6-W03 step 6); it supersedes `counters.followUpUnread`. */
  followUpUnread?: number | undefined;
  /** `403 IMPERSONATION_DENIED` on the S10 routes: their entries are hidden (step 7). */
  instructorEntriesDenied?: boolean;
  modules: readonly string[];
  pathname: string;
  roles: readonly Role[];
}) {
  const { t } = useTranslation("shell");
  const hasPlatformRole = (roles as readonly string[]).includes("AGILITYHUB_ADMIN");
  const unreadFollowUp = followUpUnread ?? counters?.followUpUnread;
  const definitions: GatedSidebarGroup[] = [
    {
      label: t("shell:nav.dashboard"),
      entries: [
        {
          href: "/tauler",
          icon: "grid",
          id: "dashboard",
          label: t("shell:nav.dashboard"),
          roles: ["ADMIN"],
        },
      ],
    },
    {
      // Mockups D12 and D13 (organizer 30-09): the instructor's own group. «Grups del dia» is
      // screen 20 of the member app, with no back-office route: it has no entry here.
      label: t("shell:nav.instructor"),
      roles: ["INSTRUCTOR", "ADMIN"],
      entries: [
        {
          // Screen D12 (S10 §2); E5-W03 moved the old `training` entry to `/entrenaments`.
          href: "/agenda",
          icon: "cal",
          id: "weekly-agenda",
          label: t("shell:nav.weeklyAgenda"),
        },
        {
          // «Alumnes», the student search that opens D13.
          href: "/alumnes",
          icon: "paw",
          id: "students",
          label: t("shell:nav.students"),
        },
      ],
    },
    {
      label: t("shell:nav.people"),
      roles: ["ADMIN"],
      entries: [
        {
          ...(counters?.pendingSignups === undefined || counters.pendingSignups === 0
            ? {}
            : { count: counters.pendingSignups }),
          href: "/tauler",
          icon: "user",
          id: "pre-registrations",
          label: t("shell:nav.preRegistrations"),
        },
        { href: "/abonats", icon: "user", id: "members", label: t("shell:nav.members") },
        { href: "/gossos", icon: "paw", id: "dogs", label: t("shell:nav.dogs") },
        {
          ...(counters?.pendingRequests === undefined || counters.pendingRequests === 0
            ? {}
            : { count: counters.pendingRequests }),
          href: "/inactivitats",
          icon: "palm",
          id: "inactivity",
          label: t("shell:nav.inactivity"),
        },
        {
          ...(unreadFollowUp === undefined || unreadFollowUp === 0
            ? {}
            : { count: unreadFollowUp }),
          href: "/seguiment",
          icon: "list",
          id: "student-follow-up",
          label: t("shell:nav.studentFollowUp"),
          // S10 §2 row D14: instructors too; the group renders for them with this entry only.
          roles: ["INSTRUCTOR", "ADMIN"],
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
          roles: ["INSTRUCTOR", "ADMIN"],
        },
        {
          href: "/calendari",
          icon: "day",
          id: "class-calendar",
          label: t("shell:nav.classCalendar"),
          roles: ["INSTRUCTOR", "ADMIN"],
        },
        {
          href: "/entrenaments",
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
          roles: ["INSTRUCTOR", "ADMIN"],
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

  // A group's roles are its entries' default; an entry with its own roles (D14's) overrides them,
  // and a group shows when at least one of its entries does.
  const groups: SidebarGroup[] = definitions
    .map((group) => ({
      label: group.label,
      entries: group.entries
        .filter((entry) => isModuleUiItemEnabled(modules, "menuEntries", entry.id))
        .filter((entry) => !instructorEntriesDenied || !INSTRUCTOR_ONLY_ENTRIES.includes(entry.id))
        .filter((entry) => {
          const required = entry.roles ?? group.roles;
          return (
            (required === undefined || required.some((role) => roles.includes(role))) &&
            (entry.platformOnly !== true || hasPlatformRole)
          );
        })
        .map((entry) => ({
          active:
            matchesPath(pathname, entry.href) ||
            // Mockup D13: «Alumnes» stays lit on a student's record.
            (entry.id === "students" && matchesPath(pathname, "/alumnes/:id")) ||
            // The notification log belongs to «Comunicats» (S11 §2).
            (entry.id === "announcements" && matchesPath(pathname, "/notificacions")) ||
            // The remittances page belongs to «Facturació» (S12 §2).
            (entry.id === "billing" && matchesPath(pathname, "/facturacio/remeses")),
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

function PlanningTemplatesRoute({
  client,
  onNavigate,
}: {
  client: ReturnType<typeof createAuthenticatedApiClient>;
  onNavigate: (path: string) => void;
}) {
  const session = useSession();
  return (
    <TemplatesPage
      client={client}
      onNavigate={onNavigate}
      readOnly={!session.roles.includes("ADMIN")}
    />
  );
}

function CalendarRoute({
  client,
  onNavigate,
}: {
  client: ReturnType<typeof createAuthenticatedApiClient>;
  onNavigate: (path: string) => void;
}) {
  const session = useSession();
  return (
    <CalendarPage
      client={client}
      onNavigate={onNavigate}
      readOnly={!session.roles.includes("ADMIN")}
    />
  );
}

function ActivitiesRoute({
  client,
  onNavigate,
  pathname,
  route,
}: {
  client: ReturnType<typeof createAuthenticatedApiClient>;
  onNavigate: (path: string) => void;
  pathname: string;
  route: AdminRouteDefinition;
}) {
  const session = useSession();
  const readOnly = !session.roles.includes("ADMIN");
  const id = decodeURIComponent(pathname.split("/")[2] ?? "");
  if (route.path === "/activitats/:id/inscrits") {
    return (
      <ActivityRegistrantsPage
        activityId={id}
        client={client}
        key={pathname}
        onNavigate={onNavigate}
        readOnly={readOnly}
      />
    );
  }
  return (
    <ActivitiesPage
      client={client}
      onNavigate={onNavigate}
      readOnly={readOnly}
      {...(route.path === "/activitats/:id" ? { selectedId: id } : {})}
    />
  );
}

function routeContent(
  route: AdminRouteDefinition,
  client: ReturnType<typeof createAuthenticatedApiClient>,
  onNavigate: (path: string) => void,
  pathname: string,
) {
  if (route.path.startsWith("/activitats")) {
    return (
      <ActivitiesRoute client={client} onNavigate={onNavigate} pathname={pathname} route={route} />
    );
  }
  if (route.path === "/plantilles") {
    return <PlanningTemplatesRoute client={client} onNavigate={onNavigate} />;
  }
  if (route.path === "/plantilles/:templateId/dia/:dayOfWeek") {
    const [, , templateId = "", , day] = pathname.split("/");
    return (
      <TemplateDayPage
        client={client}
        dayOfWeek={parseDay(day)}
        key={pathname}
        onNavigate={onNavigate}
        templateId={decodeURIComponent(templateId)}
      />
    );
  }
  if (route.path === "/calendari") {
    return <CalendarRoute client={client} key={pathname} onNavigate={onNavigate} />;
  }
  if (route.path === "/calendari/dia/:date") {
    const date = pathname.split("/")[3] ?? "";
    return isIsoDate(date) ? (
      <CalendarDayPage client={client} date={date} key={pathname} onNavigate={onNavigate} />
    ) : (
      <Placeholder />
    );
  }
  if (route.path === "/agenda") {
    // D12 (S10 §2): the week, the attendance panel and E5-W02's ring card (S09 §2 row D12).
    return <WeekAgendaPage client={client} onNavigate={onNavigate} />;
  }
  if (route.path === "/seguiment") {
    // D14 (S10 §2), module TASKS through `modules.ts`.
    return <FollowUpPage client={client} onNavigate={onNavigate} />;
  }
  if (route.path === "/entrenaments") {
    return <TrainingRegisterPage client={client} onNavigate={onNavigate} />;
  }
  if (route.path === "/alumnes") {
    return <StudentsPage client={client} onNavigate={onNavigate} />;
  }
  if (route.path === "/alumnes/:id") {
    // D13 (S10 §2): INSTRUCTOR and ADMIN, never an impersonation (an admin session never is one).
    const dogId = decodeURIComponent(pathname.split("/")[2] ?? "");
    return <StudentRecordPage client={client} dogId={dogId} key={pathname} />;
  }
  if (route.path === "/tauler") {
    return <DashboardPage client={client} onNavigate={onNavigate} />;
  }
  if (route.path === "/preinscripcions/:id") {
    return <SignupReviewPage client={client} onNavigate={onNavigate} />;
  }
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
    return <SettingsPage client={client} onNavigate={onNavigate} />;
  }
  if (route.path === "/modalitats") {
    return <PlansPage client={client} />;
  }
  if (route.path === "/facturacio") {
    // D6 (S12 §2): ADMIN, module BILLING through `modules.ts` (INSTRUCTOR: no route, no entry).
    return <BillingPage client={client} onNavigate={onNavigate} />;
  }
  if (route.path === "/facturacio/remeses") {
    return <RemittancesPage client={client} onNavigate={onNavigate} />;
  }
  if (route.path === "/auditoria") {
    return <AuditPage client={client} />;
  }
  if (route.path === "/comunicats") {
    // D9 (S11 §2): templates, their preview and «Enviar comunicat».
    return <AnnouncementsPage client={client} onNavigate={onNavigate} />;
  }
  if (route.path === "/notificacions") {
    return <NotificationLogPage client={client} key={pathname} />;
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

function AdminShell({
  children,
  client,
  pathname,
}: {
  children: ReactNode;
  client: ReturnType<typeof createAuthenticatedApiClient>;
  pathname: string;
}) {
  const branding = useBranding();
  const session = useSession();
  const { t } = useTranslation(["shell", "admin-audit"]);
  const { openExports } = useExportsDrawer();
  const logo = resolveBrandingLogo(branding.theme, { placement: "compact" });
  const [counters, setCounters] = useState<components["schemas"]["DashboardCounters"]>();
  const [countersRequest, setCountersRequest] = useState(0);
  const refreshCounters = useCallback(() => {
    setCountersRequest((value) => value + 1);
  }, []);
  const countersAllowed = session.roles.includes("ADMIN");
  // S10 §2 row D14 (step 6): the «Seguiment alumnes» counter of an INSTRUCTOR or ADMIN of a club
  // with TASKS, read on load, on focus and every 60 s. The dashboard's `followUpUnread` is only
  // the first paint of an ADMIN until this answers.
  const unreadFollowUp = useUnreadFollowUp(
    client,
    branding.modules.includes("TASKS") &&
      (session.roles.includes("INSTRUCTOR") || session.roles.includes("ADMIN")),
  );

  // R-14-08: ADMIN only (an INSTRUCTOR would get 403); on load, on focus and after the commands
  // that change them (`refreshCounters`), never on every navigation.
  useEffect(() => {
    if (!countersAllowed) return undefined;
    let active = true;
    const load = () => {
      client.GET("/dashboard/counters").then(
        (result) => {
          if (active && result.data !== undefined) setCounters(result.data);
        },
        () => undefined,
      );
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [client, countersAllowed, countersRequest]);

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
        {...(counters === undefined ? {} : { counters })}
        followUpUnread={unreadFollowUp.count}
        instructorEntriesDenied={unreadFollowUp.denied}
        modules={branding.modules}
        pathname={pathname}
        roles={session.roles}
      />
      <main className="admin-shell__content">
        {/* A D14 row read that failed (R-10-13): said here, on whatever page the user went to. */}
        <FollowUpReadFailureNotice unread={unreadFollowUp} />
        <CountersRefreshContext.Provider value={refreshCounters}>
          <UnreadFollowUpContext.Provider value={unreadFollowUp}>
            {children}
          </UnreadFollowUpContext.Provider>
        </CountersRefreshContext.Provider>
      </main>
    </div>
  );
}

function AccessPage({ authClient }: { authClient: AuthClient }) {
  const { t } = useTranslation("auth");
  // R-01-13: the one-time code of 03b («Obre el backoffice»), read once.
  const [handoff] = useState(() => new URLSearchParams(window.location.search).get("handoff"));
  const handoffStarted = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, setPending] = useState<"handoff" | "login" | "magic" | null>(
    handoff === null || handoff === "" ? null : "handoff",
  );
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  // E4-W18 step 2: the code or its `/me` went unanswered (5xx, offline): a retry, never «no és
  // vàlid o ha caducat».
  const [handoffUnanswered, setHandoffUnanswered] = useState(false);

  const enterHandoff = useCallback(() => {
    window.location.assign("/tauler");
  }, []);
  const failHandoff = useCallback(
    (cause: unknown) => {
      const transient =
        authClient.hasPendingHandoff() ||
        (isApiError(cause) && (cause.status === 0 || cause.status >= 500));
      setHandoffUnanswered(transient);
      setError(transient ? undefined : t("auth:admin.handoffError"));
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

  // The session's own restore keeps trying in the background: its answer enters as well.
  useEffect(() => {
    if (!handoffUnanswered) {
      return;
    }
    const signedIn = () => {
      if (authClient.getMe() === null) return;
      setHandoffUnanswered(false);
      setPending("handoff");
      enterHandoff();
    };
    authClient.addEventListener("signedIn", signedIn);
    // E4-W18 round 2 (review #2): a recovery that signed in before this listener was attached is
    // entered as well, so the retry card never stays over a session that is already there.
    signedIn();
    return () => {
      authClient.removeEventListener("signedIn", signedIn);
    };
  }, [authClient, enterHandoff, handoffUnanswered]);

  if (handoffUnanswered) {
    return (
      <main className="access-page">
        <Card className="access-card">
          <h1>{t("auth:admin.title")}</h1>
          <p role="alert">{t("auth:access.genericError")}</p>
          <Button
            disabled={pending !== null}
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
            {pending === "handoff" ? t("auth:admin.handoffLoading") : t("auth:activation.retry")}
          </Button>
        </Card>
      </main>
    );
  }

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
  const { i18n } = useContext(I18nContext);
  // `Accept-Language` = the language the admin reads, not the browser's: the api resolves
  // texts such as `displayDescription` («D i sup.» / «D y sup.» / «D and up») from it.
  const client = useMemo(
    () =>
      createAuthenticatedApiClient(authClient, {
        baseUrl: `${window.location.origin}/api/v1`,
        getLocale: () => i18n.resolvedLanguage ?? i18n.language,
      }),
    [authClient, i18n],
  );
  const [location, setLocation] = useState(
    () => `${window.location.pathname}${window.location.search}`,
  );
  const navigate = useCallback((path: string) => {
    window.history.pushState(null, "", path);
    setLocation(path);
  }, []);
  useEffect(() => {
    const handlePopState = () => {
      setLocation(`${window.location.pathname}${window.location.search}`);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);
  const pathname = new URL(location, window.location.origin).pathname;

  if (import.meta.env.DEV && pathname === "/_gallery") {
    return <Gallery />;
  }
  if (pathname === "/acces") {
    window.location.replace("/entrar");
    return null;
  }
  if (pathname === "/entrar") {
    return <AccessPage authClient={authClient} />;
  }

  const route = currentRoute(pathname) ?? currentRoute("/tauler");
  return route === undefined ? null : (
    <OnboardingExperience authClient={authClient} presentation="modal">
      <ExportJobsProvider client={client}>
        <AdminShell client={client} pathname={pathname}>
          {gatedRoute(route, routeContent(route, client, navigate, pathname))}
        </AdminShell>
      </ExportJobsProvider>
    </OnboardingExperience>
  );
}
