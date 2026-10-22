import {
  apiFieldErrors,
  isApiError,
  type ApiClient,
  type components,
} from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Drawer, FormField, Input, useBranding } from "@agilityhub/ui";
import { type ReactNode, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

import { clubToday, periodEnd, shiftPeriod } from "../billing/shared";
import { isReadmissionPending } from "../dashboard/readmission";
import { ReadmissionPendingMessage } from "../dashboard/ReadmissionPendingMessage";

/** D6's `NO_NEXT_INVOICE_DATE` link opens the date's drawer on D10 (E146). */
export const NEXT_INVOICE_DRAWER = "proper-rebut";

/** `?calaix=proper-rebut` leaves the address once the drawer it opened is closed (E164 (d)). */
function forgetDrawerRequest(): void {
  const address = new URL(window.location.href);
  if (address.searchParams.get("calaix") !== NEXT_INVOICE_DRAWER) return;
  address.searchParams.delete("calaix");
  window.history.replaceState(
    window.history.state,
    "",
    `${address.pathname}${address.search}${address.hash}`,
  );
}

/**
 * D10's «Proper rebut» row of «Dades i pagament» (mockup D10, E146, E164 (c)): the date and the
 * amount of the next receipt, the edit action, and its drawer (`PUT /members/{id}/next-invoice-date`
 * with a reason). A monthly member without a date reads «Sense data: no es facturarà» (R-12-07).
 * Nothing is drawn for a member without a date who is not monthly: the run never bills it.
 */
export function MemberNextInvoice({
  client,
  drawerRequested = false,
  memberId,
  monthly,
  nextInvoice,
  nextInvoiceDate,
  onChanged,
  readOnly = false,
  row,
}: {
  client: ApiClient;
  /** The address asks for the drawer (`?calaix=proper-rebut`, D6's incident link). */
  drawerRequested?: boolean;
  memberId: string;
  /** The member's plan is `MONTHLY` (`undefined` while the plan is read). */
  monthly: boolean | undefined;
  /** `MemberOverview.nextInvoice`: the api's next receipt, date and amount. */
  nextInvoice: components["schemas"]["NextInvoice"] | undefined;
  /** `Member.nextInvoiceDate` (club-local `YYYY-MM-DD`, `null` without one). */
  nextInvoiceDate: string | null;
  onChanged: (date: string) => void;
  readOnly?: boolean;
  /** The data card's row, given its label and its content. */
  row: (label: string, content: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(nextInvoiceDate ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  // The api's answer until D10 reads the member again (then the record's date is the truth).
  const [saved, setSaved] = useState<{ base: string | null; date: string }>();
  const shownDate = saved?.base === nextInvoiceDate ? saved.date : nextInvoiceDate;
  const date = shownDate ?? nextInvoice?.date ?? null;
  // A date to read or correct, or a monthly member the run will skip without one.
  const shown = date !== null || monthly === true;
  // E146: from the 1st of the club's month twelve months back to the end of the month twelve ahead.
  const clubMonth = clubToday(branding.timeZone).slice(0, 7);
  const min = `${shiftPeriod(clubMonth, -12)}-01`;
  const max = periodEnd(shiftPeriod(clubMonth, 12));

  const openDrawer = () => {
    setFailure(undefined);
    setDraft(date ?? "");
    setReason("");
    setOpen(true);
  };
  const close = () => {
    if (pending) return;
    setOpen(false);
    forgetDrawerRequest();
  };

  // D6's link opens the drawer once the row is there to edit (E164 (d)): only for a monthly member
  // or one with a date; the plan may still be on its way when the record draws. Adopted while
  // rendering, once (React's «adjusting state when a prop changes»).
  const [requestHandled, setRequestHandled] = useState(false);
  if (drawerRequested && !requestHandled && !readOnly && shown) {
    setRequestHandled(true);
    setFailure(undefined);
    setDraft(date ?? "");
    setReason("");
    setOpen(true);
  }

  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFailure(undefined);
    const body = { nextInvoiceDate: draft, reason: reason.trim() };
    try {
      const result = await client.PUT("/members/{id}/next-invoice-date", {
        body,
        params: { path: { id: memberId } },
      });
      const next = result.data?.nextInvoiceDate ?? body.nextInvoiceDate;
      setSaved({ base: nextInvoiceDate, date: next });
      setOpen(false);
      forgetDrawerRequest();
      onChanged(next);
    } catch (cause) {
      setFailure(cause);
    } finally {
      setPending(false);
    }
  };

  const fields = apiFieldErrors(failure).map((entry) => entry.field);
  const dateError = fields.includes("nextInvoiceDate")
    ? t("admin-census:member.billing.nextInvoice.range", {
        from: formats.formatPlainDate(min),
        to: formats.formatPlainDate(max),
      })
    : undefined;
  const reasonError = fields.includes("reason") ? t("errors:VALIDATION_ERROR") : undefined;
  const alert =
    failure === undefined ||
    (fields.length > 0 &&
      fields.every(
        (field) => field === "nextInvoiceDate" || field === "reason",
      )) ? null : isReadmissionPending(failure) ? (
      // S04 R-04-06: a record frozen by a pending readmission points to D2.
      <ReadmissionPendingMessage memberId={memberId} />
    ) : isApiError(failure) ? (
      t(`errors:${failure.code}`, { defaultValue: t("admin-census:common.genericError") })
    ) : (
      t("admin-census:common.genericError")
    );

  if (!shown) return null;
  return (
    <>
      {row(
        t("admin-census:member.fields.nextInvoice"),
        <>
          {date === null ? (
            // R-12-07 (A39): a monthly member without a date is a simulation incident.
            <Badge tone="warning">{t("admin-census:member.billing.nextInvoice.none")}</Badge>
          ) : (
            <>
              <strong>{formats.formatPlainDate(date, "short")}</strong>
              {/* The amount is the api's next receipt: shown while it is the date shown. */}
              {nextInvoice?.date === date
                ? ` · ${formats.formatMoneyMinor(nextInvoice.amount)}`
                : null}
            </>
          )}{" "}
          {readOnly ? null : (
            <Button
              aria-label={t("admin-census:member.billing.nextInvoice.edit")}
              className="census-record__inline-action"
              onClick={openDrawer}
              variant="ghost"
            >
              {t("admin-census:common.edit")}
            </Button>
          )}
        </>,
      )}
      <Drawer
        closeLabel={t("admin-census:common.close")}
        onClose={close}
        open={open && !readOnly}
        title={t("admin-census:member.billing.nextInvoice.title")}
      >
        <form className="census-record__form" onSubmit={(event) => void save(event)}>
          <fieldset className="member-billing__fields" disabled={pending}>
            <FormField
              {...(dateError === undefined ? {} : { error: dateError })}
              id="next-invoice-date"
              label={t("admin-census:member.billing.nextInvoice.date")}
            >
              <Input
                id="next-invoice-date"
                max={max}
                min={min}
                onChange={(event) => {
                  setDraft(event.currentTarget.value);
                }}
                required
                type="date"
                value={draft}
              />
            </FormField>
            <FormField
              {...(reasonError === undefined ? {} : { error: reasonError })}
              id="next-invoice-reason"
              label={t("admin-census:member.billing.reason")}
            >
              <Input
                id="next-invoice-reason"
                maxLength={200}
                onChange={(event) => {
                  setReason(event.currentTarget.value);
                }}
                required
                value={reason}
              />
            </FormField>
          </fieldset>
          {alert === null ? null : <p role="alert">{alert}</p>}
          <div className="census-record__dialog-actions">
            <Button disabled={pending} onClick={close} variant="ghost">
              {t("admin-census:common.cancel")}
            </Button>
            <Button disabled={pending} loading={pending} type="submit">
              {t("admin-census:common.save")}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
