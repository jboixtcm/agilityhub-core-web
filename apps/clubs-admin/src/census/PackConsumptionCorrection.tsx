import {
  apiFieldErrors,
  isApiError,
  type ApiClient,
  type components,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { Button, FormField, Input, Modal } from "@agilityhub/ui";
import { useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

export function PackConsumptionCorrection({
  client,
  dogName,
  onClose,
  onRefresh,
  pack,
}: {
  client: ApiClient;
  dogName: string;
  onClose: () => void;
  onRefresh: () => void;
  pack: components["schemas"]["PackBalanceDetail"];
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const keys = useSubmissionKeys();
  const [target, setTarget] = useState(String(pack.consumed));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const stale = isApiError(failure, "STALE_VERSION");
  const minimum = pack.movements.reduce(
    (count, movement) =>
      movement.bookingId && (movement.type === "CONSUME" || movement.type === "REFUND")
        ? count - movement.delta
        : count,
    0,
  );
  const maximum = Math.min(2_147_483_647, pack.remaining + pack.consumed);
  const consumed = Number(target);
  const remaining = pack.remaining + pack.consumed - consumed;
  const valid =
    target !== "" && Number.isInteger(consumed) && consumed >= minimum && consumed <= maximum;
  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || stale || pending || reason.trim() === "") return;
    setPending(true);
    setFailure(undefined);
    const body = {
      consumed,
      expectedConsumed: pack.consumed,
      expectedRemaining: pack.remaining,
      reason: reason.trim(),
    };
    try {
      await keys.send(JSON.stringify([pack.id, body]), (key) =>
        client.POST("/pack-balances/{id}/consumption-corrections", {
          body,
          params: { path: { id: pack.id }, header: { "Idempotency-Key": key } },
        }),
      );
      onRefresh();
      onClose();
    } catch (cause) {
      setFailure(cause);
      if (isApiError(cause, "STALE_VERSION")) onRefresh();
    } finally {
      setPending(false);
    }
  };
  const error = stale
    ? t("admin-census:member.billing.consumptionStale")
    : apiFieldErrors(failure).some((field) => field.field === "consumed")
      ? t("admin-census:member.billing.consumptionChargedBookings")
      : isApiError(failure, "PACK_NEGATIVE")
        ? t("admin-census:member.billing.packNegative")
        : t("admin-census:common.genericError");
  return (
    <Modal
      closeLabel={t("admin-census:common.cancel")}
      onClose={() => {
        if (!pending) onClose();
      }}
      open
      title={t("admin-census:member.billing.correctConsumption")}
    >
      <form className="census-record__form" onSubmit={(event) => void save(event)}>
        <p>
          {dogName} · {pack.planName}
        </p>
        <FormField
          help={t("admin-census:member.billing.consumptionLimits", { minimum, maximum })}
          id="pack-consumption"
          label={t("admin-census:member.billing.consumptionTarget")}
        >
          <Input
            aria-describedby="pack-consumption-help"
            id="pack-consumption"
            max={maximum}
            min={minimum}
            onChange={(event) => {
              setTarget(event.currentTarget.value);
            }}
            required
            step={1}
            type="number"
            value={target}
          />
        </FormField>
        {valid ? <p>{t("admin-census:member.billing.consumptionBalance", { remaining })}</p> : null}
        <FormField id="pack-consumption-reason" label={t("admin-census:member.billing.reason")}>
          <Input
            id="pack-consumption-reason"
            maxLength={500}
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
            required
            value={reason}
          />
        </FormField>
        {failure === undefined ? null : <p role="alert">{error}</p>}
        <Button
          disabled={
            !valid || consumed === pack.consumed || reason.trim() === "" || pending || stale
          }
          loading={pending}
          type="submit"
        >
          {t("admin-census:common.save")}
        </Button>
      </form>
    </Modal>
  );
}
