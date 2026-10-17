import { isApiError } from "./api-error";
import type { ApiClient } from "./client";
import type { components } from "./generated/schema";

type MeRingSetup = components["schemas"]["MeRingSetup"];
type MeRingSetupSummary = components["schemas"]["MeRingSetupSummary"];
type RingSetup = components["schemas"]["RingSetup"];

/**
 * A ring's setup (`RingSetup`, the staff projection) as `GET /me/ring-setups` summarises it. The
 * history carries no `levelLabel` (only `levelIds`), so the summary has none (never the raw
 * `agilityhubLevel` code, AGENTS rule 1); the setup's own photo is the thumbnail.
 */
export function ringSetupSummary(setup: RingSetup): MeRingSetupSummary {
  return {
    builtAt: setup.builtAt,
    expectedUntil: setup.expectedUntil ?? null,
    hasViewer:
      setup.kind !== "EMPTY" &&
      (setup.courseId != null || setup.placementId != null || setup.imageUrl != null),
    id: setup.id,
    kind: setup.kind,
    levelLabel: null,
    thumbnailUrl: setup.imageUrl ?? null,
  };
}

/** `GET /rings/{id}/setups` (INSTRUCTOR · ADMIN, newest first): the ring's ACTIVE setup, if any. */
export async function readRingActiveSetup(
  client: ApiClient,
  ringId: string,
): Promise<RingSetup | null> {
  const page = (
    await client.GET("/rings/{id}/setups", {
      params: { path: { id: ringId }, query: { page: 0, size: 20 } },
    })
  ).data;
  if (page === undefined) throw new TypeError("The ring setups response did not contain data");
  return page.items.find((item) => item.status === "ACTIVE") ?? null;
}

/**
 * The rings' ACTIVE setups (S16 R-16-09): `GET /me/ring-setups` (MEMBER · INSTRUCTOR; `ringIds`
 * omitted = every active ring). An ADMIN session without the INSTRUCTOR role is refused there
 * (`403 FORBIDDEN`) and reads each ring's history instead (`GET /rings/{id}/setups`): the rings
 * asked for, or `historyRingIds` when the query names none.
 */
export async function readRingSetups(
  client: ApiClient,
  {
    historyRingIds,
    ringIds,
  }: { historyRingIds?: readonly string[]; ringIds?: readonly string[] } = {},
): Promise<MeRingSetup[]> {
  try {
    const result = await client.GET(
      "/me/ring-setups",
      ringIds === undefined ? {} : { params: { query: { ringIds: [...ringIds] } } },
    );
    if (result.data === undefined) {
      throw new TypeError("The ring setups response did not contain data");
    }
    return result.data;
  } catch (error) {
    if (!isApiError(error, "FORBIDDEN")) throw error;
    const ids = ringIds ?? historyRingIds ?? [];
    return Promise.all(
      ids.map(async (ringId) => {
        const setup = await readRingActiveSetup(client, ringId);
        return { ringId, setup: setup === null ? null : ringSetupSummary(setup) };
      }),
    );
  }
}
