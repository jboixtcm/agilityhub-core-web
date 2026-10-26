import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Card, FormField, Modal, Textarea } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useOptionalExportsDrawer } from "../audit/ExportsDrawer";

type Consent = components["schemas"]["ConsentHistoryEntry"];
type ErasureRequest = components["schemas"]["ErasureRequest"];

function errorMessage(cause: unknown, t: ReturnType<typeof useTranslation>["t"]): string {
  return isApiError(cause)
    ? t(`errors:${cause.code}`, { defaultValue: t("admin-census:common.genericError") })
    : t("admin-census:common.genericError");
}

function blockedReasons(cause: unknown): string[] {
  if (!isApiError(cause, "ERASURE_BLOCKED")) return [];
  if (typeof cause.details !== "object" || cause.details === null) return [];
  const reasons = (cause.details as Record<string, unknown>).reasons;
  return Array.isArray(reasons)
    ? reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
}

/** The member's live erasure request (S14 §6: `404` = none), or the read's failure. */
async function readErasure(
  client: ApiClient,
  memberId: string,
): Promise<ErasureRequest | undefined> {
  try {
    const { data } = await client.GET("/members/{id}/erasure", {
      params: { path: { id: memberId } },
    });
    return data;
  } catch (cause) {
    if (isApiError(cause, "NOT_FOUND")) return undefined;
    throw cause;
  }
}

/**
 * The club cancels only its own request while it waits (S14 §5–§6: `SCHEDULED`/`BLOCKED`,
 * `scope = MEMBER`); an `ACCOUNT` request is the platform's, and `ERASING` is already running.
 */
function cancellable(erasure: ErasureRequest): boolean {
  return erasure.scope === "MEMBER" && ["SCHEDULED", "BLOCKED"].includes(erasure.status);
}

function consentTypeLabel(type: string, t: ReturnType<typeof useTranslation>["t"]): string {
  if (type === "PRIVACY_POLICY")
    return t("admin-census:member.privacy.consents.types.privacyPolicy");
  if (type === "IMAGE_USE") return t("admin-census:member.privacy.consents.types.imageRights");
  return t("admin-census:member.privacy.consents.types.other");
}

function erasureBlockLabel(reason: string, t: ReturnType<typeof useTranslation>["t"]): string {
  switch (reason) {
    case "MEMBER_NOT_LEFT":
      return t("admin-census:member.privacy.erasure.blockReasons.memberNotLeft");
    case "INVOICES_OPEN":
      return t("admin-census:member.privacy.erasure.blockReasons.invoicesOpen");
    case "UPFRONT_OPEN":
      return t("admin-census:member.privacy.erasure.blockReasons.upfrontOpen");
    case "FUTURE_BOOKINGS":
      return t("admin-census:member.privacy.erasure.blockReasons.futureBookings");
    case "OTHER_MEMBERSHIPS_ACTIVE":
      return t("admin-census:member.privacy.erasure.blockReasons.otherMembershipsActive");
    default:
      return t("admin-census:member.privacy.erasure.blockReasons.other");
  }
}

/**
 * «Descarrega les dades (RGPD)» (S14 R-14-13): the package is always a queued job, followed in the
 * exports drawer. The member is never notified from here (`deliverToMember: false`, assumption in
 * E11-W01's report). A `409 MEMBER_ERASED` is final: the page says it and drops its actions.
 */
