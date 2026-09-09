import type { components } from "@agilityhub/api-client";

type ClubSettings = Pick<components["schemas"]["ClubSettings"], "paymentProviders">;
type Level = Pick<
  components["schemas"]["Level"],
  "active" | "capacity" | "code" | "grantsFreeTraining" | "name" | "nameI18n" | "order"
>;
type Plan = Pick<
  components["schemas"]["Plan"],
  "active" | "name" | "nameI18n" | "order" | "pack" | "type"
>;

export type DerivedSettingRow =
  | {
      afterKey: string;
      block: "classes";
      href: "#nivells";
      key: "capacityByLevel";
      summary: string;
    }
  | {
      afterKey: string;
      block: "freeTraining";
      href: "#nivells";
      key: "freeTrainingLevels";
      summary: string;
    }
  | {
      afterKey: string;
      block: "billing";
      href: "/modalitats";
      key: "packExpiry";
      planNames: string;
      validityMonths: number[];
    }
  | {
      afterKey: string;
      block: "billing";
      configured: boolean;
      key: "sepaCreditor";
    };

function localizedName(
  item: { name: string; nameI18n?: Record<string, string> },
  locale: string,
): string {
  return item.nameI18n?.[locale] ?? item.name;
}

function rangeCode(code: string): number | undefined {
  return /^[A-Z]$/u.test(code) ? code.codePointAt(0) : undefined;
}

function singletonLevelLabel(level: Level, locale: string): string {
  const name = localizedName(level, locale);
  return name === level.code || name.endsWith(` ${level.code}`) ? level.code : name;
}

export function groupLevelCapacities(levels: readonly Level[], locale: string): string {
  const ordered = levels
    .filter((level) => level.active)
    .sort((left, right) => left.order - right.order);
  const groups: Level[][] = [];

  for (const level of ordered) {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    const previousCode = previous === undefined ? undefined : rangeCode(previous.code);
    const nextCode = rangeCode(level.code);
    if (
      current !== undefined &&
      previous?.capacity === level.capacity &&
      previousCode !== undefined &&
      nextCode === previousCode + 1
    ) {
      current.push(level);
    } else {
      groups.push([level]);
    }
  }

  return groups
    .map((group) => {
      const first = group[0];
      const last = group.at(-1);
      if (first === undefined || last === undefined) {
        return "";
      }
      const label =
        group.length === 1 ? singletonLevelLabel(first, locale) : `${first.code}\u2013${last.code}`;
      return `${label} ${String(first.capacity)}`;
    })
    .filter(Boolean)
    .join(" \u00b7 ");
}

export function buildDerivedSettingRows({
  clubSettings,
  levels,
  locale,
  modules,
  plans,
}: {
  clubSettings?: ClubSettings | undefined;
  levels: readonly Level[];
  locale: string;
  modules: readonly string[];
  plans: readonly Plan[];
}): DerivedSettingRow[] {
  const rows: DerivedSettingRow[] = [
    {
      afterKey: "classes.defaultCapacity",
      block: "classes",
      href: "#nivells",
      key: "capacityByLevel",
      summary: groupLevelCapacities(levels, locale),
    },
  ];

  if (modules.includes("FREE_TRAINING")) {
    rows.push({
      afterKey: "training.capacityPerRingSlot",
      block: "freeTraining",
      href: "#nivells",
      key: "freeTrainingLevels",
      summary: levels
        .filter((level) => level.active && level.grantsFreeTraining)
        .sort((left, right) => left.order - right.order)
        .map((level) => level.code)
        .join(" \u00b7 "),
    });
  }

  if (modules.includes("PACKS")) {
    const packs = plans
      .filter((plan) => plan.active && plan.type === "PACK" && plan.pack !== undefined)
      .sort((left, right) => left.order - right.order);
    rows.push({
      afterKey: "billing.entryFeePerDog",
      block: "billing",
      href: "/modalitats",
      key: "packExpiry",
      planNames: packs.map((plan) => localizedName(plan, locale)).join(" \u00b7 "),
      validityMonths: packs.flatMap((plan) =>
        plan.pack === undefined ? [] : [plan.pack.validityMonths],
      ),
    });
  }

  if (modules.includes("BILLING")) {
    const sepa = clubSettings?.paymentProviders?.SEPA_XML;
    rows.push({
      afterKey: "billing.cashInvoicing",
      block: "billing",
      configured: Boolean(sepa?.configured && sepa.enabled),
      key: "sepaCreditor",
    });
  }

  return rows;
}
