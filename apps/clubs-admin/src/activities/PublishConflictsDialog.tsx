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
 * R-07-05 dialog: the classes, ring blocks and training bookings that collide with the
 * activity's ring blocks. Only classes («anul·la les classes…») and training bookings
 * («cancel·la les reserves…») can be forced; another ring block (`type: RING_BLOCK`) cannot,
 * so its presence keeps [PUBLICA I APLICA] disabled with the reason. The notice text is
 * required when a conflicting class has registrants. Mounted only while open; `onConfirm`
 * rejects with the api error to show inside the dialog (the parent refreshes `preview` from a
 * new `RING_BLOCK_CONFLICT`/`RING_HAS_BOOKINGS`).
 */
export function PublishConflictsDialog({
  askText,
  initial,
  mode,
  onClose,
  onConfirm,
  preview,
  ringName,
}: {
  /** Message of an `ADMIN_TEXT_REQUIRED` answered before the dialog opened. */
  askText?: string;
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
  const [error, setError] = useState<{ field: boolean; message: string } | undefined>(
    askText === undefined ? undefined : { field: true, message: askText },
  );
  // The api may still ask for the text (e.g. a class that got registrants meanwhile).
  const [textAsked, setTextAsked] = useState(askText !== undefined);

  const classConflicts = preview.conflicts.filter((conflict) => conflict.type === "CLASS");
  const blockConflicts = preview.conflicts.filter((conflict) => conflict.type === "RING_BLOCK");
  const withClasses = classConflicts.length > 0;
  const withBlocks = blockConflicts.length > 0;
  const withBookings = preview.trainingBookings.length > 0;
  const withText = withClasses || textAsked;
  const textRequired =
    textAsked ||
    (cancelClasses && classConflicts.some((conflict) => (conflict.bookedCount ?? 0) > 0));
  const ready =
    !withBlocks &&
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
        ...(withText && adminText.trim() !== "" ? { adminText: adminText.trim() } : {}),
        notifyEmail,
      });
    } catch (cause) {
      const textMissing = errorCode(cause) === "ADMIN_TEXT_REQUIRED";
      if (textMissing) setTextAsked(true);
      setError({ field: textMissing, message: errorMessage(cause) });
    } finally {
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
        {preview.conflicts.length > 0 ? (
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
                  {conflict.type === "RING_BLOCK"
                    ? t("admin-activities:publishDialog.ringBlock")
                    : t("admin-activities:publishDialog.bookedCount", {
                        count: conflict.bookedCount ?? 0,
                      })}
                </strong>
              </li>
            ))}
          </ul>
        ) : null}
        {withBlocks ? (
          <p className="activity-note activity-note--warning" role="note">
            {t("admin-activities:publishDialog.ringBlockNotForceable")}
          </p>
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
        {withText ? (
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
            disabled={!ready || pending}
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
