import type { components } from "../../generated/schema";

import brandingCanic from "./branding-canic.json";
import clubPagesFixture from "./club-pages.json";

export type Administrator = components["schemas"]["Administrator"];
export type ClubPage = components["schemas"]["ClubPage"];
export type FaqEntry = components["schemas"]["FaqEntry"];
export type Instructor = components["schemas"]["Instructor"];
export type Level = components["schemas"]["Level"];
export type Plan = components["schemas"]["Plan"] & {
  billingMode?: components["schemas"]["PlanBillingMode"];
};
export type Price = components["schemas"]["Price"];
export type Ring = components["schemas"]["Ring"];

const ringColor = (index: number): string =>
  brandingCanic.theme.ringPalette[index] ?? "currentColor";

const initialRings: Ring[] = [
  {
    active: true,
    allowsFreeTraining: true,
    color: ringColor(0),
    effectiveTrainingCapacity: 1,
    id: "ring-muntanya",
    name: "Muntanya",
    order: 0,
    shortName: "MUN",
    usage: {
      futureClassSessions: 4,
      futureTrainingBookings: 2,
      ringBlocks: 0,
      templateClasses: 3,
    },
    version: 1,
  },
  {
    active: true,
    allowsFreeTraining: true,
    color: ringColor(1),
    effectiveTrainingCapacity: 1,
    id: "ring-central",
    name: "Central",
    order: 10,
    shortName: "CEN",
    version: 1,
  },
  {
    active: true,
    allowsFreeTraining: true,
    color: ringColor(2),
    effectiveTrainingCapacity: 1,
    id: "ring-carretera",
    name: "Carretera",
    order: 20,
    shortName: "CAR",
    version: 1,
  },
  {
    active: true,
    allowsFreeTraining: false,
    color: ringColor(3),
    effectiveTrainingCapacity: 1,
    id: "ring-cadells",
    name: "Cadells",
    order: 30,
    shortName: "CAD",
    version: 1,
  },
  {
    active: true,
    allowsFreeTraining: false,
    color: ringColor(4),
    effectiveTrainingCapacity: 1,
    id: "ring-petita",
    name: "Petita",
    order: 40,
    shortName: "PET",
    version: 1,
  },
];

const level = (
  code: string,
  name: string,
  color: string,
  capacity: number,
  order: number,
  grantsFreeTraining: boolean,
): Level => ({
  active: true,
  capacity,
  code,
  color,
  grantsFreeTraining,
  id: `level-${code.toLocaleLowerCase()}`,
  name,
  nameI18n: { ca: name, en: name, es: name },
  order,
  version: 1,
});

const initialLevels: Level[] = [
  level("P", "Cadells", ringColor(3), 5, 0, false),
  level("A", "Nivell A", ringColor(0), 5, 10, false),
  level("B", "Nivell B", ringColor(0), 5, 20, false),
  level("C", "Nivell C", ringColor(1), 5, 30, false),
  level("D", "Nivell D", ringColor(1), 5, 40, true),
  level("E", "Nivell E", ringColor(4), 4, 50, true),
  level("F", "Nivell F", ringColor(4), 4, 60, true),
  level("G", "Nivell G", ringColor(2), 4, 70, true),
  level("T", "Teràpia", ringColor(2), 1, 80, false),
];

const initialInstructors: Instructor[] = [
  {
    active: true,
    color: brandingCanic.theme.colors.primary,
    id: "instructor-laura",
    memberId: "member-laura",
    shortName: "Laura",
    version: 1,
  },
  {
    active: true,
    color: ringColor(1),
    id: "instructor-marc",
    memberId: "member-marc",
    shortName: "Marc",
    version: 1,
  },
  {
    active: true,
    color: ringColor(4),
    id: "instructor-anna",
    memberId: "member-anna",
    shortName: "Anna",
    version: 1,
  },
  {
    active: true,
    color: ringColor(3),
    id: "instructor-sergio",
    memberId: "member-sergio",
    shortName: "Sergio",
    version: 1,
  },
];

