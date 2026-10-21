import { Button, ErrorState, LazyBoundary, reloadDocument, Skeleton } from "@agilityhub/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** A lazy chunk on its way: the UI kit's loading state, labelled. */
function ChunkLoading({ height, label }: { height: string; label?: string }) {
  const { t } = useTranslation("shell");
  return <Skeleton height={height} label={label ?? t("shell:loading")} />;
}

/** A chunk or a screen that could not be drawn: the UI kit's error state, a reload as its retry. */
function ChunkFailure({ chunk, retry }: { chunk: boolean; retry: () => void }) {
  const { t } = useTranslation(["common", "errors"]);
  return (
    <ErrorState
      action={
        <Button
          onClick={() => {
            retry();
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

/**
 * E11-W02 round 3 (review m1): the back office's lazy chunks (D19's console, the S16 courses
 * route, D18's 3D tab) under the members' app's pattern — a labelled loading state while the chunk
 * loads, and the UI kit's error state inside the shell instead of a blank app when it fails; a chunk
 * a deploy removed reloads the document once. Key it by what it shows.
 */
export function ChunkBoundary({
  children,
  height = "12rem",
  loadingLabel,
}: {
  children: ReactNode;
  height?: string;
  loadingLabel?: string;
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
    >
      {children}
    </LazyBoundary>
  );
}
