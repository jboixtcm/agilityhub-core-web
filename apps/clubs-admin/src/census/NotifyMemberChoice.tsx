import { Checkbox } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

/**
 * COMM-03 (pre-production audit, decision of 13 Nov 2026): «Avisa l'abonat» on an ADMIN's level
 * change and payment-method edit, ticked by default. Unticked, the request carries
 * `notifyMember: false` and the member gets no N-09 / N-38; the audit entry records it.
 */
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
    <label className="census-record__check-row" htmlFor={id}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        id={id}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      {t("common:notifyMember")}
    </label>
  );
}

/** Nothing while the member is notified (the default); `notifyMember: false` when unticked. */
export function memberNoticeField(notify: boolean): { notifyMember?: false } {
  return notify ? {} : { notifyMember: false };
}
