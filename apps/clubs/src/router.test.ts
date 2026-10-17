import { afterEach, describe, expect, it, vi } from "vitest";

import { inAppDestination, navigate } from "./router";

function anchor(href: string, attributes: Record<string, string> = {}) {
  const element = document.createElement("a");
  element.href = href;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
}

function click(init: MouseEventInit = {}) {
  return new MouseEvent("click", { bubbles: true, button: 0, cancelable: true, ...init });
}

function destinationOf(element: Element, init: MouseEventInit = {}) {
  const event = click(init);
  Object.defineProperty(event, "target", { value: element });
  return inAppDestination(event);
}

afterEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("A38 (E11-W02 step 1): which clicks the members' app router takes", () => {
  it("takes a plain click on a link of this app, also from inside the link", () => {
    const link = anchor("/reservar?dog=duna#classes");
    const inner = link.appendChild(document.createElement("strong"));
    expect(destinationOf(link)).toBe("/reservar?dog=duna#classes");
    expect(destinationOf(inner)).toBe("/reservar?dog=duna#classes");
  });

  it("leaves to the browser what a reload or a new tab must do", () => {
    expect(destinationOf(anchor("/reservar"), { ctrlKey: true })).toBeNull();
    expect(destinationOf(anchor("/reservar"), { metaKey: true })).toBeNull();
    expect(destinationOf(anchor("/reservar"), { shiftKey: true })).toBeNull();
    expect(destinationOf(anchor("/reservar"), { altKey: true })).toBeNull();
    expect(destinationOf(anchor("/reservar"), { button: 1 })).toBeNull();
    expect(destinationOf(anchor("/reservar", { target: "_blank" }))).toBeNull();
    expect(destinationOf(anchor("/rebuts/1.pdf", { download: "" }))).toBeNull();
    expect(destinationOf(anchor("/reservar", { "data-reload": "" }))).toBeNull();
    // Another origin (the back office, a checkout), a mail or phone link, the proxy routes and
    // files are not screens of this app.
    expect(destinationOf(anchor("https://admin.example.test/tauler"))).toBeNull();
    expect(destinationOf(anchor("mailto:club@example.test"))).toBeNull();
    expect(destinationOf(anchor("tel:+34600000000"))).toBeNull();
    for (const path of ["/api/v1/me", "/oauth2/authorize", "/connect/logout", "/.well-known/x"]) {
      expect(destinationOf(anchor(path))).toBeNull();
    }
    expect(destinationOf(anchor("/legal/politica.pdf"))).toBeNull();
    // A jump inside the same page stays the browser's.
    window.history.replaceState(null, "", "/info");
    expect(destinationOf(anchor("/info#horari"))).toBeNull();
  });

  it("leaves a click that a component already handled", () => {
    const link = anchor("/reservar");
    const event = click();
    Object.defineProperty(event, "target", { value: link });
    event.preventDefault();
    expect(inAppDestination(event)).toBeNull();
  });

  it("navigate() pushes or replaces the entry, tells the app and keeps the state", () => {
    const heard = vi.fn();
    window.addEventListener("popstate", heard);
    navigate("/inici");
    expect(window.location.pathname).toBe("/inici");
    navigate("/perfil", { replace: true, state: { notice: { code: "X", tone: "danger" } } });
    expect(window.location.pathname).toBe("/perfil");
    expect(window.history.state).toEqual({ notice: { code: "X", tone: "danger" } });
    expect(heard).toHaveBeenCalledTimes(2);
    window.removeEventListener("popstate", heard);
  });

  it("navigate() loads another origin for real", () => {
    const assign = vi.fn();
    const replace = vi.fn();
    const { hash, href, origin, pathname, search } = window.location;
    vi.spyOn(window, "location", "get").mockReturnValue({
      assign,
      hash,
      href,
      origin,
      pathname,
      replace,
      search,
    } as unknown as Location);
    navigate("https://checkout.example.test/session");
    navigate("https://admin.example.test/tauler", { replace: true });
    expect(assign).toHaveBeenCalledWith("https://checkout.example.test/session");
    expect(replace).toHaveBeenCalledWith("https://admin.example.test/tauler");
  });
});
