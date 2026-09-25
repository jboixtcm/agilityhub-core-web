import type { components } from "../../generated/schema";

import signupConfigFixture from "./signup-config-canic.json";

export type SignupConfig = components["schemas"]["SignupConfig"];
export type SignupRequest = components["schemas"]["SignupRequest"];
export type MemberDogSignupRequest = components["schemas"]["AddDogSignupRequest"];
type Money = components["schemas"]["Money"];
type SignupPlan = components["schemas"]["SignupPlan"];
type SignupPlanQuote = components["schemas"]["SignupPlanQuote"];
type SignupQuoteOption = components["schemas"]["SignupQuoteOption"];
type SignupUpfrontConfig = components["schemas"]["SignupUpfrontConfig"];
type UpfrontLine = components["schemas"]["UpfrontLine"];

type CompleteSignupConfig = SignupConfig & {
  legal: NonNullable<SignupConfig["legal"]>;
  plans: NonNullable<SignupConfig["plans"]>;
  steps: NonNullable<SignupConfig["steps"]>;
  texts: NonNullable<SignupConfig["texts"]>;
};

const baseline = signupConfigFixture as CompleteSignupConfig;

/** «Avui» of the mock club (`Europe/Madrid`) when a test or scenario does not set another day. */
export const SIGNUP_MOCK_TODAY = "2026-08-17";
/** `signup.firstMonthSplitDay`, `billing.upfrontCutoffDay` and the second-dog percentage (S04 §9). */
const FIRST_MONTH_SPLIT_DAY = 16;
const UPFRONT_CUTOFF_DAY = 25;
const SECOND_DOG_PERCENT = 50;

const content = {
  ca: {
    closed: "En aquest moment no es poden enviar sol·licituds d'alta.",
  },
  en: {
    closed: "Signup requests cannot be submitted at this time.",
    plans: ["Member", "Pack 6", "Pack 10", "Therapy"],
    planConditions: [
      "",
      "One time only",
      "One time only · then 40% off the joining fee",
      "conditions and cost depend on each case",
    ],
    offer: "Offers when a family brings more than one dog",
    paymentLabels: ["Direct debit", "Cash"],
    mandate:
      "I authorize the club to issue direct debits from this account while my relationship with the entity continues (Law 16/2009 of 13 November on payment services).",
    instructions:
      "The joining fee and current month will be paid directly to the club after the request is submitted.",
    freeTraining:
      "Classes always have an instructor and members can attend up to two per week. Free training outside class hours is also available from level D with a sporting licence.",
    therapy:
      "Individual therapy classes are also available, combined with group classes or as a preliminary step. Select Member or Pack when combining therapy with group classes; otherwise select Therapy.",
    family:
      "When a family registers more than one dog, a reduced monthly fee may apply from the second dog onwards. The joining fee still applies to each dog.",
    monthly:
      "The monthly fee is normally collected on day 1. Packs do not generate a recurring charge.",
    paymentDay:
      "If you stop attending the club or take a break, tell us before day 25 so the following month's direct debit can be changed.",
    cash: "Payments cover complete calendar periods. Contact the club to arrange them.",
    image:
      "I authorize publication of photographs of me and my dog in connection with club activities.",
  },
  es: {
    closed: "En este momento no se pueden enviar solicitudes de alta.",
    plans: ["Socio", "Bono 6", "Bono 10", "Terapia"],
    planConditions: [
      "",
      "Una sola vez",
      "Una sola vez · después 40 % de dto. en la matrícula",
      "condiciones y coste según cada caso",
    ],
    offer: "Ofertas si una familia trae más de un perro",
    paymentLabels: ["Domiciliación", "Efectivo"],
    mandate:
      "Autorizo al club a emitir recibos sobre esta cuenta mientras se mantenga mi relación con la entidad (Ley 16/2009, de 13 de noviembre, de servicios de pago).",
    instructions:
      "El pago de la entrada y el mes en curso se hará directamente al club después de enviar la solicitud.",
    freeTraining:
      "Las clases son siempre con instructor y se pueden hacer hasta dos por semana. También hay entrenamiento libre fuera del horario de clase a partir del nivel D con licencia deportiva.",
    therapy:
      "También se ofrecen clases de terapia individual, combinadas con clases en grupo o como paso previo. Selecciona Socio o Bono para combinarla con clases en grupo; en caso contrario, selecciona Terapia.",
    family:
      "Cuando una familia inscribe más de un perro, puede aplicarse una cuota mensual reducida a partir del segundo. La entrada corresponde a cada perro.",
    monthly:
      "La cuota mensual se cobrará normalmente el día 1. Los bonos no generan cargos periódicos.",
    paymentDay:
      "Si dejas de venir al club o haces una pausa, avísanos antes del día 25 para modificar el recibo del mes siguiente.",
    cash: "Los pagos cubren períodos naturales completos. Contacta con el club para coordinarlos.",
    image:
      "Autorizo la publicación de fotografías mías y de mi perro en el ámbito de las actividades del club.",
  },
} as const;

