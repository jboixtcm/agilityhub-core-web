import type { components } from "../../generated/schema";

export type MemberListItem = components["schemas"]["MemberListItem"];
export type DogListItem = components["schemas"]["DogListItem"];
export type SavedView = components["schemas"]["SavedView"];
export type MemberOverview = components["schemas"]["MemberOverview"];
export type DogDetail = components["schemas"]["DogDetail"];
export type LevelSummary = components["schemas"]["LevelSummary"];

export const censusLevels: readonly LevelSummary[] = [
  {
    active: true,
    code: "A",
    grantsFreeTraining: false,
    id: "level-a",
    name: "Nivell A",
    order: 1,
  },
  {
    active: true,
    code: "B",
    grantsFreeTraining: false,
    id: "level-b",
    name: "Nivell B",
    order: 2,
  },
  {
    active: true,
    code: "C",
    grantsFreeTraining: false,
    id: "level-c",
    name: "Nivell C",
    order: 3,
  },
  {
    active: true,
    code: "D",
    grantsFreeTraining: true,
    id: "level-d",
    name: "Nivell D",
    order: 4,
  },
  {
    active: true,
    code: "E",
    grantsFreeTraining: true,
    id: "level-e",
    name: "Nivell E",
    order: 5,
  },
];

function levelAt(index: number): LevelSummary {
  const level = censusLevels[index];
  if (level === undefined) {
    throw new RangeError("Mock level is missing");
  }
  return level;
}

const memberOverviewFixture: MemberOverview = {
  dogs: [
    {
      breed: "border collie",
      freeTrainingAllowed: false,
      id: "dog-duna",
      instructorNote: "Treballar la calma a la sortida.",
      level: levelAt(2),
      name: "Duna",
      pendingDocuments: [],
    },
    {
      breed: "mestís",
      freeTrainingAllowed: true,
      id: "dog-rock",
      instructorNote: "Vigilar l'espatlla esquerra.",
      level: levelAt(3),
      name: "Rock",
      pack: "Pack 10: 6/4 · caduca 12-11",
      pendingDocuments: [],
    },
  ],
  familyGroup: {
    holderMemberId: "member-laura",
    id: "family-laura",
    members: [
      { fullName: "Laura Serra Vidal", id: "member-laura", memberNumber: 87 },
      { fullName: "Joan Antoni Serra", id: "member-joan", memberNumber: 112 },
    ],
  },
  invoicesCount: 38,
  member: {
    accountId: "account-laura",
    accountMissing: false,
    address: {
      city: "Cabrera de Mar",
      country: "ES",
      postalCode: "08349",
      province: "Barcelona",
      street: "Carrer de la Riera, 12",
    },
    birthDate: "1988-04-12",
    bookingBlock: { active: false },
    consents: {
      imageRights: {
        at: "2026-02-03T09:00:00Z",
        granted: false,
        version: "2026-01",
      },
    },
    contactEmails: [
      { bounced: false, email: "laura.serra@example.test" },
      { bounced: false, email: "feina.laura@example.test" },
    ],
    firstName: "Laura",
    fullName: "Laura Serra Vidal",
    gender: "FEMALE",
    id: "member-laura",
    idDocument: { number: "38888881P", type: "DNI" },
    internalNotes: "Prefereix classes de tarda.",
    joinedAt: "2023-02-03T09:00:00Z",
    lastName1: "Serra",
    lastName2: "Vidal",
    memberNumber: 87,
    nextInvoiceDate: "2026-09-01",
    paymentMethod: {
      holderName: "Laura Serra Vidal",
      maskedAccount: "···· ···· ···· ···· 2231",
      type: "SEPA_DD",
    },
    phones: [
      { label: "Laura", number: "655100101", prefix: "+34" },
      { label: "Joan", number: "617100102", prefix: "+34" },
    ],
    plan: {
      id: "plan-member",
      name: "Abonat",
      summary: "Abonat · 2 gossos — 90 €/mes (tarifa familiar)",
    },
    remarks: "Contactar preferentment per correu.",
    roles: ["MEMBER"],
    status: "ACTIVE",
    version: 7,
  },
  nextInvoice: { amount: 90, date: "2026-09-01" },
  notificationPreferences: {
    availableLocales: ["ca", "es", "en"],
    emailByCategory: {
      CLUB_CHANGES: true,
      CLUB_NEWS: true,
      OPERATIONAL: false,
      PERSONAL: true,
    },
    locale: "ca",
    modules: { push: true, sms: true },
    pushClubNews: true,
    reminderMinutesBefore: null,
    reminderOptionsMinutes: [60, 120, 240, 360, 720, 1440],
    smsFixed: true,
  },
  recentAudit: [
    {
      changedAt: "2026-08-03T11:15:00Z",
      id: "audit-iban",
      summary: "canvi d'IBAN (admin Jordi)",
    },
    {
      changedAt: "2026-07-26T09:30:00Z",
      id: "audit-plan",
      summary: "canvi de tarifa (admin Jordi)",
    },
  ],
  recentInvoices: [
    { amount: 90, id: "invoice-september", label: "2026-0912 · Setembre", status: "REMITTED" },
    { amount: 90, id: "invoice-august", label: "2026-0744 · Agost", status: "PAID" },
  ],
};

