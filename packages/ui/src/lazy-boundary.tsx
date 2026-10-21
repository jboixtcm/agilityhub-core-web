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
  /**
   * What the content was drawn for (the pathname): a failure belongs to it, and a new value draws
   * the content again (E11-W05, E154). A healthy content is not remounted: React.lazy keeps its
   * module, so no loading state shows either.
   */
  resetKey?: unknown;
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

  override componentDidUpdate(previous: Omit<LazyBoundaryProps, "loading">): void {
    if (this.state.error !== undefined && !Object.is(previous.resetKey, this.props.resetKey)) {
      this.setState({ error: undefined });
    }
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
 * removed reloads the document once (`reloadOnce`). Key it by what it shows, or pass `resetKey`
 * when its content follows several addresses, so that a failure stays with that screen.
 */
export function LazyBoundary({ children, failure, loading, reload, resetKey }: LazyBoundaryProps) {
  return (
    <FailureBoundary failure={failure} reload={reload} resetKey={resetKey}>
      <Suspense fallback={loading}>{children}</Suspense>
    </FailureBoundary>
  );
}
