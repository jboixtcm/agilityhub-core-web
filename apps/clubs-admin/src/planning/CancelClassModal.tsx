import { Badge, Button, FormField, Icon, Modal, Textarea } from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type CancellationPreview,
  Emphasized,
  errorCode,
  useCalendarErrorMessage,
} from "./calendar-shared";
import { errorProp } from "./shared";

export type CancellationReason = "CLUB_MANUAL" | "DELETED";

export interface ClassHeading {
  day: string;
  description: string;
  instructors: string;
  ring: string;
  time: string;
}

/**
 * D4c (R-06-10): [ANUL·LA LA CLASSE] and [ELIMINA] of a class with registrants or waitlist show
 * the registrants from the cancellation preview and require the notice text; without them, a
 * simple confirmation without text. Mounted only while open.
 */
export function CancelClassModal({
  heading,
  onClose,
  onConfirm,
  preview,
  reason,
}: {
  heading: ClassHeading;
  onClose: () => void;
  onConfirm: (adminText: string | undefined) => Promise<void>;
  preview: CancellationPreview;
  reason: CancellationReason;
}) {
  const { t } = useTranslation(["admin-scheduling", "errors"]);
  const errorMessage = useCalendarErrorMessage();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field: boolean; message: string }>();
  const count = preview.bookings.length;
  const withRegistrants = count + preview.waitlistCount > 0;
  // Only a waitlist (R-06-10 still requires the text): no «0 alumnes inscrits».
  const waitlistOnly = count === 0 && preview.waitlistCount > 0;

  const confirm = async () => {
    setPending(true);
    setError(undefined);
    try {
      await onConfirm(withRegistrants ? text.trim() : undefined);
    } catch (cause) {
      setError({ field: errorCode(cause) === "ADMIN_TEXT_REQUIRED", message: errorMessage(cause) });
    } finally {
      setPending(false);
    }
  };

  const back = (
    <Button onClick={onClose} variant="ghost">
      {t("admin-scheduling:cancelModal.back")}
    </Button>
  );

  if (!withRegistrants) {
    return (
      <Modal
        closeLabel={t("admin-scheduling:common.close")}
        onClose={onClose}
        open
        title={
          reason === "DELETED"
            ? t("admin-scheduling:cancelModal.simpleDelete")
            : t("admin-scheduling:cancelModal.simpleCancel")
        }
      >
        {error === undefined ? null : (
          <p className="ah-form-field__error" role="alert">
            {error.message}
          </p>
        )}
        <div className="calendar-modal__actions">
          {back}
          <Button
            loading={pending}
            loadingLabel={t("admin-scheduling:common.saving")}
            onClick={() => void confirm()}
            variant="danger"
          >
            {reason === "DELETED"
              ? t("admin-scheduling:calendar.selected.delete")
              : t("admin-scheduling:calendar.selected.cancel")}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      closeLabel={t("admin-scheduling:common.close")}
      onClose={onClose}
      open
      title={t("admin-scheduling:cancelModal.title", { ...heading })}
    >
      <div className="calendar-cancel">
        <p className="calendar-cancel__intro">
          {waitlistOnly ? (
            <Emphasized
              phrase={t("admin-scheduling:cancelModal.introWaitlistCount", {
                count: preview.waitlistCount,
              })}
              text={t("admin-scheduling:cancelModal.introWaitlist", {
                count: preview.waitlistCount,
              })}
            />
          ) : (
            <Emphasized
              phrase={t("admin-scheduling:cancelModal.introCount", { count })}
              text={t("admin-scheduling:cancelModal.intro", { count })}
            />
          )}
        </p>
        {count === 0 ? null : (
          <table
            aria-label={t("admin-scheduling:cancelModal.listLabel")}
            className="calendar-cancel__list"
          >
            <tbody>
              {preview.bookings.map((booking) => (
                <tr key={booking.bookingId}>
                  <th scope="row">
                    <strong>{booking.memberName}</strong>{" "}
                    {t("admin-scheduling:cancelModal.dog", { dog: booking.dogName })}
                  </th>
                  <td>
                    {booking.levelName === null || booking.levelName === undefined ? null : (
                      <Badge className="calendar-cancel__level" tone="warning">
                        {booking.levelName}
                      </Badge>
                    )}
                  </td>
                  <td className="calendar-cancel__channels">
                    {booking.channels
                      .map((channel) =>
                        channel === "SMS" && booking.phoneCount > 1
                          ? t("admin-scheduling:cancelModal.smsPhones", {
                              count: booking.phoneCount,
                            })
                          : t(`admin-scheduling:cancelModal.channel.${channel}`, {
                              defaultValue: channel,
                            }),
                      )
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <FormField
          {...errorProp(error?.field === true ? error.message : undefined)}
          id="calendar-cancel-text"
          label={t("admin-scheduling:cancelModal.text")}
        >
          <Textarea
            id="calendar-cancel-text"
            maxLength={500}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
            required
            rows={3}
            value={text}
          />
        </FormField>
        <p className="calendar-cancel__footer">
          {t("admin-scheduling:cancelModal.footer")}
          {preview.waitlistCount > 0
            ? t("admin-scheduling:cancelModal.footerWaitlist", { count: preview.waitlistCount })
            : null}
        </p>
        {error === undefined || error.field ? null : (
          <p className="ah-form-field__error" role="alert">
            {error.message}
          </p>
        )}
        <div className="calendar-modal__actions">
          {back}
          <Button
            disabled={text.trim() === ""}
            loading={pending}
            loadingLabel={t("admin-scheduling:common.saving")}
            onClick={() => void confirm()}
            variant="danger"
          >
            <Icon aria-hidden="true" name="x" />
            {waitlistOnly
              ? t("admin-scheduling:cancelModal.confirmWaitlist")
              : t("admin-scheduling:cancelModal.confirm", { count })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
