import { useBranding } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

/**
 * The public footer of the access screen (01) and the signup (16–19), S02 R-02-02 (Jordi 25-09):
 * «{legalName} · {taxId} · {city}» from `/branding` (the entity's public identifiers, LSSI art. 10),
 * or «{name} · {city}» without a tax id; below it, the registered office «{street} · {postalCode}
 * {city}» when `legalAddress` is not `null`.
 */
export function PublicFooter({ className }: { className: string }) {
  const branding = useBranding();
  const { t } = useTranslation("common");
  const city = branding.club.city?.trim() ?? "";
  const taxId = branding.club.taxId?.trim() ?? "";
  const legalName = branding.club.legalName?.trim() ?? "";
  const entity = legalName === "" ? branding.club.name : legalName;
  const identity =
    taxId === ""
      ? city === ""
        ? t("common:publicFooter.name", { club: branding.club.name })
        : t("common:publicFooter.nameWithCity", { city, club: branding.club.name })
      : city === ""
        ? t("common:publicFooter.withTaxId", { club: entity, taxId })
        : t("common:publicFooter.withTaxIdAndCity", { city, club: entity, taxId });
  const office = branding.club.legalAddress;
  const officeCity = office?.city?.trim() ?? "";

  return (
    <footer className={className}>
      <span className="public-footer__line">{identity}</span>
      {office == null ? null : (
        <span className="public-footer__line">
          {officeCity === ""
            ? t("common:publicFooter.office", { postalCode: office.postalCode, street: office.street })
            : t("common:publicFooter.officeWithCity", {
                city: officeCity,
                postalCode: office.postalCode,
                street: office.street,
              })}
        </span>
      )}
    </footer>
  );
}
