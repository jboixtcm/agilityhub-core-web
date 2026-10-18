import type { ApiClient } from "@agilityhub/api-client";
import { Badge, Button, Card, Icon, Skeleton } from "@agilityhub/ui";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  CHECKLIST_KEYS,
  ChecklistSummary,
  checklistMissing,
  CONSOLE_TABS,
  type ConsoleNavigate,
  type ConsoleTab,
  LoadError,
  type PlatformClub,
  StatusBadge,
  usePlatformClub,
} from "./shared";
import { AuditTab } from "./tabs/AuditTab";
import { CatalogsTab } from "./tabs/CatalogsTab";
import { DomainsTab } from "./tabs/DomainsTab";
import { IdentityTab } from "./tabs/IdentityTab";
import { LegalTab } from "./tabs/LegalTab";
import { LocalizationTab } from "./tabs/LocalizationTab";
import { ModulesTab } from "./tabs/ModulesTab";
import { ParametersTab } from "./tabs/ParametersTab";
import { PaymentsTab } from "./tabs/PaymentsTab";
import { ProcessesTab } from "./tabs/ProcessesTab";
import { StatusTab } from "./tabs/StatusTab";
import { TeamTab } from "./tabs/TeamTab";
import { ThemeTab } from "./tabs/ThemeTab";
import { UsageTab } from "./tabs/UsageTab";

export interface ConsoleTabProps {
  client: ApiClient;
  club: PlatformClub;
  onNavigate: ConsoleNavigate;
  /** A write answered with the whole record (`PATCH`, `PUT …/status`): it replaces the shown one. */
  onReplace: (club: PlatformClub) => void;
  /** A write whose answer is not the record (theme, modules, providers…): the record is read again. */
  onReload: () => Promise<PlatformClub | undefined>;
}

function tabContent(tab: ConsoleTab, props: ConsoleTabProps): ReactNode {
  switch (tab) {
    case "identitat":
      return <IdentityTab {...props} />;
    case "localitzacio":
      return <LocalizationTab {...props} />;
    case "dominis":
      return <DomainsTab {...props} />;
    case "tema":
      return <ThemeTab {...props} />;
    case "moduls":
      return <ModulesTab {...props} />;
    case "pagaments":
      return <PaymentsTab {...props} />;
    case "legal":
      return <LegalTab {...props} />;
    case "parametres":
      return <ParametersTab {...props} />;
    case "catalegs":
      return <CatalogsTab {...props} />;
    case "equip":
      return <TeamTab {...props} />;
    case "processos":
      return <ProcessesTab {...props} />;
    case "auditoria":
      return <AuditTab {...props} />;
    case "us":
      return <UsageTab {...props} />;
    case "estat":
      return <StatusTab {...props} />;
  }
}

/** R-17-06 (T-17-12): the onboarding checklist, item by item, while the club is `ONBOARDING`. */
export function OnboardingChecklistCard({
  club,
  onNavigate,
}: {
  club: PlatformClub;
  onNavigate: ConsoleNavigate;
}) {
  const { t } = useTranslation("console");
  const missing = checklistMissing(club.onboardingChecklist);
  const statusHref = `/consola/clubs/${encodeURIComponent(club.id)}/estat`;
  return (
    <Card
      aria-labelledby="console-checklist-title"
      className="console-card console-checklist"
      role="region"
    >
      <h2 id="console-checklist-title">{t("console:checklist.title")}</h2>
      <p>
        <ChecklistSummary checklist={club.onboardingChecklist} />
      </p>
      <ul className="console-checklist__items">
        {CHECKLIST_KEYS.map((key) => {
          const done = club.onboardingChecklist[key];
          return (
            <li data-done={done ? "true" : "false"} key={key}>
              <Icon aria-hidden="true" name={done ? "check" : "warn"} />
              <span>{t(`console:checklist.items.${key}`)}</span>
              <Badge tone={done ? "success" : "warning"}>
                {done ? t("console:checklist.done") : t("console:checklist.pending")}
              </Badge>
            </li>
          );
        })}
      </ul>
      {/* R-17-06: activation is manual, never automatic; the console proposes it once complete. */}
      {missing.length === 0 ? (
        <p className="console-checklist__ready">
          {t("console:checklist.ready")}{" "}
          <a
            href={statusHref}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(statusHref);
            }}
          >
            {t("console:checklist.goToStatus")}
          </a>
        </p>
      ) : null}
    </Card>
  );
}

