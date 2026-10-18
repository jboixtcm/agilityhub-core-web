import { type components, isApiError, useSubmissionKeys } from "@agilityhub/api-client";
import { Badge, Button, DataTable, FormField, Modal, Select, type Tone } from "@agilityhub/ui";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  consoleErrorMessage,
  fieldErrorMap,
  formatClubDateTime,
  FormMessage,
  formErrorMessage,
  SectionCard,
  TextField,
  useWriteState,
} from "../shared";

import { PublicApiKeyCard } from "./PublicApiKeyCard";

type PlatformDomain = components["schemas"]["PlatformDomain"];
type DomainApp = PlatformDomain["app"];
type DomainStatus = PlatformDomain["status"];

export const DOMAIN_APPS = ["clubs", "clubs-admin"] as const satisfies readonly DomainApp[];

/** The DNS records a domain still needs (R-17-03): its challenge, or the ones a refusal names. */
interface ExpectedRecords {
  cnameTarget: string;
  recordName: string | null;
  recordValue: string | null;
}

export function statusTone(status: DomainStatus): Tone {
  return status === "VERIFIED" ? "success" : status === "BROKEN" ? "danger" : "warning";
}

/**
 * `422 HOST_NOT_VERIFIED {host, cnameTarget, recordName, recordValue}`: the records the api looked
 * for (the TXT pair is null for a domain without a challenge left).
 */
function refusedRecords(error: unknown): ExpectedRecords | undefined {
  if (!isApiError(error, "HOST_NOT_VERIFIED")) return undefined;
  const details =
    typeof error.details === "object" && error.details !== null
      ? (error.details as Record<string, unknown>)
      : {};
  if (typeof details.cnameTarget !== "string") return undefined;
  return {
    cnameTarget: details.cnameTarget,
    recordName: typeof details.recordName === "string" ? details.recordName : null,
    recordValue: typeof details.recordValue === "string" ? details.recordValue : null,
  };
}

