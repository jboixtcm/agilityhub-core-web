import type { components } from "../../generated/schema";

import memberSignupReviewFixture from "./member-signup-review.json";

export type MemberSignupView = components["schemas"]["MemberSignupView"];
type PendingSignup = components["schemas"]["PendingSignup"];
type SignupUpfrontReview = components["schemas"]["SignupUpfrontReview"];
type UpfrontLine = components["schemas"]["UpfrontLine"];
type ValidationDryRun = components["schemas"]["ValidationDryRun"];
type ValidationRequest = components["schemas"]["ValidationRequest"];
type Warning = components["schemas"]["SignupWarning"];

/**
 * The D2 variants of the Marta Roca signup (S04 §2 D2): the default is the mockup (a FOUND family
 * claim and a Stripe payment); `manual` has nothing paid yet; `addDog` is an ACTIVE member whose
 * new dog waits (R-04-25); `familyPending` is a family claim the applicant could not match
 * (`NOT_FOUND_PENDING`, R-04-13).
 */
export type SignupReviewVariant = "addDog" | "familyPending" | "manual";

export const signupReviewBaseline = memberSignupReviewFixture as MemberSignupView;

/** «Avui» of the D1/D2 mock world (dashboard `today`). */
const MOCK_TODAY = "2026-08-10";
const REQUESTED_NEXT_INVOICE = "2026-09-01";

function eur(amountMinor: number) {
  return { amountMinor, currency: "EUR" };
}

function totals(lines: readonly UpfrontLine[]) {
  const live = lines.filter((line) => line.status !== "CANCELLED" && line.status !== "REFUNDED");
  return {
    totalDue: eur(live.reduce((sum, line) => sum + line.amount.amountMinor, 0)),
    totalPaid: eur(live.reduce((sum, line) => sum + (line.paidAmount?.amountMinor ?? 0), 0)),
  };
}

function dueLines(lines: readonly UpfrontLine[]): UpfrontLine[] {
  return lines.map((line) => {
    const due: UpfrontLine = { ...line, provider: "MANUAL", status: "DUE" };
    delete due.paidAmount;
    return due;
  });
}

/** The view `GET /members/{id}/signup` answers for one variant of the Marta Roca signup. */
export function signupReviewVariant(
  base: MemberSignupView,
  variant: SignupReviewVariant | undefined,
): MemberSignupView {
  const view = structuredClone(base);
  if (variant === "manual" && view.upfront !== undefined) {
    view.upfront.lines = dueLines(view.upfront.lines);
    view.upfront = { ...view.upfront, ...totals(view.upfront.lines) };
    view.warnings = [...view.warnings, "UPFRONT_UNPAID"];
  }
  if (variant === "familyPending") {
    // What the applicant typed on 17; the api found no ACTIVE member with it.
    view.familyGroupClaim = { dogName: "Duna", holderName: "Laura Serra", status: "NOT_FOUND_PENDING" };
    delete view.proposals.familyGroupId;
    view.warnings = [...view.warnings, "FAMILY_HOLDER_NOT_FOUND"];
  }
  return view;
}

/**
 * Add-dog (R-04-25): Marta is ACTIVE with Kiwi, and the pending dog is Nit, sent from the app. The
 * member's version has moved on (her own edits); the new dog has its own, lower version.
 */
export function addDogSignupReview(base: MemberSignupView): MemberSignupView {
  const view = structuredClone(base);
  view.member = {
    ...view.member,
    displayStatus: { kind: "ACTIVE", label: "alta" },
    status: "ACTIVE",
    version: 7,
  };
  view.version = 7;
  view.signup = { ...view.signup, pendingDays: 1, source: "APP_ADD_DOG", submittedAt: "2026-08-09T18:40:00Z" };
  view.dogs = [
    {
      birthMonth: "2025-11",
      breed: "Border collie",
      chip: "941000031415926",
      documents: [
        {
          files: [{ downloadUrl: "https://files.example.test/cartilla_Nit.pdf", name: "cartilla_Nit.pdf" }],
          state: "RECEIVED",
          type: "VACCINATION_CARD",
        },
      ],
      id: "44000000-0000-4000-8000-000000000009",
      name: "Nit",
      sex: "MALE",
      status: "PENDING",
      version: 0,
    },
  ];
  delete view.familyGroupClaim;
  delete view.proposals.familyGroupId;
  view.upfront = {
    lines: [
      { amount: eur(10000), concept: "ENTRY_FEE", id: "45000000-0000-4000-8000-000000000009", provider: "MANUAL", status: "DUE" },
      { amount: eur(3000), concept: "ADDITIONAL_DOG_FEE", id: "45000000-0000-4000-8000-000000000010", provider: "MANUAL", status: "DUE" },
    ],
    totalDue: eur(13000),
    totalPaid: eur(0),
  };
  view.warnings = ["UPFRONT_UNPAID"];
  return view;
}

