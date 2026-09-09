import type { components } from "../../generated/schema";

export type OnboardingState = components["schemas"]["OnboardingState"];

export const importedAccountOnboarding: OnboardingState = {
  fields: [
    { key: "name", required: true, value: "Biel Roca" },
    { key: "locale", required: true, value: "ca" },
    { key: "phone", required: false, value: null },
  ],
  pending: true,
  postponeRemaining: 0,
  requiredConsent: {
    policy: "PLATFORM",
    url: "https://club.example.test/legal/privacy",
    version: "2026-09-01",
  },
};

export const policyReconsentOnboarding: OnboardingState = {
  fields: [],
  pending: true,
  postponeRemaining: 3,
  requiredConsent: {
    policy: "PLATFORM",
    url: "https://club.example.test/legal/privacy",
    version: "2026-09-01",
  },
};
