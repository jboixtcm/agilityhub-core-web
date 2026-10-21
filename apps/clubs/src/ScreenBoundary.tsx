import { Button, ErrorState, LazyBoundary, reloadDocument, Skeleton } from "@agilityhub/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** The screens' chunk on its way (E11-W02 step 6): the UI kit's loading state. */
export function ScreenLoading() {
  const { t } = useTranslation("shell");
  return <Skeleton height="12rem" label={t("shell:loading")} />;
}

/**
 * A screen that could not be drawn: the UI kit's error state, and a reload as its retry. A missing
 * chunk means the app was updated (E11-W05 step 5 (d), A39.210); a screen's own failure says so
 * plainly, in the app's register (A39.211).
 */
function ScreenFailure({ chunk, retry }: { chunk: boolean; retry: () => void }) {
  const { t } = useTranslation("common");
  return (
    <ErrorState
      action={
        <Button
          onClick={() => {
            retry();
          }}
          variant="secondary"
        >
          {chunk ? t("common:screen.reload") : t("common:boot.retry")}
        </Button>
      }
      description={chunk ? t("common:screen.updated") : t("common:screen.failed")}
      title={t("common:unavailable.title")}
    />
  );
}

/**
 * A screen's frame (E11-W02 round 2, review #4): its loading state while its chunk loads, and the
 * UI kit's error state instead of a blank app when the chunk or the screen fails. Keyed by the
 * address it shows (A38), so a failure stays with that screen.
 */
export function ScreenBoundary({ children }: { children: ReactNode }) {
  return (
    <LazyBoundary
      failure={({ chunk, retry }) => <ScreenFailure chunk={chunk} retry={retry} />}
      loading={<ScreenLoading />}
      reload={reloadDocument}
    >
      {children}
    </LazyBoundary>
  );
}
