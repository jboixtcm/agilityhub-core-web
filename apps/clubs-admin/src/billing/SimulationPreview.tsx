import type { components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, Card, Input } from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** The saved simulation's forecast, never the list of issued invoices. */
export function SimulationPreview({ items }: { items: components["schemas"]["InvoicePreview"][] }) {
  const { t } = useTranslation(["admin-billing", "enums"]);
  const formats = useClubFormats();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = search.trim().toLocaleLowerCase();
  const rows = items.filter((item) =>
    [item.memberName, ...item.lines.map((line) => line.description)].some((value) =>
      value.toLocaleLowerCase().includes(query),
    ),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const current = Math.min(page, pages - 1);
  return (
    <Card className="billing-preview">
      <h2>{t("admin-billing:simulation.previewTitle")}</h2>
      <p>{t("admin-billing:simulation.previewHelp")}</p>
      <label>
        {t("admin-billing:simulation.previewSearch")}
        <Input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(0);
          }}
        />
      </label>
      <p role="status">{t("admin-billing:simulation.previewCount", { count: rows.length })}</p>
      <div className="ah-universal-list">
        <div className="ah-universal-list__table-wrap">
          <table>
            <caption className="ah-sr-only">{t("admin-billing:simulation.previewTitle")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("admin-billing:list.columns.member")}</th>
                <th scope="col">{t("admin-billing:list.columns.paymentMethodType")}</th>
                <th scope="col">{t("admin-billing:list.columns.total")}</th>
                <th scope="col">{t("admin-billing:simulation.previewLines")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(current * 20, (current + 1) * 20).map((item, index) => (
                <tr key={`${item.memberId}:${item.invoiceId ?? String(current * 20 + index)}`}>
                  <td>
                    <a href={`/abonats/${encodeURIComponent(item.memberId)}`}>{item.memberName}</a>
                  </td>
                  <td>{t(`enums:paymentMethodType.${item.paymentMethodType}`)}</td>
                  <td>{formats.formatMoneyMinor(item.total)}</td>
                  <td>
                    <details>
                      <summary>{t("admin-billing:simulation.previewLines")}</summary>
                      <ul>
                        {item.lines.map((line, lineIndex) => (
                          <li key={lineIndex}>
                            {line.description} · {formats.formatMoneyMinor(line.total)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <nav
        aria-label={t("admin-billing:simulation.previewTitle")}
        className="billing-preview__pages"
      >
        <Button
          variant="secondary"
          disabled={current === 0}
          onClick={() => {
            setPage(current - 1);
          }}
        >
          {t("admin-billing:simulation.previewPrevious")}
        </Button>
        <span>
          {current + 1} / {pages}
        </span>
        <Button
          variant="secondary"
          disabled={current + 1 >= pages}
          onClick={() => {
            setPage(current + 1);
          }}
        >
          {t("admin-billing:simulation.previewNext")}
        </Button>
      </nav>
    </Card>
  );
}
