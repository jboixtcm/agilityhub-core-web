import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLoader } from "./shared";

afterEach(cleanup);

/** The app comes back to the foreground (the installed PWA reopened, the tab shown again). */
function comeBack() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("WEB-04: 03, 04, 07 and the waiting entry are read again when the app comes back", () => {
  it("reads again quietly on visibility, focus and online, with the rows kept while it loads", async () => {
    let answer = "yesterday";
    const load = vi.fn(() => Promise.resolve(answer));
    const { result } = renderHook(() => useLoader(load, undefined, false, true));
    await waitFor(() => {
      expect(result.current.data).toBe("yesterday");
    });
    expect(load).toHaveBeenCalledTimes(1);

    answer = "today";
    comeBack();
    expect(result.current.status).toBe("ready");
    await waitFor(() => {
      expect(result.current.data).toBe("today");
    });
    expect(load).toHaveBeenCalledTimes(2);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(3);
    });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(4);
    });
  });

  it("a read on coming back that fails keeps the rows on screen (no network yet on wake-up)", async () => {
    const load = vi.fn<() => Promise<string>>().mockResolvedValueOnce("rows");
    const { result } = renderHook(() => useLoader(load, undefined, false, true));
    await waitFor(() => {
      expect(result.current.data).toBe("rows");
    });
    load.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    comeBack();
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    // Let the rejected read settle before checking the state it left.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toMatchObject({ data: "rows", status: "ready" });

    // An explicit quiet read (04's join, 07's cancellation) still shows its error, as before.
    load.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    act(() => {
      result.current.refetch(true);
    });
    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
  });

  it("a hidden page reads nothing, and a loader without `onFocus` never reads on coming back", async () => {
    const load = vi.fn(() => Promise.resolve("rows"));
    const other = vi.fn(() => Promise.resolve("rows"));
    renderHook(() => useLoader(load, undefined, false, true));
    renderHook(() => useLoader(other));
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    comeBack();
    visibility.mockRestore();
    comeBack();
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    expect(other).toHaveBeenCalledTimes(1);
  });
});
