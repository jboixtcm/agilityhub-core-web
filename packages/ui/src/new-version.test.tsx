import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BuildVersion,
  isOtherBuild,
  isSafeMoment,
  NewVersionNotice,
  type NewVersionNoticeProps,
  parseBuildVersion,
  readDeployedVersion,
  SAFE_MOMENT_POLL_MS,
  VERSION_CHECK_INTERVAL_MS,
  VERSION_CHECK_MIN_GAP_MS,
} from "./new-version";

const OLD = "0123456789abcdef0123456789abcdef01234567";
const NEW = "89abcdef0123456789abcdef0123456789abcdef";
const running: BuildVersion = { commit: OLD, version: "1.0.0" };
const deployedNew: BuildVersion = { commit: NEW, version: "1.0.0" };

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Lets the pending promises (the read, the press) settle under fake timers. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderNotice(props: Partial<NewVersionNoticeProps> = {}) {
  const readVersion = vi.fn<() => Promise<BuildVersion | undefined>>(() =>
    Promise.resolve(deployedNew),
  );
  const reload = vi.fn();
  const view = render(
    <NewVersionNotice
      message="Hi ha una versió nova"
      readVersion={readVersion}
      reload={reload}
      reloadLabel="Recarrega"
      running={running}
      {...props}
    />,
  );
  return { readVersion, reload, view };
}

const notice = () => screen.queryByRole("status");

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("FE-07 the deployed build is read from version.json and compared with the running one", () => {
  it("reads only the {version, commit} shape REL-02 writes", () => {
    expect(parseBuildVersion({ commit: NEW, version: "1.0.0" })).toEqual(deployedNew);
    expect(parseBuildVersion({ commit: null, version: "1.0.0" })).toEqual({
      commit: null,
      version: "1.0.0",
    });
    for (const other of [
      null,
      "1.0.0",
      [NEW],
      { commit: NEW },
      { commit: "0123456", version: "1.0.0" },
      { commit: 7, version: "1.0.0" },
      { version: "1.0.0" },
    ]) {
      expect(parseBuildVersion(other)).toBeUndefined();
    }
  });

  it("asks this origin's /version.json past every cache; a 404, a network error or HTML is no build", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(deployedNew), { status: 200 })),
    );
    expect(await readDeployedVersion(fetchImpl)).toEqual(deployedNew);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toEqual(new URL("/version.json", window.location.origin));
    expect(init).toMatchObject({ cache: "no-store", credentials: "same-origin" });

    fetchImpl.mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    expect(await readDeployedVersion(fetchImpl)).toBeUndefined();
    fetchImpl.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await readDeployedVersion(fetchImpl)).toBeUndefined();
    fetchImpl.mockResolvedValueOnce(new Response("<!doctype html>", { status: 200 }));
    expect(await readDeployedVersion(fetchImpl)).toBeUndefined();
  });

  it("another build is another commit; a missing file or a null commit on either side is none", () => {
    expect(isOtherBuild(running, deployedNew)).toBe(true);
    expect(isOtherBuild(running, { commit: OLD, version: "1.0.1" })).toBe(true);
    expect(isOtherBuild(running, running)).toBe(false);
    expect(isOtherBuild(running, undefined)).toBe(false);
    expect(isOtherBuild(running, { commit: null, version: "1.0.0" })).toBe(false);
    expect(isOtherBuild({ commit: null, version: "1.0.0" }, deployedNew)).toBe(false);
  });
});

describe("FE-07 a safe moment: no dialog, nothing in progress, no field being typed in, no write", () => {
  it("is safe on a quiet page, and with the focus on a button", () => {
    document.body.innerHTML = "<main><button>Reserva</button></main>";
    expect(isSafeMoment()).toBe(true);
    document.querySelector("button")?.focus();
    expect(isSafeMoment()).toBe(true);
  });

  it.each([
    ["a dialog", '<section role="dialog" aria-modal="true">Edita</section>'],
    ["a drawer", '<aside aria-modal="true">Mètode de pagament</aside>'],
    ["an alert dialog", '<div role="alertdialog">Segur?</div>'],
    ["a native dialog", "<dialog open>Confirma</dialog>"],
    ["a press in progress", '<button aria-busy="true">Desa</button>'],
  ])("is not with %s open", (_label, html) => {
    document.body.innerHTML = html;
    expect(isSafeMoment()).toBe(false);
  });

  it("is not while a field of a page's form has the focus, nor while a write is in flight", () => {
    document.body.innerHTML = '<form><input name="phone"><textarea></textarea></form>';
    document.querySelector("input")?.focus();
    expect(isSafeMoment()).toBe(false);
    document.querySelector("textarea")?.focus();
    expect(isSafeMoment()).toBe(false);
    document.querySelector("textarea")?.blur();
    expect(isSafeMoment()).toBe(true);
    expect(isSafeMoment(document, () => true)).toBe(false);
  });
});

