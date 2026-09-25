import type { components } from "../../generated/schema";

import { censusLevels } from "./census";

type License = components["schemas"]["LicenseWithPendingFields"];
// The fixture dogs are ACTIVE, so they carry the documents and licences the api sends only for ACTIVE dogs.
export type MeDog = Omit<components["schemas"]["MeDog"], "documents" | "licenses" | "status"> & {
  documents: NonNullable<components["schemas"]["MeDog"]["documents"]>;
  licenses: License[];
  status: "ACTIVE";
};
/** A dog added from the app that waits for the club (R-04-25, E36): no documents or licences. */
export type MePendingDog = Omit<components["schemas"]["MeDog"], "documents" | "licenses" | "status"> & {
  status: "PENDING";
};
export type MeDogs = Omit<components["schemas"]["MeDogs"], "dogs"> & {
  dogs: (MeDog | MePendingDog)[];
};
export type MeProfile = components["schemas"]["MeProfile"];
type PostalTown = components["schemas"]["PostalTown"];
type DogDocumentType = components["schemas"]["DogDocumentType"];

/** `census.dogDocumentTypes` of the mock club: the product default of CATALEG_PARAMETRES (R-03-15). */
export const dogDocumentTypesCatalog = [
  {
    key: "VACCINATION_CARD",
    label: { ca: "Cartilla de vacunes", en: "Vaccination card", es: "Cartilla de vacunas" },
    required: true,
  },
  { key: "INSURANCE", label: { ca: "Assegurança", en: "Insurance", es: "Seguro" }, required: false },
  { key: "OTHER", label: { ca: "Altres", en: "Other", es: "Otros" }, required: false },
];

/**
 * `GET /me/dogs.documentTypes` (api E3-T16; a MEMBER cannot read `/parameters`): the catalog in its
 * order, each label in the reader's language when the club offers it, else in the club's default
 * language (R-03-32).
 */
export function meDogDocumentTypes(
  acceptLanguage: string | null,
  club: { defaultLocale: string; locales: readonly string[] } = { defaultLocale: "ca", locales: ["ca", "es", "en"] },
): DogDocumentType[] {
  const requested = acceptLanguage?.toLocaleLowerCase().split(/[-,]/u)[0] ?? club.defaultLocale;
  const locale = club.locales.includes(requested) ? requested : club.defaultLocale;
  return dogDocumentTypesCatalog.map(({ key, label, required }) => ({
    key,
    label: label[locale as keyof typeof label],
    required,
  }));
}

function level(index: number): components["schemas"]["LevelSummary"] {
  const value = censusLevels[index];
  if (value === undefined) {
    throw new RangeError("The member dog fixture level is missing");
  }
  return value;
}

export const meDogsFixture: MeDogs = {
  canAddDog: true,
  dogs: [
    {
      ageYears: 4,
      breed: "Border collie",
      documents: [
        {
          files: [
            {
              id: "file-duna-card-1",
              name: "cartilla_Duna_1.jpg",
              uploadedAt: "2026-05-11T09:00:00Z",
              url: "https://files.example.test/cartilla_Duna_1.jpg",
            },
            {
              id: "file-duna-card-2",
              name: "cartilla_Duna_2.jpg",
              uploadedAt: "2026-05-11T09:01:00Z",
              url: "https://files.example.test/cartilla_Duna_2.jpg",
            },
          ],
          id: "document-duna-card",
          state: "RECEIVED",
          type: "VACCINATION_CARD",
          typeLabel: "Cartilla de vacunes",
        },
        {
          files: [
            {
              id: "file-duna-insurance",
              name: "Assegurança.pdf",
              uploadedAt: "2026-05-12T09:00:00Z",
              url: "https://files.example.test/Asseguranca.pdf",
            },
          ],
          id: "document-duna-insurance",
          state: "RECEIVED",
          type: "INSURANCE",
          typeLabel: "Assegurança",
        },
      ],
      freeTrainingAllowed: false,
      id: "dog-duna",
      instructorNote: {
        text: "A veure si treballem una mica el doble a classe. El gos s'atura molt aviat al balancí",
        updatedAt: "2026-08-12T09:00:00Z",
      },
      level: level(2),
      licenses: [],
      name: "Duna",
      sex: "FEMALE",
      status: "ACTIVE",
      tasks: {
        completed: 1,
        items: [
          {
            attachmentsCount: 0,
            createdAt: "2026-08-10T09:00:00Z",
            id: "task-duna-balance",
            instructorName: "Laura",
            text: "Treballar l'entrada al balancí",
          },
          {
            attachmentsCount: 1,
            createdAt: "2026-08-12T09:00:00Z",
            id: "task-duna-weave",
            instructorName: "Marc",
            text: "Revisar l'entrada a l'eslàlom",
          },
          {
            attachmentsCount: 0,
            createdAt: "2026-07-20T09:00:00Z",
            doneAt: "2026-08-01T09:00:00Z",
            id: "task-duna-start",
            instructorName: "Laura",
            text: "Consolidar la sortida quieta",
          },
        ],
        open: 2,
      },
    },
    {
      ageYears: 3,
      breed: "Mestís",
      documents: [],
      freeTrainingAllowed: true,
      id: "dog-rock",
      level: level(3),
      licenses: [
        {
          grade: "Iniciació",
          number: "3241",
          organisation: "FCAG",
        },
        { category: "M", division: "2D", grade: "2", number: "13298", organisation: "RSCE" },
      ],
      name: "Rock",
      pack: {
        expiresOn: "2026-11-12",
        id: "pack-rock-10",
        remaining: 4,
        total: 10,
      },
      sex: "MALE",
      status: "ACTIVE",
    },
  ],
  documentTypes: meDogDocumentTypes(null),
};

export const meProfileFixture: MeProfile = {
  address: {
    city: "Cabrera de Mar",
    country: "ES",
    postalCode: "08349",
    province: "Barcelona",
    street: "C. de la Riera, 12",
  },
  contactEmails: [
    { bounced: false, email: "laura@example.cat" },
    { bounced: false, email: "feina@example.cat" },
  ],
  firstName: "Laura",
  idDocumentMasked: "38······1P",
  lastName1: "Serra",
  lastName2: "Vidal",
  paymentMethod: {
    holderName: "Laura Serra Vidal",
    maskedAccount: "···· ···· ···· ···· 2231",
    type: "SEPA_DD",
  },
  phones: [
    { label: "Laura", number: "655100101", prefix: "+34" },
    { label: "Joan", number: "617100102", prefix: "+34" },
  ],
  version: 7,
};

export const postalTownFixtures: Readonly<Record<string, PostalTown[]>> = {
  "08349": [{ region: "Barcelona", town: "Cabrera de Mar" }],
  "99999": [
    { region: "Barcelona", town: "Poble Nord" },
    { region: "Barcelona", town: "Poble Sud" },
  ],
};