function localeFrom(value: string | null): keyof typeof content {
  const locale = value?.toLocaleLowerCase().split(/[-,]/u)[0];
  return locale === "es" || locale === "en" ? locale : "ca";
}

type PaymentType = NonNullable<SignupConfig["paymentMethods"]>[number]["type"];

/** The label `GET /signup` gives a payment method in the reader's language (R-04-10), offered or not. */
export function signupPaymentLabel(type: PaymentType, acceptLanguage: string | null): string {
  const locale = localeFrom(acceptLanguage);
  if (type === "CARD") return locale === "ca" ? "Targeta" : locale === "es" ? "Tarjeta" : "Card";
  return translatedConfig(locale).paymentMethods?.find((method) => method.type === type)?.label ?? type;
}

function translatedConfig(locale: keyof typeof content): CompleteSignupConfig {
  const config = structuredClone(baseline);
  if (locale === "ca") {
    return config;
  }
  const translated = content[locale];
  config.plans.forEach((plan, index) => {
    plan.name = translated.plans[index] ?? plan.name;
    plan.conditions = translated.planConditions[index] ?? plan.conditions;
    if (plan.offerLabel !== undefined) plan.offerLabel = translated.offer;
  });
  config.paymentMethods?.forEach((method, index) => {
    method.label = translated.paymentLabels[index] ?? method.label;
    if (method.mandateText !== undefined) method.mandateText = translated.mandate;
    if (method.instructions !== undefined) method.instructions = translated.instructions;
  });
  config.texts = {
    cashConditions: translated.cash,
    familyGroupIntro: translated.family,
    freeTrainingConditions: translated.freeTraining,
    imageConsent: translated.image,
    monthlyPaymentIntro: translated.monthly,
    paymentDay: translated.paymentDay,
    therapyIntro: translated.therapy,
  };
  config.legal.imageConsentText = translated.image;
  return config;
}

