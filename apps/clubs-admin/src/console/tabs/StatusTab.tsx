import { useSubmissionKeys } from "@agilityhub/api-client";
import { Button, FormField, Textarea } from "@agilityhub/ui";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  checklistMissing,
  type ClubStatus,
  consoleErrorMessage,
  fieldErrorMap,
  FormMessage,
  SectionCard,
  StatusBadge,
  useWriteState,
} from "../shared";

import { SupportAccessCard } from "./SupportAccessCard";

/** S17 §5: the transitions the platform makes (`SUSPENDED → ONBOARDING` is `409 INVALID_STATE`). */
export const STATUS_TRANSITIONS: Readonly<Record<ClubStatus, readonly ClubStatus[]>> = {
  ACTIVE: ["SUSPENDED"],
  ONBOARDING: ["ACTIVE"],
  SUSPENDED: ["ACTIVE"],
};

/**
 * S17 §2 «Estat» (R-17-07): `ONBOARDING → ACTIVE` by hand (proposed once the checklist is complete,
 * R-17-06), `ACTIVE → SUSPENDED` with a reason, and back; below, «Entra com a administrador del
 * club» (R-17-10, `SupportAccessCard`).
 */
export function StatusTab({ client, club, onReload, onReplace }: ConsoleTabProps) {
  const { t } = useTranslation(["console", "errors", "common"]);
  const write = useWriteState();
  const keys = useSubmissionKeys();
  const [reason, setReason] = useState("");
  const fields = fieldErrorMap(t, write.error);
  const missing = checklistMissing(club.onboardingChecklist);
  const [target] = STATUS_TRANSITIONS[club.status];
  const needsReason = target === "SUSPENDED";

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (target === undefined || (needsReason && reason.trim() === "")) return;
    const body = { status: target, ...(needsReason ? { reason: reason.trim() } : {}) };
    const updated = await write.run(() =>
      keys.send(`status:${club.id}:${club.status}:${target}`, async (key) => {
        const result = await client.PUT("/platform/clubs/{id}/status", {
          body,
          params: { header: { "Idempotency-Key": key }, path: { id: club.id } },
        });
        if (result.data === undefined) throw new TypeError("Platform club without data");
        return result.data;
      }),
    );
    if (updated !== undefined) {
      setReason("");
      onReplace(updated);
    } else {
      // A refusal (`409 INVALID_STATE`: the club moved meanwhile) reads its current state again.
      await onReload();
    }
  };

  return (
    <div className="console-form">
      <form className="console-form" onSubmit={(event) => void submit(event)}>
        <SectionCard
          description={t("console:statusTab.description")}
          title={t("console:statusTab.title")}
        >
          <p className="console-status-current">
            {t("console:statusTab.current")} <StatusBadge status={club.status} />
          </p>
          <p className="console-muted">{t(`console:statusTab.meaning.${club.status}`)}</p>
          {target === undefined ? null : (
            <fieldset className="console-fieldset" disabled={write.pending}>
              {club.status === "ONBOARDING" ? (
                <p
                  className={`console-message console-message--${missing.length === 0 ? "success" : "warning"}`}
                  role="note"
                >
                  {missing.length === 0
                    ? t("console:statusTab.checklistComplete")
                    : t("console:statusTab.checklistIncomplete", {
                        items: missing.map((key) => t(`console:checklist.items.${key}`)).join(", "),
                      })}
                </p>
              ) : null}
              {needsReason ? (
                <>
                  <p className="console-muted">{t("console:statusTab.suspendEffects")}</p>
                  <FormField
                    id="console-status-reason"
                    label={t("console:statusTab.reason")}
                    {...(fields.reason === undefined ? {} : { error: fields.reason })}
                  >
                    <Textarea
                      id="console-status-reason"
                      onChange={(event) => {
                        // Another reason is another payload: it never reuses an unanswered key.
                        keys.forget(`status:${club.id}:${club.status}:${target}`);
                        setReason(event.currentTarget.value);
                      }}
                      required
                      value={reason}
                    />
                  </FormField>
                </>
              ) : null}
            </fieldset>
          )}
        </SectionCard>
        <FormMessage
          message={write.error === undefined ? undefined : consoleErrorMessage(t, write.error)}
          tone="danger"
        />
        <FormMessage
          message={write.done ? t("console:statusTab.changed") : undefined}
          tone="success"
        />
        {target === undefined ? null : (
          <div className="console-actions">
            <Button
              disabled={needsReason && reason.trim() === ""}
              loading={write.pending}
              loadingLabel={t("console:common.saving")}
              type="submit"
              variant={target === "SUSPENDED" ? "danger" : "primary"}
            >
              {t(`console:statusTab.actions.${club.status}`)}
            </Button>
          </div>
        )}
      </form>
      <SupportAccessCard client={client} club={club} />
    </div>
  );
}
