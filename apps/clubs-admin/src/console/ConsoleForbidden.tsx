import { EmptyState } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

/**
 * S17 §2 row «Entrada»: an account without `AGILITYHUB_ADMIN` is told «Aquest accés és només per a
 * l'equip AgilityHub», never shown the console.
 */
export function ConsoleForbidden() {
  const { t } = useTranslation("console");
  return (
    <EmptyState
      description={t("console:access.description")}
      icon="lock"
      title={t("console:access.title")}
    />
  );
}
