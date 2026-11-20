import type { ApiClient, components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, Card } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function OutstandingBalances({ client }: { client: ApiClient }) {
  const { t } = useTranslation("admin-billing");
  const formats = useClubFormats();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<components["schemas"]["OutstandingBalance"][]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    let current = true;
    void client
      .GET("/billing/outstanding-balances")
      .then(({ data }) => {
        if (data === undefined) throw new Error("Missing balances");
        if (current) setRows(data);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [client, open, attempt]);
  return (
    <Card>
      <Button
        variant="secondary"
        aria-expanded={open}
        onClick={() => {
          setRows(undefined);
          setFailed(false);
          setOpen(!open);
        }}
      >
        {t("admin-billing:outstanding.title")}
      </Button>
      {open &&
        (failed ? (
          <div role="alert">
            {t("admin-billing:outstanding.error")}{" "}
            <Button
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              {t("admin-billing:outstanding.retry")}
            </Button>
          </div>
        ) : rows === undefined ? (
          <p role="status">{t("admin-billing:list.loading")}</p>
        ) : rows.length === 0 ? (
          <p>{t("admin-billing:outstanding.empty")}</p>
        ) : (
          <div className="catalog-table-scroll">
            <table className="catalog-table">
              <caption className="ah-sr-only">{t("admin-billing:outstanding.title")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("admin-billing:outstanding.name")}</th>
                  <th scope="col">{t("admin-billing:outstanding.invoices")}</th>
                  <th scope="col">{t("admin-billing:outstanding.upfront")}</th>
                  <th scope="col">{t("admin-billing:outstanding.processing")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.memberId + row.invoices.currency}>
                    <th scope="row">
                      <a href={`/abonats/${encodeURIComponent(row.memberId)}`}>{row.memberName}</a>
                    </th>
                    <td>{formats.formatMoneyMinor(row.invoices)}</td>
                    <td>{formats.formatMoneyMinor(row.upfront)}</td>
                    <td>{formats.formatMoneyMinor(row.processing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </Card>
  );
}
