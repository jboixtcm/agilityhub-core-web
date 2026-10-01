import {
  type ApiClient,
  type components,
  isApiError,
  itemsWith,
  listFields,
  type SubmissionKeys,
} from "@agilityhub/api-client";
import { Button, Checkbox, FormField, Input, Modal, Textarea, useBranding } from "@agilityhub/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { errorFields, type Invoice, minorUnits, useBillingErrorMessage } from "./shared";

type MemberListItem = components["schemas"]["MemberListItem"];

const MEMBER_FIELDS = ["fullName"] as const;
const SEARCH_FIELDS = ["fullName", "memberNumber", "paymentMethod"];
const SEARCH_DEBOUNCE_MS = 300;
/** `ManualInvoiceLine.description` (`maxLength` of the contract: the SEPA remittance text). */
const DESCRIPTION_MAX = 140;

type Member = MemberListItem & { fullName: string };

interface LineDraft {
  amount: string;
  description: string;
  id: number;
  taxPercent: string;
}

function emptyLine(id: number): LineDraft {
  return { amount: "", description: "", id, taxPercent: "0" };
}

type LinePart = "amount" | "description" | "tax";

/**
 * Which input of line `index` an api `VALIDATION_ERROR` field names: `lines[i]` itself, or one of its
 * members (`lines[i].description`, `lines[i].base…`, `lines[i].taxPercent`); the contract does not
 * fix the path syntax, so any `lines[i].…` lands on the line.
 */
function linePart(field: string, index: number): LinePart | undefined {
  const prefix = `lines[${String(index)}]`;
  if (field === prefix) return "description";
  if (!field.startsWith(`${prefix}.`)) return undefined;
  const member = field.slice(prefix.length + 1);
  if (member.startsWith("base")) return "amount";
  if (member.startsWith("taxPercent")) return "tax";
  return "description";
}

/**
 * [＋ Rebut manual] (R-12-19): an adjustment receipt for one member, with its own lines (positive or
 * negative), collected by hand or, for a direct-debit member, with the next run's remittance. The
 * member comes from the census search (`GET /members?q=`), as D5 finds them.
 */