/** S17 §2 «Dominis» (R-17-03): the two records that verify a host, either of them. */
function DnsInstructions({ host, records }: { host: string; records: ExpectedRecords }) {
  const { t } = useTranslation("console");
  return (
    <div className="console-dns-options">
      <p className="console-muted">{t("console:domains.dnsIntro")}</p>
      <div>
        <h3 className="console-domains__option">{t("console:domains.cnameTitle")}</h3>
        <dl className="console-dns">
          <dt>{t("console:domains.recordType")}</dt>
          <dd>CNAME</dd>
          <dt>{t("console:domains.recordName")}</dt>
          <dd>{host}</dd>
          <dt>{t("console:domains.recordValue")}</dt>
          <dd>{records.cnameTarget}</dd>
        </dl>
      </div>
      {records.recordName === null || records.recordValue === null ? null : (
        <div>
          <h3 className="console-domains__option">{t("console:domains.txtTitle")}</h3>
          <dl className="console-dns">
            <dt>{t("console:domains.recordType")}</dt>
            <dd>TXT</dd>
            <dt>{t("console:domains.recordName")}</dt>
            <dd>{records.recordName}</dd>
            <dt>{t("console:domains.recordValue")}</dt>
            <dd>{records.recordValue}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

interface RowNotice {
  records?: ExpectedRecords;
  text: string;
  tone: "danger" | "success";
}

/**
 * S17 §2 «Dominis» (R-17-02/03, E10-T04): the club's hosts by app and state; [Afegeix domini] →
 * the DNS records to create (a CNAME to the app's product host, or the `_agilityhub-verify` TXT)
 * and [Verifica]; the primary domain of each app, and removing the others (E123). Below, the
 * club's public API key (R-17-11).
 */
export function DomainsTab({ client, club, onReload }: ConsoleTabProps) {
  const { i18n, t } = useTranslation(["console", "errors", "common"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const keys = useSubmissionKeys();
  const add = useWriteState();
  const [host, setHost] = useState("");
  const [app, setApp] = useState<DomainApp>("clubs");
  const [added, setAdded] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [notices, setNotices] = useState<Record<string, RowNotice>>({});
  const [removing, setRemoving] = useState<PlatformDomain>();
  const fields = fieldErrorMap(t, add.error);
  const domains = club.domains;
  const withInstructions = domains.filter(
    (domain) =>
      domain.status !== "VERIFIED" &&
      (domain.verification != null || notices[domain.host]?.records !== undefined),
  );

  const notify = (target: string, notice: RowNotice | undefined) => {
    setNotices((current) => ({
      ...Object.fromEntries(Object.entries(current).filter(([host]) => host !== target)),
      ...(notice === undefined ? {} : { [target]: notice }),
    }));
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = { app, host: host.trim() };
    if (body.host === "") return;
    setAdded(undefined);
    const created = await add.run(() =>
      // One `Idempotency-Key` per payload: a retry of an unanswered add is the same request.
      keys.send(JSON.stringify({ add: club.id, ...body }), async (key) => {
        const result = await client.POST("/platform/clubs/{id}/domains", {
          body,
          params: { header: { "Idempotency-Key": key }, path: { id: club.id } },
        });
        if (result.data === undefined) throw new TypeError("Platform domain without data");
        return result.data;
      }),
    );
    if (created !== undefined) {
      setHost("");
      setAdded(t("console:domains.added", { host: created.host }));
      await onReload();
    }
  };

  const verify = async (domain: PlatformDomain) => {
    setBusy(`verify:${domain.host}`);
    notify(domain.host, undefined);
    try {
      const result = await keys.send(`verify:${club.id}:${domain.host}`, async (key) => {
        const response = await client.POST("/platform/clubs/{id}/domains/{host}/verification", {
          params: {
            header: { "Idempotency-Key": key },
            path: { host: domain.host, id: club.id },
          },
        });
        if (response.data === undefined) throw new TypeError("Domain verification without data");
        return response.data;
      });
      notify(domain.host, {
        text: t("console:domains.verified", {
          host: domain.host,
          method: t(`console:domains.method.${result.method}`),
        }),
        tone: "success",
      });
      await onReload();
    } catch (error) {
      const records = refusedRecords(error);
      notify(domain.host, {
        ...(records === undefined ? {} : { records }),
        text:
          records === undefined
            ? consoleErrorMessage(t, error)
            : t("console:domains.notVerified", { host: domain.host }),
        tone: "danger",
      });
      // `409 INVALID_STATE`: the domain moved meanwhile (verified elsewhere, re-checked by P9).
      if (isApiError(error, "INVALID_STATE")) await onReload();
    } finally {
      setBusy(undefined);
    }
  };

  const makePrimary = async (domain: PlatformDomain) => {
    setBusy(`primary:${domain.host}`);
    notify(domain.host, undefined);
    try {
      await client.PUT("/platform/clubs/{id}/domains/{host}/primary", {
        params: { path: { host: domain.host, id: club.id } },
      });
      notify(domain.host, {
        text: t("console:domains.primaryChanged", {
          app: t(`console:domains.apps.${domain.app}`),
          host: domain.host,
        }),
        tone: "success",
      });
      await onReload();
    } catch (error) {
      notify(domain.host, { text: consoleErrorMessage(t, error), tone: "danger" });
      if (isApiError(error, "INVALID_STATE")) await onReload();
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async (domain: PlatformDomain) => {
    setRemoving(undefined);
    setBusy(`delete:${domain.host}`);
    notify(domain.host, undefined);
    try {
      await keys.send(`delete:${club.id}:${domain.host}`, async (key) => {
        await client.DELETE("/platform/clubs/{id}/domains/{host}", {
          params: {
            header: { "Idempotency-Key": key },
            path: { host: domain.host, id: club.id },
          },
        });
        return true;
      });
      setAdded(t("console:domains.removed", { host: domain.host }));
      await onReload();
    } catch (error) {
      notify(domain.host, { text: consoleErrorMessage(t, error), tone: "danger" });
      if (isApiError(error, "INVALID_STATE") || isApiError(error, "NOT_FOUND")) await onReload();
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="console-form">
      <SectionCard
        description={t("console:domains.description")}
        title={t("console:domains.title")}
      >
        {club.template ? (
          <p className="console-message console-message--info" role="note">
            {t("console:domains.templateClub")}
          </p>
        ) : null}
        <DataTable<PlatformDomain>
          caption={t("console:domains.caption")}
          columns={[
            {
              header: t("console:domains.columns.host"),
              key: "host",
              render: (domain) => (
                <span className="console-domain__host">
                  <strong>{domain.host}</strong>
                  {domain.primary ? (
                    <Badge tone="info">{t("console:domains.primary")}</Badge>
                  ) : null}
                </span>
              ),
            },
            {
              header: t("console:domains.columns.app"),
              key: "app",
              render: (domain) => t(`console:domains.apps.${domain.app}`),
            },
            {
              header: t("console:domains.columns.status"),
              key: "status",
              render: (domain) => (
                <Badge tone={statusTone(domain.status)}>
                  {t(`console:domains.status.${domain.status}`)}
                </Badge>
              ),
            },
            {
              header: t("console:domains.columns.verifiedAt"),
              key: "verifiedAt",
              render: (domain) =>
                formatClubDateTime(domain.verifiedAt, club.timeZone, locale) ??
                t("console:list.none"),
            },
            {
              header: t("console:domains.columns.actions"),
              key: "actions",
              render: (domain) => (
                <span className="console-row-actions">
                  {domain.status === "VERIFIED" ? null : (
                    <Button
                      aria-label={t("console:domains.verifyLabel", { host: domain.host })}
                      disabled={busy !== undefined && busy !== `verify:${domain.host}`}
                      loading={busy === `verify:${domain.host}`}
                      loadingLabel={t("console:domains.verifying")}
                      onClick={() => void verify(domain)}
                      variant="secondary"
                    >
                      {t("console:domains.verify")}
                    </Button>
                  )}
                  {domain.status === "VERIFIED" && !domain.primary ? (
                    <Button
                      aria-label={t("console:domains.makePrimaryLabel", { host: domain.host })}
                      disabled={busy !== undefined && busy !== `primary:${domain.host}`}
                      loading={busy === `primary:${domain.host}`}
                      loadingLabel={t("console:common.saving")}
                      onClick={() => void makePrimary(domain)}
                      variant="ghost"
                    >
                      {t("console:domains.makePrimary")}
                    </Button>
                  ) : null}
                  {/* The primary one of its app is removed only once another is primary (E123). */}
                  {domain.primary ? null : (
                    <Button
                      aria-label={t("console:domains.removeLabel", { host: domain.host })}
                      disabled={busy !== undefined && busy !== `delete:${domain.host}`}
                      loading={busy === `delete:${domain.host}`}
                      loadingLabel={t("console:domains.removing")}
                      onClick={() => {
                        setRemoving(domain);
                      }}
                      variant="ghost"
                    >
                      {t("console:domains.remove")}
                    </Button>
                  )}
                </span>
              ),
            },
          ]}
          empty={t("console:domains.empty")}
          loadingLabel={t("console:common.loading")}
          rowKey={(domain) => domain.host}
          rows={[...domains]}
        />
        {domains
          .filter((domain) => notices[domain.host] !== undefined)
          .map((domain) => (
            <FormMessage
              key={domain.host}
              message={notices[domain.host]?.text}
              tone={notices[domain.host]?.tone ?? "danger"}
            />
          ))}
        <FormMessage message={added} tone="success" />
        {domains.some((domain) => domain.app === "clubs-admin" && domain.status === "VERIFIED") ? (
          <p className="console-muted">{t("console:domains.adminHostsNote")}</p>
        ) : null}
      </SectionCard>
      {withInstructions.map((domain) => {
        const records: ExpectedRecords | undefined =
          notices[domain.host]?.records ??
          (domain.verification == null
            ? undefined
            : {
                cnameTarget: domain.verification.cnameTarget,
                recordName: domain.verification.recordName,
                recordValue: domain.verification.recordValue,
              });
        return records === undefined ? null : (
          <SectionCard
            key={domain.host}
            title={t("console:domains.instructionsTitle", { host: domain.host })}
          >
            <DnsInstructions host={domain.host} records={records} />
          </SectionCard>
        );
      })}
      {club.template ? null : (
        <SectionCard
          description={t("console:domains.addHelp")}
          title={t("console:domains.addTitle")}
        >
          <form className="console-form" onSubmit={(event) => void submit(event)}>
            <fieldset className="console-fieldset" disabled={add.pending}>
              <div className="console-grid">
                <TextField
                  autoComplete="off"
                  error={fields.host}
                  id="console-domain-host"
                  label={t("console:domains.host")}
                  onChange={(value) => {
                    add.clear();
                    setHost(value);
                  }}
                  placeholder={t("console:domains.hostPlaceholder")}
                  required
                  value={host}
                />
                <FormField
                  id="console-domain-app"
                  label={t("console:domains.app")}
                  {...(fields.app === undefined ? {} : { error: fields.app })}
                >
                  <Select
                    id="console-domain-app"
                    onChange={(event) => {
                      add.clear();
                      setApp(event.currentTarget.value as DomainApp);
                    }}
                    value={app}
                  >
                    {DOMAIN_APPS.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {t(`console:domains.apps.${candidate}`)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            </fieldset>
            <FormMessage
              message={add.error === undefined ? undefined : formErrorMessage(t, add.error, fields)}
              tone="danger"
            />
            <div className="console-actions">
              <Button
                disabled={host.trim() === ""}
                loading={add.pending}
                loadingLabel={t("console:domains.adding")}
                type="submit"
              >
                {t("console:domains.add")}
              </Button>
            </div>
          </form>
        </SectionCard>
      )}
      <PublicApiKeyCard client={client} club={club} />
      <Modal
        closeLabel={t("console:common.close")}
        onClose={() => {
          setRemoving(undefined);
        }}
        open={removing !== undefined}
        title={t("console:domains.removeTitle", { host: removing?.host ?? "" })}
      >
        <p>{t("console:domains.removeConfirm")}</p>
        <div className="console-actions">
          <Button
            onClick={() => {
              setRemoving(undefined);
            }}
            variant="ghost"
          >
            {t("console:common.cancel")}
          </Button>
          <Button
            onClick={() => {
              if (removing !== undefined) void remove(removing);
            }}
            variant="danger"
          >
            {t("console:domains.removeConfirmAction")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