function dogDetailFixture(id: "dog-duna" | "dog-rock"): DogDetail {
  const rock = id === "dog-rock";
  const level = levelAt(rock ? 3 : 2);
  return {
    birthDate: rock ? "2020-05-20" : "2022-03-12",
    breed: rock ? "mestís" : "border collie",
    chip: rock ? "941000000000002" : "941000000000001",
    documents: [
      {
        files: rock
          ? []
          : [
              {
                id: "file-vaccination-duna",
                name: "cartilla_Duna_1.jpg",
                uploadedAt: "2026-01-12T10:00:00Z",
                url: "https://files.example.test/cartilla_Duna_1.jpg",
              },
            ],
        id: `document-vaccination-${id}`,
        state: rock ? "PENDING" : "RECEIVED",
        type: "VACCINATION_CARD",
        typeLabel: "Cartilla de vacunes",
      },
      {
        files: [],
        id: `document-insurance-${id}`,
        state: "PENDING",
        type: "INSURANCE",
        typeLabel: "Assegurança",
      },
    ],
    freeTraining: {
      allowed: rock,
      override: null,
      source: "LEVEL",
    },
    id,
    instructorNote: rock ? "Vigilar l'espatlla esquerra." : "Treballar la calma a la sortida.",
    level,
    levelAssignedAt: rock ? "2025-04-08T09:00:00Z" : "2025-02-01T09:00:00Z",
    levelHistory: [
      {
        byAccountId: "account-admin",
        from: "2025-02-01T09:00:00Z",
        levelCode: level.code,
        levelId: level.id,
      },
    ],
    licenses: rock
      ? [
          { grade: "Iniciació", number: "3241", organisation: "FCAG" },
          { grade: "G2", number: "13298", organisation: "RSCE" },
        ]
      : [],
    name: rock ? "Rock" : "Duna",
    owner: {
      fullName: "Laura Serra Vidal",
      id: "member-laura",
      memberNumber: 87,
      status: "ACTIVE",
    },
    ...(rock ? { pack: "Pack 10: 6/4 · caduca 12-11" } : {}),
    registeredAt: "2023-02-03T09:00:00Z",
    sex: rock ? "MALE" : "FEMALE",
    status: "ACTIVE",
    tasksSummary: "2 pendents",
    version: 4,
  };
}

export const censusRecordState: {
  dogs: Record<string, DogDetail>;
  memberOverview: MemberOverview;
} = {
  dogs: {
    "dog-duna": dogDetailFixture("dog-duna"),
    "dog-rock": dogDetailFixture("dog-rock"),
  },
  memberOverview: structuredClone(memberOverviewFixture),
};

export function resetCensusRecordState(): void {
  censusRecordState.memberOverview = structuredClone(memberOverviewFixture);
  censusRecordState.dogs = {
    "dog-duna": dogDetailFixture("dog-duna"),
    "dog-rock": dogDetailFixture("dog-rock"),
  };
}