function money(amountMinor: number, currency: string): Money {
  return { amountMinor, currency };
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The standard monthly fee of a MONTHLY_FEE plan (a MAINTENANCE plan has none: no first month). */
function monthlyFee(plan: SignupPlan): number | undefined {
  return plan.type === "MONTHLY" &&
    plan.maintenanceFee === undefined &&
    plan.price?.periodicity === "MONTHLY"
    ? plan.price.amount.amountMinor
    : undefined;
}

/**
 * The quote of one plan on the club's `today`, computed like the api (R-04-14/15): the lines that
 * do not depend on the start (the entry fee only if > 0, the pack) and the two first-month options
 * of a monthly plan. Add-dog mode: the entry fee, and the options of the additional dog: TODAY with
 * the current month's additional fee, ALTERNATIVE (the 1st of next month, entry fee only) only up to
 * `billing.upfrontCutoffDay`.
 */
export function signupPlanQuote(
  plan: SignupPlan,
  today: string,
  { addDog = false, currency = "EUR" }: { addDog?: boolean; currency?: string } = {},
): SignupPlanQuote {
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number);
  const nextMonthStart = month === 12 ? isoDate(year + 1, 1, 1) : isoDate(year, month + 1, 1);
  const lines: SignupPlanQuote["lines"] = [];
  if (plan.type === "PACK" && plan.price !== undefined) {
    lines.push({ amount: money(plan.price.amount.amountMinor, currency), concept: "PACK" });
  }
  const entry = plan.entryFee?.amountMinor ?? 0;
  if (entry > 0) lines.unshift({ amount: money(entry, currency), concept: "ENTRY_FEE" });
  const linesTotal = lines.reduce((sum, line) => sum + line.amount.amountMinor, 0);
  const fee = monthlyFee(plan);
  const half = fee === undefined ? 0 : Math.round(fee / 2);
  const option = (
    kind: SignupQuoteOption["option"],
    portion: SignupQuoteOption["portion"],
    startDate: string,
    amountDue: number,
  ): SignupQuoteOption => ({
    amountDue: money(amountDue, currency),
    option: kind,
    portion,
    startDate,
    totalDue: money(linesTotal + amountDue, currency),
  });
  let options: SignupQuoteOption[] = [];
  if (fee !== undefined && addDog) {
    const additional = Math.round((fee * SECOND_DOG_PERCENT) / 100);
    options = [option("TODAY", "FULL", today, additional)];
    if (day <= UPFRONT_CUTOFF_DAY) options.push(option("ALTERNATIVE", "FULL", nextMonthStart, 0));
  } else if (fee !== undefined) {
    options =
      day < FIRST_MONTH_SPLIT_DAY
        ? [
            option("TODAY", "FULL", today, fee),
            option("ALTERNATIVE", "HALF", isoDate(year, month, FIRST_MONTH_SPLIT_DAY), half),
          ]
        : [
            option("TODAY", "HALF", today, half),
            option("ALTERNATIVE", "FULL", nextMonthStart, fee),
          ];
  }
  return { lines, options, planId: plan.id, totalDue: money(linesTotal, currency) };
}

/**
 * `GET /signup.upfront` of the mock club on `today` (S04 §6, R-04-14/15). Add-dog mode: the
 * `additionalDogOptions` are the options of the member's own plan.
 */
export function signupUpfrontConfig(
  plans: readonly SignupPlan[],
  today: string,
  { currency = "EUR", memberPlanId }: { currency?: string; memberPlanId?: string | undefined } = {},
): SignupUpfrontConfig {
  const addDog = memberPlanId !== undefined;
  const planQuotes = plans.map((plan) => signupPlanQuote(plan, today, { addDog, currency }));
  const choices = (quote: SignupPlanQuote | undefined) =>
    (quote?.options ?? []).map((option) => ({
      amount: option.amountDue,
      option: option.option,
      startDate: option.startDate,
    }));
  const firstMonthly = plans.find((plan) => monthlyFee(plan) !== undefined);
  const firstMonthlyQuote =
    firstMonthly === undefined ? undefined : signupPlanQuote(firstMonthly, today, { currency });
  return {
    ...(addDog
      ? { additionalDogOptions: choices(planQuotes.find((quote) => quote.planId === memberPlanId)) }
      : {}),
    firstMonthOptions: choices(firstMonthlyQuote),
    firstMonthSplitDay: FIRST_MONTH_SPLIT_DAY,
    planQuotes,
    today,
  };
}

