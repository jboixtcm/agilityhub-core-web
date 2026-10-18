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

export function MemberDataExportButton({
  client,
  memberId,
}: {
  client: ApiClient;
  memberId: string;
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
              setMessage({ text: t("admin-census:member.privacy.exportQueued"), tone: "status" });
              exportsDrawer?.openExports({ jobId: data.jobId, kind: "MEMBER_DATA" });
            })
            .catch((cause: unknown) => {
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
  status,
}: {
  client: ApiClient;
  erased: boolean;
  memberId: string;
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
    void client
      .GET("/members/{id}/erasure", { params: { path: { id: memberId } } })
      .then(
      ({ data }) => {
        if (current) {
          setErasure(data);
          setErasureFailure(undefined);
        }
        },
        (cause: unknown) => {
          if (!current) return;
          if (isApiError(cause, "NOT_FOUND")) setErasure(undefined);
          else setErasureFailure(errorMessage(cause, t));
        },
      )
      .finally(() => {
        if (current) setErasureLoading(false);
      });
    return () => {
      current = false;
    };
  }, [client, erased, memberId, status, t]);

  const closeRequest = () => {
    if (pending) return;
    setRequestOpen(false);
    setRequestFailure(undefined);
    setRequestBlockReasons([]);
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

      {status !== "LEFT" || erased ? null : (
        <div className="member-privacy__erasure">
          <h3>{t("admin-census:member.privacy.erasure.title")}</h3>
          {notice === undefined ? null : <p role="status">{notice}</p>}
          {erasureFailure === undefined ? null : (
            <p className="member-privacy__error" role="alert">
              {erasureFailure}
            </p>
          )}
          {erasureLoading ? (
            <p role="status">{t("admin-census:member.privacy.erasure.loading")}</p>
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
              <p>
                {t("admin-census:member.privacy.erasure.scheduled", {
                  date: formats.formatDate(erasure.executeAt),
                })}
              </p>
              {erasure.blockReasons.length === 0 ? null : (
                <ul>
                  {erasure.blockReasons.map((blockReason) => (
                    <li key={blockReason}>{erasureBlockLabel(blockReason, t)}</li>
                  ))}
                </ul>
              )}
              <Button
                disabled={pending || !["SCHEDULED", "BLOCKED"].includes(erasure.status)}
                onClick={() => {
                  setNotice(undefined);
                  setRequestFailure(undefined);
                  setCancelOpen(true);
                }}
                variant="ghost"
              >
                {t("admin-census:member.privacy.erasure.cancel")}
              </Button>
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
                .catch((cause: unknown) => {
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
                .catch((cause: unknown) => {
                  setRequestFailure(errorMessage(cause, t));
                })
                .finally(() => {
                  setPending(false);
                });
            }}
          >
            {t("admin-census:member.privacy.erasure.cancelConfirm")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
