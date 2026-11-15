import type { components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, type Tone } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

type PaymentDispute = components["schemas"]["PaymentDispute"];
type DisputeState = "closed" | "lost" | "open" | "won";

const tones: Record<DisputeState, Tone> = {
  closed: "neutral",
  lost: "danger",
  open: "danger",
  won: "success",
};

function stateLabel(state: DisputeState, t: (key: string) => string): string {
  switch (state) {
    case "open":
      return t("common:paymentDispute.state.open");
    case "won":
      return t("common:paymentDispute.state.won");
    case "lost":
      return t("common:paymentDispute.state.lost");
    case "closed":
      return t("common:paymentDispute.state.closed");
  }
}

/**
 * PAY-06 (S12 R-12-21): the state of a Stripe dispute as its last `charge.dispute.*` event left it:
 * won or lost by Stripe's status, open while Stripe has not closed it, else closed (an inquiry,
 * `warning_closed`).
 */
export function disputeState(dispute: PaymentDispute): DisputeState {
  if (dispute.status === "won") return "won";
  if (dispute.status === "lost") return "lost";
  return dispute.closedAt == null ? "open" : "closed";
}

/**
 * PAY-06 (decision of 13 Nov 2026): the mark of a card payment a cardholder disputed with their
 * bank (a chargeback), on D10's up-front payments and on the receipt drawer's card collection. It
 * changes nothing: the club answers the dispute in Stripe's dashboard. The texts live in `common`,
 * which both screens have loaded.
 */
export function DisputeMark({ dispute }: { dispute: PaymentDispute }) {
  const { t } = useTranslation("common");
  const formats = useClubFormats();
  const state = disputeState(dispute);
  const reason =
    dispute.reason == null || dispute.reason === ""
      ? t("common:paymentDispute.noReason")
      : t("common:paymentDispute.reason", { reason: dispute.reason });
  return (
    <span className="dispute-mark">
      <Badge tone={tones[state]}>{stateLabel(state, t)}</Badge>
      <small>
        {dispute.closedAt == null
          ? t("common:paymentDispute.openDetail", {
              amount: formats.formatMoneyMinor(dispute.amount),
              date: formats.formatDate(dispute.openedAt),
              reason,
            })
          : t("common:paymentDispute.closedDetail", {
              amount: formats.formatMoneyMinor(dispute.amount),
              closed: formats.formatDate(dispute.closedAt),
              opened: formats.formatDate(dispute.openedAt),
              reason,
            })}
      </small>
    </span>
  );
}
