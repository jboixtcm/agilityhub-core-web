import brandingCanic from "./fixtures/branding-canic.json";
import brandingMinim from "./fixtures/branding-minim.json";
import meAdmin from "./fixtures/me-admin.json";
import meMember from "./fixtures/me-member.json";

const scenarios = {
  admin: {
    branding: brandingCanic,
    me: meAdmin,
  },
  member: {
    branding: brandingCanic,
    me: meMember,
  },
  minimal: {
    branding: brandingMinim,
    me: meMember,
  },
} as const;

export type MockScenario = keyof typeof scenarios;

let selectedScenario: MockScenario = "admin";

export function mockScenario(name: MockScenario): void {
  selectedScenario = name;
}

export function currentMockScenario() {
  return scenarios[selectedScenario];
}
