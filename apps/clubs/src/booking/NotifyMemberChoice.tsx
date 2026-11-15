import { useSession } from "@agilityhub/auth";
import { Checkbox } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

/**
 * COMM-03 (pre-production audit, decision of 13 Nov 2026): only an ADMIN acting as the member
 * («Entra com l'abonat», an impersonation that is not an instructor's bookings-only session) may
 * book or cancel without notifying the member. The member and the instructor never see the choice.
 */
export function useMemberNoticeChoice(): boolean {
  const impersonation = useSession().me?.impersonation;
  return impersonation !== undefined && impersonation.bookingsOnly !== true;
}

/**
 * The request field of the choice: nothing while the member is notified (the default, «absent or
 * true = notify»), `notifyMember: false` only when the ADMIN unticked «Avisa l'abonat».
 */
export function memberNoticeField(offered: boolean, notify: boolean): { notifyMember?: false } {
  return offered && !notify ? { notifyMember: false } : {};
}

/** «Avisa l'abonat», ticked by default: unticked, the action reaches the member without a notice. */
export function NotifyMemberChoice({
  checked,
  disabled = false,
  id,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  id: string;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation("common");
  return (
    <label className="staff-notice-choice" htmlFor={id}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        id={id}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      <span>{t("common:notifyMember")}</span>
    </label>
  );
}
