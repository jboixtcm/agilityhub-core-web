import { BootFailure } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

/**
 * What the app can be translated with when `/branding` failed and nothing is cached (E11-W02,
 * INC-41): the product's three languages, the reader's browser language first.
 */
export const BOOT_FAILURE_BRANDING: { defaultLocale: string; locales: string[] } = {
  defaultLocale: "ca",
  locales: ["ca", "es", "en"],
};

export function BootFailurePage({
  reload = () => {
    window.location.reload();
  },
}: {
  reload?: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <BootFailure
      message={t("common:boot.offline")}
      onRetry={reload}
      retryLabel={t("common:boot.retry")}
      title={t("common:unavailable.title")}
    />
  );
}
