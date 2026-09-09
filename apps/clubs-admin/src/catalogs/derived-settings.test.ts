import { describe, expect, it } from "vitest";

import { buildDerivedSettingRows, groupLevelCapacities } from "./derived-settings";

type TestLevel = Parameters<typeof groupLevelCapacities>[0][number];

function level(
  code: string,
  name: string,
  capacity: number,
  order: number,
  grantsFreeTraining = false,
): TestLevel {
  return {
    active: true,
    capacity,
    code,
    grantsFreeTraining,
    name,
    order,
  };
}

const levels = [
  level("P", "Cadells", 5, 0),
  level("A", "Nivell A", 5, 10),
  level("B", "Nivell B", 5, 20),
  level("C", "Nivell C", 5, 30),
  level("D", "Nivell D", 5, 40, true),
  level("E", "Nivell E", 4, 50, true),
  level("F", "Nivell F", 4, 60, true),
  level("G", "Nivell G", 4, 70, true),
  level("T", "Teràpia", 1, 80),
];

const plans: Parameters<typeof buildDerivedSettingRows>[0]["plans"] = [
  {
    active: true,
    name: "Pack 6",
    order: 20,
    pack: { sessions: 6, validityMonths: 3 },
    type: "PACK",
  },
  {
    active: true,
    name: "Pack 10",
    order: 30,
    pack: { sessions: 10, validityMonths: 5 },
    type: "PACK",
  },
];

describe("T-02-13 D11 derived settings", () => {
  it("groups consecutive level capacities from the catalog", () => {
    expect(groupLevelCapacities(levels, "ca")).toBe("Cadells 5 · A–D 5 · E–G 4 · Teràpia 1");
    expect(groupLevelCapacities([level("P", "Cadells", 5, 0)], "ca")).toBe("Cadells 5");
    expect(
      groupLevelCapacities(
        [
          level("A", "Nivell A", 5, 0),
          level("B", "Nivell B", 5, 10),
          level("C", "Nivell C", 5, 20),
        ],
        "ca",
      ),
    ).toBe("A–C 5");
  });

  it("shows each of the four read rows only under its module gate", () => {
    const input = {
      clubSettings: {
        paymentProviders: { SEPA_XML: { configured: true, enabled: true } },
      },
      levels,
      locale: "ca",
      plans,
    };
    const keys = (modules: string[]) =>
      buildDerivedSettingRows({ ...input, modules }).map((row) => row.key);

    expect(keys(["BILLING", "FREE_TRAINING", "PACKS"])).toEqual([
      "capacityByLevel",
      "freeTrainingLevels",
      "packExpiry",
      "sepaCreditor",
    ]);
    expect(keys([])).toEqual(["capacityByLevel"]);
    expect(keys(["FREE_TRAINING"])).toEqual(["capacityByLevel", "freeTrainingLevels"]);
    expect(keys(["BILLING"])).toEqual(["capacityByLevel", "sepaCreditor"]);
    expect(keys(["BILLING", "PACKS"])).toEqual(["capacityByLevel", "packExpiry", "sepaCreditor"]);
  });
});