const initialAdministrators: Administrator[] = [
  {
    active: true,
    memberId: "member-laura",
    membershipId: "membership-laura",
    shortName: "Laura",
    since: "2023-02-03",
    version: 1,
  },
  {
    active: true,
    memberId: "member-marc",
    membershipId: "membership-marc",
    shortName: "Marc",
    since: "2026-01-10",
    version: 1,
  },
  {
    active: false,
    memberId: "member-montse",
    membershipId: "membership-montse",
    shortName: "Montse",
    since: "2021-09-04",
    version: 1,
  },
];

const money = (amountMinor: number): components["schemas"]["Money"] => ({
  amountMinor,
  currency: "EUR",
});

const price = (
  id: string,
  planId: string,
  amountMinor: number,
  concept: Price["concept"],
  status: Price["status"],
  validFrom: string,
  validTo?: string,
): Price => ({
  amount: money(amountMinor),
  concept,
  id,
  locked: status !== "SCHEDULED",
  periodicity: concept === "MONTHLY_FEE" || concept === "MAINTENANCE_FEE" ? "MONTHLY" : "ONE_OFF",
  planId,
  status,
  taxPercent: 21,
  validFrom,
  ...(validTo === undefined ? {} : { validTo }),
  version: 1,
});

const initialPlans: Plan[] = [
  {
    active: true,
    billingMode: "MONTHLY_FEE",
    code: "MEMBER",
    conditions: "fins a dues classes per setmana",
    conditionsI18n: {
      ca: "fins a dues classes per setmana",
      en: "up to two classes per week",
      es: "hasta dos clases por semana",
    },
    currentPrices: [
      price("price-member", "plan-member", 6000, "MONTHLY_FEE", "CURRENT", "2026-01-01"),
    ],
    dogsIncluded: 1,
    entryFee: { mode: "STANDARD" },
    id: "plan-member",
    name: "Abonat",
    nameI18n: { ca: "Abonat", en: "Member", es: "Abonado" },
    order: 0,
    prices: [
      price(
        "price-member-old",
        "plan-member",
        5500,
        "MONTHLY_FEE",
        "EXPIRED",
        "2025-01-01",
        "2025-12-31",
      ),
      price("price-member", "plan-member", 6000, "MONTHLY_FEE", "CURRENT", "2026-01-01"),
      price("price-member-next", "plan-member", 6500, "MONTHLY_FEE", "SCHEDULED", "2026-10-01"),
    ],
    showOnSignup: true,
    showOnWeb: true,
    texts: {
      description:
        "Classe sempre amb instructor. Possibilitat d'entrenament lliure fora d'hores de classe a partir de nivell D amb llicència esportiva.",
      descriptionI18n: {
        ca: "Classe sempre amb instructor. Possibilitat d'entrenament lliure fora d'hores de classe a partir de nivell D amb llicència esportiva.",
        en: "Classes always have an instructor. Free training is available outside class hours from level D with a sports licence.",
        es: "Clase siempre con instructor. Posibilidad de entrenamiento libre fuera del horario de clase a partir del nivel D con licencia deportiva.",
      },
      offerLabel: "Ofertes si es porta més d'un gos per família",
      offerLabelI18n: {
        ca: "Ofertes si es porta més d'un gos per família",
        en: "Offers when bringing more than one dog per family",
        es: "Ofertas al traer más de un perro por familia",
      },
    },
    type: "MONTHLY",
    version: 1,
  },
  {
    active: true,
    billingMode: "MONTHLY_FEE",
    code: "FAMILY_TWO",
    conditions: "50% de la quota a partir del 2n gos · pagador únic del grup",
    currentPrices: [
      price("price-family", "plan-family", 9000, "MONTHLY_FEE", "CURRENT", "2026-01-01"),
    ],
    dogsIncluded: 2,
    entryFee: { mode: "PERCENT", percent: 50 },
    id: "plan-family",
    name: "Abonat · 2 gossos",
    order: 10,
    prices: [price("price-family", "plan-family", 9000, "MONTHLY_FEE", "CURRENT", "2026-01-01")],
    showOnSignup: true,
    showOnWeb: true,
    type: "MONTHLY",
    version: 1,
  },
  {
    active: true,
    code: "PACK_6",
    conditions: "vigència 3 mesos · només un cop",
    currentPrices: [price("price-pack-6", "plan-pack-6", 13500, "PACK", "CURRENT", "2026-01-01")],
    dogsIncluded: 1,
    entryFee: { mode: "STANDARD" },
    id: "plan-pack-6",
    name: "Pack 6",
    order: 20,
    pack: { sessions: 6, validityMonths: 3 },
    prices: [price("price-pack-6", "plan-pack-6", 13500, "PACK", "CURRENT", "2026-01-01")],
    showOnSignup: true,
    showOnWeb: true,
    type: "PACK",
    version: 1,
  },
  {
    active: true,
    code: "PACK_10",
    conditions: "vigència 5 mesos · només un cop · després 40% dte. en matrícula",
    currentPrices: [price("price-pack-10", "plan-pack-10", 18000, "PACK", "CURRENT", "2026-01-01")],
    dogsIncluded: 1,
    entryFee: { mode: "PERCENT", percent: 40 },
    id: "plan-pack-10",
    name: "Pack 10",
    order: 30,
    pack: { sessions: 10, validityMonths: 5 },
    prices: [price("price-pack-10", "plan-pack-10", 18000, "PACK", "CURRENT", "2026-01-01")],
    showOnSignup: true,
    showOnWeb: true,
    type: "PACK",
    version: 1,
  },
  {
    active: true,
    billingMode: "MAINTENANCE",
    code: "THERAPY",
    conditions:
      "pagament inicial a compte del 50% de l'entrada i quota manteniment en tant no es faci classe en grup",
    currentPrices: [],
    dogsIncluded: 1,
    entryFee: { mode: "PERCENT", percent: 50 },
    id: "plan-therapy",
    name: "Teràpia",
    order: 40,
    prices: [],
    showOnSignup: true,
    showOnWeb: true,
    type: "MONTHLY",
    version: 1,
  },
];

