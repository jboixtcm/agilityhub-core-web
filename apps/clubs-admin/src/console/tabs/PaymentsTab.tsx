import type { components } from "@agilityhub/api-client";
import { isApiError } from "@agilityhub/api-client";
import { Badge, Button, FormField, Modal, Select, Switch, Textarea } from "@agilityhub/ui";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { LocaleTabs } from "../../catalogs/shared";
import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  consoleErrorMessage,
  fieldErrorMap,
  formatClubDateTime,
  FormMessage,
  type PlatformClub,
  SectionCard,
  TextField,
  useRebasedDraft,
  useWriteState,
} from "../shared";

type ProviderSummary = components["schemas"]["PlatformProviderSummary"];
type ProviderRequest = components["schemas"]["PlatformProviderRequest"];
type Provider = "MANUAL" | "SEPA_XML" | "STRIPE";

const UNCONFIGURED: ProviderSummary = { configured: false, enabled: false };

function summaryOf(club: PlatformClub, provider: Provider): ProviderSummary {
  return club.paymentProviders[provider] ?? UNCONFIGURED;
}

/**
 * `PUT /platform/clubs/{id}/payment-providers/{provider}` and `DELETE …?version=` with the club's
 * version (R-17-05). The answer is the provider's summary, so the record is read again after it;
 * `save` gives that summary (undefined when the write was refused).
 */
function useProviderWrite(
  { client, club, onReload }: Pick<ConsoleTabProps, "client" | "club" | "onReload">,
  provider: Provider,
) {
  const write = useWriteState();
  const save = async (body: Omit<ProviderRequest, "version">) => {
    const saved = await write.run(async () => {
      const result = await client.PUT("/platform/clubs/{id}/payment-providers/{provider}", {
        body: { ...body, version: club.version },
        params: { path: { id: club.id, provider } },
      });
      if (result.data === undefined) throw new TypeError("Provider without data");
      return result.data;
    }, onReload);
    if (saved !== undefined) await onReload();
    return saved;
  };
  const remove = async () => {
    const removed = await write.run(async () => {
      const result = await client.DELETE("/platform/clubs/{id}/payment-providers/{provider}", {
        params: { path: { id: club.id, provider }, query: { version: club.version } },
      });
      if (result.data === undefined) throw new TypeError("Provider without data");
      return result.data;
    }, onReload);
    if (removed !== undefined) await onReload();
    return removed !== undefined;
  };
  return { ...write, remove, save };
}

function ProviderState({ summary }: { summary: ProviderSummary }) {
  const { t } = useTranslation("console");
  return (
    <span className="console-provider-state">
      <Badge tone={summary.configured ? "success" : "neutral"}>
        {summary.configured
          ? t("console:payments.configured")
          : t("console:payments.notConfigured")}
      </Badge>
      <Badge tone={summary.enabled ? "info" : "neutral"}>
        {summary.enabled ? t("console:payments.enabled") : t("console:payments.disabled")}
      </Badge>
    </span>
  );
}

