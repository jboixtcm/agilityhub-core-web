import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Card, Icon, useBranding } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CardFailureBanner } from "../billing/InvoicesPage";

type Invoice = components["schemas"]["MeInvoice"];
type Inactivity = components["schemas"]["MeInactivityContext"];
type Leave = components["schemas"]["MeLeaveContext"];

export function ProfileLifecycleSection({
  client,
  logoutDisabled,
  onLogout,
}: {
  client: ApiClient;
  logoutDisabled: boolean;
  onLogout: () => void;
}) {
  const branding = useBranding();
  const formats = useClubFormats();
  const { t } = useTranslation(["auth", "billing", "inactivity", "leave"]);
  const [failedCard, setFailedCard] = useState<Invoice>();
  const [inactivity, setInactivity] = useState<Inactivity>();
  const [inactivityApplicable, setInactivityApplicable] = useState(true);
  const [leave, setLeave] = useState<Leave>();

  useEffect(() => {
    let active = true;
    if (branding.modules.includes("BILLING")) {
      void client.GET("/me/invoices", { params: { query: { page: 0, size: 20 } } }).then(
        ({ data }) => {
          if (active)
            setFailedCard(
              data?.items.find(
                (item) => item.status === "FAILED" && item.paymentMethod.type === "CARD",
              ),
            );
        },
        () => undefined,
      );
    }
    if (branding.modules.includes("INACTIVITY")) {
      void client.GET("/me/inactivity-periods").then(
        ({ data }) => {
          if (active) setInactivity(data);
        },
        (cause: unknown) => {
          if (active && isApiError(cause, "INACTIVITY_NOT_APPLICABLE"))
            setInactivityApplicable(false);
        },
      );
    }
    void client.GET("/me/leave-requests").then(
      ({ data }) => {
        if (active) setLeave(data);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [branding.modules, client]);

  const livePeriod = inactivity?.periods.find((item) =>
    ["REQUESTED", "APPROVED", "ACTIVE"].includes(item.state),
  );
  const inactivitySubtitle =
    livePeriod === undefined
      ? undefined
      : livePeriod.state === "REQUESTED"
        ? t("inactivity:profileRow.requested", {
            month: formats.formatMonthTitle(livePeriod.fromMonth),
          })
        : livePeriod.toMonth == null
          ? t("inactivity:profileRow.open", {
              from: formats.formatMonthTitle(livePeriod.fromMonth),
            })
          : t("inactivity:profileRow.range", {
              from: formats.formatMonthTitle(livePeriod.fromMonth),
              to: formats.formatMonthTitle(livePeriod.toMonth),
            });
  const pendingLeave = leave?.requests.find((item) => item.state === "PENDING");
  const leaveSubtitle =
    leave?.plannedLeave != null
      ? t("leave:profileRow.planned", {
          date: formats.formatPlainDate(leave.plannedLeave.date, "short"),
        })
      : pendingLeave === undefined
        ? undefined
        : t("leave:profileRow.requested", {
            date: formats.formatPlainDate(pendingLeave.requestedDate, "short"),
          });

  return (
    <>
      {failedCard === undefined ? null : <CardFailureBanner client={client} invoice={failedCard} />}
      <Card className="profile-list profile-list--final">
        {branding.modules.includes("BILLING") ? (
          <a href="/rebuts">
            <Icon aria-hidden="true" name="doc" />
            <span>{t("billing:title")}</span>
            <Icon aria-hidden="true" name="chev" />
          </a>
        ) : null}
        {branding.modules.includes("INACTIVITY") && inactivityApplicable ? (
          <a href="/inactivitat">
            <Icon aria-hidden="true" name="palm" />
            <span>{t("auth:profile.inactivity")}</span>
            {inactivitySubtitle === undefined ? null : <small>{inactivitySubtitle}</small>}
            <Icon aria-hidden="true" name="chev" />
          </a>
        ) : null}
        <a className="profile-list__muted" href="/baixa">
          <Icon aria-hidden="true" name="ban" />
          <span>{t("auth:profile.leave")}</span>
          {leaveSubtitle === undefined ? null : <small>{leaveSubtitle}</small>}
          <Icon aria-hidden="true" name="chev" />
        </a>
        <button
          className="profile-list__logout"
          disabled={logoutDisabled}
          onClick={onLogout}
          type="button"
        >
          <Icon aria-hidden="true" name="unlock" />
          <span>{t("auth:profile.logout")}</span>
          <Icon aria-hidden="true" name="chev" />
        </button>
      </Card>
    </>
  );
}
