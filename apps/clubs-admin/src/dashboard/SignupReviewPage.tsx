import { type ApiClient, type components } from "@agilityhub/api-client";
import { fmtMaskedIban, useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  Checkbox,
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
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useRefreshCounters } from "./counters";
import { classifySignupReviewError, type SignupReviewError } from "./signup-review-errors";
import { SignupEditDrawer } from "./SignupEditDrawer";

type SignupView = components["schemas"]["MemberSignupView"];
type Member = SignupView["member"];
type Dog = SignupView["dogs"][number];
type PlanOption = SignupView["planOptions"][number];
type Upfront = NonNullable<SignupView["upfront"]>;
type ValidationRequest = components["schemas"]["ValidationRequest"];
type ValidationDryRun = components["schemas"]["ValidationDryRun"];
type Warning = components["schemas"]["SignupWarning"];
interface FamilyCandidate {
  dogs: readonly string[];
  familyGroup: components["schemas"]["NamedReference"] | undefined;
  fullName: string;
  id: string;
}

/** The admin's family decision for a `NOT_FOUND_PENDING` claim (R-04-13). */
type FamilyDecision = { familyGroupId: string; holderName: string; kind: "group" } | { kind: "none" };

// Warnings shown elsewhere on D2: the image notice in the person card, the missing account in red.
const INLINE_WARNINGS: readonly Warning[] = ["NO_IMAGE_CONSENT"];

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

function planValue(planId: string | undefined, priceId: string | undefined): string {
  return planId === undefined ? "" : `${planId}|${priceId ?? ""}`;
}

function planChoiceOf(value: string): { planId: string; priceId?: string } {
  const [planId = "", priceId = ""] = value.split("|");
  return priceId === "" ? { planId } : { planId, priceId };
}

function isDryRun(value: unknown): value is ValidationDryRun {
  return typeof value === "object" && value !== null && !("memberId" in value) && "warnings" in value;
}