function RemoveProvider({
  name,
  onRemove,
  pending,
}: {
  name: string;
  onRemove: () => Promise<boolean>;
  pending: boolean;
}) {
  const { t } = useTranslation("console");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        disabled={pending}
        onClick={() => {
          setOpen(true);
        }}
        variant="danger"
      >
        {t("console:payments.remove")}
      </Button>
      <Modal
        closeLabel={t("console:common.close")}
        onClose={() => {
          setOpen(false);
        }}
        open={open}
        title={t("console:payments.removeTitle", { name })}
      >
        <p>{t("console:payments.removeConfirm")}</p>
        <div className="console-actions">
          <Button
            onClick={() => {
              setOpen(false);
            }}
            variant="ghost"
          >
            {t("console:common.cancel")}
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              void onRemove();
            }}
            variant="danger"
          >
            {t("console:payments.remove")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** SEPA: creditor, suffix and the IBAN, write-only (only its masked form is ever read). */
function SepaCard(props: ConsoleTabProps) {
  const { club } = props;
  const { t } = useTranslation(["console", "errors", "common"]);
  const summary = summaryOf(club, "SEPA_XML");
  const write = useProviderWrite(props, "SEPA_XML");
  // Rebased on every reread (a `409 STALE_VERSION` included): only the user's edits stay on top.
  const form = useRebasedDraft(
    {
      creditorId: summary.creditorId ?? "",
      creditorName: summary.creditorName ?? "",
      enabled: summary.enabled || !summary.configured,
      suffix: summary.suffix ?? "",
    },
    `${club.id}:${String(club.version)}`,
  );
  const { creditorId, creditorName, enabled, suffix } = form.draft;
  const [iban, setIban] = useState("");
  const fields = fieldErrorMap(t, write.error);
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await write.save({
      creditorId: creditorId.trim(),
      creditorName: creditorName.trim(),
      enabled,
      // Omitted keeps the stored IBAN; it never travels back.
      ...(iban.trim() === "" ? {} : { iban: iban.replaceAll(" ", "").toUpperCase() }),
      suffix: suffix.trim(),
    });
    if (saved !== undefined) setIban("");
  };
  return (
    <SectionCard title={t("console:payments.sepa.title")}>
      <ProviderState summary={summary} />
      <form className="console-form console-form--sepa" onSubmit={(event) => void submit(event)}>
        <fieldset className="console-fieldset" disabled={write.pending}>
          <div className="console-sepa-grid">
            <TextField
              error={fields.creditorName}
              id="console-sepa-creditor-name"
              label={t("console:payments.sepa.creditorName")}
              onChange={(value) => {
                form.setField("creditorName", value);
              }}
              required
              value={creditorName}
            />
            <TextField
              error={fields.creditorId}
              id="console-sepa-creditor-id"
              label={t("console:payments.sepa.creditorId")}
              onChange={(value) => {
                form.setField("creditorId", value);
              }}
              required
              value={creditorId}
            />
            <TextField
              error={fields.suffix}
              id="console-sepa-suffix"
              label={t("console:payments.sepa.suffix")}
              onChange={(value) => {
                form.setField("suffix", value);
              }}
              required
              value={suffix}
            />
            <TextField
              autoComplete="off"
              error={fields.iban}
              help={
                summary.ibanMasked === null || summary.ibanMasked === undefined
                  ? t("console:payments.sepa.ibanHelpNew")
                  : t("console:payments.sepa.ibanHelpStored", { masked: summary.ibanMasked })
              }
              id="console-sepa-iban"
              label={t("console:payments.sepa.iban")}
              onChange={setIban}
              required={!summary.configured}
              value={iban}
            />
          </div>
        </fieldset>
        <FormMessage
          message={write.error === undefined ? undefined : consoleErrorMessage(t, write.error)}
          tone="danger"
        />
        <FormMessage message={write.done ? t("console:common.saved") : undefined} tone="success" />
        <div className="console-sepa-footer">
          <div className="console-sepa-toggle">
            <span>{t("console:payments.enabledLabel")}</span>
            <Switch
              checked={enabled}
              disabled={write.pending}
              label={t("console:payments.enabledLabel")}
              onCheckedChange={(checked) => {
                form.setField("enabled", checked);
              }}
            />
          </div>
          <div className="console-actions">
            {summary.configured ? (
              <RemoveProvider
                name={t("console:payments.sepa.title")}
                onRemove={write.remove}
                pending={write.pending}
              />
            ) : null}
            <Button loading={write.pending} loadingLabel={t("console:common.saving")} type="submit">
              {t("console:common.save")}
            </Button>
          </div>
        </div>
      </form>
    </SectionCard>
  );
}

/**
 * PAY-10 (S17 R-17-05): on the prod profile, a club whose saved Stripe keys are live is switched to
 * test mode only once confirmed (`422 PROVIDER_CONFIG_INVALID {field: mode, reason: LIVE_KEYS_SAVED}`).
 */
