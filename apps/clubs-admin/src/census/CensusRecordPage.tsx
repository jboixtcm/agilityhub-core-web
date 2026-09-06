import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
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
  Switch,
  Tabs,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, type SyntheticEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type MemberOverview = components["schemas"]["MemberOverview"];
type MemberDetail = components["schemas"]["MemberDetail"];
type MemberPatchRequest = components["schemas"]["MemberPatchRequest"];
type NotificationPreferencesPatch = components["schemas"]["NotificationPreferencesPatch"];
type DogDetail = components["schemas"]["DogDetail"];
type DogListItem = components["schemas"]["DogListItem"];
type DogPatchRequest = components["schemas"]["DogPatchRequest"];
type LevelSummary = components["schemas"]["LevelSummary"];
type DogDocument = components["schemas"]["DogDocument"];
type Role = "ADMIN" | "INSTRUCTOR" | "MEMBER";
type MemberDialog = "block" | "impersonate" | "payment" | "resend" | "roles" | null;

interface Feedback {
  message: string;
  tone: "danger" | "success";
}

type TranslationFunction = ReturnType<typeof useTranslation>["t"];

function pathId(): string {
  return decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) ?? "");
}

function formatDate(value: string, locale: string, withYear = true): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
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

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("admin-census");
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
  member,
  onClose,
  onSaved,
  open,
}: {
  client: ApiClient;
  member: MemberDetail;
  onClose: () => void;
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
          setPending(true);
          setFailure(undefined);
          const body: MemberPatchRequest = {
            address: draft.address,
            birthDate: draft.birthDate,
            consents: draft.consents,
            contactEmails: draft.contactEmails.filter((item) => item.email.trim() !== ""),
            firstName: draft.firstName,
            gender: draft.gender,
            idDocument: draft.idDocument,
            ...(draft.internalNotes === undefined ? {} : { internalNotes: draft.internalNotes }),
            lastName1: draft.lastName1,
            ...(draft.lastName2 === undefined ? {} : { lastName2: draft.lastName2 }),
            phones: draft.phones.filter((item) => item.number.trim() !== ""),
            ...(draft.remarks === undefined ? {} : { remarks: draft.remarks }),
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
                  idDocument: { ...draft.idDocument, type: event.currentTarget.value },
                });
              }}
              value={draft.idDocument.type}
            />
          </FormField>
          <FormField id="member-document-number" label={t("admin-census:member.fields.document")}>
            <Input
              id="member-document-number"
              onChange={(event) => {
                setDraft({
                  ...draft,
                  idDocument: { ...draft.idDocument, number: event.currentTarget.value },
                });
              }}
              value={draft.idDocument.number}
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
                    value={phone.label}
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
            checked={draft.consents.imageRights.granted}
            onChange={(event) => {
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
          <Button loading={pending} loadingLabel={t("admin-census:common.saving")} type="submit">
            {t("admin-census:common.save")}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

function MemberSummary({
  client,
  dialog,
  overview,
  onChange,
  onFeedback,
  setDialog,
}: {
  client: ApiClient;
  dialog: MemberDialog;
  onChange: (overview: MemberOverview) => void;
  onFeedback: (feedback: Feedback) => void;
  overview: MemberOverview;
  setDialog: (dialog: MemberDialog) => void;
}) {
  const branding = useBranding();
  const { i18n, t } = useTranslation(["admin-census", "errors"]);
  const member = overview.member;
  const modules = branding.modules;
  const locale = i18n.resolvedLanguage ?? branding.defaultLocale;
  const [reason, setReason] = useState("");
  const [iban, setIban] = useState("");
  const [holderName, setHolderName] = useState(member.paymentMethod?.holderName ?? member.fullName);
  const [roles, setRoles] = useState<Role[]>(member.roles as Role[]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setFailure(undefined);
    try {
      await action();
      setDialog(null);
    } catch (error) {
      setFailure(errorText(error, t));
    } finally {
      setPending(false);
    }
  };

  const updatePreferences = async (patch: NotificationPreferencesPatch) => {
    try {
      const result = await client.PUT("/members/{id}/notification-preferences", {
        body: patch,
        params: { path: { id: member.id } },
      });
      if (result.data === undefined) {
        throw new TypeError("Preference response did not contain data");
      }
      onChange({ ...overview, notificationPreferences: result.data });
      onFeedback({ message: t("admin-census:member.feedback.preferences"), tone: "success" });
    } catch (error) {
      onFeedback({ message: errorText(error, t), tone: "danger" });
    }
  };

  const imageNotice = member.consents.imageRights.granted
    ? null
    : t("admin-census:member.imageNotice", { gender: member.gender });
  const roleLabel = (role: Role) =>
    role === "ADMIN"
      ? t("admin-census:roles.admin")
      : role === "INSTRUCTOR"
        ? t("admin-census:roles.instructor")
        : t("admin-census:roles.member");
  const preferenceLabel = (category: "CLUB_CHANGES" | "OPERATIONAL" | "PERSONAL") =>
    category === "CLUB_CHANGES"
      ? t("admin-census:member.preferences.club_changes")
      : category === "OPERATIONAL"
        ? t("admin-census:member.preferences.operational")
        : t("admin-census:member.preferences.personal");
  const contact = [
    ...member.contactEmails.map((item) => item.email),
    ...member.phones.map((phone) => `${phone.prefix} ${phone.number} (${phone.label})`),
  ].join(" · ");

  return (
    <>
      <div className="census-record__grid">
        <Card>
          <SectionTitle>{t("admin-census:member.sections.dataPayment")}</SectionTitle>
          <dl className="census-record__data-list">
            <DataRow label={t("admin-census:member.fields.contact")}>{contact}</DataRow>
            {modules.includes("BILLING") && member.plan !== undefined ? (
              <DataRow label={t("admin-census:member.fields.plan")}>
                <strong>{member.plan.summary}</strong>
              </DataRow>
            ) : null}
            {modules.includes("BILLING") ? (
              <DataRow label={t("admin-census:member.fields.payment")}>
                {member.paymentMethod?.type === "SEPA_DD"
                  ? t("admin-census:member.payment.sepa")
                  : (member.paymentMethod?.type ?? t("admin-census:values.empty"))}
                {member.paymentMethod?.maskedAccount === undefined ? null : (
                  <strong> · {member.paymentMethod.maskedAccount}</strong>
                )}{" "}
                <Badge>{t("admin-census:member.payment.adminOnly")}</Badge>{" "}
                <Button
                  className="census-record__inline-action"
                  onClick={() => {
                    setDialog("payment");
                  }}
                  variant="ghost"
                >
                  {t("admin-census:common.edit")}
                </Button>
              </DataRow>
            ) : null}
            {modules.includes("BILLING") && overview.nextInvoice !== undefined ? (
              <DataRow label={t("admin-census:member.fields.nextInvoice")}>
                <strong>{formatDate(overview.nextInvoice.date, locale)}</strong> ·{" "}
                {formatMoney(overview.nextInvoice.amount, locale, branding.currency)}
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
                locale: overview.notificationPreferences.locale.toUpperCase(),
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
              <Button
                className="census-record__inline-action"
                onClick={() => {
                  setDialog("roles");
                }}
                variant="ghost"
              >
                {t("admin-census:common.edit")}
              </Button>
            </DataRow>
            {modules.includes("FAMILY_GROUP") && overview.familyGroup !== undefined ? (
              <DataRow label={t("admin-census:member.fields.familyGroup")}>
                <span className="census-record__links">
                  {overview.familyGroup.members.map((familyMember) => (
                    <a href={`/abonats/${familyMember.id}`} key={familyMember.id}>
                      {familyMember.fullName} ·{" "}
                      {t("admin-census:member.number", { number: familyMember.memberNumber })}
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
                    <span className="census-level-chip">{dog.level.code}</span>
                    {modules.includes("FREE_TRAINING") && dog.freeTrainingAllowed ? (
                      <Badge tone="success">
                        <Icon aria-hidden="true" name="check" />
                        {t("admin-census:values.freeTraining")}
                      </Badge>
                    ) : null}
                    {modules.includes("PACKS") && dog.pack !== undefined ? (
                      <span>{dog.pack}</span>
                    ) : null}
                    {dog.pendingDocuments.map((document) => (
                      <Badge key={document} tone="warning">
                        {document}
                      </Badge>
                    ))}
                    <Icon aria-hidden="true" name="chev" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle>{t("admin-census:member.sections.preferences")}</SectionTitle>
          <div className="census-record__preferences-head">
            <span />
            <span>{t("admin-census:member.preferences.app")}</span>
            <span>{t("admin-census:member.preferences.email")}</span>
          </div>
          {(["OPERATIONAL", "PERSONAL", "CLUB_CHANGES"] as const).map((category) => (
            <div className="census-record__preference-row" key={category}>
              <span>{preferenceLabel(category)}</span>
              <Icon aria-label={t("admin-census:member.preferences.alwaysOn")} name="check" />
              <span className="census-record__preference-control">
                {category === "CLUB_CHANGES" && overview.notificationPreferences.modules.sms ? (
                  <small>{t("admin-census:member.preferences.sms")}</small>
                ) : null}
                <Switch
                  checked={overview.notificationPreferences.emailByCategory[category]}
                  label={t("admin-census:member.preferences.emailToggle", {
                    category: preferenceLabel(category),
                  })}
                  onCheckedChange={(checked) =>
                    void updatePreferences({ emailByCategory: { [category]: checked } })
                  }
                />
              </span>
            </div>
          ))}
          <div className="census-record__preference-row">
            <label htmlFor="member-reminder">{t("admin-census:member.preferences.reminder")}</label>
            <span />
            <Select
              id="member-reminder"
              onChange={(event) =>
                void updatePreferences({
                  reminderMinutesBefore:
                    event.currentTarget.value === "" ? null : Number(event.currentTarget.value),
                })
              }
              value={overview.notificationPreferences.reminderMinutesBefore ?? ""}
            >
              <option value="">{t("admin-census:member.preferences.never")}</option>
              {overview.notificationPreferences.reminderOptionsMinutes.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t("admin-census:member.preferences.hoursBefore", { count: minutes / 60 })}
                </option>
              ))}
            </Select>
          </div>
          {overview.notificationPreferences.modules.push ? (
            <div className="census-record__preference-row">
              <span>{t("admin-census:member.preferences.push")}</span>
              <Switch
                checked={overview.notificationPreferences.pushClubNews}
                label={t("admin-census:member.preferences.push")}
                onCheckedChange={(checked) => void updatePreferences({ pushClubNews: checked })}
              />
              <span />
            </div>
          ) : null}
        </Card>

        {modules.includes("BILLING") ? (
          <Card>
            <SectionTitle>{t("admin-census:member.sections.invoicesAudit")}</SectionTitle>
            <ul className="census-record__invoice-list">
              {overview.recentInvoices.map((invoice) => (
                <li key={invoice.id}>
                  <span>{invoice.label}</span>
                  <span>{formatMoney(invoice.amount, locale, branding.currency)}</span>
                  <Badge tone={invoice.status === "PAID" ? "success" : "neutral"}>
                    {invoice.status === "PAID"
                      ? t("admin-census:member.invoice.paid")
                      : t("admin-census:member.invoice.remitted")}
                  </Badge>
                </li>
              ))}
            </ul>
            <div className="census-record__links census-record__links--horizontal">
              <a href="/facturacio">
                <Icon aria-hidden="true" name="doc" />
                {t("admin-census:member.invoice.all", { count: overview.invoicesCount })}
              </a>
              <a href="/auditoria">
                <Icon aria-hidden="true" name="lock" />
                {t("admin-census:member.audit.all")}
              </a>
            </div>
            <p className="census-record__muted">
              <Icon aria-hidden="true" name="lock" /> {t("admin-census:member.audit.recent")}:{" "}
              {overview.recentAudit
                .map((audit) => `${formatDate(audit.changedAt, locale, false)} ${audit.summary}`)
                .join(" · ")}
            </p>
            <div className="census-record__footer-actions">
              {modules.includes("INACTIVITY") ? (
                <a className="census-record__action-link" href="/inactivitats">
                  <Icon aria-hidden="true" name="palm" />
                  {t("admin-census:member.actions.inactivity")}
                </a>
              ) : null}
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
                    });
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
              <a className="census-record__action-link" href="/inactivitats">
                {t("admin-census:member.actions.leave")}
              </a>
            </div>
          </Card>
        ) : null}
      </div>

      {modules.includes("TASKS") ? (
        <Card className="census-record__notes">
          <SectionTitle>{t("admin-census:member.sections.instructorNotes")}</SectionTitle>
          <dl className="census-record__data-list">
            {overview.dogs.map((dog) => (
              <DataRow key={dog.id} label={dog.name}>
                {dog.instructorNote ?? t("admin-census:values.empty")}
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
          <Button
            loading={pending}
            onClick={() =>
              void run(async () => {
                const result = await client.POST("/members/{id}/impersonation-token", {
                  body: reason.trim() === "" ? {} : { reason },
                  params: { path: { id: member.id } },
                });
                if (result.data === undefined) {
                  throw new TypeError("Impersonation response did not contain data");
                }
                const launchUrl =
                  "launchUrl" in result.data && typeof result.data.launchUrl === "string"
                    ? result.data.launchUrl
                    : "/";
                const destination = new URL(launchUrl, window.location.origin);
                destination.hash = `impersonation=${encodeURIComponent(result.data.token)}`;
                window.open(destination, "_blank", "noopener,noreferrer");
              })
            }
          >
            {t("admin-census:member.actions.impersonate")}
          </Button>
        </div>
      </Modal>

      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          setDialog(null);
        }}
        open={dialog === "payment"}
        title={t("admin-census:member.payment.title")}
      >
        <form
          className="census-record__form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = await client.PATCH("/members/{id}/payment-method", {
                body: { sepa: { holderName, iban }, type: "SEPA_DD" },
                params: { path: { id: member.id } },
              });
              if (result.data === undefined) {
                throw new TypeError("Payment response did not contain data");
              }
              onChange({
                ...overview,
                member: { ...member, accountMissing: false, paymentMethod: result.data },
              });
              onFeedback({ message: t("admin-census:member.feedback.payment"), tone: "success" });
            });
          }}
        >
          <FormField
            help={t("admin-census:member.payment.ibanHelp")}
            id="member-iban"
            label={t("admin-census:member.payment.iban")}
          >
            <Input
              autoComplete="off"
              id="member-iban"
              onChange={(event) => {
                setIban(event.currentTarget.value);
              }}
              required
              type="password"
              value={iban}
            />
          </FormField>
          <FormField id="member-holder" label={t("admin-census:member.payment.holder")}>
            <Input
              id="member-holder"
              onChange={(event) => {
                setHolderName(event.currentTarget.value);
              }}
              required
              value={holderName}
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
            <Button loading={pending} type="submit">
              {t("admin-census:common.save")}
            </Button>
          </div>
        </form>
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
                onFeedback({ message: t("admin-census:member.feedback.roles"), tone: "success" });
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
                onFeedback({ message: t("admin-census:member.feedback.blocked"), tone: "success" });
              })
            }
          >
            {t("admin-census:member.actions.block")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export function MemberRecordPage({ client, id = pathId() }: { client: ApiClient; id?: string }) {
  const branding = useBranding();
  const { t } = useTranslation("admin-census");
  const [overview, setOverview] = useState<MemberOverview>();
  const [failure, setFailure] = useState(false);
  const [reload, setReload] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [memberDialog, setMemberDialog] = useState<MemberDialog>(null);

  useEffect(() => {
    let current = true;
    void client.GET("/members/{id}/overview", { params: { path: { id } } }).then(
      (result) => {
        if (!current) return;
        if (result.data === undefined) {
          setFailure(true);
        } else {
          setOverview(result.data);
          setFailure(false);
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
  if (failure) {
    return (
      <LoadError
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
  const joinedYear = new Date(member.joinedAt).getUTCFullYear();
  const holder = overview.familyGroup?.holderMemberId === member.id;
  const primaryPhone = member.phones[0];

  return (
    <section className="census-record">
      <FeedbackMessage feedback={feedback} />
      <header className="census-record__header">
        <div className="census-record__identity">
          <h1>{member.fullName}</h1>
          <Badge>{t("admin-census:member.number", { number: member.memberNumber })}</Badge>
          <Badge tone="success">{t("admin-census:member.activeSince", { year: joinedYear })}</Badge>
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
        </div>
      </header>
      <Tabs
        items={[
          {
            content: (
              <MemberSummary
                client={client}
                dialog={memberDialog}
                onChange={setOverview}
                onFeedback={setFeedback}
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
            content: <p>{t("admin-census:member.tabs.auditPlaceholder")}</p>,
            label: t("admin-census:member.tabs.audit"),
            value: "audit",
          },
        ]}
        label={t("admin-census:member.tabs.label")}
      />
      <MemberEditDrawer
        client={client}
        key={member.version}
        member={member}
        onClose={() => {
          setEditOpen(false);
        }}
        onSaved={(saved) => {
          setOverview({ ...overview, member: saved });
          setEditOpen(false);
          setFeedback({ message: t("admin-census:member.feedback.saved"), tone: "success" });
        }}
        open={editOpen}
      />
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
  onSaved: (dog: DogDetail) => void;
  open: boolean;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const [draft, setDraft] = useState(dog);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const updateLicense = (
    index: number,
    key: "grade" | "number" | "organisation",
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
                aria-label={t("admin-census:dog.fields.licenseGrade", { number: index + 1 })}
                onChange={(event) => {
                  updateLicense(index, "grade", event.currentTarget.value);
                }}
                placeholder={t("admin-census:dog.fields.grade")}
                value={draft.licenses[index]?.grade ?? ""}
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
      const signed = await client.POST("/attachments/upload-url", {
        body: {
          fileName: file.name,
          mimeType: file.type,
          purpose: "DOG_DOCUMENT",
          sizeBytes: file.size,
        },
      });
      if (signed.data === undefined) throw new TypeError("Upload response did not contain data");
      const response = await fetch(signed.data.uploadUrl, {
        body: file,
        headers: { "Content-Type": file.type },
        method: "PUT",
      });
      if (!response.ok) throw new TypeError("File upload failed");
      const created = await client.POST("/dogs/{id}/documents", {
        body: { fileKey: signed.data.fileKey, name: name.trim() === "" ? file.name : name, type },
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
  const [members, setMembers] = useState<DogListItem["owner"][]>([]);
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
            fields: "fullName",
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
        setDog(dogResult.data);
        setFailure(false);
        setSelectedLevel(dogResult.data.level?.id ?? "");
        setFreeOverride(
          dogResult.data.freeTraining.override === null
            ? "level"
            : dogResult.data.freeTraining.override
              ? "true"
              : "false",
        );
        setLevels(levelResult.data?.items ?? []);
        setMembers(
          (memberResult.data?.items ?? []).map(
            (member) => member as unknown as DogListItem["owner"],
          ),
        );
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
          {branding.modules.includes("FREE_TRAINING") && dog.freeTraining.allowed ? (
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
                {dog.owner.fullName} ·{" "}
                {t("admin-census:member.number", { number: dog.owner.memberNumber })}
              </a>
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
            {dog.levelHistory.map((entry) => (
              <li key={`${entry.levelId}-${entry.from}`}>
                <strong>{entry.levelCode}</strong> · {formatDate(entry.from, locale)} —{" "}
                {entry.to === undefined
                  ? t("admin-census:dog.level.current")
                  : formatDate(entry.to, locale)}
              </li>
            ))}
          </ul>
        </Card>
        {branding.modules.includes("FREE_TRAINING") ? (
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
                  {license.grade === undefined ? null : ` · ${license.grade}`}
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
        {branding.modules.includes("TASKS") ? (
          <Card>
            <SectionTitle>{t("admin-census:dog.sections.instructorNotes")}</SectionTitle>
            <p>{dog.instructorNote ?? t("admin-census:values.empty")}</p>
            <p className="census-record__muted">
              {t("admin-census:dog.tasks.summary")}:{" "}
              {dog.tasksSummary ?? t("admin-census:values.empty")}
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
          setDog(saved);
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
        <p className="census-record__warning">{t("admin-census:dog.level.futureWarning")}</p>
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
                  level: result.data.level,
                  levelAssignedAt: result.data.levelAssignedAt,
                });
                setFeedback({
                  message:
                    result.data.warnings.futureBookingsOutsideLevel > 0
                      ? t("admin-census:dog.feedback.levelWarning", {
                          count: result.data.warnings.futureBookingsOutsideLevel,
                        })
                      : t("admin-census:dog.feedback.levelSaved"),
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
                setDog(result.data);
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
                setDog(result.data);
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
                const signed = await client.POST("/attachments/upload-url", {
                  body: {
                    fileName: photo.name,
                    mimeType: photo.type,
                    purpose: "DOG_PHOTO",
                    sizeBytes: photo.size,
                  },
                });
                if (signed.data === undefined)
                  throw new TypeError("Upload response did not contain data");
                const uploaded = await fetch(signed.data.uploadUrl, {
                  body: photo,
                  headers: { "Content-Type": photo.type },
                  method: "PUT",
                });
                if (!uploaded.ok) throw new TypeError("Photo upload failed");
                const result = await client.PUT("/dogs/{id}/photo", {
                  body: { fileKey: signed.data.fileKey },
                  params: { path: { id: dog.id } },
                });
                if (result.data === undefined)
                  throw new TypeError("Photo response did not contain data");
                setDog({ ...dog, photoUrl: result.data.photoUrl });
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
