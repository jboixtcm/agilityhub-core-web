import { isApiError } from "@agilityhub/api-client";
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
  cause,
  reload = () => {
    window.location.reload();
  },
}: {
  /** What stopped the boot (E11-W02 round 2): an address no club has says so; the rest is offline. */
  cause?: unknown;
  reload?: () => void;
}) {
  // `errors` is loaded with `common` before the page shows (`showBootFailure`).
  const { t } = useTranslation("common");
  return (
    <BootFailure
      message={
        isApiError(cause, "UNKNOWN_HOST") ? t("errors:UNKNOWN_HOST") : t("common:boot.offline")
      }
      onRetry={reload}
      retryLabel={t("common:boot.retry")}
      title={t("common:unavailable.title")}
    />
  );
}
