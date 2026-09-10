import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
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
  Skeleton,
  Textarea,
  Toast,
  useBranding,
} from "@agilityhub/ui";
import { type ChangeEvent, type SyntheticEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type SignupView = components["schemas"]["MemberSignupView"];
type Member = SignupView["member"];
type Dog = SignupView["dogs"][number];
type ValidationRequest = components["schemas"]["ValidationRequest"];

function currentMemberId(): string {
  return window.location.pathname.split("/").filter(Boolean).at(-1) ?? "";
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function isoDateFromInput(value: string, locale: "ca" | "es" | "en"): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value);
  if (match === null) return undefined;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  const day = locale === "en" ? second : first;
  const month = locale === "en" ? first : second;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return undefined;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function errorFields(error: unknown): Readonly<Record<string, string>> {
  if (!isApiError(error) || typeof error.details !== "object" || error.details === null) return {};
  const values = (error.details as Record<string, unknown>).fieldErrors;
  if (!Array.isArray(values)) return {};
  return Object.fromEntries(values.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as Record<string, unknown>;
    return typeof item.field === "string" && typeof item.code === "string" ? [[item.field, item.code]] : [];
  }));
}

function contactValue(member: Member): string {
  const email = member.contactEmails[0]?.email ?? "";
  const phone = member.phones[0];
  return [email, phone === undefined ? "" : `${phone.prefix} ${phone.number.slice(0, 3)} ··· ···`].filter(Boolean).join(" · ");
}

function warningKey(warning: components["schemas"]["SignupWarning"]): string | undefined {
  return {
    ACCOUNT_NOT_PROVIDED: "admin-census:signupReview.warnings.account",
    DOCUMENT_PENDING: "admin-census:signupReview.warnings.document",
    FAMILY_HOLDER_NOT_FOUND: "admin-census:signupReview.warnings.family",
    UPFRONT_UNPAID: "admin-census:signupReview.warnings.upfront",
    NO_IMAGE_CONSENT: undefined,
    READMISSION: undefined,
  }[warning];
}

