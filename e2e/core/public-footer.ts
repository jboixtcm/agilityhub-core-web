import { type Locator, type Page } from "@playwright/test";

import { expect } from "./oauth-token-log";

/** The part of `GET /branding` the public footer reads (S02 R-02-02). */
export interface BrandingClub {
  city: string | null;
  /** Always sent since api E3-T16 (`null` without a street or postal code); absent on an older core. */
  legalAddress?: { city: string | null; postalCode: string; street: string } | null;
  legalName: string | null;
  name: string;
  taxId: string | null;
}

/** The club of the core's `/branding`, read from the page's own origin (the dev proxy sets the host). */
export async function brandingClub(page: Page): Promise<BrandingClub> {
  return page.evaluate(async () => {
    const response = await fetch("/api/v1/branding");
    return ((await response.json()) as { club: BrandingClub }).club;
  });
}

/**
 * E3-W12 step 5 (S02 R-02-02, Jordi 25-09): «{legalName} · {taxId} · {city}» («{name} · {city}»
 * without a tax id) and, below it, the registered office «{street} · {postalCode} {city}».
 */
export function publicFooterLines(club: BrandingClub): string[] {
  const city = club.city?.trim() ?? "";
  const taxId = club.taxId?.trim() ?? "";
  const legalName = club.legalName?.trim() ?? "";
  const entity = taxId === "" || legalName === "" ? club.name : legalName;
  const identity = [entity, taxId, city].filter((part) => part !== "").join(" · ");
  const office = club.legalAddress;
  if (office == null) return [identity];
  const officeCity = office.city?.trim() ?? "";
  return [identity, `${office.street} · ${office.postalCode}${officeCity === "" ? "" : ` ${officeCity}`}`];
}

export async function expectPublicFooter(footer: Locator, club: BrandingClub): Promise<void> {
  // Soft: a core older than api E3-T16 fails here, and the rest of the flow still runs.
  expect.soft(club, "/branding club.legalAddress (api E3-T16)").toHaveProperty("legalAddress");
  await expect(footer.locator(".public-footer__line")).toHaveText(publicFooterLines(club));
}
