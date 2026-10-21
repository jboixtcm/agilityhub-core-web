import { act, render, screen } from "@testing-library/react";
import { type ReactElement, type ReactNode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LazyBoundary } from "./lazy-boundary";

afterEach(() => {
  sessionStorage.clear();
});

function Drawn({ fail, mounted }: { fail: string | undefined; mounted?: () => void }) {
  useEffect(() => {
    mounted?.();
  }, [mounted]);
  if (fail !== undefined) throw new Error(fail);
  return <p>Drawn</p>;
}

function frame(children: ReactNode, reload: () => void, resetKey?: string): ReactElement {
  return (
    <LazyBoundary
      failure={({ chunk, retry }) => (
        <div role="alert">
          {chunk ? "chunk" : "screen"}
          <button onClick={retry} type="button">
            retry
          </button>
        </div>
      )}
      loading={<p role="status">Loading</p>}
      reload={reload}
      {...(resetKey === undefined ? {} : { resetKey })}
    >
      {children}
    </LazyBoundary>
  );
}

describe("E11-W05 step 5 (a): one boundary for both apps' screens (packages/ui)", () => {
  it("a screen that throws while drawing shows the app's failure as a screen failure, and the document is not reloaded", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    render(frame(<Drawn fail="Cannot read properties of undefined" />, reload));
    expect(screen.getByRole("alert")).toHaveTextContent("screen");
    expect(reload).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("a chunk a deploy removed shows the failure as a chunk failure and reloads the document once", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    const missing = "Failed to fetch dynamically imported module: /assets/a1.js";
    const { rerender } = render(frame(<Drawn fail={missing} />, reload, "/a"));
    expect(screen.getByRole("alert")).toHaveTextContent("chunk");
    expect(reload).toHaveBeenCalledTimes(1);
    // Still missing on the next address within the minute: no reload loop.
    rerender(frame(<Drawn fail={missing} />, reload, "/b"));
    expect(screen.getByRole("alert")).toHaveTextContent("chunk");
    expect(reload).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

describe("E11-W05 step 5 (E11-W02 round 3 minor, E154): a failure belongs to the address it was drawn for", () => {
  it("a new resetKey (the next pathname) draws the content again; the same key keeps the failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    const { rerender } = render(frame(<Drawn fail="broken" />, reload, "/recorreguts/x"));
    expect(screen.getByRole("alert")).toHaveTextContent("screen");
    rerender(frame(<Drawn fail={undefined} />, reload, "/recorreguts/x"));
    expect(screen.getByRole("alert")).toBeVisible();
    act(() => {
      rerender(frame(<Drawn fail={undefined} />, reload, "/recorreguts"));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Drawn")).toBeVisible();
    vi.restoreAllMocks();
  });

  it("a healthy screen is not remounted when the key changes (no lost state, no loading flash)", () => {
    const mounted = vi.fn();
    const { rerender } = render(
      frame(<Drawn fail={undefined} mounted={mounted} />, vi.fn(), "/recorreguts"),
    );
    rerender(frame(<Drawn fail={undefined} mounted={mounted} />, vi.fn(), "/recorreguts/a"));
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
