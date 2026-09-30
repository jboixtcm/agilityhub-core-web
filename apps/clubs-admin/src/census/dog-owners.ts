import type { ApiClient } from "@agilityhub/api-client";

/** How many dog ids travel in one `id:in:` filter, so a query string stays short. */
export const OWNER_BATCH_SIZE = 100;

export interface DogOwners {
  /** The owners of the resolved dogs, each once, in the order the dogs were selected. */
  memberIds: string[];
  /** Selected dogs the api did not return: the recipients would be incomplete. */
  missing: string[];
}

/**
 * «Enviar comunicat» from D15 (S11 R-11-13): the selection is dogs, the announcement goes to their
 * owners. A selection survives paging and can exceed one page of the api (1,000 rows), so the
 * owners are read by batches of `OWNER_BATCH_SIZE` ids, and every selected dog must come back
 * (E7-W01 round 2 #6).
 */
export async function resolveDogOwners(
  client: ApiClient,
  dogIds: readonly string[],
): Promise<DogOwners> {
  const ownerOf = new Map<string, string | undefined>();
  for (let start = 0; start < dogIds.length; start += OWNER_BATCH_SIZE) {
    const batch = dogIds.slice(start, start + OWNER_BATCH_SIZE);
    const { data } = await client.GET("/dogs", {
      params: {
        query: { fields: "id,owner", filter: [`id:in:${batch.join(",")}`], size: 1000 },
      },
    });
    for (const dog of data?.items ?? []) ownerOf.set(dog.id, dog.owner?.id);
  }
  const memberIds = [
    ...new Set(
      dogIds.flatMap((id) => {
        const owner = ownerOf.get(id);
        return owner === undefined ? [] : [owner];
      }),
    ),
  ];
  return { memberIds, missing: dogIds.filter((id) => !ownerOf.has(id)) };
}