/** D1 row of the add-dog variant: the same member, now with «Nit (nou gos)». */
export function addDogPendingSignup(item: PendingSignup): PendingSignup {
  return {
    ...item,
    dogs: [{ breed: "border", isAddDog: true, name: "Nit" }],
    pendingDays: 1,
    submittedAt: "2026-08-09T18:40:00Z",
  };
}

/**
 * The views of the other D1 rows (Pol C., Núria T.): the Marta view with the row's person, dogs,
 * plan and payment, each dog with its own version and the plan's upfront lines still due.
 */
export function derivedSignupReview(base: MemberSignupView, pending: PendingSignup): MemberSignupView {
  const view = structuredClone(base);
  const plan = view.planOptions.find((option) => option.name === pending.planName) ?? view.planOptions[0];
  view.member.id = pending.memberId;
  view.member.firstName = pending.shortName.split(" ")[0] ?? pending.shortName;
  view.member.fullName = pending.shortName;
  view.member.accountMissing = (pending.warnings ?? []).includes("ACCOUNT_NOT_PROVIDED");
  if (pending.paymentMethodType === "MANUAL") {
    view.member.paymentMethod = { channel: "Efectiu", type: "MANUAL" };
    delete view.member.maskedAccount;
  } else if (view.member.accountMissing) {
    view.member.paymentMethod = { type: "SEPA_DD" };
    delete view.member.maskedAccount;
  }
  view.signup.pendingDays = pending.pendingDays;
  view.signup.submittedAt = pending.submittedAt;
  view.signup.source = pending.dogs.some((dog) => dog.isAddDog) ? "APP_ADD_DOG" : "PUBLIC";
  view.warnings = [...(pending.warnings ?? [])];
  delete view.familyGroupClaim;
  delete view.proposals.familyGroupId;
  const template = view.dogs[0];
  if (template !== undefined) {
    view.dogs = pending.dogs.map((dog, index) => ({
      ...template,
      breed: dog.breed,
      id: `44000000-0000-4000-8000-0000000000${String(index + 2).padStart(2, "0")}`,
      name: dog.name,
      version: 1,
    }));
  }
  if (plan !== undefined) {
    const price = plan.prices[0];
    view.member.plan = { id: plan.planId, name: plan.name, type: plan.type };
    view.member.planId = plan.planId;
    view.signup.planIdRequested = plan.planId;
    view.proposals.planId = plan.planId;
    if (price === undefined) delete view.proposals.priceId;
    else view.proposals.priceId = price.priceId;
    if (plan.type !== "MONTHLY") delete view.proposals.nextInvoiceDate;
    // Nothing collected yet: the plan's lines are all due.
    view.upfront = quoteUpfront({ ...view, upfront: { lines: [], totalDue: eur(0), totalPaid: eur(0) } }, plan.planId, []);
  }
  return view;
}

/**
 * R-04-14/15 lines of a plan for the dry run: MONTHLY with a MONTHLY_FEE → entry fee + first month
 * (the requested plan keeps the start frozen at submission; another starts today, a full month);
 * PACK → the pack; a MAINTENANCE plan (Teràpia) → its entry fee only.
 */
function quoteLines(view: MemberSignupView, planId: string): {
  firstMonth?: SignupUpfrontReview["firstMonth"];
  lines: { amount: number; concept: UpfrontLine["concept"] }[];
  nextInvoiceDate?: string;
} {
  const plan = view.planOptions.find((option) => option.planId === planId);
  const price = plan?.prices[0];
  if (plan === undefined || price === undefined) return { lines: [] };
  if (plan.type === "PACK") return { lines: [{ amount: price.amount.amountMinor, concept: "PACK" }] };
  if (price.concept === "MAINTENANCE_FEE") {
    return { lines: [{ amount: 5000, concept: "ENTRY_FEE" }], nextInvoiceDate: REQUESTED_NEXT_INVOICE };
  }
  const requested = planId === view.signup.planIdRequested;
  const frozen = view.upfront?.firstMonth;
  const firstMonth =
    requested && frozen !== undefined
      ? { ...frozen, amountDue: eur(frozen.portion === "HALF" ? Math.round(price.amount.amountMinor / 2) : price.amount.amountMinor) }
      : { amountDue: price.amount, option: "TODAY" as const, portion: "FULL" as const, startDate: MOCK_TODAY };
  return {
    firstMonth,
    lines: [
      { amount: 10000, concept: "ENTRY_FEE" },
      { amount: firstMonth.amountDue.amountMinor, concept: "FIRST_MONTH" },
    ],
    nextInvoiceDate: REQUESTED_NEXT_INVOICE,
  };
}

/**
 * The upfront block of a plan (S04 §5, E39): PAID and PARTIAL rows are kept as they are and their
 * paid amount is deducted from the new amount due; DUE rows are replaced by the new plan's lines.
 */
