import {
  isApiError,
  itemsWith,
  listFields,
  type ApiClient,
  type components,
  type ListItemWith,
  uploadSigned,
} from "@agilityhub/api-client";
import { fmtMaskedIban, fmtPlainDate, isPlainDate, normalizeLocale } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  FormField,
  Icon,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, type SyntheticEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AuditTrail, auditActionLabel, auditRoleLabel } from "../audit/AuditPage";
import { useRefreshCounters } from "../dashboard/counters";
import { loadDogDocumentTypes } from "../dashboard/readmission";
import { NotificationPreferencesBlock } from "../messaging/NotificationPreferencesBlock";

import { MemberBillingBlock } from "./MemberBillingBlock";
import { MemberBookingsCard } from "./MemberBookingsCard";
import { MemberInactivityDrawer } from "./MemberInactivityDrawer";
import { MemberLeaveDrawer } from "./MemberLeaveDrawer";
import { MemberPaymentMethodDrawer } from "./MemberPaymentMethodDrawer";
import { MemberPlanDrawer } from "./MemberPlanDrawer";
type MemberOverview = components["schemas"]["MemberOverview"];
type MemberDetail = components["schemas"]["Member"];
type MemberPatchRequest = components["schemas"]["MemberPatch"];
type NotificationPreferences = components["schemas"]["NotificationPreferences"];

/**
 * `MemberOverview.notificationPreferences` is a free-form object in the contract: D10's block
 * renders it when it carries the preferences the api answers (`NotificationPreferences`).
 */
function isNotificationPreferences(value: unknown): value is NotificationPreferences {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<NotificationPreferences>;
  return (
    typeof candidate.emailByCategory === "object" &&
    Array.isArray(candidate.reminderOptionsMinutes) &&
    typeof candidate.modules === "object"
  );
}
type ApiDogDetail = components["schemas"]["DogDetail"];
type License = components["schemas"]["LicenseWithPendingFields"];
type Dog = Omit<components["schemas"]["Dog"], "licenses"> &
  components["schemas"]["DogPendingFields"] & { licenses: License[] };
type DogDetail = Omit<ApiDogDetail, "dog" | "licenses"> &
  Dog & {
    dog: Dog;
    licenses: License[];
  };
/** The transfer's new owner: the member list asked for the name only (`fields`). */
const TRANSFER_MEMBER_FIELDS = ["fullName"] as const;
type TransferMember = ListItemWith<components["schemas"]["MemberListItem"], "fullName">;
type DogPatchRequest = components["schemas"]["DogPatch"] &
  components["schemas"]["DogPatchPendingFields"];
type LevelSummary = components["schemas"]["LevelSummary"];
type DogDocument = components["schemas"]["DogDocument"];
type Plan = components["schemas"]["Plan"] & {
  billingMode?: components["schemas"]["PlanBillingMode"];
};
type Role = "ADMIN" | "INSTRUCTOR" | "MEMBER";
type MemberDialog =
  "block" | "impersonate" | "inactivity" | "leave" | "payment" | "plan" | "resend" | "roles" | null;

interface Feedback {
  message: string;
  tone: "danger" | "success";
}

type TranslationFunction = ReturnType<typeof useTranslation>["t"];

function pathId(): string {
  return decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) ?? "");
}

function formatDate(value: string, locale: string, withYear = true): string {
  if (isPlainDate(value)) {
    // R-06-14: a business date is the calendar day it names, whatever the zone.
    return fmtPlainDate(value, normalizeLocale(locale), withYear ? "short" : "dayMonthNumeric");
  }
  const date = new Date(value);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(date);
}

