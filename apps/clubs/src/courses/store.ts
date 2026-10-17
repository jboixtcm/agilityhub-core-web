import type { ApiClient } from "@agilityhub/api-client";
import { CoreApiStore } from "@agilityhub/api-client/core-api-store";
import { useBranding } from "@agilityhub/ui";
import { useMemo } from "react";

import { buildEventsSubscriber } from "./live-events";

/**
 * The `PlannerStore` of the members' app course screens: the club is the only venue (S16 §14.2),
 * and the build session's events come from the live transport `main.tsx` configured, or from the
 * store's own polling when there is none.
 */
export function useCourseStore(client: ApiClient): CoreApiStore {
  const branding = useBranding();
  const { city, name } = branding.club;
  // A club host always has a slug; only a product host's branding carries `null`.
  const slug = branding.club.slug ?? "";
  return useMemo(() => {
    const subscribeBuildEvents = buildEventsSubscriber();
    return new CoreApiStore({
      client,
      ...(subscribeBuildEvents === undefined ? {} : { subscribeBuildEvents }),
      venue: { city: city ?? null, id: slug, locale: branding.defaultLocale, name, slug },
    });
  }, [branding.defaultLocale, city, client, name, slug]);
}
