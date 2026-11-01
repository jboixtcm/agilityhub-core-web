import { type Me, type Role, useSession } from "@agilityhub/auth";

export type AppProfile = Extract<Role, "MEMBER" | "INSTRUCTOR">;

/** The club app is for lessons and training; administration has its own entry point. */
export function appProfiles(me: Me): readonly AppProfile[] {
  const membership = me.membership;
  return (membership?.profiles ?? []).filter(
    (role): role is AppProfile =>
      (role === "MEMBER" || role === "INSTRUCTOR") && membership?.roles.includes(role) === true,
  );
}

/** An old ADMIN preference never becomes a mobile profile or a cross-host navigation. */
export function activeAppProfile(me: Me): AppProfile | undefined {
  const profiles = appProfiles(me);
  const active = profiles.find((profile) => profile === me.membership?.activeProfile);
  if (active !== undefined) return active;
  const remembered = me.membership?.rememberProfile
    ? profiles.find((profile) => profile === me.membership?.defaultProfile)
    : undefined;
  return remembered ?? (profiles.length === 1 ? profiles[0] : undefined);
}

export function directAppProfile(me: Me): AppProfile | undefined {
  const profiles = appProfiles(me);
  if (profiles.length === 1) return profiles[0];
  return me.membership?.rememberProfile ? activeAppProfile(me) : undefined;
}

/** Scope navigation only. The authentication roles and the back-office session are untouched. */
export function useAppSession() {
  const session = useSession();
  return {
    ...session,
    activeProfile: session.me === null ? null : (activeAppProfile(session.me) ?? null),
  };
}