function formatMoney(value: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    currency,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function dogDetailView(value: ApiDogDetail): DogDetail {
  const dog = value.dog as Dog;
  return { ...value, ...dog, dog, licenses: value.licenses };
}

function mergeDogDetail(current: DogDetail, dog: Dog): DogDetail {
  return { ...current, ...dog, dog, licenses: dog.licenses, version: dog.version };
}

function errorText(error: unknown, t: TranslationFunction): string {
  if (isApiError(error)) {
    return t(`errors:${error.code}`, { defaultValue: t("admin-census:common.genericError") });
  }
  return t("admin-census:common.genericError");
}

function FeedbackMessage({ feedback }: { feedback: Feedback | undefined }) {
  if (feedback === undefined) {
    return null;
  }
  return (
    <div
      className={`census-record__feedback census-record__feedback--${feedback.tone}`}
      role={feedback.tone === "danger" ? "alert" : "status"}
    >
      {feedback.message}
    </div>
  );
}

function LoadingRecord() {
  const { t } = useTranslation("admin-census");
  return (
    <div aria-busy="true" className="census-record__loading" role="status">
      {t("admin-census:common.loading")}
    </div>
  );
}

/**
 * The record could not be read: a retry. An erased member (`409 MEMBER_ERASED`, S14 §5) is final
 * instead — its own message and nothing to retry (E7-W06, ruling E82 on E6-W04 Q3).
 */
function LoadError({ error, onRetry }: { error?: unknown; onRetry: () => void }) {
  const { t } = useTranslation(["admin-census", "errors"]);
  if (isApiError(error, "MEMBER_ERASED")) {
    return (
      <Card className="census-record__load-error">
        <p role="alert">{t("errors:MEMBER_ERASED")}</p>
      </Card>
    );
  }
  return (
    <Card className="census-record__load-error">
      <p role="alert">{t("admin-census:common.loadError")}</p>
      <Button onClick={onRetry} variant="secondary">
        {t("admin-census:common.retry")}
      </Button>
    </Card>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="census-record__section-title">{children}</h2>;
}

function DataRow({ label, children }: { children: ReactNode; label: string }) {
  return (
    <div className="census-record__data-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function MemberEditDrawer({
  client,
  erased,
  member,
  onClose,
  onErased,
  onSaved,
  open,
}: {
  client: ApiClient;
  /** The member is erased (S14 §5): the drawer sends nothing more. */
  erased: boolean;
  member: MemberDetail;
  onClose: () => void;
  onErased: () => void;
  onSaved: (member: MemberDetail) => void;
  open: boolean;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const [draft, setDraft] = useState(member);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();

  return (
    <Drawer
      closeLabel={t("admin-census:common.close")}
      onClose={onClose}
      open={open}
      title={t("admin-census:member.edit.title")}
    >
      <form
        className="census-record__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (erased) return;
          setPending(true);
          setFailure(undefined);
          const body: MemberPatchRequest = {
            address: draft.address,
            birthDate: draft.birthDate,
            // The core sends `null` for an optional value it does not have: read as absent.
            ...(draft.consents == null
              ? {}
              : {
                  consents: {
                    imageRights: { granted: draft.consents.imageRights.granted },
                  },
                }),
            contactEmails: draft.contactEmails.filter((item) => item.email.trim() !== ""),
            firstName: draft.firstName,
            gender: draft.gender,
            ...(draft.idDocument == null ? {} : { idDocument: draft.idDocument }),
            ...(draft.internalNotes == null ? {} : { internalNotes: draft.internalNotes }),
            lastName1: draft.lastName1,
            ...(draft.lastName2 == null ? {} : { lastName2: draft.lastName2 }),
            phones: draft.phones.filter((item) => item.number.trim() !== ""),
            ...(draft.remarks == null ? {} : { remarks: draft.remarks }),
            version: member.version,
          };
          void client
            .PATCH("/members/{id}", { body, params: { path: { id: member.id } } })
            .then((result) => {
              if (result.data === undefined) {
                throw new TypeError("Member response did not contain data");
              }
              onSaved(result.data);
            })
            .catch((error: unknown) => {
              // S14 §5 (E7-W07 step 3): erased meanwhile — final, nothing to send again.
              if (isApiError(error, "MEMBER_ERASED")) onErased();
              setFailure(errorText(error, t));
            })
            .finally(() => {
              setPending(false);
            });
        }}
      >
        <div className="census-record__form-grid">
          <FormField id="member-document-type" label={t("admin-census:member.fields.documentType")}>
            <Input
              id="member-document-type"
              onChange={(event) => {
                setDraft({
                  ...draft,
                  idDocument: {
                    number: draft.idDocument?.number ?? "",
                    type: event.currentTarget.value,
                  },
                });
              }}
              value={draft.idDocument?.type ?? ""}
            />
          </FormField>
          <FormField id="member-document-number" label={t("admin-census:member.fields.document")}>
            <Input
              id="member-document-number"
              onChange={(event) => {
                setDraft({
                  ...draft,
                  idDocument: {
                    number: event.currentTarget.value,
                    type: draft.idDocument?.type ?? "",
                  },
                });
              }}
              value={draft.idDocument?.number ?? ""}
            />
          </FormField>
          <FormField id="member-first-name" label={t("admin-census:member.fields.firstName")}>
            <Input
              id="member-first-name"
              onChange={(event) => {
                setDraft({ ...draft, firstName: event.currentTarget.value });
              }}
              value={draft.firstName}
            />
          </FormField>
          <FormField id="member-last-name-1" label={t("admin-census:member.fields.lastName1")}>
            <Input
              id="member-last-name-1"
              onChange={(event) => {
                setDraft({ ...draft, lastName1: event.currentTarget.value });
              }}
              value={draft.lastName1}
            />
          </FormField>
          <FormField id="member-last-name-2" label={t("admin-census:member.fields.lastName2")}>
            <Input
              id="member-last-name-2"
              onChange={(event) => {
                setDraft({ ...draft, lastName2: event.currentTarget.value });
              }}
              value={draft.lastName2 ?? ""}
            />
          </FormField>
          <FormField id="member-gender" label={t("admin-census:member.fields.gender")}>
            <Select
              id="member-gender"
              onChange={(event) => {
                setDraft({ ...draft, gender: event.currentTarget.value as MemberDetail["gender"] });
              }}
              value={draft.gender}
            >
              <option value="FEMALE">{t("admin-census:values.female")}</option>
              <option value="MALE">{t("admin-census:values.male")}</option>
              <option value="OTHER">{t("admin-census:values.other")}</option>
            </Select>
          </FormField>
          <FormField id="member-birth-date" label={t("admin-census:member.fields.birthDate")}>
            <Input
              id="member-birth-date"
              onChange={(event) => {
                setDraft({ ...draft, birthDate: event.currentTarget.value });
              }}
              type="date"
              value={draft.birthDate}
            />
          </FormField>
        </div>
        <fieldset className="census-record__fieldset">
          <legend>{t("admin-census:member.fields.emails")}</legend>
          {[0, 1].map((index) => (
            <FormField
              id={`member-email-${String(index)}`}
              key={index}
              label={t("admin-census:member.fields.email", { number: index + 1 })}
            >
              <Input
                id={`member-email-${String(index)}`}
                onChange={(event) => {
                  const contactEmails = [...draft.contactEmails];
                  contactEmails[index] = {
                    bounced: contactEmails[index]?.bounced ?? false,
                    email: event.currentTarget.value,
                  };
                  setDraft({ ...draft, contactEmails });
                }}
                required={index === 0}
                type="email"
                value={draft.contactEmails[index]?.email ?? ""}
              />
            </FormField>
          ))}
        </fieldset>
        <fieldset className="census-record__fieldset">
          <legend>{t("admin-census:member.fields.phones")}</legend>
          {[0, 1].map((index) => {
            const phone = draft.phones[index] ?? { label: "", number: "", prefix: "+34" };
            return (
              <div className="census-record__form-grid" key={index}>
                <FormField
                  id={`member-phone-prefix-${String(index)}`}
                  label={t("admin-census:member.fields.phonePrefix")}
                >
                  <Input
                    id={`member-phone-prefix-${String(index)}`}
                    onChange={(event) => {
                      const phones = [...draft.phones];
                      phones[index] = { ...phone, prefix: event.currentTarget.value };
                      setDraft({ ...draft, phones });
                    }}
                    value={phone.prefix}
                  />
                </FormField>
                <FormField
                  id={`member-phone-${String(index)}`}
                  label={t("admin-census:member.fields.phone", { number: index + 1 })}
                >
                  <Input
                    id={`member-phone-${String(index)}`}
                    onChange={(event) => {
                      const phones = [...draft.phones];
                      phones[index] = { ...phone, number: event.currentTarget.value };
                      setDraft({ ...draft, phones });
                    }}
                    required={index === 0}
                    type="tel"
                    value={phone.number}
                  />
                </FormField>
                <FormField
                  id={`member-phone-label-${String(index)}`}
                  label={t("admin-census:member.fields.phoneLabel")}
                >
                  <Input
                    id={`member-phone-label-${String(index)}`}
                    onChange={(event) => {
                      const phones = [...draft.phones];
                      phones[index] = { ...phone, label: event.currentTarget.value };
                      setDraft({ ...draft, phones });
                    }}
                    value={phone.label ?? ""}
                  />
                </FormField>
              </div>
            );
          })}
        </fieldset>
        <fieldset className="census-record__fieldset">
          <legend>{t("admin-census:member.fields.address")}</legend>
          <FormField id="member-street" label={t("admin-census:member.fields.street")}>
            <Input
              id="member-street"
              onChange={(event) => {
                setDraft({
                  ...draft,
                  address: { ...draft.address, street: event.currentTarget.value },
                });
              }}
              value={draft.address.street}
            />
          </FormField>
          <div className="census-record__form-grid">
            <FormField id="member-postal-code" label={t("admin-census:member.fields.postalCode")}>
              <Input
                id="member-postal-code"
                onChange={(event) => {
                  setDraft({
                    ...draft,
                    address: { ...draft.address, postalCode: event.currentTarget.value },
                  });
                }}
                value={draft.address.postalCode}
              />
            </FormField>
            <FormField id="member-city" label={t("admin-census:member.fields.city")}>
              <Input
                id="member-city"
                onChange={(event) => {
                  setDraft({
                    ...draft,
                    address: { ...draft.address, city: event.currentTarget.value },
                  });
                }}
                value={draft.address.city}
              />
            </FormField>
          </div>
        </fieldset>
        <FormField id="member-remarks" label={t("admin-census:member.fields.remarks")}>
          <Textarea
            id="member-remarks"
            onChange={(event) => {
              setDraft({ ...draft, remarks: event.currentTarget.value });
            }}
            value={draft.remarks ?? ""}
          />
        </FormField>
        <FormField id="member-internal-notes" label={t("admin-census:member.fields.internalNotes")}>
          <Textarea
            id="member-internal-notes"
            onChange={(event) => {
              setDraft({ ...draft, internalNotes: event.currentTarget.value });
            }}
            value={draft.internalNotes ?? ""}
          />
        </FormField>
        <label className="census-record__check-row">
          <Checkbox
            checked={draft.consents?.imageRights.granted ?? false}
            disabled={draft.consents == null}
            onChange={(event) => {
              if (draft.consents == null) return;
              setDraft({
                ...draft,
                consents: {
                  ...draft.consents,
                  imageRights: {
                    ...draft.consents.imageRights,
                    granted: event.currentTarget.checked,
                  },
                },
              });
            }}
          />
          {t("admin-census:member.fields.imageRights")}
        </label>
        {failure === undefined ? null : <p role="alert">{failure}</p>}
        <div className="census-record__dialog-actions">
          <Button onClick={onClose} variant="ghost">
            {t("admin-census:common.cancel")}
          </Button>
          {erased ? null : (
            <Button loading={pending} loadingLabel={t("admin-census:common.saving")} type="submit">
              {t("admin-census:common.save")}
            </Button>
          )}
        </div>
      </form>
    </Drawer>
  );
}

function MemberSummary({
  client,
  dialog,
  erased,
  overview,
  onChange,
  onErased,
  onFeedback,
  onReload,
  setDialog,
}: {
  client: ApiClient;
  dialog: MemberDialog;
  /** The member is erased (S14 §5): no change is offered, and an open dialog sends nothing more. */
  erased: boolean;
  onChange: (overview: MemberOverview) => void;
  onErased: () => void;
  onFeedback: (feedback: Feedback) => void;
  onReload: () => void;
  overview: MemberOverview;
  setDialog: (dialog: MemberDialog) => void;
}) {
  const branding = useBranding();
  // `admin-audit` names the actions and roles of «Darrers canvis» (S14 R-14-11).
  const { i18n, t } = useTranslation(["admin-census", "admin-audit", "errors"]);
  const member = overview.member;
  const modules = branding.modules;
  const locale = i18n.resolvedLanguage ?? branding.defaultLocale;
  const [reason, setReason] = useState("");
  const [roles, setRoles] = useState<Role[]>(member.roles as Role[]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [plan, setPlan] = useState<Plan>();
  const [documentTypeLabels, setDocumentTypeLabels] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const pendingDocuments = overview.dogs.some((dog) => dog.pendingDocuments.length > 0);
  const labelLanguage = i18n.resolvedLanguage ?? i18n.language;

  // A pending document is named by its type's label (`census.dogDocumentTypes`), as D2 does, never
  // by its key (E4-W13 report, question 4). While the labels load, or for a type the club no longer
  // lists, the chip reads «Document pendent».
  useEffect(() => {
    if (!pendingDocuments) return;
    let current = true;
    loadDogDocumentTypes(client, labelLanguage).then(
      (types) => {
        if (current) setDocumentTypeLabels(new Map(types.map((type) => [type.key, type.label])));
      },
      () => {
        if (current) setDocumentTypeLabels(new Map());
      },
    );
    return () => {
      current = false;
    };
  }, [client, labelLanguage, pendingDocuments]);

  useEffect(() => {
    let current = true;
    if (!modules.includes("BILLING") || member.planId === undefined) {
      return () => {
        current = false;
      };
    }
    void client
      .GET("/plans", { params: { query: { includeInactive: true } } })
      .then((result) => {
        if (!current) return;
        const plans = (result.data?.items ?? []) as Plan[];
        setPlan(plans.find((item) => item.id === member.planId));
      })
      .catch(() => {
        if (current) setPlan(undefined);
      });
    return () => {
      current = false;
    };
  }, [client, member.planId, modules]);

  /**
   * Sends one of the record's changes. Its failure shows in the open dialog or, for a change
   * without one («Desbloqueja les reserves»), on the page. A `409 MEMBER_ERASED` (the member was
   * erased after the record was read, S14 §5) is final: the record stops offering changes and the
   * dialog cannot send the request again (E7-W07 step 3).
   */
  const run = async (action: () => Promise<void>, failureOn: "dialog" | "page" = "dialog") => {
    setPending(true);
    setFailure(undefined);
    try {
      await action();
      setDialog(null);
    } catch (error) {
      if (isApiError(error, "MEMBER_ERASED")) onErased();
      if (failureOn === "page") onFeedback({ message: errorText(error, t), tone: "danger" });
      else setFailure(errorText(error, t));
    } finally {
      setPending(false);
    }
  };

  const imageNotice = member.consents?.imageRights.granted
    ? null
    : t("admin-census:member.imageNotice", { gender: member.gender });
  const roleLabel = (role: Role) =>
    role === "ADMIN"
      ? t("admin-census:roles.admin")
      : role === "INSTRUCTOR"
        ? t("admin-census:roles.instructor")
        : t("admin-census:roles.member");
  const contact = [
    ...member.contactEmails.map((item) => item.email),
    ...member.phones.map(
      (phone) => `${phone.prefix} ${phone.number}${phone.label == null ? "" : ` (${phone.label})`}`,
    ),
  ].join(" · ");
  const memberPlan = plan?.id === member.planId ? plan : undefined;
  const maskedIban = fmtMaskedIban(member.paymentMethod?.maskedAccount);

  return (
    <>
      <div className="census-record__grid">
        <Card>
          <SectionTitle>{t("admin-census:member.sections.dataPayment")}</SectionTitle>
          <dl className="census-record__data-list">
            <DataRow label={t("admin-census:member.fields.contact")}>{contact}</DataRow>
            {modules.includes("BILLING") && memberPlan !== undefined ? (
              <DataRow label={t("admin-census:member.fields.plan")}>
                <strong>{memberPlan.name}</strong>{" "}
                {erased ? null : (
                  <Button
                    className="census-record__inline-action"
                    onClick={() => {
                      setDialog("plan");
                    }}
                    variant="ghost"
                  >
                    {t("admin-census:common.edit")}
                  </Button>
                )}
              </DataRow>
            ) : null}
            {modules.includes("BILLING") && memberPlan?.billingMode !== undefined ? (
              <DataRow label={t("admin-census:member.fields.billingMode")}>
                {memberPlan.billingMode === "MAINTENANCE"
                  ? t("admin-census:member.billingMode.maintenance")
                  : t("admin-census:member.billingMode.monthlyFee")}
              </DataRow>
            ) : null}
            {modules.includes("BILLING") ? (
              <DataRow label={t("admin-census:member.fields.payment")}>
                {/* AGENTS rule 1 (E4-W17 step 9): the method's label, never the raw enum. */}
                {member.paymentMethod?.type === "SEPA_DD"
                  ? t("admin-census:member.payment.sepa")
                  : member.paymentMethod?.type === "CARD"
                    ? t("admin-census:signupReview.paymentMethod.CARD")
                    : member.paymentMethod?.type === "MANUAL"
                      ? t("admin-census:signupReview.paymentMethod.MANUAL")
                      : t("admin-census:values.empty")}
                {maskedIban === null ? null : <strong> · {maskedIban}</strong>}{" "}
                <Badge>{t("admin-census:member.payment.adminOnly")}</Badge>{" "}
                {erased ? null : (
                  <Button
                    className="census-record__inline-action"
                    onClick={() => {
                      setDialog("payment");
                    }}
                    variant="ghost"
                  >
                    {t("admin-census:common.edit")}
                  </Button>
                )}
              </DataRow>
            ) : null}
            {modules.includes("BILLING") && overview.nextInvoice !== undefined ? (
              <DataRow label={t("admin-census:member.fields.nextInvoice")}>
                <strong>{formatDate(overview.nextInvoice.date, locale)}</strong> ·{" "}
                {formatMoney(
                  overview.nextInvoice.amount.amountMinor / 100,
                  locale,
                  overview.nextInvoice.amount.currency,
                )}
              </DataRow>
            ) : null}
            <DataRow label={t("admin-census:member.fields.consents")}>
              {imageNotice === null ? null : (
                <Badge className="census-record__image-alert" tone="warning">
                  <Icon aria-hidden="true" name="warn" />
                  {imageNotice}
                </Badge>
              )}{" "}
              {t("admin-census:member.language", {
                locale: (isNotificationPreferences(overview.notificationPreferences)
                  ? overview.notificationPreferences.locale
                  : branding.defaultLocale
                ).toUpperCase(),
              })}
            </DataRow>
            <DataRow label={t("admin-census:member.fields.roles")}>
              <span className="census-record__badges">
                {(["MEMBER", "INSTRUCTOR", "ADMIN"] as const).map((role) => (
                  <Badge key={role} tone={member.roles.includes(role) ? "success" : "neutral"}>
                    {roleLabel(role)}
                  </Badge>
                ))}
              </span>{" "}
              {erased ? null : (
                <Button
                  className="census-record__inline-action"
                  onClick={() => {
                    setDialog("roles");
                  }}
                  variant="ghost"
                >
                  {t("admin-census:common.edit")}
                </Button>
              )}
            </DataRow>
            {modules.includes("FAMILY_GROUP") && overview.familyGroup !== undefined ? (
              <DataRow label={t("admin-census:member.fields.familyGroup")}>
                <span className="census-record__links">
                  {overview.familyGroup.members.map((familyMember) => (
                    <a href={`/abonats/${familyMember.id}`} key={familyMember.id}>
                      {familyMember.fullName}
                      {familyMember.memberNumber == null
                        ? null
                        : ` · ${t("admin-census:member.number", { number: familyMember.memberNumber })}`}
                    </a>
                  ))}
                </span>
              </DataRow>
            ) : null}
          </dl>
        </Card>

        <Card>
          <SectionTitle>{t("admin-census:member.sections.dogs")}</SectionTitle>
          <ul className="census-record__dog-list">
            {overview.dogs.map((dog) => (
              <li key={dog.id}>
                <a className="census-record__dog-link" href={`/gossos/${dog.id}`}>
                  <span>
                    <strong>{dog.name}</strong> · {dog.breed}
                  </span>
                  <span className="census-record__dog-details">
                    {dog.level === undefined ? null : (
                      <span className="census-level-chip">{dog.level.code}</span>
                    )}
                    {modules.includes("FREE_TRAINING") && dog.freeTrainingAllowed ? (
                      <Badge tone="success">
                        <Icon aria-hidden="true" name="check" />
                        {t("admin-census:values.freeTraining")}
                      </Badge>
                    ) : null}
                    {modules.includes("PACKS") && dog.pack !== undefined ? (
                      <span>
                        {t("admin-census:member.pack", {
                          date:
                            dog.pack.expiresOn === undefined
                              ? t("admin-census:values.empty")
                              : formatDate(dog.pack.expiresOn, locale, false).replaceAll("/", "-"),
                          remaining: dog.pack.remaining,
                          total: dog.pack.total,
                          used: dog.pack.total - dog.pack.remaining,
                        })}
                      </span>
                    ) : null}
                    {dog.pendingDocuments.map((document) => (
                      <Badge key={document} tone="warning">
                        {documentTypeLabels.get(document) ??
                          t("admin-census:member.documentPending")}
                      </Badge>
                    ))}
                    <Icon aria-hidden="true" name="chev" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>

        {/* E7-W01 round 2 #4: the block reads its own route, so it never depends on the free-form
            `MemberOverview.notificationPreferences` and never disappears. An erased member's
            preferences are refused (`409 MEMBER_ERASED`, S14 §5): the block says so as final,
            with nothing to read, save or retry (E7-W06, ruling E82 on E6-W04 Q3), also when
            another change found the member erased meanwhile (E7-W07 step 3). */}
        {erased ? (
          <Card className="notification-preferences">
            <SectionTitle>{t("admin-census:member.sections.preferences")}</SectionTitle>
            <p role="status">{t("errors:MEMBER_ERASED")}</p>
          </Card>
        ) : (
          <NotificationPreferencesBlock
            client={client}
            // One block per member: its saves on their way never mix with another member's.
            key={member.id}
            memberId={member.id}
            onFeedback={onFeedback}
          />
        )}

        {modules.includes("BILLING") ? (
          <MemberBillingBlock
            client={client}
            dogs={overview.dogs}
            memberId={member.id}
            onPackAdjusted={() => {
              onReload();
            }}
            readOnly={erased}
          />
        ) : null}

        {/* Audit and lifecycle actions stay available without BILLING (R-03-30). */}
        <Card>
          <SectionTitle>{t("admin-census:member.tabs.audit")}</SectionTitle>
          <div className="census-record__links census-record__links--horizontal">
            <a href={`/abonats/${member.id}/auditoria`}>
              <Icon aria-hidden="true" name="lock" />
              {t("admin-census:member.audit.all")}
            </a>
          </div>
          <p className="census-record__muted">
            <Icon aria-hidden="true" name="lock" /> {t("admin-census:member.audit.recent")}:{" "}
            {/* S14 R-14-11 / R-03-26: «{dd/mm} {action} ({role} {name})», with the labels of the
                action and of the role, never their codes (E7-W03 round 2 #5, AGENTS rule 1). */}
            {overview.recentAudit
              .map((audit) => {
                const values = {
                  action: auditActionLabel(t, audit.action),
                  date: formatDate(audit.at, locale, false),
                  role: auditRoleLabel(t, audit.actorRole),
                };
                return audit.actorName === undefined || audit.actorName === ""
                  ? t("admin-census:member.audit.entryWithoutName", values)
                  : t("admin-census:member.audit.entry", { ...values, name: audit.actorName });
              })
              .join(" · ")}
          </p>
          {/* S14 §5: an erased member takes no S03/S13 change (`409 MEMBER_ERASED`), so none is
              offered (E7-W07 step 3). */}
          {erased ? null : (
            <div className="census-record__footer-actions">
              {member.status === "LEFT" ? (
                <Button
                  onClick={() => {
                    setDialog("leave");
                  }}
                  variant="ghost"
                >
                  {t("admin-census:reactivation.action")}
                </Button>
              ) : modules.includes("INACTIVITY") ? (
                <Button
                  onClick={() => {
                    setDialog("inactivity");
                  }}
                  variant="ghost"
                >
                  <Icon aria-hidden="true" name="palm" />
                  {t("admin-census:member.actions.inactivity")}
                </Button>
              ) : null}
              {member.status === "LEFT" ? null : (
                <Button
                  onClick={() => {
                    if (member.bookingBlock.active) {
                      void run(async () => {
                        await client.DELETE("/members/{id}/booking-block", {
                          params: { path: { id: member.id } },
                        });
                        onChange({
                          ...overview,
                          member: { ...member, bookingBlock: { active: false } },
                        });
                        onFeedback({
                          message: t("admin-census:member.feedback.unblocked"),
                          tone: "success",
                        });
                      }, "page");
                    } else {
                      setDialog("block");
                    }
                  }}
                  variant="ghost"
                >
                  <Icon aria-hidden="true" name={member.bookingBlock.active ? "unlock" : "lock"} />
                  {member.bookingBlock.active
                    ? t("admin-census:member.actions.unblock")
                    : t("admin-census:member.actions.block")}
                </Button>
              )}
              {member.status === "LEFT" ? null : (
                <Button
                  onClick={() => {
                    setDialog("leave");
                  }}
                  variant="ghost"
                >
                  {t("admin-census:member.actions.leave")}
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* S08/S09 (E5-W03): the member's class and training bookings, read-only (R-08-19). */}
      <MemberBookingsCard client={client} memberId={member.id} />

      {modules.includes("TASKS") ? (
        <Card className="census-record__notes">
          <SectionTitle>{t("admin-census:member.sections.instructorNotes")}</SectionTitle>
          <dl className="census-record__data-list">
            {overview.dogs.map((dog) => (
              <DataRow key={dog.id} label={dog.name}>
                {t("admin-census:values.empty")}
              </DataRow>
            ))}
          </dl>
        </Card>
      ) : null}

      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setDialog(null);
        }}
        open={dialog === "resend"}
        title={t("admin-census:member.resend.title")}
      >
        <p>{t("admin-census:member.resend.description")}</p>
        {failure === undefined ? null : <p role="alert">{failure}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setDialog(null);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          {erased ? null : (
            <Button
              loading={pending}
              onClick={() =>
                void run(async () => {
                  const result = await client.POST("/members/{id}/access-resend", {
                    params: { path: { id: member.id } },
                  });
                  if (result.data === undefined) {
                    throw new TypeError("Access response did not contain data");
                  }
                  onFeedback({
                    message: t("admin-census:member.feedback.accessSent", {
                      email: result.data.sentTo,
                    }),
                    tone: "success",
                  });
                })
              }
            >
              {t("admin-census:member.actions.resend")}
            </Button>
          )}
        </div>
      </Modal>

      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setDialog(null);
        }}
        open={dialog === "impersonate"}
        title={t("admin-census:member.impersonate.title")}
      >
        <p>{t("admin-census:member.impersonate.description")}</p>
        <FormField id="impersonation-reason" label={t("admin-census:member.impersonate.reason")}>
          <Textarea
            id="impersonation-reason"
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
            value={reason}
          />
        </FormField>
        {failure === undefined ? null : <p role="alert">{failure}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setDialog(null);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          {erased ? null : (
            <Button
              loading={pending}
              onClick={() =>
                void run(async () => {
                  const result = await client.POST("/members/{id}/impersonation-token", {
                    body: reason.trim() === "" ? {} : { reason },
                    params: { path: { id: member.id } },
                  });
                  // S01 D10 (E47): only the api's `launchUrl` opens: the club app's host with a
                  // one-time code (`/entrar?handoff=`). The token never goes into a URL, and a
                  // missing `launchUrl` is an error in this dialog, never a guessed address.
                  const launchUrl = result.data?.launchUrl;
                  if (typeof launchUrl !== "string" || launchUrl === "") {
                    throw new TypeError("Impersonation response did not contain launchUrl");
                  }
                  window.open(launchUrl, "_blank", "noopener,noreferrer");
                })
              }
            >
              {t("admin-census:member.actions.impersonate")}
            </Button>
          )}
        </div>
      </Modal>

      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setDialog(null);
        }}
        open={dialog === "roles"}
        title={t("admin-census:member.roles.title")}
      >
        <div className="census-record__role-list">
          {(["MEMBER", "INSTRUCTOR", "ADMIN"] as const).map((role) => (
            <label className="census-record__check-row" key={role}>
              <Checkbox
                checked={roles.includes(role)}
                disabled={role === "MEMBER"}
                onChange={(event) => {
                  setRoles(
                    event.currentTarget.checked
                      ? [...roles, role]
                      : roles.filter((current) => current !== role),
                  );
                }}
              />
              {roleLabel(role)}
            </label>
          ))}
        </div>
        {failure === undefined ? null : <p role="alert">{failure}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setDialog(null);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          {erased ? null : (
            <Button
              loading={pending}
              onClick={() =>
                void run(async () => {
                  const result = await client.PUT("/members/{id}/roles", {
                    body: { roles },
                    params: { path: { id: member.id } },
                  });
                  if (result.data === undefined) {
                    throw new TypeError("Role response did not contain data");
                  }
                  onChange({ ...overview, member: { ...member, roles: result.data.roles } });
                  onFeedback({
                    message: t("admin-census:member.feedback.roles"),
                    tone: "success",
                  });
                })
              }
            >
              {t("admin-census:common.save")}
            </Button>
          )}
        </div>
      </Modal>

      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setDialog(null);
        }}
        open={dialog === "block"}
        title={t("admin-census:member.block.title")}
      >
        <p>{t("admin-census:member.block.description")}</p>
        <FormField id="booking-block-reason" label={t("admin-census:member.block.reason")}>
          <Textarea
            id="booking-block-reason"
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
            required
            value={reason}
          />
        </FormField>
        {failure === undefined ? null : <p role="alert">{failure}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setDialog(null);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          {erased ? null : (
            <Button
              disabled={reason.trim() === ""}
              loading={pending}
              onClick={() =>
                void run(async () => {
                  const result = await client.POST("/members/{id}/booking-block", {
                    body: { reason },
                    params: { path: { id: member.id } },
                  });
                  if (result.data === undefined) {
                    throw new TypeError("Booking block response did not contain data");
                  }
                  onChange({ ...overview, member: { ...member, bookingBlock: result.data } });
                  onFeedback({
                    message: t("admin-census:member.feedback.blocked"),
                    tone: "success",
                  });
                })
              }
            >
              {t("admin-census:member.actions.block")}
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}

export function MemberRecordPage({ client, id = pathId() }: { client: ApiClient; id?: string }) {
  const branding = useBranding();
  const refreshCounters = useRefreshCounters();
  const { i18n, t } = useTranslation("admin-census");
  const [overview, setOverview] = useState<MemberOverview>();
  // Why the record could not be read: a `409 MEMBER_ERASED` is final, anything else retried.
  const [failure, setFailure] = useState<{ error: unknown }>();
  const [reload, setReload] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [memberDialog, setMemberDialog] = useState<MemberDialog>(() => {
    const requested = new URLSearchParams(window.location.search).get("calaix");
    return requested === "inactivitat"
      ? "inactivity"
      : requested === "baixa"
        ? "leave"
        : requested === "pagament"
          ? "payment"
          : requested === "modalitat"
            ? "plan"
            : null;
  });
  // The member a change found erased after the record was read (`409 MEMBER_ERASED`, S14 §5).
  const [erasedMeanwhile, setErasedMeanwhile] = useState<string>();
  const initialPeriodId = new URLSearchParams(window.location.search).get("period") ?? undefined;

  useEffect(() => {
    let current = true;
    void client.GET("/members/{id}/overview", { params: { path: { id } } }).then(
      (result) => {
        if (!current) return;
        if (result.data === undefined) {
          setFailure({ error: undefined });
        } else {
          setOverview(result.data);
          setFailure(undefined);
        }
      },
      (error: unknown) => {
        if (current) setFailure({ error });
      },
    );
    return () => {
      current = false;
    };
  }, [client, id, reload]);
  if (failure !== undefined) {
    return (
      <LoadError
        error={failure.error}
        onRetry={() => {
          setReload((value) => value + 1);
        }}
      />
    );
  }
  if (overview === undefined) {
    return <LoadingRecord />;
  }
  const member = overview.member;
  const locale = normalizeLocale(i18n.resolvedLanguage ?? branding.defaultLocale);
  const joinedYear =
    member.joinedAt == null ? undefined : new Date(member.joinedAt).getUTCFullYear();
  const holder = overview.familyGroup?.holderMemberId === member.id;
  const primaryPhone = member.phones[0];
  // S14 §5 (E7-W07 step 3): an erased member takes no S03/S13 change — the api answers
  // `409 MEMBER_ERASED` to each — so the record offers none: read erased, or found erased by a
  // change sent from a record read before the erasure.
  const erased = member.erasedAt != null || erasedMeanwhile === member.id;
  const onErased = () => {
    setErasedMeanwhile(member.id);
  };

  return (
    <section className="census-record">
      <FeedbackMessage feedback={feedback} />
      <header className="census-record__header">
        <div className="census-record__identity">
          <h1>{member.fullName}</h1>
          {/* A member without a number (a pending or imported record) shows no «núm.» badge. */}
          {member.memberNumber == null ? null : (
            <Badge>{t("admin-census:member.number", { number: member.memberNumber })}</Badge>
          )}
          {joinedYear === undefined ? null : (
            <Badge tone="success">
              {t("admin-census:member.activeSince", { year: joinedYear })}
            </Badge>
          )}
          {member.displayStatus.kind === "INACTIVE_PERIOD" ? (
            <Badge tone="warning">
              {member.displayStatus.date == null
                ? t("admin-census:inactivity.badgeOpen")
                : t("admin-census:inactivity.badgeUntil", {
                    date: formatDate(member.displayStatus.date, locale, false),
                  })}
            </Badge>
          ) : null}
          {member.displayStatus.kind === "LEAVE_SCHEDULED" && member.displayStatus.date != null ? (
            <Badge tone="warning">
              {t("admin-census:leave.badgeScheduled", {
                date: formatDate(member.displayStatus.date, locale),
              })}
            </Badge>
          ) : null}
          {branding.modules.includes("FAMILY_GROUP") && overview.familyGroup !== undefined ? (
            <Badge>
              {holder
                ? t("admin-census:member.familyHolder")
                : t("admin-census:member.familyMember")}
            </Badge>
          ) : null}
          {member.bookingBlock.active ? (
            <Badge tone="danger">{t("admin-census:member.bookingBlocked")}</Badge>
          ) : null}
          {branding.modules.includes("BILLING") && member.accountMissing ? (
            <Badge tone="danger">{t("admin-census:member.accountMissing")}</Badge>
          ) : null}
          {branding.modules.includes("BILLING") &&
          member.paymentMethod?.type === "CARD" &&
          member.paymentMethod.invalid === true ? (
            <Badge tone="danger">{t("admin-census:member.billing.invalidCard")}</Badge>
          ) : null}
        </div>
        <div className="census-record__header-actions">
          {primaryPhone === undefined ? null : (
            <a
              className="census-record__action-link"
              href={`https://wa.me/${primaryPhone.prefix.replace("+", "")}${primaryPhone.number}`}
              rel="noreferrer"
              target="_blank"
            >
              <Icon aria-hidden="true" name="wa" />
              {t("admin-census:member.actions.whatsapp")}
            </a>
          )}
          {erased ? null : (
            <>
              <Button
                onClick={() => {
                  setMemberDialog("resend");
                }}
                variant="ghost"
              >
                {t("admin-census:member.actions.resend")}
              </Button>
              <Button
                onClick={() => {
                  setMemberDialog("impersonate");
                }}
                variant="ghost"
              >
                <Icon aria-hidden="true" name="user" />
                {t("admin-census:member.actions.impersonate")}
              </Button>
              <Button
                onClick={() => {
                  setEditOpen(true);
                }}
                variant="secondary"
              >
                <Icon aria-hidden="true" name="edit" />
                {t("admin-census:common.edit")}
              </Button>
            </>
          )}
        </div>
      </header>
      <Tabs
        items={[
          {
            content: (
              <MemberSummary
                client={client}
                dialog={memberDialog}
                erased={erased}
                onChange={setOverview}
                onErased={onErased}
                onFeedback={setFeedback}
                onReload={() => {
                  setReload((value) => value + 1);
                }}
                overview={overview}
                setDialog={setMemberDialog}
              />
            ),
            label: t("admin-census:member.tabs.summary"),
            value: "summary",
          },
          ...(branding.modules.includes("TASKS")
            ? [
                {
                  content: <p>{t("admin-census:member.tabs.tasksPlaceholder")}</p>,
                  label: t("admin-census:member.tabs.tasks"),
                  value: "tasks",
                },
              ]
            : []),
          {
            content: <AuditTrail client={client} memberId={member.id} />,
            label: t("admin-census:member.tabs.audit"),
            value: "audit",
          },
        ]}
        label={t("admin-census:member.tabs.label")}
      />
      <MemberEditDrawer
        client={client}
        erased={erased}
        key={member.version}
        member={member}
        onClose={() => {
          setEditOpen(false);
        }}
        onErased={onErased}
        onSaved={(saved) => {
          setOverview({ ...overview, member: saved });
          setEditOpen(false);
          setFeedback({ message: t("admin-census:member.feedback.saved"), tone: "success" });
        }}
        open={editOpen}
      />
      {branding.modules.includes("INACTIVITY") && (!erased || memberDialog === "inactivity") ? (
        <MemberInactivityDrawer
          client={client}
          {...(initialPeriodId === undefined ? {} : { initialPeriodId })}
          memberId={member.id}
          onChanged={() => {
            setReload((value) => value + 1);
            refreshCounters();
          }}
          onClose={() => {
            setMemberDialog(null);
          }}
          onErased={onErased}
          open={memberDialog === "inactivity"}
        />
      ) : null}
      {!erased || memberDialog === "leave" ? (
        <MemberLeaveDrawer
          client={client}
          member={member}
          onChanged={(saved) => {
            if (saved?.id === member.id) setOverview({ ...overview, member: saved });
            else setReload((value) => value + 1);
            refreshCounters();
          }}
          onClose={() => {
            setMemberDialog(null);
          }}
          onErased={onErased}
          open={memberDialog === "leave"}
        />
      ) : null}
      {branding.modules.includes("BILLING") && (!erased || memberDialog === "payment") ? (
        <MemberPaymentMethodDrawer
          client={client}
          memberId={member.id}
          onChanged={(paymentMethod) => {
            setOverview({
              ...overview,
              member: { ...member, accountMissing: false, paymentMethod },
            });
            setFeedback({ message: t("admin-census:member.feedback.payment"), tone: "success" });
          }}
          onClose={() => {
            setMemberDialog(null);
          }}
          onErased={onErased}
          open={memberDialog === "payment"}
          paymentMethod={member.paymentMethod}
        />
      ) : null}
      {branding.modules.includes("BILLING") && (!erased || memberDialog === "plan") ? (
        <MemberPlanDrawer
          client={client}
          member={member}
          onChanged={() => {
            setReload((value) => value + 1);
          }}
          onClose={() => {
            setMemberDialog(null);
          }}
          onErased={onErased}
          open={memberDialog === "plan"}
        />
      ) : null}
    </section>
  );
}

function DogEditDrawer({
  client,
  dog,
  onClose,
  onSaved,
  open,
}: {
  client: ApiClient;
  dog: DogDetail;
  onClose: () => void;
  onSaved: (dog: Dog) => void;
  open: boolean;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const [draft, setDraft] = useState(dog);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const updateLicense = (
    index: number,
    key: "category" | "division" | "grade" | "number" | "organisation",
    value: string,
  ) => {
    const licenses = [...draft.licenses];
    const license = licenses[index] ?? { number: "", organisation: "" };
    licenses[index] = { ...license, [key]: value };
    setDraft({ ...draft, licenses });
  };

  return (
    <Drawer
      closeLabel={t("admin-census:common.close")}
      onClose={onClose}
      open={open}
      title={t("admin-census:dog.edit.title")}
    >
      <form
        className="census-record__form"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setFailure(undefined);
          const body: DogPatchRequest = {
            birthDate: draft.birthDate,
            breed: draft.breed,
            chip: draft.chip,
            ...(draft.handlerName === undefined ? {} : { handlerName: draft.handlerName }),
            licenses: draft.licenses.filter(
              (license) => license.organisation.trim() !== "" && license.number.trim() !== "",
            ),
            name: draft.name,
            sex: draft.sex,
            version: dog.version,
          };
          void client
            .PATCH("/dogs/{id}", { body, params: { path: { id: dog.id } } })
            .then((result) => {
              if (result.data === undefined) {
                throw new TypeError("Dog response did not contain data");
              }
              onSaved(result.data);
            })
            .catch((error: unknown) => {
              setFailure(errorText(error, t));
            })
            .finally(() => {
              setPending(false);
            });
        }}
      >
        <FormField id="dog-name" label={t("admin-census:dog.fields.name")}>
          <Input
            id="dog-name"
            onChange={(event) => {
              setDraft({ ...draft, name: event.currentTarget.value });
            }}
            value={draft.name}
          />
        </FormField>
        <FormField id="dog-breed" label={t("admin-census:dog.fields.breed")}>
          <Input
            id="dog-breed"
            onChange={(event) => {
              setDraft({ ...draft, breed: event.currentTarget.value });
            }}
            value={draft.breed}
          />
        </FormField>
        <div className="census-record__form-grid">
          <FormField id="dog-sex" label={t("admin-census:dog.fields.sex")}>
            <Select
              id="dog-sex"
              onChange={(event) => {
                setDraft({ ...draft, sex: event.currentTarget.value as DogDetail["sex"] });
              }}
              value={draft.sex}
            >
              <option value="FEMALE">{t("admin-census:values.female")}</option>
              <option value="MALE">{t("admin-census:values.male")}</option>
            </Select>
          </FormField>
          <FormField id="dog-birth-date" label={t("admin-census:dog.fields.birthDate")}>
            <Input
              id="dog-birth-date"
              onChange={(event) => {
                setDraft({ ...draft, birthDate: event.currentTarget.value });
              }}
              type="date"
              value={draft.birthDate}
            />
          </FormField>
        </div>
        <FormField id="dog-chip" label={t("admin-census:dog.fields.chip")}>
          <Input
            id="dog-chip"
            onChange={(event) => {
              setDraft({ ...draft, chip: event.currentTarget.value });
            }}
            value={draft.chip}
          />
        </FormField>
        <FormField id="dog-handler" label={t("admin-census:dog.fields.handler")}>
          <Input
            id="dog-handler"
            maxLength={80}
            onChange={(event) => {
              setDraft({ ...draft, handlerName: event.currentTarget.value });
            }}
            value={draft.handlerName ?? ""}
          />
        </FormField>
        <fieldset className="census-record__fieldset">
          <legend>{t("admin-census:dog.sections.licenses")}</legend>
          {[0, 1].map((index) => (
            <div className="census-record__license-edit" key={index}>
              <Input
                aria-label={t("admin-census:dog.fields.licenseOrganisation", { number: index + 1 })}
                onChange={(event) => {
                  updateLicense(index, "organisation", event.currentTarget.value);
                }}
                placeholder={t("admin-census:dog.fields.organisation")}
                value={draft.licenses[index]?.organisation ?? ""}
              />
              <Input
                aria-label={t("admin-census:dog.fields.licenseNumber", { number: index + 1 })}
                onChange={(event) => {
                  updateLicense(index, "number", event.currentTarget.value);
                }}
                placeholder={t("admin-census:dog.fields.number")}
                value={draft.licenses[index]?.number ?? ""}
              />
              <Input
                aria-label={t("admin-census:dog.fields.licenseCategory", { number: index + 1 })}
                maxLength={10}
                onChange={(event) => {
                  updateLicense(index, "category", event.currentTarget.value);
                }}
                placeholder={t("admin-census:dog.fields.category")}
                value={draft.licenses[index]?.category ?? ""}
              />
              <Input
                aria-label={t("admin-census:dog.fields.licenseGrade", { number: index + 1 })}
                onChange={(event) => {
                  updateLicense(index, "grade", event.currentTarget.value);
                }}
                placeholder={t("admin-census:dog.fields.grade")}
                value={draft.licenses[index]?.grade ?? ""}
              />
              <Input
                aria-label={t("admin-census:dog.fields.licenseDivision", { number: index + 1 })}
                maxLength={20}
                onChange={(event) => {
                  updateLicense(index, "division", event.currentTarget.value);
                }}
                placeholder={t("admin-census:dog.fields.division")}
                value={draft.licenses[index]?.division ?? ""}
              />
            </div>
          ))}
        </fieldset>
        {failure === undefined ? null : <p role="alert">{failure}</p>}
        <div className="census-record__dialog-actions">
          <Button onClick={onClose} variant="ghost">
            {t("admin-census:common.cancel")}
          </Button>
          <Button loading={pending} type="submit">
            {t("admin-census:common.save")}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

function DocumentList({
  client,
  dog,
  onChange,
  onFeedback,
}: {
  client: ApiClient;
  dog: DogDetail;
  onChange: (dog: DogDetail) => void;
  onFeedback: (feedback: Feedback) => void;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const [type, setType] = useState(dog.documents[0]?.type ?? "");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File>();
  const [pending, setPending] = useState(false);

  const upload = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (file === undefined) return;
    setPending(true);
    try {
      const fileKey = await uploadSigned(client, file, "DOG_DOCUMENT");
      const created = await client.POST("/dogs/{id}/documents", {
        body: { fileKey, name: name.trim() === "" ? file.name : name, type },
        params: { path: { id: dog.id } },
      });
      if (created.data === undefined) throw new TypeError("Document response did not contain data");
      onChange({
        ...dog,
        documents: dog.documents.map((document) =>
          document.id === created.data.id ? created.data : document,
        ),
      });
      setFile(undefined);
      setName("");
      onFeedback({ message: t("admin-census:dog.feedback.documentUploaded"), tone: "success" });
    } catch (error) {
      onFeedback({ message: errorText(error, t), tone: "danger" });
    } finally {
      setPending(false);
    }
  };

  const updateDocument = (updated: DogDocument) => {
    onChange({
      ...dog,
      documents: dog.documents.map((document) => (document.id === updated.id ? updated : document)),
    });
  };

  return (
    <Card>
      <SectionTitle>{t("admin-census:dog.sections.documents")}</SectionTitle>
      <ul className="census-record__documents">
        {dog.documents.map((document) => (
          <li key={document.id}>
            <div className="census-record__document-head">
              <strong>{document.typeLabel}</strong>
              <Badge tone={document.state === "RECEIVED" ? "success" : "warning"}>
                {document.state === "RECEIVED"
                  ? t("admin-census:dog.documents.received")
                  : t("admin-census:dog.documents.pending")}
              </Badge>
              {document.state === "PENDING" ? (
                <Button
                  className="census-record__inline-action"
                  onClick={() => {
                    void client
                      .POST("/dogs/{id}/documents/reminder", {
                        body: { type: document.type },
                        params: { path: { id: dog.id } },
                      })
                      .then(() => {
                        updateDocument({ ...document, lastReminderAt: new Date().toISOString() });
                        onFeedback({
                          message: t("admin-census:dog.feedback.reminderSent"),
                          tone: "success",
                        });
                      })
                      .catch((error: unknown) => {
                        onFeedback({ message: errorText(error, t), tone: "danger" });
                      });
                  }}
                  variant="ghost"
                >
                  {t("admin-census:dog.documents.remind")}
                </Button>
              ) : null}
            </div>
            {document.files.length === 0 ? null : (
              <ul>
                {document.files.map((documentFile) => (
                  <li key={documentFile.id}>
                    <a href={documentFile.url} rel="noreferrer" target="_blank">
                      {documentFile.name}
                    </a>
                    <Button
                      className="census-record__inline-action"
                      onClick={() => {
                        void client
                          .DELETE("/dogs/{id}/documents/{docId}/files/{fileId}", {
                            params: {
                              path: { docId: document.id, fileId: documentFile.id, id: dog.id },
                            },
                          })
                          .then(() => {
                            const files = document.files.filter(
                              (item) => item.id !== documentFile.id,
                            );
                            updateDocument({
                              ...document,
                              files,
                              state: files.length === 0 ? "PENDING" : "RECEIVED",
                            });
                            onFeedback({
                              message: t("admin-census:dog.feedback.documentRemoved"),
                              tone: "success",
                            });
                          })
                          .catch((error: unknown) => {
                            onFeedback({ message: errorText(error, t), tone: "danger" });
                          });
                      }}
                      variant="ghost"
                    >
                      {t("admin-census:dog.documents.remove")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <form className="census-record__upload-form" onSubmit={(event) => void upload(event)}>
        <FormField id="dog-document-type" label={t("admin-census:dog.documents.type")}>
          <Select
            id="dog-document-type"
            onChange={(event) => {
              setType(event.currentTarget.value);
            }}
            value={type}
          >
            {dog.documents.map((document) => (
              <option key={document.type} value={document.type}>
                {document.typeLabel}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="dog-document-name" label={t("admin-census:dog.documents.name")}>
          <Input
            id="dog-document-name"
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            value={name}
          />
        </FormField>
        <FormField id="dog-document-file" label={t("admin-census:dog.documents.file")}>
          <Input
            accept="image/*,application/pdf"
            id="dog-document-file"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0]);
            }}
            required
            type="file"
          />
        </FormField>
        <Button loading={pending} type="submit">
          <Icon aria-hidden="true" name="up" />
          {t("admin-census:dog.documents.upload")}
        </Button>
      </form>
    </Card>
  );
}

export function DogRecordPage({ client, id = pathId() }: { client: ApiClient; id?: string }) {
  const branding = useBranding();
  const { i18n, t } = useTranslation(["admin-census", "errors"]);
  const locale = i18n.resolvedLanguage ?? branding.defaultLocale;
  const [dog, setDog] = useState<DogDetail>();
  const [levels, setLevels] = useState<LevelSummary[]>([]);
  const [members, setMembers] = useState<TransferMember[]>([]);
  const [failure, setFailure] = useState(false);
  const [reload, setReload] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>();
  const [dialog, setDialog] = useState<
    "deactivate" | "free" | "level" | "photo" | "reactivate" | "transfer" | null
  >(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string>();
  const [selectedLevel, setSelectedLevel] = useState("");
  const [freeOverride, setFreeOverride] = useState<"false" | "level" | "true">("level");
  const [toMemberId, setToMemberId] = useState("");
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<File>();

  useEffect(() => {
    let current = true;
    void Promise.all([
      client.GET("/dogs/{id}", { params: { path: { id } } }),
      client.GET("/levels", { params: { query: { includeInactive: false } } }),
      client.GET("/members", {
        params: {
          query: {
            fields: listFields(TRANSFER_MEMBER_FIELDS),
            filter: ["status:eq:ACTIVE"],
            page: 0,
            size: 200,
            sort: ["lastName,asc"],
          },
        },
      }),
    ]).then(
      ([dogResult, levelResult, memberResult]) => {
        if (!current) return;
        if (dogResult.data === undefined) {
          setFailure(true);
          return;
        }
        setDog(dogDetailView(dogResult.data));
        setFailure(false);
        setSelectedLevel(dogResult.data.level?.id ?? "");
        setFreeOverride(
          dogResult.data.freeTraining?.override == null
            ? "level"
            : dogResult.data.freeTraining.override
              ? "true"
              : "false",
        );
        setLevels(levelResult.data?.items ?? []);
        try {
          setMembers(itemsWith(memberResult.data?.items ?? [], TRANSFER_MEMBER_FIELDS));
        } catch {
          setFailure(true);
        }
      },
      () => {
        if (current) setFailure(true);
      },
    );
    return () => {
      current = false;
    };
  }, [client, id, reload]);

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setDialogError(undefined);
    try {
      await action();
      setDialog(null);
    } catch (error) {
      setDialogError(errorText(error, t));
    } finally {
      setPending(false);
    }
  };

  if (failure)
    return (
      <LoadError
        onRetry={() => {
          setReload((value) => value + 1);
        }}
      />
    );
  if (dog === undefined) return <LoadingRecord />;

  return (
    <section className="census-record">
      <FeedbackMessage feedback={feedback} />
      <header className="census-record__header">
        <div className="census-record__identity">
          <h1>{dog.name}</h1>
          <Badge tone={dog.status === "ACTIVE" ? "success" : "danger"}>
            {dog.status === "ACTIVE"
              ? t("admin-census:dog.status.active")
              : t("admin-census:dog.status.inactive")}
          </Badge>
          {dog.level === undefined ? null : <Badge tone="info">{dog.level.code}</Badge>}
          {branding.modules.includes("FREE_TRAINING") && dog.freeTraining?.allowed ? (
            <Badge tone="success">{t("admin-census:values.freeTraining")}</Badge>
          ) : null}
        </div>
        <div className="census-record__header-actions">
          <Button
            onClick={() => {
              setDialog("transfer");
            }}
            variant="ghost"
          >
            <Icon aria-hidden="true" name="swap" />
            {t("admin-census:dog.actions.transfer")}
          </Button>
          <Button
            onClick={() => {
              setEditOpen(true);
            }}
            variant="secondary"
          >
            <Icon aria-hidden="true" name="edit" />
            {t("admin-census:common.edit")}
          </Button>
          <Button
            onClick={() => {
              setDialog(dog.status === "ACTIVE" ? "deactivate" : "reactivate");
            }}
            variant={dog.status === "ACTIVE" ? "danger" : "secondary"}
          >
            {dog.status === "ACTIVE"
              ? t("admin-census:dog.actions.deactivate")
              : t("admin-census:dog.actions.reactivate")}
          </Button>
        </div>
      </header>
      <div className="census-record__grid">
        <Card>
          <SectionTitle>{t("admin-census:dog.sections.data")}</SectionTitle>
          <dl className="census-record__data-list">
            <DataRow label={t("admin-census:dog.fields.owner")}>
              <a href={`/abonats/${dog.owner.id}`}>
                {dog.owner.fullName}
                {dog.owner.memberNumber === undefined
                  ? null
                  : ` · ${t("admin-census:member.number", { number: dog.owner.memberNumber })}`}
              </a>
            </DataRow>
            <DataRow label={t("admin-census:dog.fields.handler")}>
              {dog.handlerName ?? t("admin-census:values.empty")}
            </DataRow>
            <DataRow label={t("admin-census:dog.fields.breed")}>{dog.breed}</DataRow>
            <DataRow label={t("admin-census:dog.fields.sex")}>
              {dog.sex === "FEMALE"
                ? t("admin-census:values.female")
                : t("admin-census:values.male")}
            </DataRow>
            <DataRow label={t("admin-census:dog.fields.birthDate")}>
              {formatDate(dog.birthDate, locale)}
            </DataRow>
            <DataRow label={t("admin-census:dog.fields.chip")}>{dog.chip}</DataRow>
            <DataRow label={t("admin-census:dog.fields.registeredAt")}>
              {formatDate(dog.registeredAt, locale)}
            </DataRow>
          </dl>
        </Card>
        <Card>
          <div className="census-record__section-heading">
            <SectionTitle>{t("admin-census:dog.sections.level")}</SectionTitle>
            <Button
              onClick={() => {
                setDialog("level");
              }}
              variant="ghost"
            >
              {t("admin-census:dog.actions.changeLevel")}
            </Button>
          </div>
          {dog.level === undefined ? (
            <p>{t("admin-census:values.empty")}</p>
          ) : (
            <p className="census-record__level-current">
              <span className="census-level-chip">{dog.level.code}</span>
              <strong>{dog.level.name}</strong>
              {dog.levelAssignedAt === undefined
                ? null
                : t("admin-census:dog.level.since", {
                    date: formatDate(dog.levelAssignedAt, locale),
                  })}
            </p>
          )}
          <ul className="census-record__history">
            {(dog.levelHistory ?? []).map((entry) => (
              <li key={`${entry.levelId}-${entry.from}`}>
                <strong>
                  {levels.find((level) => level.id === entry.levelId)?.code ?? entry.levelId}
                </strong>{" "}
                · {formatDate(entry.from, locale)} —{" "}
                {entry.to === undefined
                  ? t("admin-census:dog.level.current")
                  : formatDate(entry.to, locale)}
              </li>
            ))}
          </ul>
        </Card>
        {branding.modules.includes("FREE_TRAINING") && dog.freeTraining !== undefined ? (
          <Card>
            <div className="census-record__section-heading">
              <SectionTitle>{t("admin-census:dog.sections.freeTraining")}</SectionTitle>
              <Button
                onClick={() => {
                  setDialog("free");
                }}
                variant="ghost"
              >
                {t("admin-census:common.edit")}
              </Button>
            </div>
            <Badge tone={dog.freeTraining.allowed ? "success" : "neutral"}>
              {dog.freeTraining.allowed
                ? t("admin-census:values.freeTraining")
                : t("admin-census:dog.freeTraining.notAllowed")}
            </Badge>
            <p className="census-record__muted">
              {dog.freeTraining.source === "LEVEL"
                ? t("admin-census:dog.freeTraining.byLevel")
                : t("admin-census:dog.freeTraining.manual")}
            </p>
          </Card>
        ) : null}
        <Card>
          <SectionTitle>{t("admin-census:dog.sections.licenses")}</SectionTitle>
          {dog.licenses.length === 0 ? (
            <p>{t("admin-census:values.empty")}</p>
          ) : (
            <ul className="census-record__plain-list">
              {dog.licenses.map((license) => (
                <li key={license.organisation}>
                  {license.organisation} ·{" "}
                  {t("admin-census:dog.license.number", { number: license.number })}
                  {[license.category, license.grade, license.division]
                    .filter((value): value is string => typeof value === "string" && value !== "")
                    .map((value) => ` · ${value}`)}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <div className="census-record__section-heading">
            <SectionTitle>{t("admin-census:dog.sections.photo")}</SectionTitle>
            <Button
              onClick={() => {
                setDialog("photo");
              }}
              variant="ghost"
            >
              <Icon aria-hidden="true" name="cam" />
              {t("admin-census:dog.actions.photo")}
            </Button>
          </div>
          {dog.photoUrl === undefined ? (
            <div className="census-record__photo-placeholder">
              <Icon aria-hidden="true" name="paw" />
              {t("admin-census:dog.photo.empty")}
            </div>
          ) : (
            <img
              alt={t("admin-census:dog.photo.alt", { name: dog.name })}
              className="census-record__photo"
              src={dog.photoUrl}
            />
          )}
        </Card>
        {branding.modules.includes("TASKS") && dog.tasksSummary !== undefined ? (
          <Card>
            <SectionTitle>{t("admin-census:dog.sections.instructorNotes")}</SectionTitle>
            <p>{dog.instructorNote?.text ?? t("admin-census:values.empty")}</p>
            <p className="census-record__muted">
              {t("admin-census:dog.tasks.summary")}:{" "}
              {t("admin-census:dog.tasks.counts", {
                completed: dog.tasksSummary.completed,
                open: dog.tasksSummary.open,
              })}
            </p>
          </Card>
        ) : null}
      </div>
      <DocumentList client={client} dog={dog} onChange={setDog} onFeedback={setFeedback} />

      <DogEditDrawer
        client={client}
        dog={dog}
        key={dog.version}
        onClose={() => {
          setEditOpen(false);
        }}
        onSaved={(saved) => {
          setDog(mergeDogDetail(dog, saved));
          setEditOpen(false);
          setFeedback({ message: t("admin-census:dog.feedback.saved"), tone: "success" });
        }}
        open={editOpen}
      />

      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setDialog(null);
        }}
        open={dialog === "level"}
        title={t("admin-census:dog.level.title")}
      >
        <FormField id="dog-level" label={t("admin-census:dog.level.select")}>
          <Select
            id="dog-level"
            onChange={(event) => {
              setSelectedLevel(event.currentTarget.value);
            }}
            value={selectedLevel}
          >
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.code} · {level.name}
              </option>
            ))}
          </Select>
        </FormField>
        {dialogError === undefined ? null : <p role="alert">{dialogError}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setDialog(null);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              void run(async () => {
                const result = await client.PATCH("/dogs/{id}/level", {
                  body: { levelId: selectedLevel },
                  params: { path: { id: dog.id } },
                });
                if (result.data === undefined)
                  throw new TypeError("Level response did not contain data");
                setDog({
                  ...dog,
                  dog: {
                    ...dog.dog,
                    levelAssignedAt: result.data.levelAssignedAt,
                    levelId: result.data.level.id,
                  },
                  level: result.data.level,
                  levelAssignedAt: result.data.levelAssignedAt,
                });
                setFeedback({
                  message: t("admin-census:dog.feedback.levelSaved"),
                  tone: "success",
                });
              })
            }
          >
            {t("admin-census:common.save")}
          </Button>
        </div>
      </Modal>

      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setDialog(null);
        }}
        open={dialog === "free"}
        title={t("admin-census:dog.freeTraining.title")}
      >
        <FormField id="dog-free-training" label={t("admin-census:dog.sections.freeTraining")}>
          <Select
            id="dog-free-training"
            onChange={(event) => {
              setFreeOverride(event.currentTarget.value as typeof freeOverride);
            }}
            value={freeOverride}
          >
            <option value="level">{t("admin-census:dog.freeTraining.levelOption")}</option>
            <option value="true">{t("admin-census:values.yes")}</option>
            <option value="false">{t("admin-census:values.no")}</option>
          </Select>
        </FormField>
        {dialogError === undefined ? null : <p role="alert">{dialogError}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setDialog(null);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              void run(async () => {
                const override = freeOverride === "level" ? null : freeOverride === "true";
                const result = await client.PATCH("/dogs/{id}/free-training", {
                  body: { override },
                  params: { path: { id: dog.id } },
                });
                if (result.data === undefined)
                  throw new TypeError("Free training response did not contain data");
                setDog({ ...dog, freeTraining: result.data });
                setFeedback({
                  message: t("admin-census:dog.feedback.freeTraining"),
                  tone: "success",
                });
              })
            }
          >
            {t("admin-census:common.save")}
          </Button>
        </div>
      </Modal>

      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setDialog(null);
        }}
        open={dialog === "transfer"}
        title={t("admin-census:dog.transfer.title")}
      >
        <FormField id="dog-owner" label={t("admin-census:dog.transfer.owner")}>
          <Select
            id="dog-owner"
            onChange={(event) => {
              setToMemberId(event.currentTarget.value);
            }}
            value={toMemberId}
          >
            <option value="">{t("admin-census:dog.transfer.select")}</option>
            {members
              .filter((member) => member.id !== dog.owner.id)
              .slice(0, 12)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField id="dog-transfer-reason" label={t("admin-census:dog.transfer.reason")}>
          <Textarea
            id="dog-transfer-reason"
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
            value={reason}
          />
        </FormField>
        {dialogError === undefined ? null : <p role="alert">{dialogError}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setDialog(null);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          <Button
            disabled={toMemberId === ""}
            loading={pending}
            onClick={() =>
              void run(async () => {
                const result = await client.POST("/dogs/{id}/transfer", {
                  body: { ...(reason.trim() === "" ? {} : { reason }), toMemberId },
                  params: { path: { id: dog.id } },
                });
                if (result.data === undefined)
                  throw new TypeError("Transfer response did not contain data");
                setDog(mergeDogDetail(dog, result.data));
                setFeedback({
                  message: t("admin-census:dog.feedback.transferred"),
                  tone: "success",
                });
              })
            }
          >
            {t("admin-census:dog.actions.transfer")}
          </Button>
        </div>
      </Modal>

      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setDialog(null);
        }}
        open={dialog === "deactivate" || dialog === "reactivate"}
        title={
          dialog === "deactivate"
            ? t("admin-census:dog.deactivate.title")
            : t("admin-census:dog.reactivate.title")
        }
      >
        <p>
          {dialog === "deactivate"
            ? t("admin-census:dog.deactivate.description")
            : t("admin-census:dog.reactivate.description")}
        </p>
        <FormField id="dog-status-reason" label={t("admin-census:dog.status.reason")}>
          <Textarea
            id="dog-status-reason"
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
            value={reason}
          />
        </FormField>
        {dialogError === undefined ? null : <p role="alert">{dialogError}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setDialog(null);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          <Button
            loading={pending}
            variant={dialog === "deactivate" ? "danger" : "primary"}
            onClick={() =>
              void run(async () => {
                const action =
                  dialog === "deactivate"
                    ? ("/dogs/{id}/deactivation" as const)
                    : ("/dogs/{id}/reactivation" as const);
                const result =
                  action === "/dogs/{id}/deactivation"
                    ? await client.POST(action, {
                        body: reason.trim() === "" ? {} : { reason },
                        params: { path: { id: dog.id } },
                      })
                    : await client.POST(action, {
                        body: reason.trim() === "" ? {} : { reason },
                        params: { path: { id: dog.id } },
                      });
                if (result.data === undefined)
                  throw new TypeError("Status response did not contain data");
                setDog(mergeDogDetail(dog, result.data));
                setFeedback({
                  message:
                    action === "/dogs/{id}/deactivation"
                      ? t("admin-census:dog.feedback.deactivated")
                      : t("admin-census:dog.feedback.reactivated"),
                  tone: "success",
                });
              })
            }
          >
            {dialog === "deactivate"
              ? t("admin-census:dog.actions.deactivate")
              : t("admin-census:dog.actions.reactivate")}
          </Button>
        </div>
      </Modal>

      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setDialog(null);
        }}
        open={dialog === "photo"}
        title={t("admin-census:dog.photo.title")}
      >
        <FormField id="dog-photo" label={t("admin-census:dog.photo.file")}>
          <Input
            accept="image/*"
            id="dog-photo"
            onChange={(event) => {
              setPhoto(event.currentTarget.files?.[0]);
            }}
            type="file"
          />
        </FormField>
        {dialogError === undefined ? null : <p role="alert">{dialogError}</p>}
        <div className="census-record__dialog-actions">
          <Button
            onClick={() => {
              setDialog(null);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          <Button
            disabled={photo === undefined}
            loading={pending}
            onClick={() =>
              void run(async () => {
                if (photo === undefined) return;
                const fileKey = await uploadSigned(client, photo, "DOG_PHOTO");
                const result = await client.PUT("/dogs/{id}/photo", {
                  body: { fileKey },
                  params: { path: { id: dog.id } },
                });
                if (result.data === undefined)
                  throw new TypeError("Photo response did not contain data");
                setDog({
                  ...dog,
                  dog: { ...dog.dog, photoUrl: result.data.photoUrl },
                  photoUrl: result.data.photoUrl,
                });
                setFeedback({ message: t("admin-census:dog.feedback.photo"), tone: "success" });
              })
            }
          >
            {t("admin-census:dog.actions.photo")}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