export function MemberDataExportButton({
  client,
  memberId,
  onErased,
}: {
  client: ApiClient;
  memberId: string;
  onErased: () => void;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const exportsDrawer = useOptionalExportsDrawer();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "status" }>();

  return (
    <div className="member-privacy__export">
      <Button
        disabled={pending}
        loading={pending}
        loadingLabel={t("admin-census:member.privacy.exportPreparing")}
        onClick={() => {
          setPending(true);
          setMessage({ text: t("admin-census:member.privacy.exportPreparing"), tone: "status" });
          void client
            .POST("/members/{id}/data-export", {
              body: { deliverToMember: false },
              params: { path: { id: memberId } },
            })
            .then(({ data }) => {
              if (data === undefined) throw new TypeError("Data export response had no job");
              // The drawer owns live progress. This acknowledgement stays accurate after
              // READY, FAILED or EXPIRED and when the drawer is closed.
              setMessage({
                text: t("admin-census:member.privacy.exportRequested"),
                tone: "status",
              });
              exportsDrawer?.openExports({ jobId: data.jobId, kind: "MEMBER_DATA" });
            })
            .catch((cause: unknown) => {
              if (isApiError(cause, "MEMBER_ERASED")) {
                setMessage(undefined);
                onErased();
                return;
              }
              setMessage({ text: errorMessage(cause, t), tone: "error" });
            })
            .finally(() => {
              setPending(false);
            });
        }}
        variant="ghost"
      >
        {t("admin-census:member.privacy.export")}
      </Button>
      {message === undefined ? null : (
        <small role={message.tone === "error" ? "alert" : "status"}>{message.text}</small>
      )}
    </div>
  );
}