const memberNames = [
  ["Laura", "Serra Vidal"],
  ["Marc", "Prats García"],
  ["Anna", "Ballart Consul"],
  ["Eva", "Perez Prunell"],
  ["Sergio", "Gimenez Casado"],
  ["Montse", "Tresserra Casas"],
  ["Aina", "Roca Soler"],
  ["Biel", "Puig Miró"],
  ["Clara", "Font Pons"],
  ["Dídac", "Vila Costa"],
] as const;

const dogNames = [
  "Duna",
  "Rock",
  "Nass",
  "Thai",
  "Trevi",
  "Bruc",
  "Kira",
  "Neru",
  "Lua",
  "Taca",
  "Gala",
  "Ot",
] as const;

const levels = ["A", "B", "C", "D", "E", "F", "G"] as const;
const breeds = ["border collie", "mestís", "xolo", "malinois", "sheltie"] as const;

const featuredMembers: readonly MemberListItem[] = [
  {
    birthDate: "1988-04-12",
    bookingBlocked: false,
    city: "Cabrera de Mar",
    contact: "laura.serra@example.test · 655 100 101",
    displayStatus: { kind: "ACTIVE", label: "alta" },
    dogs: [
      { id: "dog-duna", levelCode: "C", name: "Duna" },
      { id: "dog-rock", levelCode: "D", name: "Rock" },
    ],
    firstName: "Laura",
    freeTrainingAllowed: true,
    fullName: "Laura Serra Vidal",
    gender: "FEMALE",
    id: "member-laura",
    idDocument: "38······1P",
    imageRightsGranted: true,
    joinedAt: "2023-02-03T09:00:00Z",
    lastName: "Serra Vidal",
    memberNumber: 87,
    nextInvoiceDate: "2026-09-30",
    paymentMethod: "···· ···· ···· ···· 2231",
    pendingDocuments: 0,
    plan: { id: "plan-member", name: "Abonat", summary: "Abonat 2 gossos · 90 €" },
    postalCode: "08349",
    roles: ["MEMBER"],
    status: "ACTIVE",
  },
  {
    birthDate: "1991-08-24",
    bookingBlocked: false,
    city: "Mataró",
    contact: "marc.prats@example.test · 655 100 102",
    displayStatus: { kind: "ACTIVE", label: "alta" },
    dogs: [{ id: "dog-chun-li", levelCode: "A", name: "Chun-li" }],
    firstName: "Marc",
    freeTrainingAllowed: false,
    fullName: "Marc Prats García",
    gender: "MALE",
    id: "member-marc",
    idDocument: "47······2Q",
    imageRightsGranted: true,
    joinedAt: "2024-01-10T09:00:00Z",
    lastName: "Prats García",
    memberNumber: 88,
    nextInvoiceDate: "2026-09-30",
    paymentMethod: "Targeta",
    pendingDocuments: 0,
    plan: { id: "plan-member", name: "Abonat", summary: "Abonat · 60 €" },
    postalCode: "08301",
    roles: ["MEMBER"],
    status: "ACTIVE",
  },
  {
    birthDate: "1985-02-19",
    bookingBlocked: false,
    city: "Argentona",
    contact: "anna.ballart@example.test · 655 100 103",
    displayStatus: { kind: "ACTIVE", label: "alta" },
    dogs: [{ id: "dog-nass", levelCode: "B", name: "Nass" }],
    firstName: "Anna",
    freeTrainingAllowed: false,
    fullName: "Anna Ballart Consul",
    gender: "FEMALE",
    id: "member-anna",
    idDocument: "52······3R",
    imageRightsGranted: false,
    joinedAt: "2024-03-12T09:00:00Z",
    lastName: "Ballart Consul",
    memberNumber: 89,
    nextInvoiceDate: "2026-09-30",
    paymentMethod: "Manual",
    pendingDocuments: 1,
    plan: { id: "plan-member", name: "Abonat", summary: "Pack 10 · 4 restants" },
    postalCode: "08310",
    roles: ["MEMBER"],
    status: "ACTIVE",
  },
  {
    birthDate: "1979-10-08",
    bookingBlocked: false,
    city: "Vilassar de Mar",
    contact: "eva.perez@example.test · 655 100 104",
    displayStatus: { date: "2026-09-15", kind: "INACTIVE_PERIOD", label: "inactiva fins 15/09" },
    dogs: [{ id: "dog-fish", levelCode: "B", name: "Fish" }],
    firstName: "Eva",
    freeTrainingAllowed: false,
    fullName: "Eva Perez Prunell",
    gender: "FEMALE",
    id: "member-eva",
    idDocument: "39······4S",
    imageRightsGranted: true,
    joinedAt: "2022-05-16T09:00:00Z",
    lastName: "Perez Prunell",
    memberNumber: 90,
    nextInvoiceDate: "2026-10-31",
    paymentMethod: "···· ···· ···· ···· 7789",
    pendingDocuments: 0,
    plan: { id: "plan-member", name: "Abonat", summary: "Abonat · 60 €" },
    postalCode: "08340",
    roles: ["MEMBER"],
    status: "ACTIVE",
  },
  {
    birthDate: "1994-06-01",
    bookingBlocked: false,
    city: "Mataró",
    contact: "sergio.gimenez@example.test · 655 100 105",
    displayStatus: { kind: "ACTIVE", label: "alta" },
    dogs: [{ id: "dog-thai", levelCode: "E", name: "Thai" }],
    firstName: "Sergio",
    freeTrainingAllowed: true,
    fullName: "Sergio Gimenez Casado",
    gender: "MALE",
    id: "member-sergio",
    idDocument: "41······5T",
    imageRightsGranted: true,
    joinedAt: "2021-07-22T09:00:00Z",
    lastName: "Gimenez Casado",
    memberNumber: 91,
    nextInvoiceDate: "2026-09-30",
    paymentMethod: "···· ···· ···· ···· 3382",
    pendingDocuments: 0,
    plan: { id: "plan-member", name: "Abonat", summary: "Abonat · 60 €" },
    postalCode: "08302",
    roles: ["MEMBER"],
    status: "ACTIVE",
  },
  {
    birthDate: "1974-11-17",
    bookingBlocked: false,
    city: "Cabrils",
    contact: "montse.tresserra@example.test · 655 100 106",
    displayStatus: { date: "2026-08-31", kind: "LEAVE_SCHEDULED", label: "baixa 31/08" },
    dogs: [{ id: "dog-trevi", levelCode: "D", name: "Trevi" }],
    firstName: "Montse",
    freeTrainingAllowed: true,
    fullName: "Montse Tresserra Casas",
    gender: "FEMALE",
    id: "member-montse",
    idDocument: "36······6U",
    imageRightsGranted: true,
    joinedAt: "2020-09-04T09:00:00Z",
    lastName: "Tresserra Casas",
    leaveDate: "2026-08-31",
    memberNumber: 92,
    nextInvoiceDate: "2026-08-31",
    paymentMethod: "···· ···· ···· ···· 9041",
    pendingDocuments: 0,
    plan: { id: "plan-member", name: "Abonat", summary: "Abonat · 60 €" },
    postalCode: "08348",
    roles: ["MEMBER"],
    status: "ACTIVE",
  },
];

