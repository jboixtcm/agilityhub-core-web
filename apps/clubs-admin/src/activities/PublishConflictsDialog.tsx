import { useClubFormats } from "@agilityhub/i18n";
import { Button, Checkbox, FormField, Modal, Switch, Textarea } from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type ConflictOptions,
  errorCode,
  type RingConflicts,
  useActivityErrorMessage,
} from "./shared";

export type ConflictDialogMode = "publish" | "save";

/**
 * R-07-05 dialog: the classes and training bookings that collide with the activity's ring
 * blocks, the options that force them («anul·la les classes…», «cancel·la les reserves…») and
 * the notice text, required when a conflicting class has registrants. Mounted only while open.
 */
export function PublishConflictsDialog({
  initial,
  mode,
  onClose,
  onConfirm,
  preview,
  ringName,
}: {
  initial?: ConflictOptions & { notifyEmail?: boolean };
  mode: ConflictDialogMode;
  onClose: () => void;
  onConfirm: (options: ConflictOptions & { notifyEmail: boolean }) => Promise<void>;
  preview: RingConflicts;
  ringName: (ringId: string) => string;
}) {
  const { t } = useTranslation(["admin-activities", "errors"]);
  const formats = useClubFormats();
  const errorMessage = useActivityErrorMessage();
  const [cancelClasses, setCancelClasses] = useState(initial?.cancelClasses ?? false);
  const [cancelBookings, setCancelBookings] = useState(initial?.cancelBookings ?? false);
  const [adminText, setAdminText] = useState(initial?.adminText ?? "");
  const [notifyEmail, setNotifyEmail] = useState(initial?.notifyEmail ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field: boolean; message: string }>();

  const withClasses = preview.conflicts.length > 0;
  const withBookings = preview.trainingBookings.length > 0;
  const textRequired =
    cancelClasses && preview.conflicts.some((conflict) => (conflict.bookedCount ?? 0) > 0);
  const ready =
    (!withClasses || cancelClasses) &&
    (!withBookings || cancelBookings) &&
    (!textRequired || adminText.trim() !== "");
  const time = (instant: string) => formats.formatTime(instant).replace(/^0(?=\d:)/u, "");

  const confirm = async () => {
    setPending(true);
    setError(undefined);
    try {
      await onConfirm({
        ...(withBookings ? { cancelBookings } : {}),
        ...(withClasses ? { cancelClasses } : {}),
        ...(adminText.trim() === "" ? {} : { adminText: adminText.trim() }),
        notifyEmail,
      });
    } catch (cause) {
      setError({
        field: errorCode(cause) === "ADMIN_TEXT_REQUIRED",
        message: errorMessage(cause),
      });
      setPending(false);
    }
  };

  return (
    <Modal
      closeLabel={t("admin-activities:common.close")}
      onClose={onClose}
      open
      title={t("admin-activities:publishDialog.conflictsTitle")}
    >
      <div className="activity-conflicts">
        {withClasses ? (
          <ul
            aria-label={t("admin-activities:publishDialog.classesLabel")}
            className="activity-conflicts__list"
          >
            {preview.conflicts.map((conflict) => (
              <li key={`${conflict.ringId}-${conflict.id}`}>
                <span>
                  {t("admin-activities:publishDialog.conflictRow", {
                    from: time(conflict.from),
                    label: conflict.label,
                    ring: ringName(conflict.ringId),
                    to: time(conflict.to),
                  })}
                </span>
                <strong>
                  {t("admin-activities:publishDialog.bookedCount", {
                    count: conflict.bookedCount ?? 0,
                  })}
                </strong>
              </li>
            ))}
          </ul>
        ) : null}
        {withBookings ? (
          <section aria-labelledby="activity-conflicts-training">
            <h3 id="activity-conflicts-training">
              {t("admin-activities:publishDialog.trainingTitle")}
            </h3>
            <ul className="activity-conflicts__list">
              {preview.trainingBookings.map((booking) => (
                <li key={booking.bookingId}>
                  {t("admin-activities:publishDialog.trainingRow", {
                    dog: booking.dogName,
                    from: time(booking.from),
                    member: booking.memberName,
                    ring: ringName(booking.ringId),
                    to: time(booking.to),
                  })}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {withClasses ? (
          <label className="activity-check">
            <Checkbox
              checked={cancelClasses}
              onChange={(event) => {
                setCancelClasses(event.currentTarget.checked);
              }}
            />
            <span>{t("admin-activities:publishDialog.cancelClasses")}</span>
          </label>
        ) : null}
        {withBookings ? (
          <label className="activity-check">
            <Checkbox
              checked={cancelBookings}
              onChange={(event) => {
                setCancelBookings(event.currentTarget.checked);
              }}
            />
            <span>{t("admin-activities:publishDialog.cancelBookings")}</span>
          </label>
        ) : null}
        {withClasses ? (
          <FormField
            {...(error?.field === true ? { error: error.message } : {})}
            id="activity-conflicts-text"
            label={t("admin-activities:publishDialog.adminText")}
          >
            <Textarea
              id="activity-conflicts-text"
              maxLength={500}
              onChange={(event) => {
                setAdminText(event.currentTarget.value);
              }}
              required={textRequired}
              rows={3}
              value={adminText}
            />
          </FormField>
        ) : null}
        {mode === "publish" ? (
          <div className="activity-switch">
            <Switch
              checked={notifyEmail}
              label={t("admin-activities:publishDialog.notifyEmail")}
              onCheckedChange={setNotifyEmail}
            />
            <span aria-hidden="true">{t("admin-activities:publishDialog.notifyEmail")}</span>
          </div>
        ) : null}
        {error === undefined || error.field ? null : (
          <p className="ah-form-field__error" role="alert">
            {error.message}
          </p>
        )}
        <div className="activity-modal__actions">
          <Button onClick={onClose} variant="ghost">
            {t("admin-activities:common.back")}
          </Button>
          <Button
            disabled={!ready}
            loading={pending}
            loadingLabel={t("admin-activities:common.saving")}
            onClick={() => void confirm()}
          >
            {mode === "publish"
              ? t("admin-activities:publishDialog.apply")
              : t("admin-activities:publishDialog.applySave")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