export function signupConfig({
  acceptLanguage,
  billing,
  enabled,
  familyGroup,
  member,
  packs,
  privacyPolicyUrl,
  stripe,
  today = SIGNUP_MOCK_TODAY,
}: {
  acceptLanguage: string | null;
  billing: boolean;
  enabled: boolean;
  familyGroup: boolean;
  packs: boolean;
  privacyPolicyUrl: string;
  stripe: boolean;
  member?: SignupConfig["member"];
  /** The club's date (`CLUB.timeZone`) the quotes are computed for. */
  today?: string;
}): SignupConfig {
  const locale = localeFrom(acceptLanguage);
  const config = translatedConfig(locale);
  config.enabled = enabled;
  config.closedText = content[locale].closed;
  config.legal.privacyPolicyUrl = privacyPolicyUrl;
  if (!familyGroup) {
    // `signup.allowFamilyGroupPending` is present with FAMILY_GROUP only.
    delete config.allowFamilyGroupPending;
    config.steps = config.steps.filter((step) => step !== "FAMILY_GROUP");
    config.plans = config.plans.map((plan) => {
      const copy = { ...plan };
      delete copy.offerLabel;
      return copy;
    });
  }
  if (!packs) {
    config.plans = config.plans.filter((plan) => plan.type !== "PACK");
  }
  if (!billing) {
    delete config.paymentMethods;
    config.plans = config.plans.map((plan) => {
      const copy = { ...plan };
      delete copy.entryFee;
      delete copy.maintenanceFee;
      delete copy.price;
      return copy;
    });
  } else {
    // Add-dog mode also quotes the member's own plan (SignupUpfrontConfig.planQuotes).
    const quoted = [
      ...config.plans,
      ...baseline.plans.filter(
        (plan) => plan.id === member?.planId && !config.plans.some((offered) => offered.id === plan.id),
      ),
    ];
    config.upfront = signupUpfrontConfig(quoted, today, { memberPlanId: member?.planId });
    if (stripe) {
      config.paymentMethods?.splice(1, 0, {
        label: signupPaymentLabel("CARD", locale),
        type: "CARD",
      });
    }
  }
  if (member === undefined) {
    delete config.member;
  } else {
    config.member = member;
  }
  return config;
}

const configuredMember = baseline.member;
if (configuredMember === undefined) {
  throw new TypeError("The signup fixture requires a member variant");
}
export const signupMemberFixture = configuredMember;

export const signupTownFixtures: Readonly<Record<string, components["schemas"]["Town"][]>> = {
  "08001": [
    { name: "Poble Antic", region: "Barcelona" },
    { name: "Poble Centre", region: "Barcelona" },
    { name: "Poble Nou", region: "Barcelona" },
  ],
  "08349": [{ name: "Cabrera de Mar", region: "Barcelona" }],
};

/**
 * `SignupResult.upfront` of a submission (R-04-14): the plan's lines plus the chosen option, as a
 * `FIRST_MONTH` line (public) or an `ADDITIONAL_DOG_FEE` line (add-dog, only when > 0).
 */
export function signupResultUpfront(
  quote: SignupPlanQuote | undefined,
  chosen: SignupQuoteOption["option"] | undefined,
  { addDog = false }: { addDog?: boolean } = {},
): components["schemas"]["SignupUpfront"] {
  const option = quote?.options.find((candidate) => candidate.option === chosen) ?? quote?.options[0];
  const currency = quote?.totalDue.currency ?? "EUR";
  const concepts: { amount: Money; concept: UpfrontLine["concept"] }[] = [...(quote?.lines ?? [])];
  if (option !== undefined && option.amountDue.amountMinor > 0) {
    concepts.push({ amount: option.amountDue, concept: addDog ? "ADDITIONAL_DOG_FEE" : "FIRST_MONTH" });
  }
  // As the real core answers it (`signup-quote-add-dog-core.json`): each line DUE with a zero paid amount.
  const lines: UpfrontLine[] = concepts.map((line, index) => ({
    amount: line.amount,
    concept: line.concept,
    id: `30000000-0000-4000-8000-00000000000${String(index + 1)}`,
    paidAmount: money(0, line.amount.currency),
    status: "DUE",
  }));
  return {
    ...(addDog && option !== undefined
      ? { additionalDog: { amountDue: option.amountDue, option: option.option, startDate: option.startDate } }
      : {}),
    lines,
    totalDue: option?.totalDue ?? quote?.totalDue ?? money(0, currency),
  };
}
