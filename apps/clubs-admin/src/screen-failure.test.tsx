import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { server } from "@agilityhub/api-client/mocks/server";
import { AuthClient, MemoryRefreshTokenStore, SessionProvider } from "@agilityhub/auth";
import { createI18n } from "@agilityhub/i18n";
import { type Branding, BrandingProvider, reloadDocument } from "@agilityhub/ui";
import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { ADMIN_AUTH_OPTIONS } from "./auth-options";

// D16's team screen fails while drawing (a defect of the screen, not of its chunk).
vi.mock("./catalogs/TeamPage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./catalogs/TeamPage")>()),
  TeamPage: () => {
    throw new TypeError("Cannot read properties of undefined (reading 'members')");
  },
}));
// The courses chunk: a course that cannot be drawn on `/recorreguts/x`; the route's own
// navigation (the in-chunk links) is kept so that the test follows it.
const courses = vi.hoisted(() => ({ navigate: undefined as ((path: string) => void) | undefined }));
vi.mock("./courses/CoursesRoute", async (importOriginal) => {
  const original = await importOriginal<typeof import("./courses/CoursesRoute")>();
  const Route = original.default;
  return {
    ...original,
    default: (props: Parameters<typeof Route>[0]) => {
      courses.navigate = props.onNavigate;
      if (props.pathname === "/recorreguts/x") throw new Error("A course that cannot be drawn");
      return <Route {...props} />;
    },
  };
});
vi.mock("@agilityhub/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agilityhub/ui")>()),
  reloadDocument: vi.fn(),
}));

const branding = brandingCanicFixture as Branding;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
  vi.mocked(reloadDocument).mockClear();
  vi.restoreAllMocks();
});
afterAll(() => {
  server.close();
});

async function renderAt(path: string) {
  // React reports the thrown render errors; they are this test's subject.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const client = new AuthClient({
    ...ADMIN_AUTH_OPTIONS,
    apiBaseUrl: `${window.location.origin}/api/v1`,
    identityBaseUrl: window.location.origin,
    mockMode: true,
    mockRefreshTokenStore: new MemoryRefreshTokenStore(),
  });
  await client.login("aina.serra@example.test", "secret-password");
  window.history.pushState(null, "", path);
  const i18n = await createI18n({
    branding,
    browserLanguages: ["ca"],
    initialNamespaces: ["common", "errors", "shell"],
    storage: undefined,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider branding={branding}>
        <SessionProvider client={client}>
          <App authClient={client} />
        </SessionProvider>
      </BrandingProvider>
    </I18nextProvider>,
  );
}

describe("E11-W05 step 5 (a): a back-office screen that fails to draw never blanks the app", () => {
  it("/equip throws while drawing: an ErrorState inside the shell says so (no reload), and the next address draws its screen", async () => {
    await renderAt("/equip");

    const alert = await screen.findByRole("alert", {}, { timeout: 5_000 });
    expect(alert).toHaveTextContent("No disponible");
    expect(alert).toHaveTextContent("No s'ha pogut mostrar aquesta pantalla.");
    expect(screen.getByRole("button", { name: "Torna-ho a provar" })).toBeVisible();
    // The shell is still there, and a screen error is not a missing chunk: no reload.
    expect(screen.getByRole("link", { name: "Tauler" })).toBeVisible();
    expect(reloadDocument).not.toHaveBeenCalled();

    // The browser's Back/Forward to another address of the back office draws that screen.
    act(() => {
      window.history.pushState(null, "", "/recorreguts");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "Biblioteca de recorreguts" },
        { timeout: 5_000 },
      ),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("E11-W05 step 5 (E11-W02 round 3 minor, E154): the courses chunk's failure belongs to its address", () => {
  it("a course that throws on /recorreguts/x, then navigate(«/recorreguts») from inside the chunk: the list renders", async () => {
    await renderAt("/recorreguts/x");

    expect(await screen.findByRole("alert", {}, { timeout: 5_000 })).toHaveTextContent(
      "No disponible",
    );
    expect(courses.navigate).toBeDefined();

    act(() => {
      courses.navigate?.("/recorreguts");
    });
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "Biblioteca de recorreguts" },
        { timeout: 5_000 },
      ),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
