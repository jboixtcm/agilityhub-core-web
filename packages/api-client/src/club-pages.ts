import type { ApiClient } from "./client";
import type { components } from "./generated/schema";

export interface PublicClubPageRequest {
  apiKey: string;
  clubSlug: string;
  key: string;
  locale: string;
}

export async function getPublicClubPage(
  client: ApiClient,
  request: PublicClubPageRequest,
): Promise<components["schemas"]["PublicClubPage"]> {
  const result = await client.GET("/public/{clubSlug}/pages/{key}", {
    params: {
      header: {
        "Accept-Language": request.locale,
        "X-Api-Key": request.apiKey,
      },
      path: { clubSlug: request.clubSlug, key: request.key },
    },
  });
  if (result.data === undefined) {
    throw new TypeError("The public club page response did not contain data", {
      cause: result.error,
    });
  }
  return result.data;
}