function isLiveKeysSaved(error: unknown): boolean {
  if (!isApiError(error, "PROVIDER_CONFIG_INVALID")) return false;
  const details: unknown = error.details;
  return (
    typeof details === "object" &&
    details !== null &&
    (details as Record<string, unknown>).reason === "LIVE_KEYS_SAVED"
  );
}

/**
 * Stripe: the keys are write-only («configurada · live · última prova OK 03-09»), the publishable
 * key is sent again with each save (its last four are read), and [Prova la connexió] pings it.
 * PAY-10: a save with a new secret key runs the same test, so a refused key answers `422
 * STRIPE_CONNECTION_FAILED` (the typed values stay) and a passed one shows its account; saved live
 * keys switch to test mode only after a danger confirmation, which sends the same body again with
 * `testModeOverride: true`.
 */
function StripeCard(props: ConsoleTabProps) {
  const { client, club, onReload } = props;
  const { i18n, t } = useTranslation(["console", "errors", "common"]);
  const summary = summaryOf(club, "STRIPE");
  const write = useProviderWrite(props, "STRIPE");
  const test = useWriteState();
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const form = useRebasedDraft(
    {
      enabled: summary.enabled || !summary.configured,
      mode: summary.mode ?? "test",
    },
    `${club.id}:${String(club.version)}`,
  );
  const { enabled, mode } = form.draft;
  // The account a connection test reached: [Prova la connexió]'s, or the one a key save ran.
  const [connection, setConnection] = useState<{ account: string; mode: "live" | "test" }>();
  // The body of the last save, sent again with `testModeOverride` once the switch is confirmed.
  const [sent, setSent] = useState<Omit<ProviderRequest, "version">>();
  const liveKeysSaved = sent !== undefined && isLiveKeysSaved(write.error);
  const fields = fieldErrorMap(t, write.error);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const lastTest = formatClubDateTime(summary.lastTestAt, club.timeZone, locale);

  const send = async (body: Omit<ProviderRequest, "version">) => {
    setConnection(undefined);
    setSent(body);
    const saved = await write.save(body);
    if (saved === undefined) return;
    setSecretKey("");
    setWebhookSecret("");
    setPublishableKey("");
    // PAY-10: a new secret key was tested on save; the summary names the account it reached.
    if (saved.accountIdMasked != null && saved.mode != null) {
      setConnection({ account: saved.accountIdMasked, mode: saved.mode });
    }
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    await send({
      enabled,
      mode,
      publishableKey: publishableKey.trim(),
      // Omitted secrets keep the stored ones (R-17-05).
      ...(secretKey.trim() === "" ? {} : { secretKey: secretKey.trim() }),
      ...(webhookSecret.trim() === "" ? {} : { webhookSecret: webhookSecret.trim() }),
    });
  };

  const keepLiveMode = () => {
    write.clear();
  };

  const confirmTestMode = () => {
    if (sent === undefined) return;
    void send({ ...sent, testModeOverride: true });
  };

  const runTest = async () => {
    setConnection(undefined);
    const result = await test.run(async () => {
      const response = await client.POST("/platform/clubs/{id}/payment-providers/stripe/test", {
        params: { path: { id: club.id } },
      });
      if (response.data === undefined) throw new TypeError("Stripe test without data");
      return response.data;
    });
    if (result !== undefined) {
      setConnection({ account: result.accountName, mode: result.mode });
      // `lastTestAt` changed: the summary is read again.
      await onReload();
    }
  };

  return (
    <SectionCard title={t("console:payments.stripe.title")}>
      <ProviderState summary={summary} />
      {summary.configured ? (
        <p className="console-muted" data-testid="stripe-summary">
          {[
            t("console:payments.stripe.configuredSummary"),
            summary.mode === null || summary.mode === undefined
              ? null
              : t(`console:payments.stripe.modes.${summary.mode}`),
            summary.last4 === null || summary.last4 === undefined
              ? null
              : t("console:payments.stripe.last4", { last4: summary.last4 }),
            lastTest === undefined
              ? t("console:payments.stripe.neverTested")
              : t("console:payments.stripe.lastTest", { at: lastTest }),
          ]
            .filter((part) => part !== null)
            .join(" · ")}
        </p>
      ) : null}
      <form className="console-form" onSubmit={(event) => void submit(event)}>
        <fieldset className="console-fieldset" disabled={write.pending}>
          <div className="console-grid">
            <TextField
              autoComplete="off"
              error={fields.publishableKey}
              help={t("console:payments.stripe.publishableHelp")}
              id="console-stripe-publishable"
              label={t("console:payments.stripe.publishableKey")}
              onChange={setPublishableKey}
              required
              value={publishableKey}
            />
            <FormField id="console-stripe-mode" label={t("console:payments.stripe.mode")}>
              <Select
                id="console-stripe-mode"
                onChange={(event) => {
                  form.setField("mode", event.currentTarget.value === "live" ? "live" : "test");
                }}
                value={mode}
              >
                <option value="test">{t("console:payments.stripe.modes.test")}</option>
                <option value="live">{t("console:payments.stripe.modes.live")}</option>
              </Select>
            </FormField>
            {/* `new-password`: browsers ignore `off` on passwords and would offer to save the secret. */}
            <TextField
              autoComplete="new-password"
              error={fields.secretKey}
              help={
                summary.configured
                  ? t("console:payments.writeOnlyKept")
                  : t("console:payments.writeOnly")
              }
              id="console-stripe-secret"
              label={t("console:payments.stripe.secretKey")}
              onChange={setSecretKey}
              required={!summary.configured}
              type="password"
              value={secretKey}
            />
            <TextField
              autoComplete="new-password"
              error={fields.webhookSecret}
              help={
                summary.configured
                  ? t("console:payments.writeOnlyKept")
                  : t("console:payments.writeOnly")
              }
              id="console-stripe-webhook"
              label={t("console:payments.stripe.webhookSecret")}
              onChange={setWebhookSecret}
              type="password"
              value={webhookSecret}
            />
          </div>
          <div className="catalog-switch-row">
            <span>{t("console:payments.enabledLabel")}</span>
            <Switch
              checked={enabled}
              label={t("console:payments.enabledLabel")}
              onCheckedChange={(checked) => {
                form.setField("enabled", checked);
              }}
            />
          </div>
        </fieldset>
        <FormMessage
          message={
            // The confirmation below says why a switch to test mode was not saved.
            write.error === undefined || liveKeysSaved
              ? undefined
              : consoleErrorMessage(t, write.error)
          }
          tone="danger"
        />
        <FormMessage message={write.done ? t("console:common.saved") : undefined} tone="success" />
        <FormMessage
          message={
            test.error === undefined
              ? undefined
              : isApiError(test.error, "STRIPE_CONNECTION_FAILED")
                ? t("errors:STRIPE_CONNECTION_FAILED")
                : consoleErrorMessage(t, test.error)
          }
          tone="danger"
        />
        <FormMessage
          message={
            connection === undefined
              ? undefined
              : t("console:payments.stripe.testOk", {
                  account: connection.account,
                  mode: t(`console:payments.stripe.modes.${connection.mode}`),
                })
          }
          tone="success"
        />
        <div className="console-actions">
          {summary.configured ? (
            <RemoveProvider
              name={t("console:payments.stripe.title")}
              onRemove={write.remove}
              pending={write.pending}
            />
          ) : null}
          <Button
            disabled={!summary.configured || write.pending}
            loading={test.pending}
            loadingLabel={t("console:payments.stripe.testing")}
            onClick={() => void runTest()}
            variant="secondary"
          >
            {t("console:payments.stripe.test")}
          </Button>
          <Button loading={write.pending} loadingLabel={t("console:common.saving")} type="submit">
            {t("console:common.save")}
          </Button>
        </div>
      </form>
      <Modal
        closeLabel={t("console:common.close")}
        onClose={keepLiveMode}
        open={liveKeysSaved}
        title={t("console:payments.stripe.liveToTest.title")}
      >
        <p>{t("console:payments.stripe.liveToTest.body")}</p>
        <div className="console-actions">
          <Button onClick={keepLiveMode} variant="ghost">
            {t("console:common.cancel")}
          </Button>
          <Button onClick={confirmTestMode} variant="danger">
            {t("console:payments.stripe.liveToTest.confirm")}
          </Button>
        </div>
      </Modal>
    </SectionCard>
  );
}

