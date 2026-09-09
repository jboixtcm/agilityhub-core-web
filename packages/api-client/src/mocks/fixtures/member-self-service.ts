import type { components } from "../../generated/schema";

import { censusLevels } from "./census";

type License = components["schemas"]["LicenseWithPendingFields"];
export type MeDog = Omit<components["schemas"]["MeDog"], "licenses"> & {
  licenses: License[];
};
export type MeDogs = Omit<components["schemas"]["MeDogs"], "dogs"> & { dogs: MeDog[] };
export type MeProfile = components["schemas"]["MeProfile"];
type PostalTown = components["schemas"]["PostalTown"];

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
      tasks: {
        completed: 1,
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
    },
  ],
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