export function ManualInvoiceModal({
  client,
  keys,
  onClose,
  onCreated,
}: {
  client: ApiClient;
  keys: SubmissionKeys;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}) {
  const { t } = useTranslation(["admin-billing", "errors"]);
  const branding = useBranding();
  const errorMessage = useBillingErrorMessage();
  const [query, setQuery] = useState("");
  // The last answer, with the text it answers: a list for an older text is never shown.
  const [found, setFound] = useState<{ members: Member[]; text: string }>();
  const [member, setMember] = useState<Member>();
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(1)]);
  const nextLine = useRef(2);
  const [includeInNextRun, setIncludeInNextRun] = useState(false);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const sepa = member?.paymentMethod?.type === "SEPA_DD";
  const fields = errorFields(failure);

  const text = query.trim();
  const members = found?.text === text ? found.members : [];
  const searching = text !== "" && found?.text !== text;

  // The census search, debounced; an older answer never replaces a newer query's.
  useEffect(() => {
    if (text === "") return undefined;
    let current = true;
    const timeout = window.setTimeout(() => {
      void client
        .GET("/members", {
          params: {
            query: {
              fields: listFields(SEARCH_FIELDS),
              filter: ["status:eq:ACTIVE"],
              page: 0,
              q: text,
              size: 20,
              sort: ["lastName,asc"],
            },
          },
        })
        .then(
          (result) => {
            if (current) {
              setFound({ members: itemsWith(result.data?.items ?? [], MEMBER_FIELDS), text });
            }
          },
          () => {
            if (current) setFound({ members: [], text });
          },
        );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [client, text]);

  const parsed = lines.map((line) => ({
    amountMinor: minorUnits(line.amount, branding.currency),
    description: line.description.trim(),
    line,
    taxPercent: Number(line.taxPercent.replace(",", ".")),
  }));
  const apiError = t("errors:VALIDATION_ERROR");
  const lineErrors = parsed.map((item, index) => {
    const parts = new Set(fields.map((field) => linePart(field, index)));
    return {
      amount:
        item.amountMinor === undefined || item.amountMinor === 0
          ? t("admin-billing:manual.amountRequired")
          : undefined,
      apiAmount: parts.has("amount") ? apiError : undefined,
      apiDescription: parts.has("description") ? apiError : undefined,
      apiTax: parts.has("tax") ? apiError : undefined,
      description:
        item.description === "" ? t("admin-billing:manual.descriptionRequired") : undefined,
      tax:
        Number.isFinite(item.taxPercent) && item.taxPercent >= 0 && item.taxPercent <= 100
          ? undefined
          : t("admin-billing:manual.taxInvalid"),
    };
  });
  // The fields this form shows an api error on; any other one reads in the general alert.
  const shownOnForm = (field: string) =>
    lines.some((_, index) => linePart(field, index) !== undefined) ||
    field === "memberId" ||
    field === "note" ||
    (field === "includeInNextRun" && sepa);
  const valid =
    member !== undefined &&
    lineErrors.every(
      (item) =>
        item.amount === undefined && item.description === undefined && item.tax === undefined,
    );

  const create = async () => {
    setSubmitted(true);
    if (!valid) return;
    setPending(true);
    setFailure(undefined);
    const body = {
      ...(sepa && includeInNextRun ? { includeInNextRun: true } : {}),
      lines: parsed.map((item) => ({
        base: { amountMinor: item.amountMinor ?? 0, currency: branding.currency },
        description: item.description,
        taxPercent: item.taxPercent,
      })),
      memberId: member.id,
      note: note.trim(),
    };
    try {
      const result = await keys.send(JSON.stringify(["manual-invoice", body]), (key) =>
        client.POST("/invoices", { body, params: { header: { "Idempotency-Key": key } } }),
      );
      if (result.data !== undefined) onCreated(result.data);
    } catch (error) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  const updateLine = (id: number, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const generalError =
    failure === undefined || (fields.length > 0 && fields.every(shownOnForm))
      ? undefined
      : isApiError(failure, "CURRENCY_MISMATCH")
        ? t("errors:CURRENCY_MISMATCH")
        : errorMessage(failure);

  return (
    <Modal
      closeLabel={t("admin-billing:actions.close")}
      dismissible={!pending}
      onClose={onClose}
      open
      title={t("admin-billing:manual.title")}
    >
      <form
        className="billing-manual"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <FormField
          {...(submitted && member === undefined
            ? { error: t("admin-billing:manual.memberRequired") }
            : fields.includes("memberId")
              ? { error: apiError }
              : {})}
          id="billing-manual-member"
          label={t("admin-billing:manual.member")}
        >
          <Input
            aria-describedby="billing-manual-member-results"
            autoComplete="off"
            id="billing-manual-member"
            onChange={(event) => {
              // A new search drops the choice: the receipt never goes to a member no longer shown.
              setQuery(event.currentTarget.value);
              setMember(undefined);
              setIncludeInNextRun(false);
            }}
            placeholder={t("admin-billing:manual.memberSearch")}
            type="search"
            value={query}
          />
        </FormField>
        <div aria-live="polite" id="billing-manual-member-results">
          {searching ? <p>{t("admin-billing:manual.memberSearching")}</p> : null}
          {!searching && query.trim() !== "" && members.length === 0 ? (
            <p>{t("admin-billing:manual.noMembers")}</p>
          ) : null}
          {members.length === 0 ? null : (
            <fieldset className="billing-manual__members">
              <legend className="ah-sr-only">{t("admin-billing:manual.member")}</legend>
              {members.map((candidate) => (
                <label key={candidate.id}>
                  <input
                    checked={member?.id === candidate.id}
                    name="billing-manual-member-choice"
                    onChange={() => {
                      setMember(candidate);
                      setIncludeInNextRun(false);
                    }}
                    type="radio"
                  />
                  {candidate.memberNumber === undefined
                    ? candidate.fullName
                    : t("admin-billing:manual.memberOption", {
                        name: candidate.fullName,
                        number: candidate.memberNumber,
                      })}
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <fieldset className="billing-manual__lines">
          <legend>{t("admin-billing:manual.lines")}</legend>
          {lines.map((line, index) => {
            const errors = lineErrors[index];
            const number = index + 1;
            return (
              <div className="billing-manual__line" key={line.id}>
                <FormField
                  {...(submitted && errors?.description !== undefined
                    ? { error: errors.description }
                    : errors?.apiDescription === undefined
                      ? {}
                      : { error: errors.apiDescription })}
                  id={`billing-manual-description-${String(line.id)}`}
                  label={t("admin-billing:manual.description", { index: number })}
                >
                  <Input
                    id={`billing-manual-description-${String(line.id)}`}
                    maxLength={DESCRIPTION_MAX}
                    onChange={(event) => {
                      updateLine(line.id, { description: event.currentTarget.value });
                    }}
                    value={line.description}
                  />
                </FormField>
                <FormField
                  {...(submitted && errors?.amount !== undefined
                    ? { error: errors.amount }
                    : errors?.apiAmount === undefined
                      ? {}
                      : { error: errors.apiAmount })}
                  id={`billing-manual-amount-${String(line.id)}`}
                  label={t("admin-billing:manual.amount", { index: number })}
                >
                  <Input
                    id={`billing-manual-amount-${String(line.id)}`}
                    inputMode="decimal"
                    onChange={(event) => {
                      updateLine(line.id, { amount: event.currentTarget.value });
                    }}
                    value={line.amount}
                  />
                </FormField>
                <FormField
                  {...(submitted && errors?.tax !== undefined
                    ? { error: errors.tax }
                    : errors?.apiTax === undefined
                      ? {}
                      : { error: errors.apiTax })}
                  id={`billing-manual-tax-${String(line.id)}`}
                  label={t("admin-billing:manual.taxPercent", { index: number })}
                >
                  <Input
                    id={`billing-manual-tax-${String(line.id)}`}
                    inputMode="decimal"
                    onChange={(event) => {
                      updateLine(line.id, { taxPercent: event.currentTarget.value });
                    }}
                    value={line.taxPercent}
                  />
                </FormField>
                {lines.length === 1 ? null : (
                  <Button
                    aria-label={t("admin-billing:manual.removeLine", { index: number })}
                    onClick={() => {
                      setLines((current) => current.filter((item) => item.id !== line.id));
                    }}
                    variant="ghost"
                  >
                    {t("admin-billing:manual.remove")}
                  </Button>
                )}
              </div>
            );
          })}
          <Button
            onClick={() => {
              const id = nextLine.current;
              nextLine.current += 1;
              setLines((current) => [...current, emptyLine(id)]);
            }}
            variant="secondary"
          >
            {t("admin-billing:manual.addLine")}
          </Button>
        </fieldset>

        {sepa ? (
          <>
            <label className="billing-manual__check">
              <Checkbox
                {...(fields.includes("includeInNextRun")
                  ? { "aria-describedby": "billing-manual-include-error", "aria-invalid": true }
                  : {})}
                checked={includeInNextRun}
                onChange={(event) => {
                  setIncludeInNextRun(event.currentTarget.checked);
                }}
              />
              {t("admin-billing:manual.includeInNextRun")}
            </label>
            {fields.includes("includeInNextRun") ? (
              <p className="billing-modal__error" id="billing-manual-include-error" role="alert">
                {apiError}
              </p>
            ) : null}
          </>
        ) : null}

        <FormField
          {...(fields.includes("note") ? { error: apiError } : {})}
          id="billing-manual-note"
          label={t("admin-billing:manual.note")}
        >
          <Textarea
            id="billing-manual-note"
            maxLength={500}
            onChange={(event) => {
              setNote(event.currentTarget.value);
            }}
            value={note}
          />
        </FormField>

        {generalError === undefined ? null : (
          <div className="billing-modal__error" role="alert">
            {generalError}
          </div>
        )}
        <div className="billing-modal__actions">
          <Button loading={pending} loadingLabel={t("admin-billing:manual.creating")} type="submit">
            {t("admin-billing:manual.create")}
          </Button>
          <Button disabled={pending} onClick={onClose} variant="ghost">
            {t("admin-billing:actions.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
