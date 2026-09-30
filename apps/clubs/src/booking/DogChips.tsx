import { Icon } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

import "./booking.css";
import type { HomeDog } from "./shared";

/** The chip texts; 03 and 04 use `home:dogs.*`, screen 25 its own `history:dogs.*`. */
export interface DogChipLabels {
  all: string;
  groupDog: (dog: { level: string; name: string; owner: string }) => string;
  groupDogNoLevel: (dog: { name: string; owner: string }) => string;
  label: string;
  ownDog: (dog: { level: string; name: string }) => string;
}

/**
 * The dog selector of 03, 04 and 25 (R-08-23, R-10-14): own dogs first, then the group's «Toby ·
 * B (Joan Antoni)»; «Tots» last and only with `withAll` when more than one dog is accessible. The
 * paw marks the first own dog, as the mockups. `selected = null` is «Tots».
 */
export function DogChips({
  disabled = false,
  dogs,
  labels,
  onSelect,
  selected,
  withAll,
}: {
  disabled?: boolean;
  dogs: readonly HomeDog[];
  labels?: DogChipLabels;
  onSelect: (dogId: string | null) => void;
  selected: string | null;
  withAll: boolean;
}) {
  const { t } = useTranslation("home");
  const texts: DogChipLabels = labels ?? {
    all: t("home:dogs.all"),
    groupDog: (values) => t("home:dogs.groupDog", values),
    groupDogNoLevel: (values) => t("home:dogs.groupDogNoLevel", values),
    label: t("home:dogs.label"),
    ownDog: (values) => t("home:dogs.ownDog", values),
  };
  const ordered = [...dogs.filter((dog) => dog.own), ...dogs.filter((dog) => !dog.own)];
  const showAll = withAll && ordered.length > 1;
  const chip = (id: string | null, label: string, paw: boolean) => {
    const pressed = id === selected || (id !== null && !showAll && ordered.length === 1);
    return (
      <button
        aria-pressed={pressed}
        className={`ah-chip dog-chip${pressed ? " dog-chip--selected" : ""}`}
        disabled={disabled}
        key={id ?? "all"}
        onClick={() => {
          if (!pressed) onSelect(id);
        }}
        type="button"
      >
        {paw ? <Icon aria-hidden="true" name="paw" /> : null}
        {label}
      </button>
    );
  };
  return (
    <div aria-label={texts.label} className="dog-chips" role="group">
      {ordered.map((dog, index) => {
        const level = dog.levelName ?? "";
        const owner = dog.ownerFirstName ?? "";
        const label = dog.own
          ? level === ""
            ? dog.name
            : texts.ownDog({ level, name: dog.name })
          : level === ""
            ? texts.groupDogNoLevel({ name: dog.name, owner })
            : texts.groupDog({ level, name: dog.name, owner });
        return chip(dog.id, label, index === 0 && dog.own);
      })}
      {showAll ? chip(null, texts.all, false) : null}
    </div>
  );
}
