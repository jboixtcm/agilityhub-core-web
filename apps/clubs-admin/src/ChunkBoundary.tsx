import { Button, ErrorState, LazyBoundary, reloadDocument, Skeleton } from "@agilityhub/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** A lazy chunk on its way: the UI kit's loading state, labelled. */
function ChunkLoading({ height, label }: { height: string; label?: string }) {
  const { t } = useTranslation("shell");
  return <Skeleton height={height} label={label ?? t("shell:loading")} />;
}

/**
 * A chunk or a screen that could not be drawn: the UI kit's error state, a reload as its retry.
 * A missing chunk means the app was updated (E11-W05 step 5 (d), A39.210); a screen's own failure
 * says so plainly, in the app's register (A39.211).
 */
function ChunkFailure({ chunk, retry }: { chunk: boolean; retry: () => void }) {
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
 * E11-W02 round 3 (review m1): the back office's lazy chunks (D19's console, the S16 courses
 * route, D18's 3D tab) under the members' app's pattern — a labelled loading state while the chunk
 * loads, and the UI kit's error state inside the shell instead of a blank app when it fails; a chunk
 * a deploy removed reloads the document once. Since E11-W05 step 5 (a) every back-office screen is
 * drawn inside one. Key it by what it shows, or pass `resetKey` (the pathname) when its content
 * follows several addresses.
 */
export function ChunkBoundary({
  children,
  height = "12rem",
  loadingLabel,
  resetKey,
}: {
  children: ReactNode;
  height?: string;
  loadingLabel?: string;
  resetKey?: string;
}) {
  return (
    <LazyBoundary
      failure={({ chunk, retry }) => <ChunkFailure chunk={chunk} retry={retry} />}
      loading={
        <ChunkLoading
          height={height}
          {...(loadingLabel === undefined ? {} : { label: loadingLabel })}
        />
      }
      reload={reloadDocument}
      resetKey={resetKey}
    >
      {children}
    </LazyBoundary>
  );
}
