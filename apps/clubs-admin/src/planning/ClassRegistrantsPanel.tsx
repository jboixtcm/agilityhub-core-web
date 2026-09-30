import {
  type ApiClient,
  type ClassBookingItem,
  type ClassWaitlistEntry,
  isApiError,
  isLiveWaitlistEntry,
  removeWaitlistEntry,
  useClassRegistrants,
  waitlistEntryGuide,
} from "@agilityhub/api-client";
import {
  Button,
  Modal,
  RegistrantsPanel,
  type RegistrantsPanelWaiting,
  type Tone,
  useBranding,
} from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** The chip of each booking state (the api's `state`, R-08-02: never recomputed here). */
export const BOOKING_STATE_TONES: Readonly<Record<ClassBookingItem["state"], Tone>> = {
  ACTIVE: "success",
  CANCELLED: "neutral",
  CANCELLED_BY_CLUB: "danger",
  CANCELLED_LATE: "warning",
  PAYMENT_PENDING: "warning",
};

/**
 * The chip of a registrant: the api's derived `displayState` (S08 §6, E5-T29), with 07's literals
 * (`enums:bookingState.*`): a past booking reads «feta», a NO_SHOW mark «no presentat» (red).
 */
export const BOOKING_DISPLAY_STATE_TONES: Readonly<Record<ClassBookingItem["displayState"], Tone>> =
  {
    CANCELLED: "neutral",
    CANCELLED_BY_CLUB: "danger",
    CANCELLED_LATE: "warning",
    CONFIRMED: "success",
    DONE: "neutral",
    NO_SHOW: "danger",
    PAYMENT_PENDING: "warning",
  };

type Translate = ReturnType<typeof useTranslation>["t"];

/**
 * «Júlia + Kira» (S10 R-10-00: `handlerName ?? memberFirstName`, E5-T29), or «1. Júlia + Kira» in
 * a FIFO club (R-08-12 `position`, `null` with ALL_AT_ONCE). Without a guide, the dog alone.
 */
export function waitingLabel(t: Translate, entry: ClassWaitlistEntry): string {
  const dog = entry.dogName ?? entry.dog.name;
  const guide = waitlistEntryGuide(entry);
  const name = guide === "" ? dog : t("admin-scheduling:registrants.name", { dog, member: guide });
  return entry.position === null || entry.position === undefined
    ? name
    : t("admin-scheduling:registrants.position", { name, position: entry.position });
}

/**
 * The registrants of a class (S08 §6) inside D4's selected-class card: every booking with its state
 * and, with `WAITLIST`, the «En espera: …» line. ADMIN may remove a waiting entry (R-08-16); nobody
 * books, cancels or marks attendance here (R-08-19 «Entra com l'abonat», S10).
 */
export function ClassRegistrantsPanel({
  booked,
  capacity,
  classSessionId,
  client,
  onChanged,
  readOnly,
}: {
  booked: number;
  capacity: number;
  classSessionId: string;
  client: ApiClient;
  /** A removal changed the class's `counters.waiting`: the host refetches it. */
  onChanged?: () => void;
  readOnly: boolean;
}) {
  const branding = useBranding();
  const { t } = useTranslation(["admin-scheduling", "enums", "errors"]);
  const waitlistEnabled = branding.modules.includes("WAITLIST");
  const registrants = useClassRegistrants(client, classSessionId, waitlistEnabled);
  const [confirming, setConfirming] = useState<RegistrantsPanelWaiting>();
  const [pendingId, setPendingId] = useState<string>();
  const [removalError, setRemovalError] = useState<string>();

  const live =
    registrants.status === "ready" ? (registrants.waitlist ?? []).filter(isLiveWaitlistEntry) : [];
  const entries = live.map((entry) => ({ id: entry.id, label: waitingLabel(t, entry) }));

  const remove = async (entry: RegistrantsPanelWaiting) => {
    setPendingId(entry.id);
    setRemovalError(undefined);
    try {
      await removeWaitlistEntry(client, entry.id);
      setConfirming(undefined);
      registrants.refetch();
      onChanged?.();
    } catch (cause) {
      if (isApiError(cause, "WAITLIST_ENTRY_NOT_LIVE")) {
        // Someone else changed it (booked, expired, left): show why and read the list again.
        setConfirming(undefined);
        setRemovalError(t("errors:WAITLIST_ENTRY_NOT_LIVE"));
        registrants.refetch();
        onChanged?.();
      } else {
        setRemovalError(
          isApiError(cause)
            ? t(`errors:${cause.code}`, { defaultValue: t("errors:INTERNAL_ERROR") })
            : t("errors:INTERNAL_ERROR"),
        );
      }
    } finally {
      setPendingId(undefined);
    }
  };

  const loadError =
    registrants.status === "error" ? (
      <>
        <span>{t("admin-scheduling:registrants.loadError")}</span>{" "}
        <Button onClick={registrants.refetch} variant="ghost">
          {t("admin-scheduling:registrants.retry")}
        </Button>
      </>
    ) : undefined;

  return (
    <>
      <RegistrantsPanel
        emptyLabel={t("admin-scheduling:registrants.empty")}
        {...(loadError === undefined
          ? removalError === undefined || confirming !== undefined
            ? {}
            : { error: removalError }
          : { error: loadError })}
        loading={registrants.status === "loading"}
        loadingLabel={t("admin-scheduling:registrants.loading")}
        {...(readOnly
          ? {}
          : {
              removal: {
                buttonLabel: t("admin-scheduling:registrants.remove"),
                label: (entry: RegistrantsPanelWaiting) =>
                  t("admin-scheduling:registrants.removeLabel", { name: entry.label }),
                onRemove: (entry: RegistrantsPanelWaiting) => {
                  setRemovalError(undefined);
                  setConfirming(entry);
                },
                pendingId,
              },
            })}
        rows={
          registrants.status === "ready"
            ? registrants.bookings.map((item) => ({
                id: item.id,
                level: item.levelCode ?? undefined,
                name: t("admin-scheduling:registrants.name", {
                  dog: item.dogName,
                  member: item.memberName,
                }),
                state: {
                  label: t(`enums:bookingState.${item.displayState}`),
                  tone: BOOKING_DISPLAY_STATE_TONES[item.displayState],
                },
              }))
            : []
        }
        title={t("admin-scheduling:registrants.title", { booked, capacity })}
        {...(waitlistEnabled
          ? {
              waiting: {
                entries,
                text: t("admin-scheduling:registrants.waiting", {
                  names: entries.map((entry) => entry.label).join(" · "),
                }),
              },
            }
          : {})}
      />
      <Modal
        closeLabel={t("admin-scheduling:common.close")}
        onClose={() => {
          if (pendingId === undefined) setConfirming(undefined);
        }}
        open={confirming !== undefined}
        title={t("admin-scheduling:registrants.removeConfirm.title")}
      >
        <p>
          {t("admin-scheduling:registrants.removeConfirm.text", { name: confirming?.label ?? "" })}
        </p>
        {removalError === undefined ? null : <p role="alert">{removalError}</p>}
        <div className="calendar-modal__actions">
          <Button
            disabled={pendingId !== undefined}
            onClick={() => {
              setConfirming(undefined);
            }}
            variant="ghost"
          >
            {t("admin-scheduling:registrants.removeConfirm.cancel")}
          </Button>
          <Button
            loading={pendingId !== undefined}
            loadingLabel={t("admin-scheduling:common.saving")}
            onClick={() => {
              if (confirming !== undefined) void remove(confirming);
            }}
            variant="danger"
          >
            {t("admin-scheduling:registrants.removeConfirm.confirm")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
