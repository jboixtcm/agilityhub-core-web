import { useEffect, useRef, useState } from "react";

import { reloadDocument } from "./chunk-reload";
import { Button } from "./components";

/**
 * FE-07: «new version available, reload». Each app knows the build it runs (its `version.json` of
 * REL-02, compiled in as `__AGILITYHUB_BUILD__`) and reads the one its host serves now. When they
 * differ it offers a reload, at a safe moment, and only the person's press reloads: never a reload
 * in the middle of a form.
 */

/** A bundle's identity, as its `version.json` says it: `{version, commit}`. */
export interface BuildVersion {
  commit: string | null;
  version: string;
}

/** Each app host serves its own bundle's file there, revalidated on every load (CFG-05). */
export const VERSION_FILE_PATH = "/version.json";
/** While the tab stays open and visible, the file is read again this often. */
export const VERSION_CHECK_INTERVAL_MS = 10 * 60_000;
/** Coming back to the tab reads it again, but never twice within this gap. */
export const VERSION_CHECK_MIN_GAP_MS = 60_000;
/** Once a new build is known, how often the moment is looked at again. */
export const SAFE_MOMENT_POLL_MS = 2_000;

const COMMIT = /^[0-9a-f]{40}$/u;

/** A `version.json` body, or `undefined` for any other shape. */
export function parseBuildVersion(value: unknown): BuildVersion | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const { commit, version } = value as Record<string, unknown>;
  if (typeof version !== "string" || version === "") return undefined;
  if (commit === null) return { commit: null, version };
  return typeof commit === "string" && COMMIT.test(commit) ? { commit, version } : undefined;
}

/**
 * The bundle the host serves now: its own origin's `version.json`, never from a cache (the member
 * app's worker does not precache it). A 404, a network error or another shape: `undefined`.
 */
export async function readDeployedVersion(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<BuildVersion | undefined> {
  try {
    const response = await fetchImpl(new URL(VERSION_FILE_PATH, window.location.origin), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;
    return parseBuildVersion(await response.json());
  } catch {
    return undefined;
  }
}

/**
 * Another build is deployed: both commits are known and differ (or the version does). A build
 * without a commit (outside CI) on either side, or no file, never counts as one.
 */
export function isOtherBuild(running: BuildVersion, deployed: BuildVersion | undefined): boolean {
  if (deployed === undefined || running.commit === null || deployed.commit === null) return false;
  return deployed.commit !== running.commit || deployed.version !== running.version;
}

const OPEN_FORM = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';
const IN_PROGRESS = '[aria-busy="true"]';
const FIELD = [
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"])',
  "select",
  "textarea",
  '[contenteditable]:not([contenteditable="false"])',
].join(", ");

/**
 * A moment a reload interrupts nothing: no write in flight (`busy`), no dialog or drawer open (a
 * confirmation, an editor or a form in a drawer), nothing shown in progress, and no field with the
 * focus (someone typing in a page's form).
 */
export function isSafeMoment(doc: Document = document, busy: () => boolean = () => false): boolean {
  if (busy()) return false;
  if (doc.querySelector(OPEN_FORM) !== null || doc.querySelector(IN_PROGRESS) !== null) {
    return false;
  }
  const active = doc.activeElement;
  return !(active instanceof HTMLElement && active.matches(FIELD));
}

export interface NewVersionOptions {
  /** This bundle's own `{version, commit}` (the app's `__AGILITYHUB_BUILD__`). */
  running: BuildVersion;
  /** The writes in flight (`apiWritesInFlight() > 0`): the offer waits for none. */
  busy?: () => boolean;
  /** Called once, when the host is first seen serving another build. */
  onOtherBuild?: () => void;
  /** Another sign of a new build in control (the member app's worker took over), not a reload. */
  workerUpdated?: boolean;
  /** Reads the deployed `version.json` (tests). */
  readVersion?: () => Promise<BuildVersion | undefined>;
}

/**
 * Whether to offer the reload now: another build is deployed (or the worker says one took over)
 * and the moment is safe. The file is read at start-up, when the tab is shown again (at most once a
 * minute) and every ten minutes while visible; once another build is seen it is not read again,
 * and a running build without a commit never reads it.
 */
export function useNewVersionOffer({
  busy,
  onOtherBuild,
  readVersion = readDeployedVersion,
  running,
  workerUpdated = false,
}: NewVersionOptions): boolean {
  const [deployedOther, setDeployedOther] = useState(false);
  const [safe, setSafe] = useState(false);
  // The latest callbacks for the timers and listeners below, without restarting them.
  const latest = useRef({ busy, onOtherBuild, readVersion, running });
  useEffect(() => {
    latest.current = { busy, onOtherBuild, readVersion, running };
  });

  const comparable = running.commit !== null;
  useEffect(() => {
    // A build without a commit (the dev server, a build outside CI) has nothing to compare.
    if (deployedOther || !comparable) return;
    let active = true;
    let reading = false;
    let lastRead = Number.NEGATIVE_INFINITY;
    const check = async () => {
      if (reading || document.visibilityState === "hidden") return;
      reading = true;
      lastRead = Date.now();
      try {
        const deployed = await latest.current.readVersion();
        if (active && isOtherBuild(latest.current.running, deployed)) {
          active = false;
          latest.current.onOtherBuild?.();
          setDeployedOther(true);
        }
      } finally {
        reading = false;
      }
    };
    const onVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRead >= VERSION_CHECK_MIN_GAP_MS
      ) {
        void check();
      }
    };
    void check();
    const interval = window.setInterval(() => {
      void check();
    }, VERSION_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [comparable, deployedOther]);

  const available = deployedOther || workerUpdated;
  useEffect(() => {
    if (!available) return;
    const look = () => {
      setSafe(isSafeMoment(document, latest.current.busy));
    };
    look();
    const poll = window.setInterval(look, SAFE_MOMENT_POLL_MS);
    document.addEventListener("focusin", look);
    document.addEventListener("focusout", look);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("focusin", look);
      document.removeEventListener("focusout", look);
    };
  }, [available]);

  return available && safe;
}

export interface NewVersionNoticeProps extends NewVersionOptions {
  /** «Hi ha una versió nova». */
  message: string;
  /** «Recarrega». */
  reloadLabel: string;
  /** Before the reload: the member app lets its new worker take over first. */
  prepareReload?: () => Promise<void>;
  reload?: () => void;
}

/**
 * The offer itself: a polite status with its button, shown while `useNewVersionOffer` says so. It
 * never takes the focus and never reloads on its own; the press reloads the document.
 */
export function NewVersionNotice({
  message,
  prepareReload,
  reload = reloadDocument,
  reloadLabel,
  ...options
}: NewVersionNoticeProps) {
  const offered = useNewVersionOffer(options);
  const [reloading, setReloading] = useState(false);
  if (!offered && !reloading) return null;
  return (
    <div className="ah-toast ah-tone--info ah-new-version" role="status">
      <span>{message}</span>
      <Button
        disabled={reloading}
        onClick={() => {
          setReloading(true);
          void (prepareReload?.() ?? Promise.resolve())
            .catch(() => undefined)
            .then(() => {
              reload();
            });
        }}
        variant="secondary"
      >
        {reloadLabel}
      </Button>
    </div>
  );
}
