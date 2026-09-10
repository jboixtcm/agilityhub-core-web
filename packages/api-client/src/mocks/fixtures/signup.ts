import type { components } from "../../generated/schema";

import signupConfigFixture from "./signup-config-canic.json";

export type SignupConfig = components["schemas"]["SignupConfig"];
export type SignupRequest = components["schemas"]["SignupRequest"];
export type MemberDogSignupRequest = components["schemas"]["MemberDogSignupRequest"];

const baseline = signupConfigFixture as SignupConfig;

const content = {
  ca: {
    additional: "Quota addicional del gos",
    closed: "En aquest moment no es poden enviar sol·licituds d'alta.",
  },
  en: {
    additional: "Additional dog fee",
    closed: "Signup requests cannot be submitted at this time.",
    plans: ["Member", "Pack 6", "Pack 10", "Therapy"],
    planConditions: "One time only",
    planDiscount: "then 40% off the registration fee",
    therapyDescription: "conditions and cost depend on each case",
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
    options: [
      "Start today, 17 August (half month)",
      "Start on 1 September (full month)",
    ],
    entry: "Joining fee (1 dog)",
  },
  es: {
    additional: "Cuota adicional del perro",
    closed: "En este momento no se pueden enviar solicitudes de alta.",
    plans: ["Socio", "Bono 6", "Bono 10", "Terapia"],
    planConditions: "Una sola vez",
    planDiscount: "después 40 % de descuento en la matrícula",
    therapyDescription: "condiciones y coste según cada caso",
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
    options: [
      "Alta hoy, 17 de agosto (medio mes)",
      "Alta el 1 de septiembre (mes completo)",
    ],
    entry: "Entrada (1 perro)",
  },
} as const;

function localeFrom(value: string | null): keyof typeof content {
  const locale = value?.toLocaleLowerCase().split(/[-,]/u)[0];
  return locale === "es" || locale === "en" ? locale : "ca";
}

function translatedConfig(locale: keyof typeof content): SignupConfig {
  const config = structuredClone(baseline);
  if (locale === "ca") {
    return config;
  }
  const translated = content[locale];
  config.plans.forEach((plan, index) => {
    plan.name = translated.plans[index] ?? plan.name;
    if (plan.conditions !== undefined) plan.conditions = translated.planConditions;
    if (plan.offerLabel !== undefined) plan.offerLabel = translated.offer;
    if (plan.pack?.discountLabel !== undefined) plan.pack.discountLabel = translated.planDiscount;
    if (plan.id === "plan-therapy") plan.description = translated.therapyDescription;
  });
  config.paymentMethods.forEach((method, index) => {
    method.label = translated.paymentLabels[index] ?? method.label;
    if (method.mandateText !== undefined) method.mandateText = translated.mandate;
    if (method.instructions !== undefined) method.instructions = translated.instructions;
  });
  config.texts = {
    cashConditions: translated.cash,
    familyGroupIntro: translated.family,
    freeTrainingConditions: translated.freeTraining,
    monthlyPaymentIntro: translated.monthly,
    paymentDay: translated.paymentDay,
    therapyIntro: translated.therapy,
  };
  config.legal.imageConsentText = translated.image;
  config.upfront?.firstMonthOptions.forEach((option, index) => {
    option.label = translated.options[index] ?? option.label;
  });
  const entry = config.upfront?.lines.find((line) => line.type === "ENTRY_FEE");
  if (entry !== undefined) entry.label = translated.entry;
  return config;
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
}: {
  acceptLanguage: string | null;
  billing: boolean;
  enabled: boolean;
  familyGroup: boolean;
  packs: boolean;
  privacyPolicyUrl: string;
  stripe: boolean;
  member?: SignupConfig["member"];
}): SignupConfig {
  const locale = localeFrom(acceptLanguage);
  const config = translatedConfig(locale);
  config.enabled = enabled;
  config.closedText = content[locale].closed;
  config.legal.privacyPolicyUrl = privacyPolicyUrl;
  if (!familyGroup) {
    config.steps = config.steps.filter((step) => step !== "FAMILY");
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
    config.paymentMethods = [];
    delete config.upfront;
    config.plans = config.plans.map((plan) => {
      const copy = { ...plan };
      delete copy.entryFee;
      delete copy.maintenanceFee;
      delete copy.price;
      return copy;
    });
  } else if (stripe) {
    config.paymentMethods.splice(1, 0, {
      label: locale === "ca" ? "Targeta" : locale === "es" ? "Tarjeta" : "Card",
      type: "CARD",
    });
  }
  if (member === undefined) {
    delete config.member;
  } else {
    config.member = member;
    if (config.upfront !== undefined) {
      config.upfront.lines = [
        ...config.upfront.lines,
        {
          amount: { amountMinor: 3000, currency: config.upfront.totalDue.currency },
          label: content[locale].additional,
          type: "ADDITIONAL_DOG_FEE",
        },
      ];
    }
  }
  return config;
}

const configuredMember = baseline.member;
if (configuredMember === undefined) {
  throw new TypeError("The signup fixture requires a member variant");
}
export const signupMemberFixture = configuredMember;

export const signupTownFixtures: Readonly<Record<string, components["schemas"]["SignupTown"][]>> = {
  "08001": [
    { name: "Poble Antic", region: "Barcelona" },
    { name: "Poble Centre", region: "Barcelona" },
    { name: "Poble Nou", region: "Barcelona" },
  ],
  "08349": [{ name: "Cabrera de Mar", region: "Barcelona" }],
};
