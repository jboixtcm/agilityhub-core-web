import {
  type ApiClient,
  type components,
  itemsWith,
  listFields,
  type SubmissionKeys,
} from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, FormField, Input, Modal, Select, useBranding } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  formatMoney,
  isPeriod,
  minorUnits,
  useBillingErrorMessage,
  useBillingLocale,
} from "./shared";

type Concept = components["schemas"]["InvoiceConceptView"];
interface Choice {
  id: string;
  fullName: string;
}

export function InvoiceConceptsModal({
  client,
  keys,
  period,
  onClose,
  onChanged,
}: {
  client: ApiClient;
  keys: SubmissionKeys;
  period: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation("admin-billing");
  const locale = useBillingLocale();
  const formats = useClubFormats();
  const { currency } = useBranding();
  const describeError = useBillingErrorMessage();
  const [rules, setRules] = useState<Concept[]>();
  const [listError, setListError] = useState<unknown>();
  const [reload, setReload] = useState(0);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("0");
  const [first, setFirst] = useState(period);
  const [recurring, setRecurring] = useState(false);
  const [end, setEnd] = useState("");
  const [allMembers, setAllMembers] = useState(false);
  const [selected, setSelected] = useState<Choice[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ query: string; items: Choice[] }>();
  const [searchError, setSearchError] = useState<{ query: string; error: unknown }>();
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<string>();
  const [notice, setNotice] = useState("");
  const text = query.trim();
  useEffect(() => {
    let active = true;
    void client.GET("/billing/concepts").then(
      (result) => {
        if (active) {
          setListError(undefined);
          setRules(result.data ?? []);
        }
      },
      (failure: unknown) => {
        if (active) setListError(failure);
      },
    );
    return () => {
      active = false;
    };
  }, [client, reload]);

  useEffect(() => {
    if (allMembers || text === "") return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      void client
        .GET("/members", {
          params: {
            query: {
              q: text,
              page: 0,
              size: 20,
              fields: listFields(["fullName", "memberNumber"]),
              sort: ["lastName,asc"],
            },
          },
        })
        .then(
          (result) => {
            if (active) {
              setSearchError(undefined);
              setSearch({
                query: text,
                items: itemsWith(result.data?.items ?? [], ["fullName"] as const),
              });
            }
          },
          (failure: unknown) => {
            if (active) setSearchError({ query: text, error: failure });
          },
        );
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [allMembers, client, text]);

  const cents = minorUnits(amount.trim().replace(/^\+/u, ""), currency);
  const percent = Number(tax.replace(",", "."));
  const valid =
    description.trim() !== "" &&
    cents !== undefined &&
    Number.isSafeInteger(cents) &&
    cents !== 0 &&
    tax.trim() !== "" &&
    Number.isFinite(percent) &&
    percent >= 0 &&
    percent <= 100 &&
    isPeriod(first) &&
    (!recurring || end >= first + "-01") &&
    (allMembers || selected.length > 0);

  async function save() {
    if (!valid || pending) return;
    const body = {
      description: description.trim(),
      amount: { amountMinor: cents, currency },
      taxPercent: percent,
      firstPeriod: first,
      ...(recurring ? { endsOn: end } : {}),
      allMembers,
      memberIds: allMembers ? [] : selected.map((member) => member.id),
    };
    setError(undefined);
    setPending(true);
    try {
      await keys.send(JSON.stringify(["invoice-concept", body]), (key) =>
        client.POST("/billing/concepts", { body, params: { header: { "Idempotency-Key": key } } }),
      );
      setDescription("");
      setAmount("");
      setSelected([]);
      setQuery("");
      setAllMembers(false);
      setNotice(t("admin-billing:concepts.saved"));
      setReload((n) => n + 1);
      onChanged();
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  async function cancel(id: string) {
    setPending(true);
    setError(undefined);
    try {
      await client.DELETE("/billing/concepts/{id}", { params: { path: { id } } });
      setConfirm(undefined);
      setNotice(t("admin-billing:concepts.stopped"));
      setReload((n) => n + 1);
      onChanged();
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      title={t("admin-billing:concepts.title")}
      closeLabel={t("admin-billing:actions.close")}
      dismissible={!pending}
      onClose={onClose}
    >
      <p>{t("admin-billing:concepts.help")}</p>
      <form
        className="billing-manual billing-concept-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormField id="concept-description" label={t("admin-billing:concepts.description")}>
          <Input
            id="concept-description"
            value={description}
            maxLength={140}
            required
            onChange={(e) => {
              setDescription(e.currentTarget.value);
            }}
          />
        </FormField>
        <FormField id="concept-amount" label={t("admin-billing:concepts.amount", { currency })}>
          <Input
            id="concept-amount"
            value={amount}
            inputMode="text"
            required
            onChange={(e) => {
              setAmount(e.currentTarget.value);
            }}
          />
        </FormField>
        <FormField id="concept-tax" label={t("admin-billing:concepts.tax")}>
          <Input
            id="concept-tax"
            type="number"
            min="0"
            max="100"
            step="any"
            value={tax}
            onChange={(e) => {
              setTax(e.currentTarget.value);
            }}
          />
        </FormField>
        <FormField id="concept-first" label={t("admin-billing:concepts.first")}>
          <Input
            id="concept-first"
            type="month"
            required
            value={first}
            onChange={(e) => {
              setFirst(e.currentTarget.value);
            }}
          />
        </FormField>
        <FormField id="concept-frequency" label={t("admin-billing:concepts.frequency")}>
          <Select
            id="concept-frequency"
            value={recurring ? "recurring" : "once"}
            onChange={(e) => {
              setRecurring(e.currentTarget.value === "recurring");
            }}
          >
            <option value="once">{t("admin-billing:concepts.once")}</option>
            <option value="recurring">{t("admin-billing:concepts.recurring")}</option>
          </Select>
        </FormField>
        {recurring && (
          <FormField id="concept-end" label={t("admin-billing:concepts.end")}>
            <Input
              id="concept-end"
              type="date"
              min={first + "-01"}
              required
              value={end}
              onChange={(e) => {
                setEnd(e.currentTarget.value);
              }}
            />
          </FormField>
        )}
        <FormField id="concept-recipients" label={t("admin-billing:concepts.recipients")}>
          <Select
            id="concept-recipients"
            value={allMembers ? "all" : "selected"}
            onChange={(e) => {
              setAllMembers(e.currentTarget.value === "all");
            }}
          >
            <option value="selected">{t("admin-billing:concepts.selection")}</option>
            <option value="all">{t("admin-billing:concepts.all")}</option>
          </Select>
        </FormField>
        {!allMembers && (
          <>
            <FormField id="concept-members" label={t("admin-billing:manual.memberSearch")}>
              <Input
                id="concept-members"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.currentTarget.value);
                }}
              />
            </FormField>
            {text && search?.query === text && (
              <ul>
                {search.items
                  .filter((member) => !selected.some((chosen) => chosen.id === member.id))
                  .map((member) => (
                    <li key={member.id}>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setSelected([...selected, member]);
                          setQuery("");
                        }}
                      >
                        {member.fullName}
                      </Button>
                    </li>
                  ))}
                {search.items.length === 0 && <li>{t("admin-billing:manual.noMembers")}</li>}
              </ul>
            )}
            {searchError?.query === text && <p role="alert">{describeError(searchError.error)}</p>}
            <ul aria-label={t("admin-billing:concepts.recipients")}>
              {selected.map((member) => (
                <li key={member.id}>
                  {member.fullName}{" "}
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t("admin-billing:concepts.removeMember", { name: member.fullName })}
                    onClick={() => {
                      setSelected(selected.filter((m) => m.id !== member.id));
                    }}
                  >
                    {t("admin-billing:concepts.remove")}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        <Button type="submit" disabled={!valid || pending}>
          {t("admin-billing:concepts.add")}
        </Button>
      </form>
      {error !== undefined && <p role="alert">{describeError(error)}</p>}
      <p role="status">{notice}</p>
      <h3 className="billing-concept-title">{t("admin-billing:concepts.scheduled")}</h3>
      {listError !== undefined && (
        <p role="alert">
          {describeError(listError)}{" "}
          <Button
            onClick={() => {
              setReload((n) => n + 1);
            }}
          >
            {t("admin-billing:concepts.retry")}
          </Button>
        </p>
      )}
      {rules?.length === 0 && <p>{t("admin-billing:concepts.empty")}</p>}
      <ul className="billing-concept-list">
        {rules?.map((rule) => (
          <li key={rule.id}>
            <strong>
              {rule.description} · {formatMoney(rule.amount, locale)}
            </strong>
            <div>
              {formats.formatPlainDate(rule.firstPeriod + "-01", "monthYear")}
              {rule.endsOn
                ? " – " + formats.formatPlainDate(rule.endsOn)
                : " · " + t("admin-billing:concepts.once")}
            </div>
            <div>
              {rule.allMembers ? t("admin-billing:concepts.all") : rule.memberNames.join(", ")}
            </div>
            {confirm === rule.id ? (
              <>
                <span>{t("admin-billing:concepts.stopConfirm")}</span>
                <Button
                  disabled={pending}
                  variant="ghost"
                  onClick={() => {
                    setConfirm(undefined);
                  }}
                >
                  {t("admin-billing:concepts.keep")}
                </Button>
                <Button disabled={pending} onClick={() => void cancel(rule.id)}>
                  {t("admin-billing:concepts.stop")}
                </Button>
              </>
            ) : (
              <Button
                disabled={pending}
                variant="ghost"
                onClick={() => {
                  setConfirm(rule.id);
                }}
              >
                {t("admin-billing:concepts.stop")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