function generatedMember(index: number): MemberListItem {
  const sequence = index + 1;
  const [firstName, lastName] = memberNames[index % memberNames.length] ?? memberNames[0];
  const levelCode = levels[index % levels.length] ?? "A";
  const dogName = dogNames[index % dogNames.length] ?? "Duna";
  return {
    birthDate: `${String(1970 + (index % 30))}-${String((index % 12) + 1).padStart(2, "0")}-12`,
    bookingBlocked: index % 29 === 0,
    city: index % 2 === 0 ? "Cabrera de Mar" : "Mataró",
    contact: `persona${String(sequence)}@example.test · 655 ${String(100_000 + sequence).slice(-6)}`,
    displayStatus: { kind: "ACTIVE", label: "alta" },
    dogs: [
      {
        id: `dog-generated-${String(sequence)}`,
        levelCode,
        name: `${dogName} ${String(sequence)}`,
      },
    ],
    firstName,
    freeTrainingAllowed: ["D", "E", "F", "G"].includes(levelCode),
    fullName: `${firstName} ${lastName} ${String(sequence)}`,
    gender: index % 2 === 0 ? "FEMALE" : "MALE",
    id: `member-generated-${String(sequence)}`,
    idDocument: `${String(10_000_000 + sequence).slice(0, 2)}······${String(sequence).slice(-1)}Z`,
    imageRightsGranted: index % 5 !== 0,
    joinedAt: `${String(2020 + (index % 6))}-01-15T09:00:00Z`,
    lastName: `${lastName} ${String(sequence)}`,
    memberNumber: 92 + sequence,
    nextInvoiceDate: "2026-09-30",
    paymentMethod: index % 3 === 0 ? "Manual" : "···· ···· ···· ···· 2231",
    pendingDocuments: index % 13 === 0 ? 1 : 0,
    plan: {
      id: "plan-member",
      name: "Abonat",
      summary: index % 4 === 0 ? "Abonat 2 gossos · 90 €" : "Abonat · 60 €",
    },
    postalCode: index % 2 === 0 ? "08349" : "08301",
    roles: index % 17 === 0 ? ["MEMBER", "INSTRUCTOR"] : ["MEMBER"],
    status: "ACTIVE",
  };
}

