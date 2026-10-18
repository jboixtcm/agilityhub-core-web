import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { useSession } from "@agilityhub/auth";
import { fmtDateTime, normalizeLocale } from "@agilityhub/i18n";
import { Button, Card, useBranding } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type AuditEntryListItem = components["schemas"]["AuditEntryListItem"];

/** A live support access of the AgilityHub team to this club (S17 R-17-10). */
export interface LiveSupportAccess {
  actorName: string | undefined;
  expiresAt: string;
  /** The grant: the `entityId` of its `SUPPORT_ACCESS_STARTED` entry. */
  id: string;
  reason: string | undefined;
  startedAt: string;
}

const FIELDS = "id,at,actorName,entityId,details,reason";

function expiresAtOf(entry: AuditEntryListItem): string | undefined {
  const value = entry.details?.expiresAt;
  return typeof value === "string" ? value : undefined;
}

/**
 * The accesses still alive: started (`SUPPORT_ACCESS_STARTED`, `details.expiresAt`), not past their
 * expiry and not ended (`SUPPORT_ACCESS_ENDED` of the same grant). There is no list of grants
 * (E128): the audit is where the club sees them.
 */
export function liveSupportAccesses(
  started: readonly AuditEntryListItem[],
  ended: readonly AuditEntryListItem[],
  now: number,
): LiveSupportAccess[] {
  const endedIds = new Set(ended.map((entry) => entry.entityId));
  return started.flatMap((entry) => {
    const expiresAt = expiresAtOf(entry);
    if (
      entry.entityId === undefined ||
      entry.at === undefined ||
      expiresAt === undefined ||
      Date.parse(expiresAt) <= now ||
      endedIds.has(entry.entityId)
    ) {
      return [];
    }
    return [
      {
        actorName: entry.actorName,
        expiresAt,
        id: entry.entityId,
        reason: entry.reason,
        startedAt: entry.at,
      },
    ];
  });
}

/** The club audit's support entries (both actions, newest first) → the accesses still alive. */
async function readLiveSupportAccesses(client: ApiClient): Promise<LiveSupportAccess[]> {
  const list = async (action: "SUPPORT_ACCESS_ENDED" | "SUPPORT_ACCESS_STARTED") => {
    const items: AuditEntryListItem[] = [];
    let page = 0;
    let totalPages = 1;
    while (page < totalPages) {
      const result = await client.GET("/audit-entries", {
        params: {
          query: {
            fields: FIELDS,
            filter: [`action:eq:${action}`],
            page,
            size: 50,
            sort: ["at,desc"],
          },
        },
      });
      if (result.data === undefined) throw new TypeError("Audit page without data");
      items.push(...result.data.items);
      totalPages = result.data.totalPages;
      page += 1;
    }
    return items;
  };
  const [started, ended] = await Promise.all([
    list("SUPPORT_ACCESS_STARTED"),
    list("SUPPORT_ACCESS_ENDED"),
  ]);
  return liveSupportAccesses(started, ended, Date.now());
}

/**
 * S14 «Auditoria» of the club (S17 R-17-10, E123): the AgilityHub team's live support accesses,
 * each with [Acaba l'accés] (`DELETE /support-accesses/{id}`). The card exists only while one is
 * alive, and never in a support session itself (`403 SUPPORT_RESTRICTED`).
 */
export function SupportAccessesCard({ client }: { client: ApiClient }) {
  const { i18n, t } = useTranslation(["admin-audit", "errors"]);
  const branding = useBranding();
  const session = useSession();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
  const [accesses, setAccesses] = useState<LiveSupportAccess[]>([]);
  const [ending, setEnding] = useState<string>();
  const [message, setMessage] = useState<{ text: string; tone: "danger" | "success" }>();
  const [reads, setReads] = useState(0);
  const allowed = session.roles.includes("ADMIN") && session.me?.support === undefined;

  useEffect(() => {
    if (!allowed) return undefined;
    let active = true;
    readLiveSupportAccesses(client).then(
      (live) => {
        if (active) setAccesses(live);
      },
      // The audit list below says its own read failure; this card only adds the live accesses.
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [allowed, client, reads]);

  const end = async (access: LiveSupportAccess) => {
    setEnding(access.id);
    setMessage(undefined);
    try {
      await client.DELETE("/support-accesses/{id}", { params: { path: { id: access.id } } });
      setMessage({
        text: t("admin-audit:support.ended", { name: access.actorName ?? "" }),
        tone: "success",
      });
    } catch (error) {
      setMessage({
        text:
          isApiError(error, "INVALID_STATE") || isApiError(error, "NOT_FOUND")
            ? t("admin-audit:support.alreadyEnded")
            : isApiError(error)
              ? t(`errors:${error.code}`, { defaultValue: t("admin-audit:support.endFailed") })
              : t("admin-audit:support.endFailed"),
        tone: "danger",
      });
    } finally {
      setEnding(undefined);
      setReads((value) => value + 1);
    }
  };

  if (!allowed || (accesses.length === 0 && message === undefined)) return null;

  return (
    <Card aria-labelledby="audit-support-title" className="audit-support" role="region">
      <h2 id="audit-support-title">{t("admin-audit:support.title")}</h2>
      {accesses.length === 0 ? null : (
        <ul className="audit-support__items">
          {accesses.map((access) => (
            <li key={access.id}>
              <p>
                {t("admin-audit:support.item", {
                  from: fmtDateTime(access.startedAt, locale, branding.timeZone),
                  name: access.actorName ?? t("admin-audit:support.unknownActor"),
                  until: fmtDateTime(access.expiresAt, locale, branding.timeZone),
                })}
                {access.reason === undefined || access.reason === "" ? null : (
                  <span className="audit-support__reason">
                    {t("admin-audit:support.reason", { reason: access.reason })}
                  </span>
                )}
              </p>
              <Button
                disabled={ending !== undefined && ending !== access.id}
                loading={ending === access.id}
                loadingLabel={t("admin-audit:support.ending")}
                onClick={() => void end(access)}
                variant="danger"
              >
                {t("admin-audit:support.end")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {message === undefined ? null : (
        <p role={message.tone === "danger" ? "alert" : "status"}>{message.text}</p>
      )}
    </Card>
  );
}
