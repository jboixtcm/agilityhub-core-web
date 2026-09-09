import type { components } from "../../generated/schema";

export type MemberListItem = components["schemas"]["MemberListItem"];
type License = components["schemas"]["LicenseWithPendingFields"];
type DogPendingFields = components["schemas"]["DogPendingFields"];
type ApiDog = components["schemas"]["Dog"];
type Dog = Omit<ApiDog, "licenses"> & DogPendingFields & { licenses: License[] };
export type DogListItem = Omit<components["schemas"]["DogListItem"], "licenses"> &
  DogPendingFields & { licenses: License[] };
export type SavedView = components["schemas"]["SavedView"];
export type MemberOverview = components["schemas"]["MemberOverview"];
export type DogDetail = Omit<components["schemas"]["DogDetail"], "dog" | "licenses"> & {
  dog: Dog;
  licenses: License[];
};
export type LevelSummary = components["schemas"]["LevelSummary"];

export const censusLevels: readonly LevelSummary[] = [
  {
    code: "A",
    id: "level-a",
    name: "Nivell A",
  },
  {
    code: "B",
    id: "level-b",
    name: "Nivell B",
  },
  {
    code: "C",
    id: "level-c",
    name: "Nivell C",
  },
  {
    code: "D",
    id: "level-d",
    name: "Nivell D",
  },
  {
    code: "E",
    id: "level-e",
    name: "Nivell E",
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
      level: levelAt(2),
      name: "Duna",
      pendingDocuments: [],
    },
    {
      breed: "mestís",
      freeTrainingAllowed: true,
      id: "dog-rock",
      level: levelAt(3),
      name: "Rock",
      pack: {
        expiresOn: "2026-11-12",
        id: "pack-rock-10",
        remaining: 4,
        total: 10,
      },
      pendingDocuments: [],
    },
  ],
  familyGroup: {
    holderMemberId: "member-laura",
    id: "family-laura",
    memberIds: ["member-laura", "member-joan"],
    members: [
      {
        dogs: [
          { id: "dog-duna", name: "Duna" },
          { id: "dog-rock", name: "Rock" },
        ],
        fullName: "Laura Serra Vidal",
        id: "member-laura",
        memberNumber: 87,
      },
      { dogs: [], fullName: "Joan Antoni Serra", id: "member-joan", memberNumber: 112 },
    ],
    status: "ACTIVE",
    version: 1,
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
      privacyPolicy: {
        acceptedAt: "2026-02-03T09:00:00Z",
        version: "2026-01",
      },
    },
    contactEmails: [
      { bounced: false, email: "laura.serra@example.test" },
      { bounced: false, email: "feina.laura@example.test" },
    ],
    displayStatus: { kind: "ACTIVE", label: "alta" },
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
    planId: "plan-family",
    phones: [
      { label: "Laura", number: "655100101", prefix: "+34" },
      { label: "Joan", number: "617100102", prefix: "+34" },
    ],
    priceId: "price-family",
    remarks: "Contactar preferentment per correu.",
    roles: ["MEMBER"],
    status: "ACTIVE",
    version: 7,
  },
  nextInvoice: { amount: { amountMinor: 9000, currency: "EUR" }, date: "2026-09-01" },
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
      action: "canvi d'IBAN",
      actorName: "Jordi",
      actorRole: "ADMIN",
      at: "2026-08-03T11:15:00Z",
      id: "audit-iban",
    },
    {
      action: "canvi de tarifa",
      actorName: "Jordi",
      actorRole: "ADMIN",
      at: "2026-07-26T09:30:00Z",
      id: "audit-plan",
    },
  ],
  recentInvoices: [
    {
      amount: { amountMinor: 9000, currency: "EUR" },
      date: "2026-09-01",
      id: "invoice-september",
      status: "REMITTED",
    },
    {
      amount: { amountMinor: 9000, currency: "EUR" },
      date: "2026-08-01",
      id: "invoice-august",
      status: "PAID",
    },
  ],
};

