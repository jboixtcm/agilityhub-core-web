import type { components } from "../../generated/schema";

import { clubLocalDate } from "./planning";

/**
 * The S12 world of D6 (E8-W01): the mockup's September 2026 with its simulation of 25/08, the run
 * generated that day (168 receipts, 6.480 €, collected on 01/09, ruling A28), its SEPA remittance,
 * August's history (collected, one bank return, a first attempt rolled back) and the provider
 * variants of the scenarios. Fictional people only; `ES00` account fragments.
 */

type BillingIncident = components["schemas"]["BillingIncident"];
type BillingIncidentCode = components["schemas"]["BillingIncidentCode"];
type BillingRun = components["schemas"]["BillingRun"];
type BillingSimulation = components["schemas"]["BillingSimulation"];
type ByProvider = components["schemas"]["ByProvider"];
type CashMember = components["schemas"]["CashMember"];
type Collection = components["schemas"]["Collection"];
type Invoice = components["schemas"]["Invoice"];
type InvoiceLineOrigin = components["schemas"]["InvoiceLineOrigin"];
type InvoiceListItem = components["schemas"]["InvoiceListItem"];
type InvoicePreview = components["schemas"]["InvoicePreview"];
type Money = components["schemas"]["Money"];
type PaymentMethodType = components["schemas"]["PaymentMethodType"];
type Remittance = components["schemas"]["Remittance"];
type RemittanceListItem = components["schemas"]["RemittanceListItem"];
type RollbackBlocker = components["schemas"]["RollbackBlocker"];
type SimulationKpis = components["schemas"]["SimulationKpis"];

export type BillingProvider = "MANUAL" | "SEPA_XML" | "STRIPE";

/**
 * The scenario variants (`scenarios.ts`): the Cànic's SEPA + cash (`default`), a cash-only club
 * (`manualOnly`), a card club (`stripe`), a remittance submitted by another admin just before the
 * rollback (`rollbackBlocked`) and a simulation older than the last change (`stale`).
 */
export type BillingVariant = "default" | "manualOnly" | "rollbackBlocked" | "stale" | "stripe";

/** Club-local Wednesday 26/08/2026 10:00: after the 25/08 simulation and run, before 01/09. */
export const BILLING_MOCK_NOW = "2026-08-26T08:00:00Z";
export const BILLING_MOCK_PERIOD = "2026-09";
const CURRENCY = "EUR";
const SERIES = "2026";
const ADMIN_ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
/** The club's creditor (CLUB.paymentProviders.SEPA_XML), as the remittance snapshot carries it. */
const CREDITOR = {
  bic: null,
  id: "ES00ZZZG00000000",
  maskedIban: "ES00 **** **** **** **** 0042",
  name: "Club Agility Fictici",
};

const MONTH_NAMES_CA = [
  "Gener",
  "Febrer",
  "Març",
  "Abril",
  "Maig",
  "Juny",
  "Juliol",
  "Agost",
  "Setembre",
  "Octubre",
  "Novembre",
  "Desembre",
] as const;

export function eur(amountMinor: number): Money {
  return { amountMinor, currency: CURRENCY };
}

