import { Button, ErrorState, Skeleton } from "@agilityhub/ui";
import { Component, type ReactNode, Suspense } from "react";
import { useTranslation } from "react-i18next";

import { isChunkLoadError, reloadDocument, reloadOnce } from "./chunk-reload";

/** The screens' chunk on its way (E11-W02 step 6): the UI kit's loading state. */
export function ScreenLoading() {
  const { t } = useTranslation("shell");
  return <Skeleton height="12rem" label={t("shell:loading")} />;
}

/** A screen that could not be drawn: the UI kit's error state, and a reload as its retry. */
function ScreenFailure({ chunk }: { chunk: boolean }) {
  const { t } = useTranslation(["common", "errors"]);
  return (
    <ErrorState
      action={
        <Button
          onClick={() => {
            reloadDocument();
          }}
          variant="secondary"
        >
          {t("common:boot.retry")}
        </Button>
      }
      description={chunk ? t("common:boot.offline") : t("errors:INTERNAL_ERROR")}
      title={t("common:unavailable.title")}
    />
  );
}

interface FailureBoundaryState {
  error?: unknown;
}

class FailureBoundary extends Component<{ children: ReactNode }, FailureBoundaryState> {
  override state: FailureBoundaryState = {};

  static getDerivedStateFromError(error: unknown): FailureBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown): void {
    // A chunk a deploy replaced: one reload brings the new build (no loop, `reloadOnce`).
    if (isChunkLoadError(error)) reloadOnce(reloadDocument);
  }

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    return <ScreenFailure chunk={isChunkLoadError(this.state.error)} />;
  }
}

/**
 * A screen's frame (E11-W02 round 2, review #4): its loading state while its chunk loads, and the
 * UI kit's error state instead of a blank app when the chunk or the screen fails. Keyed by the
 * address it shows (A38), so a failure stays with that screen.
 */
export function ScreenBoundary({ children }: { children: ReactNode }) {
  return (
    <FailureBoundary>
      <Suspense fallback={<ScreenLoading />}>{children}</Suspense>
    </FailureBoundary>
  );
}
