import { useSubmissionKeys } from "@agilityhub/api-client";
import { Button, FormField, Textarea } from "@agilityhub/ui";
import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  clubAdminOrigin,
  handOverSupportAccess,
  SUPPORT_PATH,
  supportAdminHost,
} from "../../support/support-access";
import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  consoleErrorMessage,
  fieldErrorMap,
  formatClubDateTime,
  FormMessage,
  SectionCard,
  useWriteState,
} from "../shared";

/**
 * S17 §2 «Estat» · «Entra com a administrador del club» (R-17-10, E10-T04): a time-boxed support
 * access with a reason. The new tab is opened on the click itself (a popup blocker lets only that
 * one through), on the club's back-office host; the token reaches it by `postMessage` once the api
 * grants it (`support-access.ts`), and the tab is closed if the api refuses.
 */
export function SupportAccessCard({ client, club }: Pick<ConsoleTabProps, "client" | "club">) {
  const { i18n, t } = useTranslation(["console", "errors", "common"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const write = useWriteState();
  const keys = useSubmissionKeys();
  const [reason, setReason] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [granted, setGranted] = useState<string>();
  const handover = useRef<ReturnType<typeof handOverSupportAccess>>(undefined);
  const host = supportAdminHost(club);
  const fields = fieldErrorMap(t, write.error);

  useEffect(
    () => () => {
      handover.current?.stop();
    },
    [],
  );

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = { reason: reason.trim() };
    if (host === undefined || body.reason === "" || write.pending) return;
    setBlocked(false);
    setGranted(undefined);
    const origin = clubAdminOrigin(host);
    const tab = window.open(`${origin}${SUPPORT_PATH}`, "_blank");
    if (tab === null) {
      setBlocked(true);
      return;
    }
    handover.current?.stop();
    const current = handOverSupportAccess(tab, origin);
    handover.current = current;
    void write
      .run(() =>
        // One `Idempotency-Key` per payload: a retry of an unanswered request is the same access
        // (the api answers the same token).
        keys.send(JSON.stringify({ club: club.id, ...body }), async (key) => {
          const result = await client.POST("/platform/clubs/{id}/support-access", {
            body,
            params: { header: { "Idempotency-Key": key }, path: { id: club.id } },
          });
          if (result.data === undefined) throw new TypeError("Support access without data");
          return result.data;
        }),
      )
      .then((access) => {
        if (access === undefined) {
          current.stop();
          tab.close();
          return;
        }
        current.deliver(access);
        setReason("");
        setGranted(
          t("console:support.granted", {
            until: formatClubDateTime(access.expiresAt, club.timeZone, locale) ?? "",
          }),
        );
      });
  };

  return (
    <SectionCard description={t("console:support.description")} title={t("console:support.title")}>
      <form className="console-form" onSubmit={submit}>
        {host === undefined ? (
          <p className="console-message console-message--warning" role="note">
            {t("console:support.noAdminHost")}
          </p>
        ) : (
          <p className="console-muted">{t("console:support.opensHost", { host })}</p>
        )}
        <fieldset className="console-fieldset" disabled={write.pending || host === undefined}>
          <FormField
            id="console-support-reason"
            label={t("console:support.reason")}
            {...(fields.reason === undefined ? {} : { error: fields.reason })}
          >
            <Textarea
              id="console-support-reason"
              onChange={(event) => {
                setReason(event.currentTarget.value);
              }}
              required
              value={reason}
            />
          </FormField>
        </fieldset>
        <FormMessage
          message={
            blocked
              ? t("console:support.popupBlocked")
              : write.error === undefined
                ? undefined
                : consoleErrorMessage(t, write.error)
          }
          tone="danger"
        />
        <FormMessage message={granted} tone="success" />
        <div className="console-actions">
          <Button
            disabled={host === undefined || reason.trim() === ""}
            loading={write.pending}
            loadingLabel={t("console:support.entering")}
            type="submit"
            variant="secondary"
          >
            {t("console:support.enter")}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
