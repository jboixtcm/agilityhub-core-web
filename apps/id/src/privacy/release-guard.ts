import type { Plugin } from "vite";

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** A real calendar day written `YYYY-MM-DD` («2026-02-30» is not one). */
function isCalendarDay(value: string): boolean {
  const match = PLAIN_DATE.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * PRIV-01: why a production build cannot ship the privacy policy of `/privacy`, or `null` when it
 * can. The effective date is a placeholder (`null`) until the club opens the platform.
 */
export function privacyPolicyBuildProblem(effectiveDate: string | null): string | null {
  if (effectiveDate === null) {
    return (
      "PRIV-01: PRIVACY_POLICY_EFFECTIVE_DATE in apps/id/src/privacy/privacy-policy.ts is unset. " +
      "Set it to the day the privacy policy takes effect (YYYY-MM-DD) before a production build."
    );
  }
  if (!isCalendarDay(effectiveDate)) {
    return `PRIV-01: PRIVACY_POLICY_EFFECTIVE_DATE «${effectiveDate}» in apps/id/src/privacy/privacy-policy.ts is not a calendar day written YYYY-MM-DD.`;
  }
  return null;
}

/**
 * Stops `vite build` of `apps/id` while the privacy policy has no valid effective date. A mock
 * build (`VITE_MOCK=1`) ships MSW and is never a production build (FE-05), so it is let through.
 */
export function privacyPolicyBuildGuard(
  effectiveDate: string | null,
  { mock }: { mock: boolean },
): Plugin {
  return {
    apply: "build",
    buildStart() {
      if (mock) return;
      const problem = privacyPolicyBuildProblem(effectiveDate);
      if (problem !== null) this.error(problem);
    },
    name: "privacy-policy-effective-date",
  };
}
