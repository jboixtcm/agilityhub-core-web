import { useTranslation } from "react-i18next";

/**
 * S04 R-04-06 (INC-39; E11-W06 W10): D10's answer to a write refused with `409 INVALID_STATE
 * {reason: READMISSION_PENDING}` — the record waits for D2: validate or reject the readmission
 * there first. D2 is the member's own signup (`/preinscripcions/:memberId`).
 */
export function ReadmissionPendingMessage({ memberId }: { memberId: string }) {
  const { t } = useTranslation(["admin-census", "admin-dashboard"]);
  return (
    <>
      {t("admin-census:member.readmissionPending")}{" "}
      <a href={`/preinscripcions/${encodeURIComponent(memberId)}`}>
        {t("admin-dashboard:signups.title")}
      </a>
    </>
  );
}
