import { Badge, Button, FormField, Icon, Modal, Textarea } from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Emphasized } from "../planning/calendar-shared";

import { type CancellationPreview, errorCode, useActivityErrorMessage } from "./shared";

/**
 * R-07-06 (D4c pattern): with registrants or a waitlist, the list from the cancellation
 * preview and the required notice text (1–500) — [CANCEL·LA I AVISA ELS {n} INSCRITS] stays
 * disabled without it; without anyone, a simple confirmation. Mounted only while open.
 */
export function CancelActivityModal({
  onClose,
  onConfirm,
  preview,
  reason = "CLUB_MANUAL",
  title,
}: {
  onClose: () => void;
  onConfirm: (adminText: string | undefined) => Promise<void>;
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
  const count = preview.activeCount + preview.waitingCount;

  const confirm = async () => {
    setPending(true);
    setError(undefined);
    try {
      await onConfirm(count > 0 ? text.trim() : undefined);
    } catch (cause) {
      setError({ field: errorCode(cause) === "ADMIN_TEXT_REQUIRED", message: errorMessage(cause) });
      setPending(false);
    }
  };

  const back = (
    <Button onClick={onClose} variant="ghost">
      {t("admin-activities:common.back")}
    </Button>
  );

  if (count === 0) {
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

  return (
    <Modal
      closeLabel={t("admin-activities:common.close")}
      onClose={onClose}
      open
      title={t("admin-activities:cancelModal.title", { title })}
    >
      <div className="activity-cancel">
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
                    .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <FormField
          {...(error?.field === true ? { error: error.message } : {})}
          id="activity-cancel-text"
          label={t("admin-activities:cancelModal.text")}
        >
          <Textarea
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
            {t("admin-activities:cancelModal.confirm", { count })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
