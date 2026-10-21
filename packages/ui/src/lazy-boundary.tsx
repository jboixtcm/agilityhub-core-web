import { Component, type ReactNode, Suspense } from "react";

import { isChunkLoadError, reloadOnce } from "./chunk-reload";

export interface LazyBoundaryProps {
  children: ReactNode;
  /** Shown while the lazy chunk loads: the app's loading state (a labelled `Skeleton`). */
  loading: ReactNode;
  /**
   * Shown instead of the content once it failed: the app's `ErrorState`. `chunk` says the chunk
   * itself could not be fetched; `retry` reloads the document.
   */
  failure: (failure: { chunk: boolean; retry: () => void }) => ReactNode;
  /** The document's reload (`reloadDocument`; a test passes its own). */
  reload: () => void;
}

interface FailureBoundaryState {
  error?: unknown;
}

class FailureBoundary extends Component<Omit<LazyBoundaryProps, "loading">, FailureBoundaryState> {
  override state: FailureBoundaryState = {};

  static getDerivedStateFromError(error: unknown): FailureBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown): void {
    // A chunk a deploy replaced: one reload brings the new build (no loop, `reloadOnce`).
    if (isChunkLoadError(error)) reloadOnce(this.props.reload);
  }

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    return this.props.failure({
      chunk: isChunkLoadError(this.state.error),
      retry: this.props.reload,
    });
  }
}

/**
 * A lazy screen's frame (E11-W02 rounds 2–3): its loading state while its chunk loads, and the
 * app's error state instead of a blank app when the chunk or the screen fails; a chunk a deploy
 * removed reloads the document once (`reloadOnce`). Key it by what it shows, so that a failure
 * stays with that screen.
 */
export function LazyBoundary({ children, failure, loading, reload }: LazyBoundaryProps) {
  return (
    <FailureBoundary failure={failure} reload={reload}>
      <Suspense fallback={loading}>{children}</Suspense>
    </FailureBoundary>
  );
}
