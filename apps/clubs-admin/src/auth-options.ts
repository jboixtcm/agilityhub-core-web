import type { AuthClientOptions } from "@agilityhub/auth";

/** The back office's own `AuthClient` options (shared by `main.tsx` and the tests). */
export const ADMIN_AUTH_OPTIONS = {
  clientId: "clubs-admin",
  // E4-W18 step 2: the back office's handoff opens the caller's own account (03b), never an
  // impersonation («Entra com l'abonat» opens the member app).
  handoffSessions: "account",
} as const satisfies Pick<AuthClientOptions, "clientId" | "handoffSessions">;