function dogDetailFixture(id: "dog-duna" | "dog-rock"): DogDetail {
  const rock = id === "dog-rock";
  const level = levelAt(rock ? 3 : 2);
  return {
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
    dog: {
      birthDate: rock ? "2020-05-20" : "2022-03-12",
      breed: rock ? "mestís" : "border collie",
      chip: rock ? "941000000000002" : "941000000000001",
      ...(rock ? { handlerName: "Júlia Roca" } : {}),
      id,
      instructorNote: {
        text: rock ? "Vigilar l'espatlla esquerra." : "Treballar la calma a la sortida.",
        updatedAt: "2026-08-12T09:00:00Z",
      },
      levelAssignedAt: rock ? "2025-04-08T09:00:00Z" : "2025-02-01T09:00:00Z",
      levelId: level.id,
      licenses: rock
        ? [
            {
              grade: "Iniciació",
              number: "3241",
              organisation: "FCAG",
            },
            {
              category: "M",
              division: "2D",
              grade: "2",
              number: "13298",
              organisation: "RSCE",
            },
          ]
        : [],
      memberId: "member-laura",
      name: rock ? "Rock" : "Duna",
      registeredAt: "2023-02-03T09:00:00Z",
      sex: rock ? "MALE" : "FEMALE",
      status: "ACTIVE",
      version: 4,
    },
    level,
    levelHistory: [
      {
        byAccountId: "account-admin",
        from: "2025-02-01T09:00:00Z",
        levelId: level.id,
      },
    ],
    licenses: rock
      ? [
          {
            grade: "Iniciació",
            number: "3241",
            organisation: "FCAG",
          },
          {
            category: "M",
            division: "2D",
            grade: "2",
            number: "13298",
            organisation: "RSCE",
          },
        ]
      : [],
    owner: {
      fullName: "Laura Serra Vidal",
      id: "member-laura",
      memberNumber: 87,
      status: "ACTIVE",
    },
    ...(rock
      ? { pack: { expiresOn: "2026-11-12", id: "pack-rock-10", remaining: 4, total: 10 } }
      : {}),
    tasksSummary: { completed: 1, open: 2 },
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

const featuredMembers = [
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

function generatedMember(index: number) {
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

type MemberFixtureInput = (typeof featuredMembers)[number] | ReturnType<typeof generatedMember>;

function memberListItem(input: MemberFixtureInput): MemberListItem {
  const [email = "", phone = ""] = input.contact.split(" · ");
  return {
    birthDate: input.birthDate,
    bookingBlocked: input.bookingBlocked,
    city: input.city,
    contact: {
      emails: [{ bounced: false, email }],
      phones: [{ number: phone.replaceAll(" ", ""), prefix: "+34" }],
    },
    displayStatus: input.displayStatus,
    dogs: input.dogs.map((dog) => ({
      id: dog.id,
      level: {
        code: dog.levelCode,
        id: `level-${dog.levelCode.toLocaleLowerCase()}`,
        name: `Nivell ${dog.levelCode}`,
      },
      name: dog.name,
    })),
    freeTraining: input.freeTrainingAllowed,
    fullName: input.fullName,
    gender: input.gender as NonNullable<MemberListItem["gender"]>,
    id: input.id,
    idDocument: input.idDocument,
    imageRights: { granted: input.imageRightsGranted },
    joinedAt: input.joinedAt,
    ...("leaveDate" in input ? { leaveDate: input.leaveDate } : {}),
    memberNumber: input.memberNumber,
    nextInvoiceDate: input.nextInvoiceDate,
    paymentMethod: input.paymentMethod.includes("····")
      ? { maskedAccount: input.paymentMethod, type: "SEPA_DD" }
      : { channel: input.paymentMethod, type: "MANUAL" },
    pendingDocuments: input.pendingDocuments === 0 ? [] : ["VACCINATION_CARD"],
    plan: { id: input.plan.id, name: input.plan.name },
    postalCode: input.postalCode,
    roles: input.roles as NonNullable<MemberListItem["roles"]>,
    version: 1,
  };
}

export const censusMembers: readonly MemberListItem[] = [
  ...featuredMembers,
  ...Array.from({ length: 184 - featuredMembers.length }, (_, index) => generatedMember(index)),
].map(memberListItem);

const featuredDogs = [
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
    handlerName: "Júlia Roca",
    id: "dog-rock",
    level: { code: "D", id: "level-d", name: "Nivell D", order: 4 },
    levelAssignedAt: "2025-04-08",
    licenses: [
      {
        grade: "Iniciació",
        number: "3241",
        organisation: "FCAG",
      },
      { category: "M", division: "2D", grade: "2", number: "13298", organisation: "RSCE" },
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

function generatedDog(index: number) {
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
        ? [
            {
              category: levels[index % 5] ?? "M",
              division: "Iniciació",
              grade: "Iniciació",
              number: String(4000 + sequence),
              organisation: "FCAG",
            },
          ]
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

type DogFixtureInput = (typeof featuredDogs)[number] | ReturnType<typeof generatedDog>;

function dogListItem(input: DogFixtureInput): DogListItem {
  return {
    age: input.ageYears,
    breed: input.breed,
    chip: input.chip,
    displayStatus: input.displayStatus,
    freeTraining: {
      allowed: input.freeTrainingAllowed,
      override: null,
      source: "LEVEL",
    },
    id: input.id,
    ...(typeof Reflect.get(input, "handlerName") === "string"
      ? { handlerName: Reflect.get(input, "handlerName") as string }
      : {}),
    level: {
      code: input.level.code,
      id: input.level.id,
      name: input.level.name,
    },
    levelAssignedAt: input.levelAssignedAt,
    licenses: input.licenses,
    name: input.name,
    owner: {
      fullName: input.owner.fullName,
      id: input.owner.id,
      status: "ACTIVE",
    },
    ...("pack" in input
      ? {
          pack: {
            expiresOn: "2026-11-12",
            id: "pack-list-10",
            remaining: 4,
            total: 10,
          },
        }
      : {}),
    pendingDocuments: input.pendingDocuments === 0 ? [] : ["VACCINATION_CARD"],
    registeredAt: input.registeredAt,
    sex: input.sex as DogListItem["sex"],
    version: 1,
  };
}

export const censusDogs: readonly DogListItem[] = [
  ...featuredDogs,
  ...Array.from({ length: 242 - featuredDogs.length }, (_, index) => generatedDog(index)),
].map(dogListItem);

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
    version: 1,
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
    version: 1,
  },
];