export const censusMembers: readonly MemberListItem[] = [
  ...featuredMembers,
  ...Array.from({ length: 184 - featuredMembers.length }, (_, index) => generatedMember(index)),
];

const featuredDogs: readonly DogListItem[] = [
  {
    ageYears: 4,
    birthDate: "2022-03-12",
    breed: "border collie",
    chip: "941000000000001",
    displayStatus: { kind: "ACTIVE", label: "actiu" },
    freeTrainingAllowed: false,
    id: "dog-duna",
    level: { code: "C", id: "level-c", name: "Nivell C", order: 3 },
    levelAssignedAt: "2025-02-01",
    licenses: [],
    name: "Duna",
    owner: { fullName: "Laura Serra", id: "member-laura", lastName: "Serra" },
    pendingDocuments: 0,
    registeredAt: "2023-02-03T09:00:00Z",
    sex: "FEMALE",
    status: "ACTIVE",
  },
  {
    ageYears: 6,
    birthDate: "2020-05-20",
    breed: "mestís",
    chip: "941000000000002",
    displayStatus: { kind: "ACTIVE", label: "actiu" },
    freeTrainingAllowed: true,
    id: "dog-rock",
    level: { code: "D", id: "level-d", name: "Nivell D", order: 4 },
    levelAssignedAt: "2025-04-08",
    licenses: [
      { grade: "Iniciació", number: "3241", organisation: "FCAG" },
      { grade: "G2", number: "13298", organisation: "RSCE" },
    ],
    name: "Rock",
    owner: { fullName: "Laura Serra", id: "member-laura", lastName: "Serra" },
    pack: "Pack 10 · 4 restants",
    pendingDocuments: 0,
    registeredAt: "2023-02-03T09:00:00Z",
    sex: "MALE",
    status: "ACTIVE",
  },
  {
    ageYears: 3,
    birthDate: "2023-01-09",
    breed: "xolo",
    chip: "941000000000003",
    displayStatus: { kind: "ACTIVE", label: "actiu" },
    freeTrainingAllowed: false,
    id: "dog-nass",
    level: { code: "B", id: "level-b", name: "Nivell B", order: 2 },
    levelAssignedAt: "2025-05-10",
    licenses: [],
    name: "Nass",
    owner: { fullName: "Anna Ballart", id: "member-anna", lastName: "Ballart" },
    pendingDocuments: 1,
    registeredAt: "2024-03-12T09:00:00Z",
    sex: "MALE",
    status: "ACTIVE",
  },
  {
    ageYears: 5,
    birthDate: "2021-07-15",
    breed: "malinois",
    chip: "941000000000004",
    displayStatus: { kind: "ACTIVE", label: "actiu" },
    freeTrainingAllowed: true,
    id: "dog-thai",
    level: { code: "E", id: "level-e", name: "Nivell E", order: 5 },
    levelAssignedAt: "2024-10-02",
    licenses: [{ grade: "Grau I", number: "2988", organisation: "FCAG" }],
    name: "Thai",
    owner: { fullName: "Sergio Gimenez", id: "member-sergio", lastName: "Gimenez" },
    pendingDocuments: 0,
    registeredAt: "2021-07-22T09:00:00Z",
    sex: "MALE",
    status: "ACTIVE",
  },
  {
    ageYears: 7,
    birthDate: "2019-08-12",
    breed: "sheltie",
    chip: "941000000000005",
    displayStatus: { date: "2026-08-31", kind: "LEAVE_SCHEDULED", label: "baixa 31/08" },
    freeTrainingAllowed: true,
    id: "dog-trevi",
    level: { code: "D", id: "level-d", name: "Nivell D", order: 4 },
    levelAssignedAt: "2023-09-01",
    licenses: [],
    name: "Trevi",
    owner: { fullName: "Montse Tresserra", id: "member-montse", lastName: "Tresserra" },
    pendingDocuments: 0,
    registeredAt: "2020-09-04T09:00:00Z",
    sex: "MALE",
    status: "ACTIVE",
  },
];