/** S17 §2 row «D19 Fitxa»: `/consola/clubs/:id/{tab}`. */
export function ClubRecordPage({
  client,
  created,
  id,
  onNavigate,
  tab,
}: {
  client: ApiClient;
  /** Just created by the wizard (`?creat=1`): its first view says so. */
  created: boolean;
  id: string;
  onNavigate: ConsoleNavigate;
  tab: ConsoleTab;
}) {
  const { t } = useTranslation("console");
  const record = usePlatformClub(client, id);
  const club = record.club;
  const link = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onNavigate(href);
  };

  if (club === undefined) {
    return (
      <div className="console-page">
        <a className="console-back" href="/consola/clubs" onClick={link("/consola/clubs")}>
          <Icon aria-hidden="true" name="undo" />
          {t("console:record.back")}
        </a>
        {record.error === undefined ? (
          <Skeleton label={t("console:common.loading")} />
        ) : (
          <LoadError error={record.error} onRetry={() => void record.reload()} />
        )}
      </div>
    );
  }

  return (
    <div className="console-page">
      <a className="console-back" href="/consola/clubs" onClick={link("/consola/clubs")}>
        <Icon aria-hidden="true" name="undo" />
        {t("console:record.back")}
      </a>
      <header className="console-page__header console-record__header">
        <div>
          <h1>{club.name}</h1>
          <p className="console-record__meta">
            <span>{club.slug}</span>
            <StatusBadge status={club.status} />
            {club.template ? <Badge tone="info">{t("console:list.templateClub")}</Badge> : null}
            {/* While ONBOARDING the checklist card below says it item by item. */}
            {club.status === "ONBOARDING" ? null : (
              <ChecklistSummary checklist={club.onboardingChecklist} />
            )}
          </p>
        </div>
      </header>
      {created ? (
        <p className="console-message console-message--success" role="status">
          {t("console:record.created", { name: club.name })}
        </p>
      ) : null}
      {record.error === undefined ? null : (
        // A reread that failed (after a write, or a STALE_VERSION): the shown version may be old,
        // so the next write would be refused with no hint why (round 2 #8).
        <div className="console-message console-message--danger" role="alert">
          <p>{t("console:record.reloadFailed")}</p>
          <Button
            disabled={record.loading}
            onClick={() => void record.reload()}
            variant="secondary"
          >
            {t("console:common.retry")}
          </Button>
        </div>
      )}
      {club.status === "ONBOARDING" ? (
        <OnboardingChecklistCard club={club} onNavigate={onNavigate} />
      ) : null}
      <nav aria-label={t("console:record.tabsLabel")} className="console-tabs">
        {CONSOLE_TABS.map((candidate) => {
          const href = `/consola/clubs/${encodeURIComponent(club.id)}/${candidate}`;
          return (
            <a
              aria-current={candidate === tab ? "page" : undefined}
              className="console-tabs__tab"
              href={href}
              key={candidate}
              onClick={link(href)}
            >
              {t(`console:tabs.${candidate}`)}
            </a>
          );
        })}
      </nav>
      <section aria-label={t(`console:tabs.${tab}`)} className="console-tab-panel">
        {/* While the reread failed, no write goes out with the possibly stale `version` (E10-W01
            review #2): the tab stays readable, its fields and actions disabled until the retry. */}
        <fieldset className="console-tab-panel__writes" disabled={record.error !== undefined}>
          {tabContent(tab, {
            client,
            club,
            onNavigate,
            onReload: record.reload,
            onReplace: record.replace,
          })}
        </fieldset>
      </section>
    </div>
  );
}