function EditSignupDrawer({
  client,
  onClose,
  onSaved,
  open,
  signup,
}: {
  client: ApiClient;
  onClose: () => void;
  onSaved: () => void;
  open: boolean;
  signup: SignupView;
}) {
  const { t } = useTranslation("admin-census");
  const [member, setMember] = useState(() => structuredClone(signup.member));
  const [dogs, setDogs] = useState(() => structuredClone(signup.dogs));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      const memberResult = await client.PATCH("/members/{id}", {
        body: {
          address: member.address,
          birthDate: member.birthDate,
          contactEmails: member.contactEmails.map(({ email }) => ({ email })),
          firstName: member.firstName,
          gender: member.gender,
          ...(member.idDocument === undefined ? {} : { idDocument: member.idDocument }),
          lastName1: member.lastName1,
          ...(member.lastName2 === undefined ? {} : { lastName2: member.lastName2 }),
          phones: member.phones,
          version: signup.version,
        },
        params: { path: { id: member.id } },
      });
      if (memberResult.error !== undefined) {
        setError(isApiError(memberResult.error, "STALE_VERSION") ? t("admin-census:signupReview.stale") : t("admin-census:signupReview.genericError"));
        return;
      }
      let version = memberResult.data.version;
      for (const dog of dogs.filter((item) => item.status === "PENDING")) {
        const dogResult = await client.PATCH("/dogs/{id}", {
          body: {
            birthDate: `${dog.birthMonth}-01`,
            breed: dog.breed,
            chip: dog.chip,
            name: dog.name,
            sex: dog.sex,
            version,
          },
          params: { path: { id: dog.id } },
        });
        if (dogResult.error !== undefined) {
          setError(isApiError(dogResult.error, "STALE_VERSION") ? t("admin-census:signupReview.stale") : t("admin-census:signupReview.genericError"));
          return;
        }
        version = dogResult.data.version;
      }
      onSaved();
    } catch (cause) {
      setError(isApiError(cause, "STALE_VERSION") ? t("admin-census:signupReview.stale") : t("admin-census:signupReview.genericError"));
    } finally {
      setWorking(false);
    }
  };

  const memberField = (key: "firstName" | "lastName1" | "lastName2" | "birthDate") => ({
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget.value;
      setMember((value) => ({ ...value, [key]: input }));
    },
    value: member[key] ?? "",
  });

  return (
    <Drawer closeLabel={t("admin-census:signupReview.cancel")} onClose={onClose} open={open} title={t("admin-census:signupReview.editTitle")}>
      <form className="signup-edit-form" onSubmit={(event) => void save(event)}>
        {(["firstName", "lastName1", "lastName2", "birthDate"] as const).map((key) => (
          <FormField id={`signup-edit-${key}`} key={key} label={t(`admin-census:signupReview.fields.${key}`)}><Input id={`signup-edit-${key}`} {...memberField(key)} /></FormField>
        ))}
        <FormField id="signup-edit-id" label={t("admin-census:signupReview.fields.idDocument")}><Input id="signup-edit-id" onChange={(event) => { const input = event.currentTarget.value; setMember((value) => ({ ...value, idDocument: { number: input, type: value.idDocument?.type ?? "OTHER" } })); }} value={member.idDocument?.number ?? ""} /></FormField>
        <FormField id="signup-edit-email" label={t("admin-census:signupReview.fields.email")}><Input id="signup-edit-email" onChange={(event) => { const input = event.currentTarget.value; setMember((value) => ({ ...value, contactEmails: [{ bounced: false, email: input }] })); }} type="email" value={member.contactEmails[0]?.email ?? ""} /></FormField>
        <FormField id="signup-edit-phone" label={t("admin-census:signupReview.fields.phone")}><Input id="signup-edit-phone" onChange={(event) => { const input = event.currentTarget.value; setMember((value) => ({ ...value, phones: [{ ...(value.phones[0]?.label === undefined ? {} : { label: value.phones[0].label }), number: input, prefix: value.phones[0]?.prefix ?? "" }] })); }} value={member.phones[0]?.number ?? ""} /></FormField>
        {(["street", "postalCode", "city"] as const).map((key) => (
          <FormField id={`signup-edit-${key}`} key={key} label={t(`admin-census:signupReview.fields.${key}`)}><Input id={`signup-edit-${key}`} onChange={(event) => { const input = event.currentTarget.value; setMember((value) => ({ ...value, address: { ...value.address, [key]: input } })); }} value={member.address[key]} /></FormField>
        ))}
        {dogs.map((dog, index) => (
          <fieldset disabled={dog.status !== "PENDING"} key={dog.id}>
            <legend>{t("admin-census:signupReview.dog", { current: index + 1, total: dogs.length })}</legend>
            {(["name", "breed", "birthMonth", "chip"] as const).map((key) => (
              <FormField id={`signup-edit-dog-${String(index)}-${key}`} key={key} label={t(`admin-census:signupReview.fields.${key}`)}><Input id={`signup-edit-dog-${String(index)}-${key}`} onChange={(event) => { const input = event.currentTarget.value; setDogs((value) => value.map((item) => item.id === dog.id ? { ...item, [key]: input } : item)); }} value={dog[key]} /></FormField>
            ))}
            <FormField id={`signup-edit-dog-${String(index)}-sex`} label={t("admin-census:signupReview.fields.sex")}><Select id={`signup-edit-dog-${String(index)}-sex`} onChange={(event) => { const input = event.currentTarget.value as Dog["sex"]; setDogs((value) => value.map((item) => item.id === dog.id ? { ...item, sex: input } : item)); }} value={dog.sex}><option value="FEMALE">{t("admin-census:values.female")}</option><option value="MALE">{t("admin-census:values.male")}</option></Select></FormField>
          </fieldset>
        ))}
        {error === undefined ? null : <p role="alert">{error}</p>}
        <Button loading={working} type="submit">{t("admin-census:signupReview.actions.save")}</Button>
      </form>
    </Drawer>
  );
}