/** A deterministic uuid of the billing world (`b{kind}000000-0000-4000-8000-{n}`). */
function uuid(kind: number, n: number): string {
  return `b${String(kind)}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** The frozen month of a description, in the club's `defaultLocale` (ca): «Setembre 2026». */
export function frozenMonth(period: string): string {
  const [year = "", month = "1"] = period.split("-");
  return `${MONTH_NAMES_CA[Number(month) - 1] ?? ""} ${year}`;
}

export function isPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/u.test(value);
}

export function shiftPeriod(period: string, months: number): string {
  const [year = 0, month = 1] = period.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------
// The members the runs bill (R-12-01…05), in the run's order.

interface BillingMember {
  amountMinor: number;
  /** A card the provider will refuse at charge time (`stripe`: «impagat (targeta)», R-12-13). */
  cardDeclined?: boolean;
  /** A card withdrawn after the run (`stripe`: FAILED{NO_PAYMENT_METHOD} at charge time). */
  cardInvalid?: boolean;
  concept: string;
  fullName: string;
  id: string;
  lastName: string;
  memberNumber: number;
  /** The method the Cànic's member has (`SEPA_DD` or `MANUAL`); the variants swap SEPA_DD. */
  method: "MANUAL" | "SEPA_DD";
  origin: InvoiceLineOrigin;
}

const FIRST_NAMES = [
  "Núria",
  "Albert",
  "Carla",
  "Oriol",
  "Mireia",
  "Pol",
  "Judit",
  "Arnau",
  "Laia",
  "Gerard",
  "Clàudia",
  "Bernat",
  "Aina",
  "Quim",
] as const;
const LAST_NAMES = [
  "Puig",
  "Ferrer",
  "Casals",
  "Vidal",
  "Riba",
  "Soler",
  "Bosch",
  "Font",
  "Roig",
  "Mas",
  "Pujol",
  "Camps",
  "Torrent",
] as const;

/** Pere Soler's place: in August his receipt is 2026-0871, the mockup's «impagat (manual)». */
const PERE_SOLER_INDEX = 127;
/** The other September bank return. */
const SECOND_RETURN_INDEX = 60;

function generatedMember(index: number): BillingMember {
  const sequence = index + 1;
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length] ?? "Núria";
  const lastName = `${LAST_NAMES[(index * 5) % LAST_NAMES.length] ?? "Puig"} ${String(sequence)}`;
  const cash = index >= 160;
  // 42 «Abonat» fees of 60 € and 118 maintenance fees of 30 € (S05 Teràpia), so the month's 168
  // receipts add up to the mockup's 6.480 €.
  const maintenance = !cash && index % 4 !== 0 && index < 160 && index >= 2;
  return {
    amountMinor: maintenance ? 3000 : 6000,
    concept: maintenance ? "Quota manteniment" : "Quota Abonat",
    fullName: `${firstName} ${lastName}`,
    id: uuid(1, 100 + sequence),
    lastName,
    memberNumber: 200 + sequence,
    method: cash ? "MANUAL" : "SEPA_DD",
    origin: maintenance ? "MAINTENANCE_FEE" : "MONTHLY_FEE",
  };
}

function billingMembers(): BillingMember[] {
  const featured: BillingMember[] = [
    {
      amountMinor: 9000,
      concept: "Quota Abonat 2 gossos",
      fullName: "Laura Serra",
      id: uuid(1, 1),
      lastName: "Serra",
      memberNumber: 87,
      method: "SEPA_DD",
      origin: "MONTHLY_FEE",
    },
    {
      amountMinor: 6000,
      concept: "Quota Abonat",
      fullName: "Marc Prats",
      id: uuid(1, 2),
      lastName: "Prats",
      memberNumber: 88,
      method: "SEPA_DD",
      origin: "MONTHLY_FEE",
    },
    {
      amountMinor: 1000,
      concept: "Quota inactivitat",
      fullName: "Eva Perez",
      id: uuid(1, 3),
      lastName: "Perez",
      memberNumber: 90,
      method: "SEPA_DD",
      origin: "INACTIVITY_FEE",
    },
    {
      amountMinor: 6000,
      concept: "Quota Abonat",
      fullName: "Joan Vila",
      id: uuid(1, 4),
      lastName: "Vila",
      memberNumber: 121,
      method: "MANUAL",
      origin: "MONTHLY_FEE",
    },
    {
      amountMinor: 6000,
      concept: "Quota Abonat",
      fullName: "Roser Camps",
      id: uuid(1, 5),
      lastName: "Camps",
      memberNumber: 122,
      method: "MANUAL",
      origin: "MONTHLY_FEE",
    },
    {
      amountMinor: 2000,
      concept: "Quota inactivitat",
      fullName: "Sílvia Roca",
      id: uuid(1, 6),
      lastName: "Roca",
      memberNumber: 95,
      method: "SEPA_DD",
      origin: "INACTIVITY_FEE",
    },
  ];
  // 162 more: 160 by direct debit and, last, two more paying cash.
  const generated = Array.from({ length: 162 }, (_, index) => generatedMember(index));
  const pere = generated[PERE_SOLER_INDEX - featured.length];
  if (pere !== undefined) {
    Object.assign(pere, {
      amountMinor: 6000,
      concept: "Quota Abonat",
      fullName: "Pere Soler",
      lastName: "Soler",
      origin: "MONTHLY_FEE",
    });
  }
  // `stripe`: Marc's card was withdrawn after the run; Laura's is declined when charged.
  const laura = featured[0];
  const marc = featured[1];
  if (laura !== undefined) laura.cardDeclined = true;
  if (marc !== undefined) marc.cardInvalid = true;
  return [...featured, ...generated];
}

const INCIDENTS: readonly BillingIncident[] = [
  { code: "NO_BANK_ACCOUNT", memberId: uuid(1, 901), memberName: "Joan Vila" },
  { code: "NO_PRICE", memberId: uuid(1, 902), memberName: "Pau Riera" },
];
const MANUAL_ONLY_INCIDENTS: readonly BillingIncident[] = [
  { code: "NO_PRICE", memberId: uuid(1, 902), memberName: "Pau Riera" },
  { code: "PROVIDER_DISABLED", memberId: uuid(1, 903), memberName: "Andreu Coll" },
];
const STRIPE_INCIDENTS: readonly BillingIncident[] = [
  { code: "CARD_INVALID", memberId: uuid(1, 904), memberName: "Joan Vila" },
  { code: "NO_PRICE", memberId: uuid(1, 902), memberName: "Pau Riera" },
];
/** «Actius amb pagament en efectiu» of the mockup, with their planned leave (S13). */
const CASH_MEMBERS: readonly CashMember[] = [
  { memberId: uuid(1, 4), memberName: "Joan Vila", plannedLeaveDate: "2026-12-31" },
  { memberId: uuid(1, 5), memberName: "Roser Camps", plannedLeaveDate: "2027-06-30" },
];

// ---------------------------------------------------------------------------------------------
// The stored world.

export interface StoredInvoice {
  invoice: Invoice;
  memberLastName: string;
  memberNumber: number | null;
  /** CANCELLED by a rollback (R-12-14, E87): listed only under the CANCELLED filter. */
  rolledBack: boolean;
}

export interface StoredRun {
  /**
   * The waiting manual SEPA receipts (`includeInNextRun`, E87) this run's remittance collects; its
   * rollback returns them to PENDING.
   */
  carriedInvoiceIds?: string[];
  /** The series numbers the run took, for the numbering given back by a rollback. */
  firstNumber: number;
  lastNumber: number;
  /** `GET /billing/runs/{id}` reads of a CHARGING run (the mock settles the cards on the second). */
  polls: number;
  previousNextNumber: number;
  run: Omit<BillingRun, "rollbackBlockers" | "rollbackable">;
}

export interface StoredSimulation {
  simulation: BillingSimulation;
  /** A member, price or billing parameter changed after it (R-12-07): 409 SIMULATION_STALE. */
  stale: boolean;
}

export interface IdempotentAnswer {
  body: unknown;
  signature: string;
  status: number;
}

export interface BillingWorld {
  idempotency: Map<string, IdempotentAnswer>;
  invoices: StoredInvoice[];
  members: BillingMember[];
  /** The series' next number (R-12-08). */
  nextNumber: number;
  providers: readonly BillingProvider[];
  remittances: Remittance[];
  /** `rollbackBlocked`: another admin marks the remittance submitted just before the rollback. */
  rollbackRace: boolean;
  runs: StoredRun[];
  sequence: number;
  simulations: Map<string, StoredSimulation>;
  variant: BillingVariant;
}

function providersOf(variant: BillingVariant): readonly BillingProvider[] {
  if (variant === "manualOnly") return ["MANUAL"];
  if (variant === "stripe") return ["STRIPE", "MANUAL"];
  return ["SEPA_XML", "MANUAL"];
}

/** The member's method in the club of the variant (no SEPA in a cash-only or a card club). */
export function memberMethod(world: BillingWorld, member: BillingMember): PaymentMethodType {
  if (member.method === "MANUAL") return "MANUAL";
  if (world.providers.includes("SEPA_XML")) return "SEPA_DD";
  return world.providers.includes("STRIPE") ? "CARD" : "MANUAL";
}

function providerOf(method: PaymentMethodType): BillingProvider {
  return method === "SEPA_DD" ? "SEPA_XML" : method === "CARD" ? "STRIPE" : "MANUAL";
}

function incidentsOf(variant: BillingVariant): readonly BillingIncident[] {
  if (variant === "manualOnly") return MANUAL_ONLY_INCIDENTS;
  if (variant === "stripe") return STRIPE_INCIDENTS;
  return INCIDENTS;
}

/** The KPIs of a month (R-12-07): counts and totals by provider of what the run would issue. */
export function simulationKpis(world: BillingWorld): SimulationKpis {
  const byProvider: ByProvider = {};
  let total = 0;
  for (const member of world.members) {
    const provider = providerOf(memberMethod(world, member));
    const current = byProvider[provider] ?? { count: 0, total: eur(0) };
    byProvider[provider] = {
      count: current.count + 1,
      total: eur(current.total.amountMinor + member.amountMinor),
    };
    total += member.amountMinor;
  }
  return {
    byProvider,
    cashPending: world.members.filter((member) => memberMethod(world, member) === "MANUAL").length,
    count: world.members.length,
    inactivityFees: {
      count: world.members.filter((member) => member.origin === "INACTIVITY_FEE").length,
      firstMonth: eur(2000),
      following: eur(1000),
    },
    total: eur(total),
  };
}

export function buildSimulation(
  world: BillingWorld,
  period: string,
  at: string,
): BillingSimulation {
  const preview: InvoicePreview[] = world.members.map((member) => ({
    lines: [
      {
        description: `${member.concept} — ${frozenMonth(period)}`,
        origin: member.origin,
        total: eur(member.amountMinor),
      },
    ],
    memberId: member.id,
    memberName: member.fullName,
    paymentMethodType: memberMethod(world, member),
    total: eur(member.amountMinor),
  }));
  world.sequence += 1;
  return {
    at,
    cashMembers: [...CASH_MEMBERS],
    id: uuid(5, world.sequence),
    incidents: [...incidentsOf(world.variant)],
    invoicesPreview: preview,
    kpis: simulationKpis(world),
    period,
  };
}

function displayNumber(number: number): string {
  return `${SERIES}-${String(number).padStart(4, "0")}`;
}

function mandateRef(member: BillingMember): string {
  return `canic-${String(member.memberNumber)}-1`;
}

function paymentMethodOf(world: BillingWorld, member: BillingMember): Invoice["paymentMethod"] {
  const type = memberMethod(world, member);
  if (type === "SEPA_DD") {
    return {
      channel: null,
      holderName: member.fullName,
      last4: null,
      mandateRef: mandateRef(member),
      maskedAccount: `ES00 **** **** **** **** ${String(1000 + (member.memberNumber % 9000)).slice(-4)}`,
      type,
    };
  }
  if (type === "CARD") {
    return {
      channel: null,
      holderName: member.fullName,
      last4: member.cardInvalid === true ? "0002" : "4242",
      mandateRef: null,
      maskedAccount: null,
      type,
    };
  }
  return {
    channel: "CASH",
    holderName: null,
    last4: null,
    mandateRef: null,
    maskedAccount: null,
    type,
  };
}

function collection(
  world: BillingWorld,
  invoice: Pick<Invoice, "id" | "total">,
  fields: Partial<Collection> & Pick<Collection, "createdAt" | "provider" | "status">,
): Collection {
  world.sequence += 1;
  return {
    amount: invoice.total,
    attempt: 1,
    failureCode: null,
    failureMessage: null,
    id: uuid(3, world.sequence),
    invoiceId: invoice.id,
    providerRef: null,
    refunds: [],
    remittanceId: null,
    resolvedAt: null,
    ...fields,
  };
}

interface IssueOptions {
  at: string;
  issueDate: string;
  member: BillingMember;
  number: number;
  period: string;
  remittanceId: string | null;
  runId: string;
}

/** One receipt of a run (R-12-11): SEPA COLLECTING in the remittance, cash and cards PENDING. */
function issueInvoice(world: BillingWorld, options: IssueOptions): StoredInvoice {
  const { member } = options;
  const paymentMethod = paymentMethodOf(world, member);
  world.sequence += 1;
  const total = eur(member.amountMinor);
  const invoice: Invoice = {
    base: total,
    cancelReason: null,
    cancelledAt: null,
    collections: [],
    createdAt: options.at,
    createdByAccountId: ADMIN_ACCOUNT_ID,
    displayNumber: displayNumber(options.number),
    failedAt: null,
    failureReason: null,
    id: uuid(2, world.sequence),
    includeInNextRun: false,
    issueDate: options.issueDate,
    kind: "PERIODIC",
    lines: [
      {
        base: total,
        bookingId: null,
        description: `${member.concept} — ${frozenMonth(options.period)}`,
        lineNo: 1,
        origin: member.origin,
        priceId: null,
        tax: eur(0),
        taxPercent: 0,
        total,
      },
    ],
    memberId: member.id,
    memberSnapshot: { fullName: member.fullName, number: member.memberNumber, taxId: null },
    note: null,
    number: options.number,
    paidAt: null,
    paymentMethod,
    period: options.period,
    refundedTotal: eur(0),
    remittanceId: paymentMethod.type === "SEPA_DD" ? options.remittanceId : null,
    runId: options.runId,
    series: SERIES,
    status: paymentMethod.type === "SEPA_DD" ? "COLLECTING" : "PENDING",
    tax: eur(0),
    total,
    version: 1,
  };
  invoice.collections = [
    paymentMethod.type === "SEPA_DD"
      ? collection(world, invoice, {
          createdAt: options.at,
          provider: "SEPA_XML",
          providerRef: `${mandateRef(member)}/${invoice.displayNumber}`,
          remittanceId: options.remittanceId,
          status: "SUBMITTED",
        })
      : collection(world, invoice, {
          createdAt: options.at,
          provider: providerOf(paymentMethod.type),
          status: "CREATED",
        }),
  ];
  return {
    invoice,
    memberLastName: member.lastName,
    memberNumber: member.memberNumber,
    rolledBack: false,
  };
}

export interface GenerateOptions {
  at: string;
  collectionDate: string | null;
  period: string;
  simulationId: string;
}

/** `POST /billing/runs` (R-12-11): the run, its receipts and, with SEPA, its remittance. */
export function generateRun(
  world: BillingWorld,
  options: GenerateOptions,
): { remittance: Remittance | null; stored: StoredRun } {
  world.sequence += 1;
  const runId = uuid(4, world.sequence);
  const sepa = world.providers.includes("SEPA_XML");
  world.sequence += 1;
  const remittanceId = sepa ? uuid(6, world.sequence) : null;
  const firstNumber = world.nextNumber;
  const issueDate = clubLocalDate(new Date(options.at));
  const issued = world.members.map((member, index) =>
    issueInvoice(world, {
      at: options.at,
      issueDate,
      member,
      number: firstNumber + index,
      period: options.period,
      remittanceId,
      runId,
    }),
  );
  world.invoices.push(...issued);
  const previousNextNumber = world.nextNumber;
  world.nextNumber = firstNumber + issued.length;
  const kpis = simulationKpis(world);
  const byProvider: ByProvider = {};
  for (const [provider, totals] of Object.entries(kpis.byProvider) as [
    BillingProvider,
    NonNullable<ByProvider[BillingProvider]>,
  ][]) {
    byProvider[provider] =
      provider === "SEPA_XML" && remittanceId !== null
        ? { ...totals, remittanceId }
        : provider === "STRIPE"
          ? { ...totals, charged: 0, failed: 0 }
          : totals;
  }
  // E87 (R-12-19): a manual SEPA receipt waiting with `includeInNextRun` (a positive total, E89)
  // is collected by this run's remittance.
  const carried =
    remittanceId === null
      ? []
      : world.invoices.filter(
          (item) =>
            item.invoice.kind === "MANUAL" &&
            item.invoice.status === "PENDING" &&
            item.invoice.includeInNextRun &&
            item.invoice.paymentMethod.type === "SEPA_DD" &&
            item.invoice.total.amountMinor > 0,
        );
  for (const item of carried) {
    const { invoice } = item;
    const waiting = invoice.collections.find(
      (entry) => entry.provider === "SEPA_XML" && entry.status === "CREATED",
    );
    const providerRef = `${invoice.paymentMethod.mandateRef ?? invoice.memberId.slice(0, 8)}/${invoice.displayNumber}`;
    if (waiting === undefined) {
      invoice.collections = [
        ...invoice.collections,
        collection(world, invoice, {
          createdAt: options.at,
          provider: "SEPA_XML",
          providerRef,
          remittanceId,
          status: "SUBMITTED",
        }),
      ];
    } else {
      waiting.providerRef = providerRef;
      waiting.remittanceId = remittanceId;
      waiting.status = "SUBMITTED";
    }
    invoice.remittanceId = remittanceId;
    invoice.status = "COLLECTING";
    invoice.version += 1;
  }
  const sepaInvoices = [
    ...issued.filter((item) => item.invoice.paymentMethod.type === "SEPA_DD"),
    ...carried,
  ];
  const remittance: Remittance | null =
    remittanceId === null
      ? null
      : {
          collectionIds: sepaInvoices.flatMap((item) =>
            item.invoice.collections.map((entry) => entry.id),
          ),
          count: sepaInvoices.length,
          creationAt: options.at,
          creditor: { ...CREDITOR },
          fileAvailable: true,
          id: remittanceId,
          messageId: `canic-${options.period}-${String(world.runs.length + 1)}`,
          period: options.period,
          requestedCollectionDate: options.collectionDate ?? `${options.period}-01`,
          runId,
          sequenceBreakdown: { FRST: 0, RCUR: sepaInvoices.length },
          status: "GENERATED",
          submittedAt: null,
          submittedByAccountId: null,
          total: eur(sepaInvoices.reduce((sum, item) => sum + item.invoice.total.amountMinor, 0)),
          xsdValidatedAt: options.at,
          xsdValidationSkipped: null,
        };
  if (remittance !== null) world.remittances.unshift(remittance);
  const stored: StoredRun = {
    carriedInvoiceIds: carried.map((item) => item.invoice.id),
    firstNumber,
    lastNumber: world.nextNumber - 1,
    polls: 0,
    previousNextNumber,
    run: {
      byProvider,
      collectionDate: sepa ? (options.collectionDate ?? `${options.period}-01`) : null,
      createdByAccountId: ADMIN_ACCOUNT_ID,
      finishedAt: null,
      id: runId,
      invoiceIds: issued.map((item) => item.invoice.id),
      period: options.period,
      rollbackReason: null,
      rolledBackAt: null,
      simulationId: options.simulationId,
      skipped: [...incidentsOf(world.variant)],
      startedAt: options.at,
      status: "GENERATED",
    },
  };
  world.runs.unshift(stored);
  return { remittance, stored };
}

/** `POST /billing/runs/{id}/rollback`'s effects (R-12-14), also used to seed August's first try. */
export function rollBackRun(world: BillingWorld, stored: StoredRun, at: string, reason: string) {
  const ids = new Set(stored.run.invoiceIds);
  const carried = new Set(stored.carriedInvoiceIds ?? []);
  const runRemittanceId = world.remittances.find((entry) => entry.runId === stored.run.id)?.id;
  let cancelled = 0;
  for (const item of world.invoices) {
    const { invoice } = item;
    // E87: a waiting manual receipt the remittance carried goes back to PENDING, still waiting
    // for the next run (`includeInNextRun` kept).
    if (carried.has(invoice.id) && invoice.status === "COLLECTING") {
      invoice.collections = invoice.collections.map((entry) =>
        entry.remittanceId === runRemittanceId && entry.status === "SUBMITTED"
          ? { ...entry, failureCode: "ROLLBACK", resolvedAt: at, status: "FAILED" }
          : entry,
      );
      invoice.collections = [
        ...invoice.collections,
        collection(world, invoice, { createdAt: at, provider: "SEPA_XML", status: "CREATED" }),
      ];
      invoice.remittanceId = null;
      invoice.status = "PENDING";
      invoice.version += 1;
      continue;
    }
    if (!ids.has(invoice.id)) continue;
    // E89 (R-12-14): the rollback takes the whole block of the run, also a receipt the admin
    // cancelled meanwhile (it keeps its own reason); its number is issued again.
    if (invoice.status === "CANCELLED") {
      item.rolledBack = true;
      continue;
    }
    invoice.collections = [
      ...invoice.collections,
      collection(world, invoice, {
        createdAt: at,
        failureCode: "ROLLBACK",
        provider: invoice.collections[0]?.provider ?? "MANUAL",
        resolvedAt: at,
        status: "FAILED",
      }),
    ];
    invoice.status = "CANCELLED";
    invoice.cancelReason = "ROLLBACK";
    invoice.cancelledAt = at;
    invoice.version += 1;
    item.rolledBack = true;
    cancelled += 1;
  }
  const remittance = world.remittances.find((entry) => entry.runId === stored.run.id);
  if (remittance !== undefined) remittance.status = "ROLLED_BACK";
  stored.run.status = "ROLLED_BACK";
  stored.run.rolledBackAt = at;
  stored.run.rollbackReason = reason;
  world.nextNumber = stored.firstNumber;
  // The members' nextInvoiceDate went back: the month's simulation is older than that change.
  const simulation = world.simulations.get(stored.run.period);
  if (simulation !== undefined) simulation.stale = true;
  return { cancelledInvoices: cancelled, restoredMembers: cancelled };
}

/** R-12-14: why a run cannot be rolled back now (empty = it can, while GENERATED or CHARGING). */
export function rollbackBlockers(world: BillingWorld, stored: StoredRun): RollbackBlocker[] {
  if (stored.run.status === "ROLLED_BACK") return [];
  const ids = new Set(stored.run.invoiceIds);
  const invoices = world.invoices.filter((item) => ids.has(item.invoice.id));
  const blockers: RollbackBlocker[] = [];
  const remittance = world.remittances.find((entry) => entry.runId === stored.run.id);
  if (remittance?.status === "SUBMITTED") blockers.push("REMITTANCE_SUBMITTED");
  if (
    invoices.some((item) =>
      item.invoice.collections.some(
        (entry) =>
          entry.provider === "STRIPE" &&
          (entry.status === "SUBMITTED" || entry.status === "SUCCEEDED"),
      ),
    )
  ) {
    blockers.push("COLLECTION_SUBMITTED");
  }
  if (invoices.some((item) => item.invoice.status === "PAID")) blockers.push("INVOICE_PAID");
  if (world.nextNumber > stored.lastNumber + 1) blockers.push("MANUAL_INVOICE_AFTER");
  return blockers;
}

export function runResource(world: BillingWorld, stored: StoredRun): BillingRun {
  const blockers = rollbackBlockers(world, stored);
  return {
    ...stored.run,
    rollbackBlockers: blockers,
    rollbackable:
      (stored.run.status === "GENERATED" || stored.run.status === "CHARGING") &&
      blockers.length === 0,
  };
}

/** The month's live run, else its last rolled-back one (`GET /billing/periods/{period}`). */
export function periodRun(world: BillingWorld, period: string): StoredRun | undefined {
  const runs = world.runs.filter((stored) => stored.run.period === period);
  return runs.find((stored) => stored.run.status !== "ROLLED_BACK") ?? runs[0];
}

export function listItem(item: StoredInvoice): InvoiceListItem {
  const { invoice } = item;
  const [first] = invoice.lines;
  const more = invoice.lines.length - 1;
  return {
    concept: `${first?.description ?? ""}${more > 0 ? ` (+${String(more)})` : ""}`,
    displayNumber: invoice.displayNumber,
    failedAt: invoice.failedAt ?? null,
    id: invoice.id,
    issueDate: invoice.issueDate,
    kind: invoice.kind,
    member: {
      fullName: invoice.memberSnapshot.fullName,
      id: invoice.memberId,
      memberNumber: item.memberNumber,
    },
    number: invoice.number,
    paidAt: invoice.paidAt ?? null,
    paymentMethodType: invoice.paymentMethod.type,
    period: invoice.period,
    refundedTotal: invoice.refundedTotal,
    remittanceId: invoice.remittanceId ?? null,
    rolledBack: item.rolledBack,
    runId: invoice.runId ?? null,
    status: invoice.status,
    total: invoice.total,
  };
}

export function remittanceListItem(remittance: Remittance): RemittanceListItem {
  return {
    count: remittance.count,
    creationAt: remittance.creationAt,
    fileAvailable: remittance.fileAvailable,
    id: remittance.id,
    messageId: remittance.messageId,
    period: remittance.period,
    requestedCollectionDate: remittance.requestedCollectionDate,
    status: remittance.status,
    submittedAt: remittance.submittedAt ?? null,
    total: remittance.total,
  };
}

/** A SEPA receipt returned by the bank (R-12-17): `Collection FAILED{BANK_RETURN}` appended. */
function bankReturn(world: BillingWorld, item: StoredInvoice, at: string, reason: string) {
  const { invoice } = item;
  const sepa = invoice.collections.find((entry) => entry.provider === "SEPA_XML");
  invoice.collections = [
    ...invoice.collections,
    collection(world, invoice, {
      createdAt: at,
      failureCode: "BANK_RETURN",
      failureMessage: reason,
      provider: "SEPA_XML",
      providerRef: sepa?.providerRef ?? null,
      remittanceId: sepa?.remittanceId ?? null,
      resolvedAt: at,
      status: "FAILED",
    }),
  ];
  invoice.status = "FAILED";
  invoice.failedAt = at;
  invoice.failureReason = reason;
  invoice.paidAt = null;
  invoice.version += 1;
}

/** August: the first run rolled back, the second collected on 01/08 and one bank return. */
function seedAugust(world: BillingWorld) {
  const period = "2026-08";
  const firstTry = generateRun(world, {
    at: "2026-07-24T08:10:00Z",
    collectionDate: "2026-08-01",
    period,
    simulationId: uuid(5, 9001),
  });
  rollBackRun(world, firstTry.stored, "2026-07-24T09:30:00Z", "Preu de la quota equivocat");
  const simulation = buildSimulation(world, period, "2026-07-27T07:00:00Z");
  world.simulations.set(period, { simulation, stale: false });
  const { remittance, stored } = generateRun(world, {
    at: "2026-07-27T07:05:00Z",
    collectionDate: "2026-08-01",
    period,
    simulationId: simulation.id,
  });
  if (remittance !== null) {
    remittance.status = "SUBMITTED";
    remittance.submittedAt = "2026-07-28T08:00:00Z";
    remittance.submittedByAccountId = ADMIN_ACCOUNT_ID;
  }
  const ids = new Set(stored.run.invoiceIds);
  for (const item of world.invoices.filter((entry) => ids.has(entry.invoice.id))) {
    const { invoice } = item;
    const sepa = invoice.paymentMethod.type === "SEPA_DD";
    // P5's step i (E87) on 01/08 for the remittance; the cash marked paid by hand.
    invoice.collections = invoice.collections.map((entry) => ({
      ...entry,
      providerRef: sepa ? (entry.providerRef ?? null) : "CASH",
      resolvedAt: sepa ? "2026-07-31T22:00:00Z" : "2026-08-03T16:00:00Z",
      status: "SUCCEEDED",
    }));
    invoice.status = "PAID";
    invoice.paidAt = sepa ? "2026-07-31T22:00:00Z" : "2026-08-03T16:00:00Z";
    invoice.version += 1;
    if (item.invoice.memberSnapshot.fullName === "Pere Soler") {
      bankReturn(world, item, "2026-08-06T08:30:00Z", "Devolució bancària");
    }
  }
  stored.run.status = "COMPLETED";
  stored.run.finishedAt = "2026-07-31T22:00:00Z";
}

/** September as the mockup shows it: simulated and generated on 25/08, two bank returns since. */
function seedSeptember(world: BillingWorld, withRun: boolean) {
  const period = BILLING_MOCK_PERIOD;
  const simulation = buildSimulation(world, period, "2026-08-25T07:12:00Z");
  world.simulations.set(period, { simulation, stale: world.variant === "stale" });
  if (!withRun) return;
  const { stored } = generateRun(world, {
    at: "2026-08-25T07:20:00Z",
    collectionDate: world.providers.includes("SEPA_XML") ? "2026-09-01" : null,
    period,
    simulationId: simulation.id,
  });
  if (!world.providers.includes("SEPA_XML")) return;
  const ids = new Set(stored.run.invoiceIds);
  const september = world.invoices.filter((item) => ids.has(item.invoice.id));
  for (const index of [SECOND_RETURN_INDEX, PERE_SOLER_INDEX]) {
    const item = september[index];
    if (item !== undefined) {
      bankReturn(world, item, "2026-08-26T07:30:00Z", "Mandat anul·lat pel titular");
    }
  }
}

export function createBillingWorld(variant: BillingVariant = "default"): BillingWorld {
  const world: BillingWorld = {
    idempotency: new Map(),
    invoices: [],
    members: billingMembers(),
    nextNumber: 744,
    providers: providersOf(variant),
    remittances: [],
    rollbackRace: variant === "rollbackBlocked",
    runs: [],
    sequence: 0,
    simulations: new Map(),
    variant,
  };
  if (variant === "default" || variant === "rollbackBlocked") {
    seedAugust(world);
    seedSeptember(world, true);
  } else {
    world.nextNumber = 912;
    seedSeptember(world, variant === "stripe");
  }
  return world;
}

let currentWorld: BillingWorld | undefined;

/**
 * Built on the first billing request, never at import: the browser worker loads every mock world
 * on each page, and a page that never reads billing does not pay for two months of receipts.
 */
export const billingState: { world: BillingWorld } = {
  get world() {
    currentWorld ??= createBillingWorld();
    return currentWorld;
  },
  set world(world: BillingWorld) {
    currentWorld = world;
  },
};

export function resetBillingState(variant: BillingVariant = "default"): void {
  billingState.world = createBillingWorld(variant);
}

/** The month's chip counts (E87: a receipt cancelled by a rollback is not in «Tots»). */
export function periodCounts(world: BillingWorld, period: string) {
  const invoices = world.invoices.filter(
    (item) => item.invoice.period === period && !item.rolledBack,
  );
  const count = (status: Invoice["status"]) =>
    invoices.filter((item) => item.invoice.status === status).length;
  return {
    all: invoices.length,
    failed: count("FAILED"),
    paid: count("PAID"),
    pending: count("PENDING"),
    remitted: count("COLLECTING"),
  };
}

/** The KPI figure of the incident list of a simulation (`BillingIncidentCode`, R-12-07). */
export const BILLING_INCIDENT_CODES: readonly BillingIncidentCode[] = [
  "NO_BANK_ACCOUNT",
  "NO_PLAN",
  "NO_PRICE",
  "CARD_INVALID",
  "CURRENCY_MISMATCH",
  "PROVIDER_DISABLED",
];

export { ADMIN_ACCOUNT_ID as BILLING_ADMIN_ACCOUNT_ID, displayNumber, uuid as billingUuid };