const initialFaqEntries: FaqEntry[] = [
  {
    active: true,
    answer: "Sí, sempre que respecti les normes del club.",
    answerI18n: {
      ca: "Sí, sempre que respecti les normes del club.",
      en: "Yes, provided they respect the club rules.",
      es: "Sí, siempre que respete las normas del club.",
    },
    category: "Convivència al club",
    categoryI18n: {
      ca: "Convivència al club",
      en: "At the club",
      es: "Convivencia en el club",
    },
    id: "faq-visitors",
    order: 0,
    question: "Puc venir amb més gent al club?",
    questionI18n: {
      ca: "Puc venir amb més gent al club?",
      en: "Can I bring other people to the club?",
      es: "¿Puedo venir con más gente al club?",
    },
    version: 1,
  },
  {
    active: true,
    answer: "Només a les zones indicades.",
    category: "Convivència al club",
    id: "faq-off-lead",
    order: 10,
    question: "El gos pot anar deslligat pel club?",
    version: 1,
  },
  {
    active: true,
    answer: "Anul·la la reserva des de l'app.",
    category: "Reserves de classe",
    id: "faq-cancel",
    order: 20,
    question: "Què he de fer si no puc venir a una classe?",
    version: 1,
  },
  {
    active: true,
    answer: "Consulta els requisits de la federació.",
    category: "Competicions",
    id: "faq-competitions",
    order: 30,
    question: "Què cal per poder participar a competicions d'agility?",
    version: 1,
  },
];

const initialClubPages = clubPagesFixture as ClubPage[];

export const catalogState: {
  administrators: Administrator[];
  clubPages: ClubPage[];
  faqEntries: FaqEntry[];
  instructors: Instructor[];
  levels: Level[];
  plans: Plan[];
  rings: Ring[];
} = {
  administrators: structuredClone(initialAdministrators),
  clubPages: structuredClone(initialClubPages),
  faqEntries: structuredClone(initialFaqEntries),
  instructors: structuredClone(initialInstructors),
  levels: structuredClone(initialLevels),
  plans: structuredClone(initialPlans),
  rings: structuredClone(initialRings),
};

export function resetCatalogState(): void {
  catalogState.administrators = structuredClone(initialAdministrators);
  catalogState.clubPages = structuredClone(initialClubPages);
  catalogState.faqEntries = structuredClone(initialFaqEntries);
  catalogState.instructors = structuredClone(initialInstructors);
  catalogState.levels = structuredClone(initialLevels);
  catalogState.plans = structuredClone(initialPlans);
  catalogState.rings = structuredClone(initialRings);
}