export function SignupReviewPage({
  client,
  onNavigate = (path) => { window.location.assign(path); },
}: {
  client: ApiClient;
  onNavigate?: (path: string) => void;
}) {
  const branding = useBranding();
  const { formatDate, formatMoney, locale } = useClubFormats();
  const { t } = useTranslation("admin-census");
  const memberId = currentMemberId();
  const [signup, setSignup] = useState<SignupView>();
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [levels, setLevels] = useState<Readonly<Record<string, string>>>({});
  const [planId, setPlanId] = useState("");
  const [priceId, setPriceId] = useState("");
  const [nextInvoiceDate, setNextInvoiceDate] = useState("");
  const [nextInvoiceInput, setNextInvoiceInput] = useState("");
  const [manualPaid, setManualPaid] = useState("0");
  const [confirmZero, setConfirmZero] = useState(false);
  const [warnDays, setWarnDays] = useState<number>();

  const load = useCallback(() => {
    void client.GET("/members/{id}/signup", { params: { path: { id: memberId } } }).then(
      (result) => {
        if (result.data === undefined) { setLoadError(true); return; }
        setLoadError(false);
        setSignup(result.data);
        setLevels(Object.fromEntries(result.data.dogs.map((dog) => [dog.id, dog.levelId ?? ""])));
        setPlanId(result.data.proposals.planId);
        setPriceId(result.data.proposals.priceId ?? "");
        const proposedDate = result.data.proposals.nextInvoiceDate ?? "";
        setNextInvoiceDate(proposedDate);
        setNextInvoiceInput(proposedDate === "" ? "" : formatDate(`${proposedDate}T12:00:00Z`, "short"));
      },
      () => { setLoadError(true); },
    );
  }, [client, formatDate, memberId]);

  useEffect(() => { load(); }, [load, reload]);
  useEffect(() => {
    void client.GET("/dashboard").then((result) => {
      if (result.data !== undefined) {
        setWarnDays(result.data.kpis.pendingSignups.warnDays);
      }
    });
  }, [client]);

  if (signup === undefined && !loadError) return <Skeleton label={t("admin-census:signupReview.loading")} />;
  if (signup === undefined) return <section className="signup-review-page"><Toast tone="danger">{t("admin-census:signupReview.loadError")}</Toast><Button onClick={() => { setLoadError(false); setReload((value) => value + 1); }}>{t("admin-census:signupReview.retry")}</Button></section>;

  const billing = branding.modules.includes("BILLING");
  const monthly = signup.member.plan?.type === "MONTHLY";
  const stripePaid = (signup.upfront?.totalPaid.amountMinor ?? 0) > 0 && signup.upfront?.lines.every((line) => line.provider === "STRIPE" && line.status === "PAID") === true;
  const validationBody = (): ValidationRequest => ({
    dogs: signup.dogs.map((dog) => ({ dogId: dog.id, ...(levels[dog.id] === undefined || levels[dog.id] === "" ? {} : { levelId: levels[dog.id] }) })),
    ...(nextInvoiceDate === "" ? {} : { nextInvoiceDate }),
    ...(planId === "" ? {} : { planId }),
    ...(priceId === "" ? {} : { priceId }),
    ...(signup.familyGroupClaim?.holder?.id === undefined ? {} : { familyGroupId: signup.familyGroupClaim.holder.id }),
    ...(billing && !stripePaid ? { upfrontAmountPaid: { amountMinor: Math.round(Number(manualPaid) * 100), currency: branding.currency } } : {}),
    version: signup.version,
  });

  const validationError = (cause: unknown) => {
    setFieldErrors(errorFields(cause));
    setMessage(isApiError(cause, "STALE_VERSION") ? t("admin-census:signupReview.stale") : isApiError(cause, "INVALID_STATE") ? t("admin-census:signupReview.invalidState") : t("admin-census:signupReview.genericError"));
  };

  const dryRun = async (nextPlanId: string) => {
    setPlanId(nextPlanId);
    try {
      const result = await client.POST("/members/{id}/validation", { body: { ...validationBody(), planId: nextPlanId }, params: { path: { id: memberId }, query: { dryRun: true } } });
      if (result.error !== undefined) { validationError(result.error); return; }
      if ("nextInvoiceDate" in result.data) {
        const proposedDate = result.data.nextInvoiceDate ?? "";
        setNextInvoiceDate(proposedDate);
        setNextInvoiceInput(proposedDate === "" ? "" : formatDate(`${proposedDate}T12:00:00Z`, "short"));
      }
    } catch (cause) { validationError(cause); }
  };

  const validate = async () => {
    if (billing && !stripePaid && Number(manualPaid) === 0 && !confirmZero) { setMessage(t("admin-census:signupReview.confirmNothingPaid")); return; }
    setWorking(true); setMessage(undefined); setFieldErrors({});
    try {
      const result = await client.POST("/members/{id}/validation", { body: validationBody(), params: { path: { id: memberId }, query: { dryRun: false } } });
      if (result.error !== undefined) { validationError(result.error); setWorking(false); return; }
      onNavigate("/tauler?signup=validated");
    } catch (cause) { validationError(cause); setWorking(false); }
  };

  const reject = async () => {
    if (rejectReason.trim().length < 3 || rejectReason.length > 500) return;
    setWorking(true); setMessage(undefined);
    try {
      const result = await client.POST("/members/{id}/rejection", { body: { reason: rejectReason.trim(), version: signup.version }, params: { path: { id: memberId } } });
      if (result.error !== undefined) { validationError(result.error); setWorking(false); return; }
      onNavigate("/tauler");
    } catch (cause) { validationError(cause); setWorking(false); }
  };

  const dogNames = signup.dogs.map((dog) => dog.name).join(", ");
  return (
    <section className="signup-review-page">
      {message === undefined ? null : <Toast tone="danger">{message}</Toast>}
      <header className="signup-review-page__header">
        <h1>{t("admin-census:signupReview.header", { number: signup.member.memberNumber ?? shortId(signup.member.id), name: signup.member.fullName, dogs: dogNames })}</h1>
        <Badge tone={warnDays !== undefined && signup.signup.pendingDays >= warnDays ? "warning" : "neutral"}>{t("admin-census:signupReview.pending", { count: signup.signup.pendingDays })}</Badge>
        {signup.signup.readmission ? <Badge>{t("admin-census:signupReview.readmission")}</Badge> : null}
      </header>
      <div className="signup-review-grid">
        <Card>
          <h2>{t("admin-census:signupReview.person")}</h2>
          <dl className="signup-review-data">
            <dt>{t("admin-census:signupReview.fields.name")}</dt><dd><strong>{signup.member.fullName}</strong></dd>
            <dt>{t("admin-census:signupReview.fields.idDocument")}</dt><dd>{signup.member.idDocument?.number ?? t("admin-census:values.empty")}</dd>
            <dt>{t("admin-census:signupReview.fields.contact")}</dt><dd>{contactValue(signup.member)} {signup.member.phones[0] === undefined ? null : <a aria-label={t("admin-census:signupReview.whatsapp")} href={`https://wa.me/${signup.member.phones[0].prefix.replaceAll(/\D/gu, "")}${signup.member.phones[0].number.replaceAll(/\D/gu, "")}`}><Icon aria-hidden="true" name="send" /> {t("admin-census:signupReview.whatsapp")}</a>}</dd>
            <dt>{t("admin-census:signupReview.fields.family")}</dt><dd>{signup.familyGroupClaim?.holderName ?? t("admin-census:values.empty")} {signup.familyGroupClaim?.status === "FOUND" ? <Badge>{t("admin-census:signupReview.familyRate")}</Badge> : null}</dd>
            <dt>{t("admin-census:signupReview.fields.payment")}</dt><dd>{signup.member.paymentMethod?.maskedAccount ?? signup.member.maskedAccount ?? t("admin-census:values.empty")} {signup.member.paymentMethod?.holderName === signup.member.fullName ? ` · ${t("admin-census:signupReview.sameHolder")}` : null}</dd>
          </dl>
          {signup.warnings.includes("NO_IMAGE_CONSENT") ? <p className="signup-review-warning signup-review-warning--image"><Icon aria-hidden="true" name="warn" /> {t("admin-census:signupReview.warnings.image", { gender: signup.member.gender === "FEMALE" ? "female" : "other" })}</p> : null}
          {signup.member.accountMissing === true ? <p className="signup-review-warning signup-review-warning--danger">{t("admin-census:signupReview.warnings.account")}</p> : null}
        </Card>
        {signup.dogs.map((dog, index) => (
          <Card key={dog.id}>
            <h2>{t("admin-census:signupReview.dog", { current: index + 1, total: signup.dogs.length })} {signup.signup.source === "APP_ADD_DOG" && dog.status === "PENDING" ? <Badge>{t("admin-census:signupReview.newDog")}</Badge> : null}</h2>
            <dl className="signup-review-data">
              <dt>{t("admin-census:signupReview.fields.name")}</dt><dd><strong>{dog.name}</strong> · {t(`admin-census:values.${dog.sex === "FEMALE" ? "female" : "male"}`)} · {dog.breed} · {formatDate(`${dog.birthMonth}-01T12:00:00Z`, "monthYear")}</dd>
              <dt>{t("admin-census:signupReview.fields.chip")}</dt><dd>{dog.chip}</dd>
              <dt>{t("admin-census:signupReview.fields.documents")}</dt><dd>{dog.documents.flatMap((document) => document.files).map((file) => <a href={file.downloadUrl} key={file.downloadUrl}><Icon aria-hidden="true" name="doc" /> {file.name}</a>)}</dd>
              <dt>{t("admin-census:signupReview.fields.notes")}</dt><dd>{dog.notesToInstructors ?? t("admin-census:values.empty")}</dd>
            </dl>
            {signup.proposals.levels.length === 0 ? null : <FormField {...(fieldErrors[`dogs.${String(index)}.levelId`] === undefined ? {} : { error: t("admin-census:signupReview.levelRequired") })} id={`signup-level-${dog.id}`} label={t("admin-census:signupReview.fields.level")}><Select id={`signup-level-${dog.id}`} onChange={(event) => { const input = event.currentTarget.value; setLevels((value) => ({ ...value, [dog.id]: input })); }} value={levels[dog.id] ?? ""}><option value="">{t("admin-census:values.empty")}</option>{signup.proposals.levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</Select></FormField>}
            {billing && monthly ? <FormField {...(fieldErrors.nextInvoiceDate === undefined ? {} : { error: t("admin-census:signupReview.invoiceRequired") })} id={`signup-invoice-${dog.id}`} label={t("admin-census:signupReview.fields.nextInvoice")}><Input id={`signup-invoice-${dog.id}`} inputMode="numeric" maxLength={10} onChange={(event) => { const input = event.currentTarget.value; setNextInvoiceInput(input); setNextInvoiceDate(isoDateFromInput(input, locale) ?? ""); }} placeholder={t("admin-census:signupReview.datePlaceholder")} required type="text" value={nextInvoiceInput} /><Badge tone="danger">{t("admin-census:signupReview.required")}</Badge></FormField> : null}
          </Card>
        ))}
      </div>
      <Card className="signup-review-decision">
        <div><h2>{t("admin-census:signupReview.plan")}</h2><Select aria-label={t("admin-census:signupReview.plan")} onChange={(event) => void dryRun(event.currentTarget.value)} value={planId}><option value={signup.proposals.planId}>{signup.member.plan?.name ?? signup.proposals.planId}</option></Select></div>
        {billing && signup.upfront !== undefined ? <div><h2>{t("admin-census:signupReview.upfront")}</h2><label>{t("admin-census:signupReview.actuallyPaid")} {stripePaid ? <><Input readOnly value={formatMoney(signup.upfront.totalPaid.amountMinor / 100)} /><Badge tone="success">{t("admin-census:signupReview.paid")}</Badge></> : <Input min="0" onChange={(event) => { setManualPaid(event.currentTarget.value); }} step="0.01" type="number" value={manualPaid} />}</label>{stripePaid ? null : <label><Checkbox checked={confirmZero} onChange={(event) => { setConfirmZero(event.currentTarget.checked); }} /> {t("admin-census:signupReview.nothingPaid")}</label>}</div> : null}
        <footer><Button onClick={() => { setEditOpen(true); }} variant="secondary"><Icon aria-hidden="true" name="edit" />{t("admin-census:signupReview.actions.edit")}</Button><Button onClick={() => { setRejectOpen(true); }} variant="danger">{t("admin-census:signupReview.actions.reject")}</Button><Button loading={working} onClick={() => void validate()}><Icon aria-hidden="true" name="check" />{t("admin-census:signupReview.actions.validate")}</Button></footer>
      </Card>
      {signup.warnings.map((warning) => warningKey(warning)).filter((key): key is string => key !== undefined).map((key) => <Badge key={key} tone="danger">{t(key)}</Badge>)}
      <EditSignupDrawer client={client} key={signup.version} onClose={() => { setEditOpen(false); }} onSaved={() => { setEditOpen(false); setMessage(t("admin-census:signupReview.saved")); setReload((value) => value + 1); }} open={editOpen} signup={signup} />
      <Modal closeLabel={t("admin-census:signupReview.cancel")} onClose={() => { setRejectOpen(false); }} open={rejectOpen} title={t("admin-census:signupReview.rejectTitle")}><FormField id="signup-reject-reason" label={t("admin-census:signupReview.rejectReason")}><Textarea id="signup-reject-reason" maxLength={500} minLength={3} onChange={(event) => { setRejectReason(event.currentTarget.value); }} value={rejectReason} /></FormField><p>{t("admin-census:signupReview.rejectHelp")}</p><Button disabled={rejectReason.trim().length < 3} loading={working} onClick={() => void reject()} variant="danger">{t("admin-census:signupReview.actions.reject")}</Button></Modal>
    </section>
  );
}
