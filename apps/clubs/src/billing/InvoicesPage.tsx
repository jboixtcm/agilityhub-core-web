import {
  isApiError,
  type ApiClient,
  type components,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Card, Chip, EmptyState, Skeleton, useToast } from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Invoice = components["schemas"]["MeInvoice"];
type PaymentMethod = components["schemas"]["MePaymentMethod"];

const tones = {
  CANCELLED: "neutral",
  COLLECTING: "warning",
  FAILED: "danger",
  PAID: "success",
  PENDING: "warning",
} as const;

function isFullyRefunded(invoice: Invoice): boolean {
  return (
    invoice.status === "PAID" &&
    invoice.refundedTotal.amountMinor === invoice.total.amountMinor
  );
}

export function CardFailureBanner({
  client,
  invoice,
}: {
  client: ApiClient;
  invoice: Invoice | undefined;
}) {
  const { t } = useTranslation("billing");
  const formats = useClubFormats();
  const toast = useToast();
  const keys = useSubmissionKeys();
  const [pending, setPending] = useState(false);

  const update = async () => {
    const body = { cancelUrl: window.location.href, successUrl: window.location.href };
    setPending(true);
    try {
      const response = await keys.send(JSON.stringify(["card-setup", body]), (key) =>
        client.POST("/me/card-setup", { body, params: { header: { "Idempotency-Key": key } } }),
      );
      if (response.data !== undefined) window.location.assign(response.data.checkoutUrl);
    } catch {
      toast.push(t("billing:cardBanner.error"), "danger");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="billing-card-banner" role="alert">
      <strong>
        {invoice === undefined
          ? t("billing:cardBanner.invalid")
          : t("billing:cardBanner.title", { month: formats.formatMonthTitle(invoice.period) })}
      </strong>
      <Button
        disabled={pending}
        loading={pending}
        onClick={() => void update()}
        variant="secondary"
      >
        {pending ? t("billing:cardBanner.working") : t("billing:cardBanner.action")}
      </Button>
    </Card>
  );
}

function ReceiptRow({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation(["billing", "enums"]);
  const formats = useClubFormats();
  return (
    <a className="receipt-row" href={`/rebuts/${invoice.id}`}>
      <span>
        <span className="ah-sr-only">
          {t("billing:list.receipt", { number: invoice.displayNumber })}.{" "}
        </span>
        <strong>{formats.formatMonthTitle(invoice.period)}</strong>
        <small>{invoice.lines[0]?.description}</small>
      </span>
      <span className="receipt-row__meta">
        <b>{formats.formatMoney(invoice.total.amountMinor / 100)}</b>
        <Badge tone={tones[invoice.status]}>
          {isFullyRefunded(invoice)
            ? t("enums:invoiceStatus.REFUNDED")
            : t(`enums:invoiceStatus.${invoice.status}`)}
        </Badge>
        {invoice.familyGroup ? <Chip>{t("billing:familyGroup")}</Chip> : null}
      </span>
    </a>
  );
}

function Detail({ client, id }: { client: ApiClient; id: string }) {
  const { t } = useTranslation(["billing", "enums", "errors"]);
  const formats = useClubFormats();
  const [invoice, setInvoice] = useState<Invoice>();
  const [state, setState] = useState<"loading" | "ready" | "error" | "moduleOff">("loading");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  useEffect(() => {
    let active = true;
    void client.GET("/me/invoices/{id}", { params: { path: { id } } }).then(
      ({ data }) => {
        if (active && data !== undefined) {
          setInvoice(data);
          setState("ready");
        }
      },
      (cause: unknown) => {
        if (active) setState(isApiError(cause, "MODULE_DISABLED") ? "moduleOff" : "error");
      },
    );
    return () => {
      active = false;
    };
  }, [client, id]);
  const download = async () => {
    const tab = window.open("", "_blank");
    setDownloading(true);
    setDownloadError(false);
    try {
      const { data } = await client.GET("/me/invoices/{id}/document", {
        params: { path: { id } },
        parseAs: "blob",
      });
      if (data === undefined) throw new TypeError("Missing PDF");
      const url = URL.createObjectURL(data);
      if (tab !== null) tab.location.href = url;
      else window.location.assign(url);
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch {
      tab?.close();
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="billing-page">
      <header className="billing-page__bar">
        <a aria-label={t("billing:back")} href="/rebuts">
          ‹
        </a>
        <h1>{t("billing:detail.title")}</h1>
      </header>
      {state === "moduleOff" ? (
        <EmptyState
          description={t("errors:MODULE_DISABLED")}
          title={t("errors:MODULE_DISABLED")}
        />
      ) : state === "error" ? (
        <EmptyState description={t("billing:loadError")} title={t("billing:loadError")} />
      ) : state === "loading" || invoice === undefined ? (
        <Skeleton height="12rem" label={t("billing:loading")} />
      ) : (
        <Card className="receipt-detail">
          <div className="receipt-detail__heading">
            <strong>{invoice.displayNumber}</strong>
            <Badge tone={tones[invoice.status]}>
              {isFullyRefunded(invoice)
                ? t("enums:invoiceStatus.REFUNDED")
                : t(`enums:invoiceStatus.${invoice.status}`)}
            </Badge>
          </div>
          <p>{formats.formatMonthTitle(invoice.period)}</p>
          <table>
            <caption className="ah-sr-only">{t("billing:detail.lines")}</caption>
            <thead>
              <tr>
                <th>{t("billing:detail.description")}</th>
                <th>{t("billing:detail.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, index) => (
                <tr key={`${line.origin}-${String(index)}`}>
                  <td>{line.description}</td>
                  <td>{formats.formatMoney(line.total.amountMinor / 100)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{t("billing:detail.total")}</th>
                <td>{formats.formatMoney(invoice.total.amountMinor / 100)}</td>
              </tr>
            </tfoot>
          </table>
          <p>
            <strong>{t("billing:detail.paymentMethod")}</strong>
            <br />
            {t(`enums:paymentMethodType.${invoice.paymentMethod.type}`)}
            {invoice.paymentMethod.maskedAccount == null
              ? ""
              : ` · ${invoice.paymentMethod.maskedAccount}`}
          </p>
          {downloadError ? <p role="alert">{t("billing:detail.downloadError")}</p> : null}
          <Button disabled={downloading} loading={downloading} onClick={() => void download()}>
            {downloading ? t("billing:detail.downloading") : t("billing:detail.download")}
          </Button>
        </Card>
      )}
    </div>
  );
}

export function InvoicesPage({
  client,
  invoiceId,
  paymentMethod,
}: {
  client: ApiClient;
  invoiceId?: string;
  paymentMethod?: PaymentMethod;
}) {
  const { t } = useTranslation(["billing", "errors"]);
  const [items, setItems] = useState<Invoice[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error" | "moduleOff">("loading");
  const load = useCallback(
    async (next: number) => {
      if (next > 0) setLoadingMore(true);
      try {
        const { data } = await client.GET("/me/invoices", {
          params: { query: { page: next, size: 20 } },
        });
        if (data === undefined) throw new TypeError("Missing receipts");
        setItems((current) => {
          if (next === 0) return data.items;
          const byId = new Map(current.map((item) => [item.id, item]));
          for (const item of data.items) byId.set(item.id, item);
          return [...byId.values()];
        });
        setPage(data.page);
        setTotalPages(data.totalPages);
        setState("ready");
      } catch (cause) {
        setState(isApiError(cause, "MODULE_DISABLED") ? "moduleOff" : "error");
      } finally {
        if (next > 0) setLoadingMore(false);
      }
    },
    [client],
  );
  useEffect(() => {
    if (invoiceId !== undefined) return undefined;
    let active = true;
    void client.GET("/me/invoices", { params: { query: { page: 0, size: 20 } } }).then(
      ({ data }) => {
        if (!active) return;
        if (data === undefined) {
          setState("error");
          return;
        }
        setItems(data.items);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setState("ready");
      },
      (cause: unknown) => {
        if (active) setState(isApiError(cause, "MODULE_DISABLED") ? "moduleOff" : "error");
      },
    );
    return () => {
      active = false;
    };
  }, [client, invoiceId]);
  if (invoiceId !== undefined) return <Detail client={client} id={invoiceId} />;
  const latestInvoice = items[0];
  const failedCard =
    latestInvoice?.status === "FAILED" && latestInvoice.paymentMethod.type === "CARD"
      ? latestInvoice
      : undefined;
  const invalidCard =
    failedCard !== undefined ||
    (paymentMethod?.type === "CARD" && paymentMethod.invalid === true);
  return (
    <div className="billing-page">
      <header className="billing-page__bar">
        <a aria-label={t("billing:back")} href="/perfil">
          ‹
        </a>
        <h1>{t("billing:title")}</h1>
      </header>
      {!invalidCard ? null : (
        <CardFailureBanner client={client} invoice={failedCard} />
      )}
      {state === "loading" ? (
        <Skeleton height="12rem" label={t("billing:loading")} />
      ) : state === "error" ? (
        <EmptyState
          action={
            <Button
              onClick={() => {
                setState("loading");
                void load(0);
              }}
            >
              {t("billing:retry")}
            </Button>
          }
          description={t("billing:loadError")}
          title={t("billing:loadError")}
        />
      ) : state === "moduleOff" ? (
        <EmptyState
          description={t("errors:MODULE_DISABLED")}
          title={t("errors:MODULE_DISABLED")}
        />
      ) : items.length === 0 ? (
        <EmptyState description={t("billing:empty")} title={t("billing:empty")} />
      ) : (
        <Card className="receipt-list">
          {items.map((item) => (
            <ReceiptRow invoice={item} key={item.id} />
          ))}
        </Card>
      )}
      {page + 1 < totalPages ? (
        <Button
          disabled={loadingMore}
          loading={loadingMore}
          onClick={() => void load(page + 1)}
          variant="secondary"
        >
          {t("billing:list.more")}
        </Button>
      ) : null}
    </div>
  );
}