/** Manual: the payment instructions, one text per club language, the default one required. */
function ManualCard(props: ConsoleTabProps) {
  const { club } = props;
  const { t } = useTranslation(["console", "errors", "common"]);
  const summary = summaryOf(club, "MANUAL");
  const write = useProviderWrite(props, "MANUAL");
  const form = useRebasedDraft(
    {
      enabled: summary.enabled || !summary.configured,
      instructions: { ...(summary.instructions ?? {}) },
    },
    `${club.id}:${String(club.version)}`,
  );
  const { enabled, instructions } = form.draft;
  const [locale, setLocale] = useState(club.defaultLocale);
  const fields = fieldErrorMap(t, write.error);
  const defaultMissing = (instructions[club.defaultLocale] ?? "").trim() === "";
  const error =
    fields[`instructions.${locale}`] ??
    (locale === club.defaultLocale && defaultMissing
      ? t("console:payments.manual.defaultRequired")
      : undefined);
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (defaultMissing) return;
    await write.save({
      enabled,
      instructions: Object.fromEntries(
        club.locales.flatMap((candidate) => {
          const text = (instructions[candidate] ?? "").trim();
          return text === "" ? [] : [[candidate, text]];
        }),
      ),
    });
  };
  return (
    <SectionCard
      description={t("console:payments.manual.description")}
      title={t("console:payments.manual.title")}
    >
      <ProviderState summary={summary} />
      <form className="console-form" onSubmit={(event) => void submit(event)}>
        <fieldset className="console-fieldset" disabled={write.pending}>
          <LocaleTabs locale={locale} locales={club.locales} onChange={setLocale} />
          <FormField
            id="console-manual-instructions"
            label={t("console:payments.manual.instructions", {
              locale: t(`console:locales.${locale}`),
            })}
            {...(error === undefined ? {} : { error })}
          >
            <Textarea
              id="console-manual-instructions"
              onChange={(event) => {
                form.setField("instructions", {
                  ...instructions,
                  [locale]: event.currentTarget.value,
                });
              }}
              required={locale === club.defaultLocale}
              value={instructions[locale] ?? ""}
            />
          </FormField>
          <div className="catalog-switch-row">
            <span>{t("console:payments.enabledLabel")}</span>
            <Switch
              checked={enabled}
              label={t("console:payments.enabledLabel")}
              onCheckedChange={(checked) => {
                form.setField("enabled", checked);
              }}
            />
          </div>
        </fieldset>
        <FormMessage
          message={write.error === undefined ? undefined : consoleErrorMessage(t, write.error)}
          tone="danger"
        />
        <FormMessage message={write.done ? t("console:common.saved") : undefined} tone="success" />
        <div className="console-actions">
          {summary.configured ? (
            <RemoveProvider
              name={t("console:payments.manual.title")}
              onRemove={write.remove}
              pending={write.pending}
            />
          ) : null}
          <Button
            disabled={defaultMissing}
            loading={write.pending}
            loadingLabel={t("console:common.saving")}
            type="submit"
          >
            {t("console:common.save")}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/** S17 §2 «Pagaments» (R-17-05): SEPA, Stripe and manual payments, secrets never read back. */
export function PaymentsTab(props: ConsoleTabProps) {
  const { t } = useTranslation("console");
  return (
    <div className="console-form">
      {props.club.modules.includes("BILLING") ? null : (
        <p className="console-message console-message--info" role="status">
          {t("console:payments.billingOff")}
        </p>
      )}
      <SepaCard {...props} />
      <StripeCard {...props} />
      <ManualCard {...props} />
    </div>
  );
}
