import { useSyncExternalStore } from "react";

interface InstallPrompt extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  enabled: boolean;
  installed: boolean;
  prompt: InstallPrompt | null;
}

let state: InstallState = { enabled: false, installed: false, prompt: null };
const listeners = new Set<() => void>();

function publish(next: InstallState) {
  state = next;
  listeners.forEach((listener) => {
    listener();
  });
}

/** The same member bundle also serves the product host. Installation is an exact-origin opt-in. */
export function isMemberPwaOrigin(origin: string, memberUrl: string | undefined): boolean {
  if (!memberUrl) return false;
  try {
    const url = new URL(memberUrl);
    return url.protocol === "https:" && url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function initializeMemberPwa(memberUrl: string | undefined, name: string | undefined) {
  if (!name || !isMemberPwaOrigin(window.location.origin, memberUrl)) return () => undefined;

  const displayMode = window.matchMedia("(display-mode: standalone)");
  const installed = () => displayMode.matches || Reflect.get(navigator, "standalone") === true;
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = "/pwa/manifest.webmanifest";
  const appleIcon = document.createElement("link");
  appleIcon.rel = "apple-touch-icon";
  appleIcon.href = "/pwa/apple-touch-icon.png";
  appleIcon.setAttribute("sizes", "180x180");
  const appleName = document.createElement("meta");
  appleName.name = "apple-mobile-web-app-title";
  appleName.content = name;
  const appleCapable = document.createElement("meta");
  appleCapable.name = "apple-mobile-web-app-capable";
  appleCapable.content = "yes";
  const metadata = [manifest, appleIcon, appleName, appleCapable];

  const onPrompt = (event: Event) => {
    event.preventDefault();
    if (!state.installed) publish({ ...state, prompt: event as InstallPrompt });
  };
  const onInstalled = () => {
    publish({ enabled: true, installed: true, prompt: null });
  };
  const onDisplayMode = () => {
    publish({ ...state, installed: installed(), prompt: null });
  };
  // Listen before attaching the manifest: the browser may offer installation during bootstrap.
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  displayMode.addEventListener("change", onDisplayMode);
  publish({ enabled: true, installed: installed(), prompt: null });
  document.head.append(...metadata);

  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
    displayMode.removeEventListener("change", onDisplayMode);
    metadata.forEach((element) => {
      element.remove();
    });
    publish({ enabled: false, installed: false, prompt: null });
  };
}

export async function promptMemberPwa(): Promise<boolean> {
  const prompt = state.prompt;
  if (prompt === null) return false;
  publish({ ...state, prompt: null });
  try {
    // A deferred event is single-use; acceptance is confirmed separately by appinstalled.
    await prompt.prompt();
    return true;
  } catch {
    return false;
  }
}

export function useMemberPwa() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