export function MemberPrivacyCard({
  client,
  erased,
  memberId,
  onErased,
  status,
}: {
  client: ApiClient;
  erased: boolean;
  memberId: string;
  /** `409 MEMBER_ERASED` (erased after the record was read, S14 §5): the page offers no change. */
  onErased: () => void;
  status: "ACTIVE" | "INACTIVE" | "LEFT" | "PENDING";
}) {
  const formats = useClubFormats();
  const { t } = useTranslation(["admin-census", "errors"]);
  const [consents, setConsents] = useState<Consent[]>();
  const [consentFailure, setConsentFailure] = useState<string>();
  const [consentReload, setConsentReload] = useState(0);
  const [erasure, setErasure] = useState<ErasureRequest>();
  const [erasureLoading, setErasureLoading] = useState(status === "LEFT" && !erased);
  const [erasureFailure, setErasureFailure] = useState<string>();
  const [erasureReload, setErasureReload] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [requestFailure, setRequestFailure] = useState<string>();
  const [requestBlockReasons, setRequestBlockReasons] = useState<string[]>([]);
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let current = true;
    void client.GET("/members/{id}/consents", { params: { path: { id: memberId } } }).then(
      ({ data }) => {
        if (current) {
          setConsents(data ?? []);
          setConsentFailure(undefined);
        }
      },
      (cause: unknown) => {
        if (current) setConsentFailure(errorMessage(cause, t));
      },
    );
    return () => {
      current = false;
    };
  }, [client, consentReload, memberId, t]);

  useEffect(() => {
    if (status !== "LEFT" || erased) return undefined;
    let current = true;
    void readErasure(client, memberId)
      .then(
        (live) => {
          if (!current) return;
          setErasure(live);
          setErasureFailure(undefined);
        },
        (cause: unknown) => {
          // Without the read the card cannot tell whether a request is live: no request button.
          if (current) setErasureFailure(errorMessage(cause, t));
        },
      )
      .finally(() => {
        if (current) setErasureLoading(false);
      });
    return () => {
      current = false;
    };
  }, [client, erased, erasureReload, memberId, status, t]);

  const closeRequest = () => {
    if (pending) return;
    setRequestOpen(false);
    setRequestFailure(undefined);
    setRequestBlockReasons([]);
  };

  /** After a refused cancellation the request changed meanwhile: the card shows it as it is now. */
  const rereadAfterRefusal = async () => {
    try {
      setErasure(await readErasure(client, memberId));
    } catch {
      // The dialog already says why the cancellation failed.
    }
  };

  const erasureStatusLine = (live: ErasureRequest) => {
    const date = formats.formatDate(live.executeAt);
    if (live.status === "BLOCKED")
      return t("admin-census:member.privacy.erasure.blocked", { date });
    if (live.status === "ERASING") return t("admin-census:member.privacy.erasure.erasing");
    return t("admin-census:member.privacy.erasure.scheduled", { date });
  };

  return (
    <Card className="member-privacy">
      <h2>{t("admin-census:member.privacy.title")}</h2>
      <h3>{t("admin-census:member.privacy.consents.title")}</h3>
      {consentFailure !== undefined ? (
        <div className="member-privacy__error" role="alert">
          <p>{consentFailure}</p>
          <Button
            onClick={() => {
              setConsents(undefined);
              setConsentFailure(undefined);
              setConsentReload((value) => value + 1);
            }}
            variant="ghost"
          >
            {t("admin-census:common.retry")}
          </Button>
        </div>
      ) : consents === undefined ? (
        <p role="status">{t("admin-census:member.privacy.consents.loading")}</p>
      ) : consents.length === 0 ? (
        <p>{t("admin-census:member.privacy.consents.empty")}</p>
      ) : (
        <ul className="member-privacy__consents">
          {consents.map((consent) => (
            <li key={`${consent.type}-${consent.version}-${consent.at}`}>
              <strong>{consentTypeLabel(consent.type, t)}</strong>
              <Badge tone={consent.granted ? "success" : "neutral"}>
                {consent.granted
                  ? t("admin-census:member.privacy.consents.granted")
                  : t("admin-census:member.privacy.consents.withdrawn")}
              </Badge>
              <small>
                {t("admin-census:member.privacy.consents.detail", {
                  date: formats.formatDate(consent.at),
                  locale: consent.locale.toUpperCase(),
                  version: consent.version,
                })}
              </small>
            </li>
          ))}
        </ul>
      )}

      {/* R-14-14: an ACTIVE or INACTIVE member must leave first (S13), and the card says so. */}
      {!erased && (status === "ACTIVE" || status === "INACTIVE") ? (
        <div className="member-privacy__erasure">
          <h3>{t("admin-census:member.privacy.erasure.title")}</h3>
          <p>{t("admin-census:member.privacy.erasure.leaveFirst")}</p>
        </div>
      ) : null}

      {status !== "LEFT" || erased ? null : (
        <div className="member-privacy__erasure">
          <h3>{t("admin-census:member.privacy.erasure.title")}</h3>
          {notice === undefined ? null : <p role="status">{notice}</p>}
          {erasureLoading ? (
            <p role="status">{t("admin-census:member.privacy.erasure.loading")}</p>
          ) : erasureFailure !== undefined ? (
            <div className="member-privacy__error" role="alert">
              <p>{erasureFailure}</p>
              <Button
                onClick={() => {
                  setErasureFailure(undefined);
                  setErasureLoading(true);
                  setErasureReload((value) => value + 1);
                }}
                variant="ghost"
              >
                {t("admin-census:common.retry")}
              </Button>
            </div>
          ) : erasure === undefined ? (
            <Button
              onClick={() => {
                setNotice(undefined);
                setRequestOpen(true);
              }}
              variant="ghost"
            >
              {t("admin-census:member.privacy.erasure.action")}
            </Button>
          ) : (
            <div className="member-privacy__scheduled">
              <p>{erasureStatusLine(erasure)}</p>
              {erasure.blockReasons.length === 0 ? null : (
                <ul>
                  {erasure.blockReasons.map((blockReason) => (
                    <li key={blockReason}>{erasureBlockLabel(blockReason, t)}</li>
                  ))}
                </ul>
              )}
              {cancellable(erasure) ? (
                <Button
                  disabled={pending}
                  onClick={() => {
                    setNotice(undefined);
                    setRequestFailure(undefined);
                    setCancelOpen(true);
                  }}
                  variant="ghost"
                >
                  {t("admin-census:member.privacy.erasure.cancel")}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      )}

      <Modal
        closeLabel={t("admin-census:common.close")}
        dismissible={!pending}
        onClose={closeRequest}
        open={requestOpen}
        title={t("admin-census:member.privacy.erasure.action")}
      >
        <p>{t("admin-census:member.privacy.erasure.description")}</p>
        <ul className="member-privacy__checks">
          <li>{t("admin-census:member.privacy.erasure.checks.left")}</li>
          <li>{t("admin-census:member.privacy.erasure.checks.invoices")}</li>
          <li>{t("admin-census:member.privacy.erasure.checks.upfront")}</li>
          <li>{t("admin-census:member.privacy.erasure.checks.bookings")}</li>
        </ul>
        <FormField id="erasure-reason" label={t("admin-census:member.privacy.erasure.reason")}>
          <Textarea
            disabled={pending}
            id="erasure-reason"
            maxLength={500}
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
            value={reason}
          />
        </FormField>
        {requestFailure === undefined ? null : (
          <div className="member-privacy__error" role="alert">
            <p>{requestFailure}</p>
            {requestBlockReasons.length === 0 ? null : (
              <ul>
                {requestBlockReasons.map((blockReason) => (
                  <li key={blockReason}>{erasureBlockLabel(blockReason, t)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="census-record__dialog-actions">
          <Button disabled={pending} onClick={closeRequest} variant="ghost">
            {t("admin-census:common.cancel")}
          </Button>
          {/* An erased member takes no request (409 MEMBER_ERASED is final, S14 §5). */}
          {erased ? null : (
            <Button
              loading={pending}
              loadingLabel={t("admin-census:member.privacy.erasure.requesting")}
              onClick={() => {
                setPending(true);
                setRequestFailure(undefined);
                setRequestBlockReasons([]);
                const body = reason.trim() === "" ? {} : { reason: reason.trim() };
                void client
                  .POST("/members/{id}/erasure", {
                    body,
                    params: { path: { id: memberId } },
                  })
                  .then(({ data }) => {
                    if (data === undefined) throw new TypeError("Erasure response had no request");
                    setErasure(data);
                    setRequestOpen(false);
                    setReason("");
                    setNotice(t("admin-census:member.privacy.erasure.requested"));
                  })
                  .catch(async (cause: unknown) => {
                    if (isApiError(cause, "MEMBER_ERASED")) onErased();
                    if (isApiError(cause, "ERASURE_ALREADY_REQUESTED")) {
                      // Another admin (or a view read before it) asked first: show that request.
                      try {
                        const live = await readErasure(client, memberId);
                        if (live !== undefined) {
                          setErasure(live);
                          setRequestOpen(false);
                          setReason("");
                          setNotice(errorMessage(cause, t));
                          return;
                        }
                      } catch {
                        // The dialog keeps the 409's message.
                      }
                    }
                    setRequestFailure(errorMessage(cause, t));
                    setRequestBlockReasons(blockedReasons(cause));
                  })
                  .finally(() => {
                    setPending(false);
                  });
              }}
            >
              {t("admin-census:member.privacy.erasure.confirm")}
            </Button>
          )}
        </div>
      </Modal>

      <Modal
        closeLabel={t("admin-census:common.close")}
        dismissible={!pending}
        onClose={() => {
          if (!pending) setCancelOpen(false);
        }}
        open={cancelOpen}
        title={t("admin-census:member.privacy.erasure.cancel")}
      >
        <p>{t("admin-census:member.privacy.erasure.cancelDescription")}</p>
        {requestFailure === undefined ? null : (
          <p className="member-privacy__error" role="alert">
            {requestFailure}
          </p>
        )}
        <div className="census-record__dialog-actions">
          <Button
            disabled={pending}
            onClick={() => {
              setCancelOpen(false);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          {erased || erasure === undefined || !cancellable(erasure) ? null : (
            <Button
              loading={pending}
              loadingLabel={t("admin-census:member.privacy.erasure.cancelling")}
              onClick={() => {
                setPending(true);
                setRequestFailure(undefined);
                void client
                  .DELETE("/members/{id}/erasure", { params: { path: { id: memberId } } })
                  .then(() => {
                    setErasure(undefined);
                    setCancelOpen(false);
                    setNotice(t("admin-census:member.privacy.erasure.cancelled"));
                  })
                  .catch(async (cause: unknown) => {
                    if (isApiError(cause, "MEMBER_ERASED")) onErased();
                    setRequestFailure(errorMessage(cause, t));
                    // `409 INVALID_STATE` (now ERASING, or the platform's request) or `404` (no
                    // live request any more): the card follows the request as it is now.
                    if (isApiError(cause, "INVALID_STATE") || isApiError(cause, "NOT_FOUND")) {
                      await rereadAfterRefusal();
                    }
                  })
                  .finally(() => {
                    setPending(false);
                  });
              }}
            >
              {t("admin-census:member.privacy.erasure.cancelConfirm")}
            </Button>
          )}
        </div>
      </Modal>
    </Card>
  );
}
