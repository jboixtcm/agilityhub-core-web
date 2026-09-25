import { Badge, Button, FormField, Icon, Modal, Textarea } from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Emphasized } from "../planning/calendar-shared";

import { type CancellationPreview, errorCode, useActivityErrorMessage } from "./shared";

/**
 * R-07-06 (D4c pattern): with registrants or a waitlist, the list from the cancellation
 * preview and the required notice text (1–500) — [CANCEL·LA I AVISA ELS {n} INSCRITS] stays
 * disabled without it; without anyone, a simple confirmation. Mounted only while open.
 *
 * Someone may register between the preview and the confirmation: the api then answers
 * `ADMIN_TEXT_REQUIRED`, the preview is fetched again (`onRefreshPreview`) and the notice field
 * shows with the error, even if the fresh preview still reads empty.
 */
export function CancelActivityModal({
  onClose,
  onConfirm,
  onRefreshPreview,
  preview,
  reason = "CLUB_MANUAL",
  title,
}: {
  onClose: () => void;
  onConfirm: (adminText: string | undefined) => Promise<void>;
  /** Fetches `GET …/cancellation-preview` again and passes the fresh one as `preview`. */
  onRefreshPreview?: () => Promise<void>;
  preview: CancellationPreview;
  /** `DELETED` = [ELIMINA] of a draft (simple confirmation, R-07-04). */
  reason?: "CLUB_MANUAL" | "DELETED";
  title: string;
}) {
  const { t } = useTranslation(["admin-activities", "enums", "errors"]);
  const errorMessage = useActivityErrorMessage();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field: boolean; message: string }>();
  const [textRequired, setTextRequired] = useState(false);
  const count = preview.activeCount + preview.waitingCount;
  const askText = count > 0 || textRequired;

  const confirm = async () => {
    setPending(true);
    setError(undefined);
    try {
      await onConfirm(askText ? text.trim() : undefined);
    } catch (cause) {
      const missingText = errorCode(cause) === "ADMIN_TEXT_REQUIRED";
      if (missingText && !askText) {
        await onRefreshPreview?.().catch(() => undefined);
        setTextRequired(true);
      }
      setError({ field: missingText, message: errorMessage(cause) });
      setPending(false);
    }
  };

  const back = (
    <Button onClick={onClose} variant="ghost">
      {t("admin-activities:common.back")}
    </Button>
  );

  if (!askText) {
    return (
      <Modal
        closeLabel={t("admin-activities:common.close")}
        onClose={onClose}
        open
        title={
          reason === "DELETED"
            ? t("admin-activities:cancelModal.deleteTitle")
            : t("admin-activities:cancelModal.simpleTitle")
        }
      >
        {error === undefined ? null : (
          <p className="ah-form-field__error" role="alert">
            {error.message}
          </p>
        )}
        <div className="activity-modal__actions">
          {back}
          <Button
            loading={pending}
            loadingLabel={t("admin-activities:common.saving")}
            onClick={() => void confirm()}
            variant="danger"
          >
            {reason === "DELETED"
              ? t("admin-activities:form.delete")
              : t("admin-activities:cancelModal.simpleConfirm")}
          </Button>
        </div>
      </Modal>
    );
  }

  const fieldError = error?.field === true ? error.message : undefined;
  return (
    <Modal
      closeLabel={t("admin-activities:common.close")}
      onClose={onClose}
      open
      title={
        count > 0
          ? t("admin-activities:cancelModal.title", { title })
          : t("admin-activities:cancelModal.simpleTitle")
      }
    >
      <div className="activity-cancel">
        {count > 0 ? (
          <>
            <p className="activity-cancel__intro">
              <Emphasized
                phrase={t("admin-activities:cancelModal.introCount", { count })}
                text={t("admin-activities:cancelModal.intro", { count })}
              />
            </p>
            <table
              aria-label={t("admin-activities:cancelModal.listLabel")}
              className="activity-cancel__list"
            >
              <tbody>
                {preview.registrations.map((registration) => (
                  <tr key={registration.registrationId}>
                    <th scope="row">
                      <strong>{registration.memberName}</strong>
                    </th>
                    <td>
                      <Badge tone={registration.state === "WAITLISTED" ? "warning" : "success"}>
                        {t(`enums:activityRegistrationState.${registration.state}`)}
                      </Badge>
                    </td>
                    <td className="activity-cancel__channels">
                      {registration.channels
                        .map((channel) =>
                          channel === "SMS" && registration.phoneCount > 1
                            ? t("admin-activities:cancelModal.smsPhones", {
                                count: registration.phoneCount,
                              })
                            : t(`admin-activities:cancelModal.channel.${channel}`, {
                                defaultValue: channel,
                              }),
                        )
                        .join(t("admin-activities:cancelModal.channelSeparator"))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
        <FormField
          {...(fieldError === undefined ? {} : { error: fieldError })}
          id="activity-cancel-text"
          label={t("admin-activities:cancelModal.text")}
        >
          <Textarea
            aria-describedby={fieldError === undefined ? undefined : "activity-cancel-text-error"}
            aria-invalid={fieldError === undefined ? undefined : true}
            disabled={pending}
            id="activity-cancel-text"
            maxLength={500}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
            required
            rows={3}
            value={text}
          />
        </FormField>
        {error === undefined || error.field ? null : (
          <p className="ah-form-field__error" role="alert">
            {error.message}
          </p>
        )}
        <div className="activity-modal__actions">
          {back}
          <Button
            disabled={text.trim() === ""}
            loading={pending}
            loadingLabel={t("admin-activities:common.saving")}
            onClick={() => void confirm()}
            variant="danger"
          >
            <Icon aria-hidden="true" name="x" />
            {count > 0
              ? t("admin-activities:cancelModal.confirm", { count })
              : t("admin-activities:cancelModal.simpleConfirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