function generatedDog(index: number): DogListItem {
  const sequence = index + 1;
  const levelCode = levels[index % levels.length] ?? "A";
  const [ownerFirstName, ownerLastName] = memberNames[index % memberNames.length] ?? memberNames[0];
  return {
    ageYears: 1 + (index % 12),
    birthDate: `${String(2014 + (index % 11))}-${String((index % 12) + 1).padStart(2, "0")}-10`,
    breed: breeds[index % breeds.length] ?? "mestís",
    chip: `941${String(10_000_000_000 + sequence)}`,
    displayStatus: { kind: "ACTIVE", label: "actiu" },
    freeTrainingAllowed: ["D", "E", "F", "G"].includes(levelCode),
    id: `dog-generated-${String(sequence)}`,
    level: {
      code: levelCode,
      id: `level-${levelCode.toLowerCase()}`,
      name: `Nivell ${levelCode}`,
      order: levels.indexOf(levelCode) + 1,
    },
    levelAssignedAt: `202${String(index % 6)}-02-01`,
    licenses:
      index % 7 === 0
        ? [{ grade: "Iniciació", number: String(4000 + sequence), organisation: "FCAG" }]
        : [],
    name: `${dogNames[index % dogNames.length] ?? "Duna"} ${String(sequence)}`,
    owner: {
      fullName: `${ownerFirstName} ${ownerLastName}`,
      id: `member-generated-${String((index % 178) + 1)}`,
      lastName: ownerLastName,
    },
    pendingDocuments: index % 19 === 0 ? 1 : 0,
    registeredAt: `202${String(index % 6)}-01-15T09:00:00Z`,
    sex: index % 2 === 0 ? "FEMALE" : "MALE",
    status: "ACTIVE",
  };
}

export const censusDogs: readonly DogListItem[] = [
  ...featuredDogs,
  ...Array.from({ length: 242 - featuredDogs.length }, (_, index) => generatedDog(index)),
];

export const initialSavedViews: readonly SavedView[] = [
  {
    columns: ["fullName", "dogs", "plan", "displayStatus"],
    filters: [{ field: "displayStatus", op: "eq", value: "LEAVE_SCHEDULED" }],
    id: "view-members-leave",
    listKey: "members",
    name: "Baixes previstes",
    ownerAccountId: "account-admin",
    shared: true,
    sort: ["leaveDate,asc"],
  },
  {
    columns: ["name", "breed", "level", "owner", "freeTraining", "licenses", "displayStatus"],
    filters: [{ field: "hasLicense", op: "eq", value: "true" }],
    id: "view-dogs-license",
    listKey: "dogs",
    name: "Amb llicència",
    ownerAccountId: "account-admin",
    shared: true,
    sort: ["name,asc"],
  },
];