// R-04-23: a collected payment stays recorded after a rejection and must be refunded (S12).
function hasCollectedPayment(upfront: Upfront | null | undefined): boolean {
  return (upfront?.lines ?? []).some(
    (line) => line.status === "PAID" || (line.status === "PARTIAL" && (line.paidAmount?.amountMinor ?? 0) > 0),
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
  const refreshCounters = useRefreshCounters();
  const { formatMoney, formatMonth, formatPlainDate, locale } = useClubFormats();
  const { t } = useTranslation(["admin-census", "errors"]);
  const memberId = currentMemberId();
  const [signup, setSignup] = useState<SignupView>();
  const [loadState, setLoadState] = useState<"error" | "loading" | "ready" | "resolved">("loading");
  const [reload, setReload] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<SignupReviewError>();
  const [working, setWorking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [decisionError, setDecisionError] = useState<SignupReviewError>();
  // The admin's own decisions: they outlive a reload of the view (an edit, a stale version).
  const [levelChoice, setLevelChoice] = useState<Readonly<Record<string, string>>>({});
  const [planChoice, setPlanChoice] = useState<{ planId: string; priceId?: string }>();
  const [dateInput, setDateInput] = useState<string>();
  const [manualPaid, setManualPaid] = useState("0");
  const [confirmZero, setConfirmZero] = useState(false);
  const [quote, setQuote] = useState<ValidationDryRun>();
  const [quotePending, setQuotePending] = useState(false);
  const [familyDecision, setFamilyDecision] = useState<FamilyDecision>();
  const [familyQuery, setFamilyQuery] = useState("");
  const [familyResults, setFamilyResults] = useState<readonly FamilyCandidate[]>();
  const [familySearching, setFamilySearching] = useState(false);
  const loadSeq = useRef(0);
  const dryRunSeq = useRef(0);

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    client.GET("/members/{id}/signup", { params: { path: { id: memberId } } }).then(
      (result) => {
        if (seq !== loadSeq.current) return;
        if (result.data === undefined) { setLoadState("error"); return; }
        setSignup(result.data);
        setLoadState("ready");
      },
      (cause: unknown) => {
        if (seq !== loadSeq.current) return;
        // R-14-01: a signup already validated or rejected (for instance from a stale D1) says so.
        setLoadState(classifySignupReviewError(cause).kind === "resolved" ? "resolved" : "error");
      },
    );
  }, [client, memberId]);

  useEffect(() => { load(); }, [load, reload]);

  const billing = branding.modules.includes("BILLING");
  const familyModule = branding.modules.includes("FAMILY_GROUP");
  const claim = signup?.familyGroupClaim;
  const pendingClaim = familyModule && claim?.status === "NOT_FOUND_PENDING";

  useEffect(() => {
    const query = familyQuery.trim();
    if (!pendingClaim || query.length < 2) return undefined;
    let active = true;
    const handle = window.setTimeout(() => {
      setFamilySearching(true);
      client
        .GET("/members", {
          // `familyGroup` is not a default column of D5: ask for it (S03 §6 `fields`).
          params: { query: { fields: "id,fullName,dogs,familyGroup", filter: ["status:eq:ACTIVE"], q: query, size: 20 } },
        })
        .then(
          (result) => {
            if (!active) return;
            setFamilyResults(
              (result.data?.items ?? [])
                .filter((item) => item.id !== memberId)
                .map((item) => ({
                  dogs: item.dogs.map((dog) => dog.name),
                  // ADMIN gets MemberListItem; the INSTRUCTOR projection has no family group.
                  familyGroup: "familyGroup" in item ? item.familyGroup : undefined,
                  fullName: item.fullName,
                  id: item.id,
                })),
            );
          },
          () => {
            if (active) setFamilyResults([]);
          },
        )
        .finally(() => {
          if (active) setFamilySearching(false);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [client, familyQuery, memberId, pendingClaim]);

  if (loadState === "loading" && signup === undefined) return <Skeleton label={t("admin-census:signupReview.loading")} />;
  if (loadState === "resolved") {
    return (
      <section className="signup-review-page">
        <Toast tone="info">{t("admin-census:signupReview.resolved")}</Toast>
        <a className="ah-button ah-button--ghost signup-review-page__record" href={`/abonats/${memberId}`} onClick={(event) => { event.preventDefault(); onNavigate(`/abonats/${memberId}`); }}>
          {t("admin-census:signupReview.resolvedLink")}
        </a>
      </section>
    );
  }
  if (signup === undefined) {
    return (
      <section className="signup-review-page">
        <Toast tone="danger">{t("admin-census:signupReview.loadError")}</Toast>
        <Button onClick={() => { setLoadState("loading"); setReload((value) => value + 1); }}>{t("admin-census:signupReview.retry")}</Button>
      </section>
    );
  }

  const member: Member = signup.member;
  const levelOf = (dog: Dog) => levelChoice[dog.id] ?? dog.levelId ?? "";
  const selectedPlan = planChoice ?? (signup.proposals.planId === undefined ? undefined : {
    planId: signup.proposals.planId,
    ...(signup.proposals.priceId === undefined ? {} : { priceId: signup.proposals.priceId }),
  });
  const selectedOption: PlanOption | undefined = signup.planOptions.find((plan) => plan.planId === selectedPlan?.planId);
  const selectedPrice = selectedOption?.prices.find((price) => price.priceId === selectedPlan?.priceId);
  const planType = selectedOption?.type ?? member.plan?.type;
  const monthly = planType === "MONTHLY";
  const proposedDate = quote === undefined ? signup.proposals.nextInvoiceDate : quote.nextInvoiceDate;
  const nextInvoiceDate = dateInput === undefined ? (proposedDate ?? "") : (isoDateFromInput(dateInput, locale) ?? "");
  const nextInvoiceText = dateInput ?? (proposedDate === undefined ? "" : formatPlainDate(proposedDate, "short"));
  const upfront: Upfront | undefined = quote?.upfront ?? signup.upfront ?? undefined;
  const liveLines = (upfront?.lines ?? []).filter((line) => line.status !== "CANCELLED" && line.status !== "REFUNDED");
  const stripePaid = (upfront?.totalPaid.amountMinor ?? 0) > 0 && liveLines.every((line) => line.provider === "STRIPE" && line.status === "PAID");
  // Only an upfront block without a Stripe payment asks for the amount collected (null = no upfront, INC-08).
  const manualUpfront = billing && upfront !== undefined && !stripePaid;
  const amountDue = Math.max(0, (upfront?.totalDue.amountMinor ?? 0) - (upfront?.totalPaid.amountMinor ?? 0));
  const readmission = signup.signup.readmission || signup.warnings.includes("READMISSION");

  const familyGroupId = (): string | undefined => {
    if (!familyModule) return undefined;
    if (claim?.status === "FOUND") return signup.proposals.familyGroupId;
    return familyDecision?.kind === "group" ? familyDecision.familyGroupId : undefined;
  };

  // A plan change's dry run leaves `nextInvoiceDate` out, so the api proposes the new plan's date.
  const validationBody = (plan = selectedPlan, withDate = true): ValidationRequest => {
    const groupId = familyGroupId();
    return {
      dogs: signup.dogs.map((dog) => ({ dogId: dog.id, ...(levelOf(dog) === "" ? {} : { levelId: levelOf(dog) }) })),
      ...(withDate && billing && monthly && nextInvoiceDate !== "" ? { nextInvoiceDate } : {}),
      ...(plan === undefined ? {} : { planId: plan.planId, ...(plan.priceId === undefined ? {} : { priceId: plan.priceId }) }),
      ...(groupId === undefined ? {} : { familyGroupId: groupId }),
      ...(manualUpfront ? { upfrontAmountPaid: { amountMinor: Math.round(Number(manualPaid) * 100), currency: branding.currency } } : {}),
      version: signup.version,
    };
  };

  const classify = (cause: unknown) =>
    classifySignupReviewError(cause, signup.dogs.map((dog) => ({ id: dog.id, levelId: levelOf(dog) })));

  const errorText = (error: SignupReviewError): string => {
    switch (error.kind) {
      case "level":
        return error.code === "LEVEL_REQUIRED" ? t("admin-census:signupReview.levelRequired") : t(`errors:${error.code}`);
      case "nextInvoiceDate":
        return error.code === "NEXT_INVOICE_DATE_REQUIRED" ? t("admin-census:signupReview.invoiceRequired") : t("admin-census:signupReview.invoiceInvalid");
      case "planCard":
        return t("admin-census:signupReview.warning.CHECKOUT_PENDING");
      case "stale":
        return t("admin-census:signupReview.stale");
      case "resolved":
        return t("admin-census:signupReview.resolved");
      case "general":
        return error.code === "INVALID_STATE"
          ? t("admin-census:signupReview.invalidState")
          : t(`errors:${error.code}`, { defaultValue: t("admin-census:signupReview.genericError") });
      default:
        return t(`errors:${error.code}`, { defaultValue: t("admin-census:signupReview.genericError") });
    }
  };

  const reloadView = () => { setReload((value) => value + 1); };

  const changePlan = async (value: string) => {
    const plan = planChoiceOf(value);
    const seq = ++dryRunSeq.current;
    setPlanChoice(plan);
    // The new plan's proposed date replaces the typed one, unless the admin types again meanwhile.
    setDateInput(undefined);
    setDecisionError(undefined);
    setQuotePending(true);
    try {
      const result = await client.POST("/members/{id}/validation", {
        body: validationBody(plan, false),
        params: { path: { id: memberId }, query: { dryRun: true } },
      });
      if (seq !== dryRunSeq.current) return;
      if (!isDryRun(result.data)) { setDecisionError({ code: "UNKNOWN", kind: "general" }); return; }
      setQuote(result.data);
    } catch (cause) {
      if (seq === dryRunSeq.current) setDecisionError(classify(cause));
    } finally {
      if (seq === dryRunSeq.current) setQuotePending(false);
    }
  };

  const validate = async () => {
    if (manualUpfront && Number(manualPaid) === 0 && !confirmZero) {
      setDecisionError({ code: "CONFIRM_NOTHING_PAID", kind: "upfront" });
      return;
    }
    if (pendingClaim && familyDecision === undefined) {
      setDecisionError({ code: "FAMILY_DECISION_REQUIRED", kind: "family" });
      return;
    }
    setWorking(true); setDecisionError(undefined);
    try {
      await client.POST("/members/{id}/validation", { body: validationBody(), params: { path: { id: memberId }, query: { dryRun: false } } });
      refreshCounters();
      onNavigate("/tauler?signup=validated");
    } catch (cause) {
      const error = classify(cause);
      if (error.kind === "resolved") setLoadState("resolved");
      setDecisionError(error);
      setWorking(false);
    }
  };

  const reject = async () => {
    if (rejectReason.trim().length < 3 || rejectReason.length > 500) return;
    setWorking(true); setRejectError(undefined);
    try {
      const result = await client.POST("/members/{id}/rejection", { body: { reason: rejectReason.trim(), version: signup.version }, params: { path: { id: memberId } } });
      refreshCounters();
      onNavigate(result.data?.paidPaymentRequiresRefund === true ? "/tauler?signup=rejected-refund" : "/tauler");
    } catch (cause) {
      const error = classify(cause);
      if (error.kind === "resolved") setLoadState("resolved");
      setRejectError(error);
      setWorking(false);
    }
  };

  const levelError = (dog: Dog) =>
    decisionError?.kind === "level" && decisionError.dogIds.includes(dog.id) ? errorText(decisionError) : undefined;
  const dateError = decisionError?.kind === "nextInvoiceDate" ? errorText(decisionError) : undefined;
  const upfrontError =
    decisionError?.kind !== "upfront"
      ? undefined
      : decisionError.code === "CONFIRM_NOTHING_PAID"
        ? t("admin-census:signupReview.confirmNothingPaid")
        : errorText(decisionError);
  const planError = decisionError?.kind === "plan" || decisionError?.kind === "planCard" ? errorText(decisionError) : undefined;
  const familyError =
    decisionError?.kind !== "family"
      ? undefined
      : decisionError.code === "FAMILY_DECISION_REQUIRED"
        ? t("admin-census:signupReview.familyDecisionRequired")
        : errorText(decisionError);
  const decisionMessage =
    decisionError === undefined || ["level", "nextInvoiceDate", "upfront", "plan", "planCard", "family"].includes(decisionError.kind)
      ? undefined
      : decisionError;

  const dogNames = signup.dogs.map((dog) => dog.name).join(", ");
  const payment = member.paymentMethod;
  const signupMonth = (value: string) => formatMonth(value).replace(/\s+(?:d(?:e|el)\s+)?\d{4}$/u, "");
  const firstMonth = upfront?.firstMonth;
  const upfrontBreakdown = liveLines
    .map((line) => {
      const amount = formatMoney(line.amount.amountMinor / 100);
      if (line.concept !== "FIRST_MONTH") return t(`admin-census:signupReview.upfrontLines.${line.concept}`, { amount });
      // The FIRST_MONTH line names its month and portion from `upfront.firstMonth` (R-04-15).
      return firstMonth === undefined
        ? t("admin-census:signupReview.upfrontLines.FIRST_MONTH_UNKNOWN", { amount })
        : t("admin-census:signupReview.upfrontLines.FIRST_MONTH", {
            amount,
            month: signupMonth(firstMonth.startDate),
            portion: firstMonth.portion,
          });
    })
    .join(" + ");
  const planLabel = (plan: PlanOption, price: PlanOption["prices"][number] | undefined) => {
    if (price === undefined) return plan.name;
    // The selected price reads the dry run's answer once there is one (S04 §2 D2: «es recalcula»).
    const quoted = quote?.price?.id === price.priceId ? quote.price : undefined;
    return t("admin-census:signupReview.planWithPrice", {
      periodicity: quoted?.periodicity ?? price.periodicity,
      plan: plan.name,
      price: formatMoney((quoted?.amount ?? price.amount).amountMinor / 100),
    });
  };
  const planOptions = signup.planOptions.flatMap((plan) =>
    plan.prices.length === 0
      ? [{ label: planLabel(plan, undefined), value: planValue(plan.planId, undefined) }]
      : plan.prices.map((price) => ({ label: planLabel(plan, price), value: planValue(plan.planId, price.priceId) })),
  );
  const selectedValue = planValue(selectedPlan?.planId, selectedPrice?.priceId ?? selectedPlan?.priceId);
  if (selectedPlan !== undefined && !planOptions.some((option) => option.value === selectedValue)) {
    planOptions.unshift({ label: selectedOption?.name ?? member.plan?.name ?? t("admin-census:values.empty"), value: selectedValue });
  }
  // The warnings a plan change brings (PAID_EXCEEDS_QUOTE, CHECKOUT_PENDING…) show on the plan card.
  const quoteWarnings = (quote?.warnings ?? []).filter((warning) => !signup.warnings.includes(warning));
  const headerWarnings = signup.warnings.filter(
    (warning) =>
      !INLINE_WARNINGS.includes(warning) &&
      warning !== "READMISSION" &&
      !(warning === "ACCOUNT_NOT_PROVIDED" && member.accountMissing === true),
  );
  const contact = [
    ...member.contactEmails.map((entry) => entry.email),
    ...member.phones.map((phone) => `${phone.prefix} ${phone.number}`),
  ].join(" · ");
  const whatsapp = member.phones[0];
  const holderGroupName = familyDecision?.kind === "group" ? familyDecision.holderName : undefined;

  return (
    <section className="signup-review-page">
      {saved ? <Toast tone="success">{t("admin-census:signupReview.saved")}</Toast> : null}
      <header className="signup-review-page__header">
        <h1>{t("admin-census:signupReview.header", { number: member.memberNumber ?? shortId(member.id), name: member.fullName, dogs: dogNames })}</h1>
        {/* R-04-24: the age warning shows when pendingDays > dashboard.pendingSignupAgeWarnDays. */}
        <Badge tone={signup.signup.pendingDays > signup.warnDays ? "warning" : "neutral"}>{t("admin-census:signupReview.pending", { count: signup.signup.pendingDays })}</Badge>
        {readmission ? <Badge>{t("admin-census:signupReview.warning.READMISSION")}</Badge> : null}
        {headerWarnings.map((warning) => <Badge key={warning} tone="warning">{t(`admin-census:signupReview.warning.${warning}`)}</Badge>)}
      </header>
      <div className="signup-review-grid">
        <Card>
          <h2>{t("admin-census:signupReview.person")}</h2>
          <dl className="signup-review-data">
            <dt>{t("admin-census:signupReview.fields.name")}</dt><dd><strong>{member.fullName}</strong></dd>
            <dt>{t("admin-census:signupReview.fields.idDocument")}</dt><dd><strong>{member.idDocument?.number ?? t("admin-census:values.empty")}</strong></dd>
            <dt>{t("admin-census:signupReview.fields.contact")}</dt>
            <dd>
              <span>{contact === "" ? t("admin-census:values.empty") : contact}</span>
              {whatsapp === undefined ? null : (
                <a className="ah-badge ah-tone--neutral signup-review-whatsapp" href={`https://wa.me/${whatsapp.prefix.replaceAll(/\D/gu, "")}${whatsapp.number.replaceAll(/\D/gu, "")}`} rel="noreferrer" target="_blank">
                  <Icon aria-hidden="true" name="wa" /> {t("admin-census:signupReview.whatsapp")}
                </a>
              )}
            </dd>
            {familyModule ? (
              <>
                <dt>{t("admin-census:signupReview.fields.family")}</dt>
                <dd className="signup-review-family">
                  {claim?.status === "FOUND" ? (
                    <>
                      <span>{t("admin-census:signupReview.familyFound", { dog: claim.dogName ?? t("admin-census:values.empty"), holder: claim.holderName ?? claim.holder?.fullName ?? t("admin-census:values.empty") })}</span>
                      <Badge>{t("admin-census:signupReview.familyFare")}</Badge>
                    </>
                  ) : claim?.status === "NOT_FOUND_PENDING" ? (
                    <>
                      <span>{t("admin-census:signupReview.familyPending", { dog: claim.dogName ?? t("admin-census:values.empty"), holder: claim.holderName ?? t("admin-census:values.empty") })}</span>
                      {familyDecision === undefined ? (
                        <div className="signup-review-family__search">
                          <FormField {...(familyError === undefined ? {} : { error: familyError })} id="signup-family-search" label={t("admin-census:signupReview.familySearch")}>
                            <Input aria-busy={familySearching || undefined} aria-describedby={familyError === undefined ? undefined : "signup-family-search-error"} aria-invalid={familyError !== undefined || undefined} id="signup-family-search" onChange={(event) => { setFamilyQuery(event.currentTarget.value); }} type="search" value={familyQuery} />
                          </FormField>
                          {familyResults === undefined || familyQuery.trim().length < 2 ? null : familyResults.length === 0 ? (
                            <p>{t("admin-census:signupReview.familyNoResults")}</p>
                          ) : (
                            <ul className="signup-review-family__results">
                              {familyResults.map((candidate) => {
                                const group = candidate.familyGroup;
                                return (
                                  <li key={candidate.id}>
                                    <span>{candidate.dogs.length === 0 ? candidate.fullName : t("admin-census:signupReview.familyCandidate", { dogs: candidate.dogs.join(", "), name: candidate.fullName })}</span>
                                    {group === undefined ? (
                                      <small>{t("admin-census:signupReview.familyNoGroup", { name: candidate.fullName })}</small>
                                    ) : (
                                      <Button onClick={() => { setFamilyDecision({ familyGroupId: group.id, holderName: candidate.fullName, kind: "group" }); setDecisionError(undefined); }} variant="ghost">
                                        {t("admin-census:signupReview.familyAttach", { name: candidate.fullName })}
                                      </Button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          <Button onClick={() => { setFamilyDecision({ kind: "none" }); setDecisionError(undefined); }} variant="ghost">{t("admin-census:signupReview.familyNone")}</Button>
                        </div>
                      ) : (
                        <span className="signup-review-family__decision">
                          <Badge>{holderGroupName === undefined ? t("admin-census:signupReview.familyNone") : t("admin-census:signupReview.familyChosen", { name: holderGroupName })}</Badge>
                          <Button onClick={() => { setFamilyDecision(undefined); }} variant="ghost">{t("admin-census:signupReview.familyChange")}</Button>
                        </span>
                      )}
                    </>
                  ) : (
                    t("admin-census:values.no")
                  )}
                  {/* The search field carries its own error; any other family error shows here. */}
                  {familyError === undefined || (pendingClaim && familyDecision === undefined) ? null : (
                    <p className="ah-form-field__error" role="alert">{familyError}</p>
                  )}
                </dd>
              </>
            ) : null}
            {billing ? (
              <>
                <dt>{t("admin-census:signupReview.fields.payment")}</dt>
                <dd>
                  {payment == null
                    ? t("admin-census:values.empty")
                    : t("admin-census:signupReview.paymentSummary", {
                        account: fmtMaskedIban(payment.maskedAccount ?? member.maskedAccount) ?? t("admin-census:values.empty"),
                        holder: payment.holderName === member.fullName ? t("admin-census:signupReview.sameHolder") : (payment.holderName ?? t("admin-census:values.empty")),
                        method: t(`admin-census:signupReview.paymentMethod.${payment.type}`),
                      })}
                </dd>
              </>
            ) : null}
          </dl>
          {signup.warnings.includes("NO_IMAGE_CONSENT") ? <p className="signup-review-warning signup-review-warning--image"><Icon aria-hidden="true" name="warn" /> {t("admin-census:signupReview.warning.NO_IMAGE_CONSENT", { gender: member.gender })}</p> : null}
          {billing && member.accountMissing === true ? <p className="signup-review-warning signup-review-warning--danger">{t("admin-census:signupReview.warning.ACCOUNT_NOT_PROVIDED")}</p> : null}
        </Card>
        {signup.dogs.map((dog, index) => {
          const files = dog.documents.flatMap((document) => document.files);
          const error = levelError(dog);
          return (
            <Card key={dog.id}>
              <h2>{t("admin-census:signupReview.dog", { current: index + 1, total: signup.dogs.length })} {signup.signup.source === "APP_ADD_DOG" && dog.status === "PENDING" ? <Badge>{t("admin-census:signupReview.newDog")}</Badge> : null}</h2>
              <dl className="signup-review-data">
                <dt>{t("admin-census:signupReview.fields.name")}</dt><dd><strong>{dog.name}</strong> · {t(`admin-census:signupReview.sex.${dog.sex}`)} · {dog.breed} · {formatPlainDate(`${dog.birthMonth}-01`, "monthYear")}</dd>
                <dt>{t("admin-census:signupReview.fields.chip")}</dt><dd>{dog.chip}</dd>
                <dt>{t("admin-census:signupReview.fields.documents")}</dt><dd>{files.map((file) => <a href={file.downloadUrl} key={file.downloadUrl} rel="noreferrer" target="_blank"><Icon aria-hidden="true" name="doc" /> {file.name}</a>)}</dd>
                <dt>
                  {t("admin-census:signupReview.fields.notes")}
                  {files.length === 0 ? null : <Badge>{t("admin-census:signupReview.attachments", { count: files.length })}</Badge>}
                </dt>
                <dd>{dog.notesToInstructors ?? t("admin-census:values.empty")}</dd>
              </dl>
              <div className="signup-review-dog-decision">
                {signup.proposals.levels.length === 0 ? null : (
                  <FormField {...(error === undefined ? {} : { error })} id={`signup-level-${dog.id}`} label={t("admin-census:signupReview.fields.level")}>
                    <Select aria-describedby={error === undefined ? undefined : `signup-level-${dog.id}-error`} aria-invalid={error !== undefined || undefined} id={`signup-level-${dog.id}`} onChange={(event) => { const input = event.currentTarget.value; setLevelChoice((value) => ({ ...value, [dog.id]: input })); if (error !== undefined) setDecisionError(undefined); }} value={levelOf(dog)}>
                      <option value="">{t("admin-census:values.empty")}</option>
                      {signup.proposals.levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
                    </Select>
                  </FormField>
                )}
                {billing && monthly && index === 0 ? (
                  <FormField {...(dateError === undefined ? {} : { error: dateError })} id={`signup-invoice-${dog.id}`} label={t("admin-census:signupReview.fields.nextInvoice")}>
                    <Input aria-describedby={dateError === undefined ? undefined : `signup-invoice-${dog.id}-error`} aria-invalid={dateError !== undefined || undefined} id={`signup-invoice-${dog.id}`} inputMode="numeric" maxLength={10} onChange={(event) => { setDateInput(event.currentTarget.value); if (dateError !== undefined) setDecisionError(undefined); }} placeholder={t("admin-census:signupReview.datePlaceholder")} required type="text" value={nextInvoiceText} />
                    <Badge tone="danger">{t("admin-census:signupReview.required")}</Badge>
                  </FormField>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="signup-review-decision">
        <div aria-busy={quotePending || undefined} className="signup-review-plan">
          <h2 id="signup-plan-title">{billing ? t("admin-census:signupReview.plan") : t("admin-census:signupReview.fields.planName")}</h2>
          {billing && planOptions.length > 0 ? (
            <Select aria-describedby={planError === undefined ? undefined : "signup-plan-error"} aria-invalid={planError !== undefined || undefined} aria-label={t("admin-census:signupReview.plan")} disabled={working} onChange={(event) => void changePlan(event.currentTarget.value)} value={selectedValue}>
              {selectedPlan === undefined ? <option value="">{t("admin-census:values.empty")}</option> : null}
              {planOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          ) : (
            <p>{selectedOption?.name ?? member.plan?.name ?? t("admin-census:values.empty")}</p>
          )}
          {planError === undefined ? null : <p className="ah-form-field__error" id="signup-plan-error" role="alert">{planError}</p>}
          {quoteWarnings.map((warning) => <p className="signup-review-warning" key={warning}>{t(`admin-census:signupReview.warning.${warning}`)}</p>)}
        </div>
        {billing && upfront !== undefined ? (
          <div className="signup-review-upfront">
            <h2>{t("admin-census:signupReview.upfront")}</h2>
            <label>
              {t("admin-census:signupReview.actuallyPaid")}{" "}
              {stripePaid ? (
                <><Input readOnly value={formatMoney(upfront.totalPaid.amountMinor / 100)} /><Badge tone="success">{t("admin-census:signupReview.paid")}</Badge></>
              ) : (
                <Input aria-describedby={upfrontError === undefined ? undefined : "signup-upfront-error"} aria-invalid={upfrontError !== undefined || undefined} max={(amountDue / 100).toFixed(2)} min="0" onChange={(event) => { setManualPaid(event.currentTarget.value); if (upfrontError !== undefined) setDecisionError(undefined); }} step="0.01" type="number" value={manualPaid} />
              )}
            </label>
            {upfrontError === undefined ? null : <p className="ah-form-field__error" id="signup-upfront-error" role="alert">{upfrontError}</p>}
            {upfrontBreakdown === "" ? null : <small className="signup-review-upfront-breakdown">{t("admin-census:signupReview.upfrontBreakdown", { lines: upfrontBreakdown })}</small>}
            {stripePaid ? null : <label><Checkbox checked={confirmZero} onChange={(event) => { setConfirmZero(event.currentTarget.checked); }} /> {t("admin-census:signupReview.nothingPaid")}</label>}
          </div>
        ) : null}
        {decisionMessage === undefined ? null : (
          <div className="signup-review-error" role="alert">
            <span>{errorText(decisionMessage)}</span>
            {decisionMessage.kind === "stale" ? <Button onClick={() => { setDecisionError(undefined); reloadView(); }} variant="ghost">{t("admin-census:signupReview.actions.reload")}</Button> : null}
          </div>
        )}
        <footer>
          <Button disabled={working} onClick={() => { setSaved(false); setEditOpen(true); }} variant="ghost"><Icon aria-hidden="true" name="edit" />{t("admin-census:signupReview.actions.edit")}</Button>
          <Button disabled={working} onClick={() => { setRejectError(undefined); setRejectOpen(true); }} variant="ghost">{t("admin-census:signupReview.actions.reject")}</Button>
          <Button disabled={quotePending} loading={working} onClick={() => void validate()}><Icon aria-hidden="true" name="check" />{t("admin-census:signupReview.actions.validate")}</Button>
        </footer>
      </Card>
      <SignupEditDrawer client={client} onClose={() => { setEditOpen(false); }} onReload={reloadView} onSaved={() => { setEditOpen(false); setSaved(true); reloadView(); }} open={editOpen} signup={signup} />
      <Modal closeLabel={t("admin-census:signupReview.cancel")} onClose={() => { setRejectOpen(false); }} open={rejectOpen} title={t("admin-census:signupReview.rejectTitle")}>
        <FormField id="signup-reject-reason" label={t("admin-census:signupReview.rejectReason")}><Textarea id="signup-reject-reason" maxLength={500} minLength={3} onChange={(event) => { setRejectReason(event.currentTarget.value); }} value={rejectReason} /></FormField>
        <p>{t("admin-census:signupReview.rejectHelp")}</p>
        {hasCollectedPayment(signup.upfront) ? <p className="signup-review-warning">{t("admin-census:signupReview.refundWarning")}</p> : null}
        {rejectError === undefined ? null : (
          <div className="signup-review-error" role="alert">
            <span>{errorText(rejectError)}</span>
            {rejectError.kind === "stale" ? <Button onClick={() => { setRejectError(undefined); reloadView(); }} variant="ghost">{t("admin-census:signupReview.actions.reload")}</Button> : null}
          </div>
        )}
        <Button disabled={rejectReason.trim().length < 3} loading={working} onClick={() => void reject()} variant="danger">{t("admin-census:signupReview.actions.reject")}</Button>
      </Modal>
    </section>
  );
}
