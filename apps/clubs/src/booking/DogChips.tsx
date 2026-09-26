import { Icon } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

import type { HomeDog } from "./shared";

/**
 * The dog selector of 03 and 04 (R-08-23): own dogs first, then the group's «Toby · B (Joan
 * Antoni)»; «Tots» last and only on 03 (`withAll`) when more than one dog is accessible. The
 * paw marks the first own dog, as the mockups. `selected = null` is «Tots».
 */
export function DogChips({
  disabled = false,
  dogs,
  onSelect,
  selected,
  withAll,
}: {
  disabled?: boolean;
  dogs: readonly HomeDog[];
  onSelect: (dogId: string | null) => void;
  selected: string | null;
  withAll: boolean;
}) {
  const { t } = useTranslation("home");
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
    <div aria-label={t("home:dogs.label")} className="dog-chips" role="group">
      {ordered.map((dog, index) => {
        const level = dog.levelName ?? "";
        const owner = dog.ownerFirstName ?? "";
        const label = dog.own
          ? level === ""
            ? dog.name
            : t("home:dogs.ownDog", { level, name: dog.name })
          : level === ""
            ? t("home:dogs.groupDogNoLevel", { name: dog.name, owner })
            : t("home:dogs.groupDog", { level, name: dog.name, owner });
        return chip(dog.id, label, index === 0 && dog.own);
      })}
      {showAll ? chip(null, t("home:dogs.all"), false) : null}
    </div>
  );
}