function quoteUpfront(view: MemberSignupView, planId: string, warnings: Warning[]): SignupUpfrontReview {
  const quote = quoteLines(view, planId);
  const kept = (view.upfront?.lines ?? []).filter((line) => line.status === "PAID" || line.status === "PARTIAL");
  const paid = kept.reduce((sum, line) => sum + (line.paidAmount?.amountMinor ?? 0), 0);
  const quoteTotal = quote.lines.reduce((sum, line) => sum + line.amount, 0);
  let remaining = Math.max(0, quoteTotal - paid);
  const fresh: UpfrontLine[] = [];
  quote.lines.forEach((line, index) => {
    const alreadyPaid = kept.some((candidate) => candidate.concept === line.concept && candidate.amount.amountMinor === line.amount);
    if (alreadyPaid || remaining === 0) return;
    const amount = Math.min(line.amount, remaining);
    remaining -= amount;
    fresh.push({
      amount: eur(amount),
      concept: line.concept,
      id: `45000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
      provider: "MANUAL",
      status: "DUE",
    });
  });
  const lines = [...kept, ...fresh];
  const upfront: SignupUpfrontReview = { lines, ...totals(lines) };
  if (quote.firstMonth !== undefined) upfront.firstMonth = quote.firstMonth;
  if (paid > quoteTotal) {
    upfront.paidExceedsQuote = eur(paid - quoteTotal);
    warnings.push("PAID_EXCEEDS_QUOTE");
  }
  return upfront;
}

/** `POST /members/{id}/validation?dryRun=true` of the mock world. */
export function signupReviewDryRun(view: MemberSignupView, body: ValidationRequest): ValidationDryRun {
  const planId = body.planId ?? view.proposals.planId ?? view.signup.planIdRequested ?? "";
  const plan = view.planOptions.find((option) => option.planId === planId);
  const price = plan?.prices.find((candidate) => candidate.priceId === body.priceId) ?? plan?.prices[0];
  const warnings: Warning[] = view.warnings.filter((warning) => warning !== "UPFRONT_UNPAID");
  const checkoutPending = (view.upfront?.lines ?? []).some((line) => line.status === "CHECKOUT_PENDING");
  if (checkoutPending && planId !== view.signup.planIdRequested) warnings.push("CHECKOUT_PENDING");
  const upfront = quoteUpfront(view, planId, warnings);
  const quote = quoteLines(view, planId);
  if (upfront.totalPaid.amountMinor < upfront.totalDue.amountMinor) warnings.push("UPFRONT_UNPAID");
  return {
    ...(body.nextInvoiceDate === undefined
      ? quote.nextInvoiceDate === undefined
        ? {}
        : { nextInvoiceDate: quote.nextInvoiceDate }
      : { nextInvoiceDate: body.nextInvoiceDate }),
    ...(price === undefined ? {} : { price: { amount: price.amount, id: price.priceId, periodicity: price.periodicity } }),
    upfront,
    warnings,
  };
}

/** Whether the plan of a validation request needs `nextInvoiceDate` (BILLING and a MONTHLY plan). */
export function signupReviewNeedsInvoiceDate(view: MemberSignupView, body: ValidationRequest): boolean {
  const planId = body.planId ?? view.proposals.planId;
  return view.planOptions.find((option) => option.planId === planId)?.type === "MONTHLY";
}

type DogDocument = components["schemas"]["DogDocument"];
type SignupDog = MemberSignupView["dogs"][number];

const documentTypeLabels: Readonly<Record<string, string>> = {
  INSURANCE: "Assegurança",
  VACCINATION_CARD: "Cartilla de vacunes",
};

/** `GET /dogs/{id}/documents` of a pending signup dog, built from the D2 view (R-04-19). */
export function signupDogDocuments(dog: SignupDog): DogDocument[] {
  return dog.documents.map((document, documentIndex) => ({
    files: document.files.map((file, fileIndex) => ({
      id: `48000000-0000-4000-8000-${dog.id.slice(-6)}${String(documentIndex)}${String(fileIndex).padStart(5, "0")}`,
      name: file.name,
      uploadedAt: "2026-08-08T10:02:00Z",
      url: file.downloadUrl,
    })),
    id: `49000000-0000-4000-8000-${dog.id.slice(-6)}${String(documentIndex).padStart(6, "0")}`,
    state: document.state,
    type: document.type,
    typeLabel: documentTypeLabels[document.type] ?? document.type,
  }));
}

/** Writes the documents back to the D2 view, so the next `GET /members/{id}/signup` shows them. */
export function storeSignupDogDocuments(dog: SignupDog, documents: readonly DogDocument[]): void {
  dog.documents = documents.map((document) => ({
    files: document.files.map((file) => ({ downloadUrl: file.url, name: file.name })),
    state: document.state,
    type: document.type,
  }));
}

/** R-04-23: a rejection with a collected payment tells the admin to refund it through billing. */
export function signupReviewHasCollectedPayment(view: MemberSignupView): boolean {
  return (view.upfront?.lines ?? []).some(
    (line) => line.status === "PAID" || (line.status === "PARTIAL" && (line.paidAmount?.amountMinor ?? 0) > 0),
  );
}
