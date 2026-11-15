import { Button, Icon, Modal } from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type ClassSession, errorCode, useCalendarErrorMessage } from "./calendar-shared";
import type { ClassHeading } from "./CancelClassModal";

/**
 * SCH-01: [RESTAURA LA CLASSE] is offered on a class cancelled by the club or by the risk review
 * (never a deleted one) whose start is still ahead; the api answers INVALID_STATE otherwise.
 */
export function isRestorable(session: ClassSession, now = Date.now()): boolean {
  const reason = session.cancellation?.reason;
  return (
    session.state === "CANCELLED" &&
    reason !== undefined &&
    reason !== "DELETED" &&
    Date.parse(session.startsAt) > now
  );
}

/**
 * SCH-01 confirmation of `POST /class-sessions/{id}/restoration`: the class becomes active again,
 * the bookings and the waiting list it had are not recovered and nobody is notified. A refusal is
 * shown inside the dialog; `CLASS_CONFLICT` here means another class holds the ring at that time.
 * Mounted only while open.
 */
export function RestoreClassModal({
  heading,
  onClose,
  onConfirm,
}: {
  heading: ClassHeading;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation(["admin-scheduling", "errors"]);
  const errorMessage = useCalendarErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const confirm = async () => {
    setPending(true);
    setError(undefined);
    try {
      await onConfirm();
    } catch (cause) {
      setError(
        errorCode(cause) === "CLASS_CONFLICT"
          ? t("admin-scheduling:restoreModal.conflict")
          : errorMessage(cause),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      closeLabel={t("admin-scheduling:common.close")}
      onClose={onClose}
      open
      title={t("admin-scheduling:restoreModal.title", { ...heading })}
    >
      <p>{t("admin-scheduling:restoreModal.text")}</p>
      {error === undefined ? null : (
        <p className="ah-form-field__error" role="alert">
          {error}
        </p>
      )}
      <div className="calendar-modal__actions">
        <Button onClick={onClose} variant="ghost">
          {t("admin-scheduling:cancelModal.back")}
        </Button>
        <Button
          loading={pending}
          loadingLabel={t("admin-scheduling:common.saving")}
          onClick={() => void confirm()}
        >
          <Icon aria-hidden="true" name="check" />
          {t("admin-scheduling:calendar.selected.restore")}
        </Button>
      </div>
    </Modal>
  );
}