describe("FE-07 «Hi ha una versió nova · Recarrega»", () => {
  it("appears when the host serves another build, and reloads only on the press", async () => {
    const prepareReload = vi.fn(() => Promise.resolve());
    const { readVersion, reload } = renderNotice({ prepareReload });
    expect(notice()).toBeNull();
    await flush();
    expect(readVersion).toHaveBeenCalledOnce();
    expect(notice()).toHaveTextContent("Hi ha una versió nova");
    // It never reloads by itself, nor takes the focus.
    await flush(VERSION_CHECK_INTERVAL_MS * 2);
    expect(reload).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
    // Once another build is known, the file is not read again.
    expect(readVersion).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Recarrega" }));
    await flush();
    expect(prepareReload).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it.each([
    ["the same build", running],
    ["no file (404, network error)", undefined],
    ["a deployed build without a commit", { commit: null, version: "1.0.0" }],
  ])("shows nothing for %s", async (_label, deployed) => {
    const readVersion = vi.fn(() => Promise.resolve(deployed));
    renderNotice({ readVersion });
    await flush(SAFE_MOMENT_POLL_MS * 3);
    expect(readVersion).toHaveBeenCalledOnce();
    expect(notice()).toBeNull();
  });

  it("a running build without a commit (dev server, unit tests) never reads the file", async () => {
    const { readVersion } = renderNotice({ running: { commit: null, version: "1.0.0" } });
    await flush(VERSION_CHECK_INTERVAL_MS * 2);
    expect(readVersion).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
  });

  it("reads again every ten minutes while visible, and on coming back to the tab at most once a minute", async () => {
    const readVersion = vi.fn<() => Promise<BuildVersion | undefined>>(() =>
      Promise.resolve(running),
    );
    renderNotice({ readVersion });
    await flush();
    expect(readVersion).toHaveBeenCalledTimes(1);
    await flush(VERSION_CHECK_INTERVAL_MS);
    expect(readVersion).toHaveBeenCalledTimes(2);
    // Hidden: the interval does not read; shown again after the gap: it reads.
    act(() => {
      setVisibility("hidden");
    });
    await flush(VERSION_CHECK_INTERVAL_MS);
    expect(readVersion).toHaveBeenCalledTimes(2);
    act(() => {
      setVisibility("visible");
    });
    await flush();
    expect(readVersion).toHaveBeenCalledTimes(3);
    // Back again within the minute: no read.
    await flush(VERSION_CHECK_MIN_GAP_MS - 1_000);
    act(() => {
      setVisibility("hidden");
      setVisibility("visible");
    });
    await flush();
    expect(readVersion).toHaveBeenCalledTimes(3);

    readVersion.mockResolvedValue(deployedNew);
    await flush(2_000);
    act(() => {
      setVisibility("hidden");
      setVisibility("visible");
    });
    await flush();
    expect(readVersion).toHaveBeenCalledTimes(4);
    expect(notice()).toHaveTextContent("Hi ha una versió nova");
  });

  it("waits while a dialog is open, and appears once it closes", async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<section id="drawer" role="dialog" aria-modal="true">Edita</section>',
    );
    renderNotice();
    await flush(SAFE_MOMENT_POLL_MS * 3);
    expect(notice()).toBeNull();
    document.getElementById("drawer")?.remove();
    await flush(SAFE_MOMENT_POLL_MS);
    expect(notice()).toHaveTextContent("Hi ha una versió nova");
  });

  it("waits while someone types in a field, and hides again when they go back to one", async () => {
    document.body.insertAdjacentHTML("beforeend", '<input aria-label="Telèfon" id="phone">');
    const field = document.getElementById("phone");
    act(() => {
      field?.focus();
    });
    renderNotice();
    await flush(SAFE_MOMENT_POLL_MS * 3);
    expect(notice()).toBeNull();
    act(() => {
      field?.blur();
    });
    await flush();
    expect(notice()).not.toBeNull();
    act(() => {
      field?.focus();
    });
    await flush();
    expect(notice()).toBeNull();
  });

  it("waits while a write is in flight", async () => {
    let writing = true;
    renderNotice({ busy: () => writing });
    await flush(SAFE_MOMENT_POLL_MS * 3);
    expect(notice()).toBeNull();
    writing = false;
    await flush(SAFE_MOMENT_POLL_MS);
    expect(notice()).not.toBeNull();
  });

  it("a new worker in control offers the reload too, without any read", async () => {
    const onOtherBuild = vi.fn();
    const readVersion = vi.fn(() => Promise.resolve(running));
    const { view } = renderNotice({
      onOtherBuild,
      readVersion,
      running: { commit: null, version: "1.0.0" },
    });
    await flush();
    expect(notice()).toBeNull();
    view.rerender(
      <NewVersionNotice
        message="Hi ha una versió nova"
        onOtherBuild={onOtherBuild}
        readVersion={readVersion}
        reload={vi.fn()}
        reloadLabel="Recarrega"
        running={{ commit: null, version: "1.0.0" }}
        workerUpdated
      />,
    );
    await flush();
    expect(notice()).toHaveTextContent("Hi ha una versió nova");
    expect(readVersion).not.toHaveBeenCalled();
    expect(onOtherBuild).not.toHaveBeenCalled();
  });

  it("onOtherBuild runs once, when the host is first seen serving another build", async () => {
    const onOtherBuild = vi.fn();
    renderNotice({ onOtherBuild });
    await flush(VERSION_CHECK_INTERVAL_MS * 2);
    expect(onOtherBuild).toHaveBeenCalledOnce();
  });

  it("a failed preparation still reloads", async () => {
    const { reload } = renderNotice({ prepareReload: () => Promise.reject(new Error("update")) });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Recarrega" }));
    await flush();
    expect(reload).toHaveBeenCalledOnce();
  });
});
