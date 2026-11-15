import { http, HttpResponse } from "msw";

import type { components } from "../generated/schema";

import { currentMockScenario } from "./scenarios";

type Entry = components["schemas"]["CompetitionEntry"];
type Preview = components["schemas"]["CompetitionPreview"];
type Receipt = components["schemas"]["CompetitionReceipt"];
type Statistics = components["schemas"]["CompetitionStatistics"];
const FCAG_URL = "https://app.fcagility.cat/federated/classification/division/128";
const FLOW_URL =
  "https://www.flowagility.com/zone/prints/run/12345678-1234-1234-1234-123456789abc/results";
const importedAt = "2026-07-20T12:00:00Z";
const standing: Entry = {
  key: "fcag-1",
  license: "0123",
  dogName: "Duna",
  handlerName: "Laia Exemple",
  clubName: "Club de prova",
  season: "2025-2026",
  division: "Divisió d’honor",
  category: "Petita",
  position: 2,
  points: 140,
};
const run: Entry = {
  key: "run-1",
  license: "0123",
  dogName: "Duna",
  season: "2026",
  trialId: "trial-1",
  runId: "run-1",
  date: "2026-07-19",
  trial: "Prova d’estiu",
  grade: "G3",
  category: "S",
  discipline: "AGILITY",
  position: 2,
  faults: 0,
  refusals: 0,
  totalPenalty: 0,
  timeSeconds: 35.21,
  speedMps: 5.4,
  qualification: "EXC_0",
  point: "PA",
};
export function competitionFixture(dogId: string, year = 2026, season = "2025-2026"): Statistics {
  const populated = dogId === "dog-duna";
  return {
    dogId,
    year,
    season,
    standings: populated
      ? [{ source: "FCAG", sourceUrl: FCAG_URL, importedAt, result: { ...standing, season } }]
      : [],
    results:
      populated && year === 2026
        ? [
            { source: "FLOW_AGILITY", sourceUrl: FLOW_URL, importedAt, result: run },
            {
              source: "FLOW_AGILITY",
              sourceUrl: FLOW_URL,
              importedAt,
              result: {
                ...run,
                key: "run-2",
                runId: "run-2",
                discipline: "JUMPING",
                point: "NONE",
              },
            },
          ]
        : [],
    scoredTrials: populated && year === 2026 ? 1 : 0,
    summaries: (["AGILITY", "JUMPING"] as const).map((discipline) => ({
      discipline,
      runs: populated && year === 2026 ? 1 : 0,
      clearRuns: populated && year === 2026 ? 1 : 0,
      p: 0,
      pa: populated && year === 2026 && discipline === "AGILITY" ? 1 : 0,
      pv: 0,
      averageSpeedMps: populated && year === 2026 ? 5.4 : null,
    })),
    lastImportedAt: populated ? importedAt : null,
  };
}
export function competitionPreviewFixture(
  source: Preview["source"] = "FCAG",
  sourceUrl = FCAG_URL,
): Preview {
  return {
    id: "preview-competition-1",
    source,
    sourceUrl,
    season: source === "FCAG" ? "2025-2026" : "2026",
    expiresAt: "2099-01-01T00:00:00Z",
    dogs: [{ id: "dog-duna", name: "Duna", license: "0123" }],
    rows: [
      {
        entry: source === "FCAG" ? standing : run,
        suggestedDogId: "dog-duna",
        match: "EXACT_LICENSE",
      },
      {
        entry: {
          ...(source === "FCAG" ? standing : run),
          key: "unmatched",
          dogName: "Núvol",
          license: "9999",
        },
        suggestedDogId: null,
        match: "UNMATCHED",
      },
    ],
  };
}
let previews = new Map<string, Preview>();
let receipts: Receipt[] = [];
export function resetCompetitionMockState() {
  previews = new Map();
  receipts = [];
}
function denied(admin = false) {
  const scenario = currentMockScenario();
  if (!scenario.branding.modules.includes("STATS"))
    return HttpResponse.json(
      { code: "MODULE_DISABLED", message: "Disabled", traceId: "mock" },
      { status: 404 },
    );
  if (admin && !scenario.me.membership?.roles.includes("ADMIN"))
    return HttpResponse.json(
      { code: "FORBIDDEN", message: "Forbidden", traceId: "mock" },
      { status: 403 },
    );
  return undefined;
}
export const competitionHandlers = [
  http.get("*/api/v1/me/dogs/:id/competition-statistics", ({ params, request }) => {
    const refusal = denied();
    if (refusal) return refusal;
    const url = new URL(request.url);
    return HttpResponse.json(
      competitionFixture(
        String(params.id),
        Number(url.searchParams.get("year") ?? 2026),
        url.searchParams.get("season") ?? "2025-2026",
      ),
    );
  }),
  http.get("*/api/v1/competition-imports", () => denied(true) ?? HttpResponse.json(receipts)),
  http.post("*/api/v1/competition-imports/preview", async ({ request }) => {
    const refusal = denied(true);
    if (refusal) return refusal;
    const body = (await request.json()) as components["schemas"]["CompetitionImportRequest"];
    const preview = competitionPreviewFixture(body.source, body.sourceUrl);
    previews.set(preview.id, preview);
    return HttpResponse.json(preview);
  }),
  http.post("*/api/v1/competition-imports/:id/confirm", async ({ params, request }) => {
    const refusal = denied(true);
    if (refusal) return refusal;
    const preview = previews.get(String(params.id));
    if (!preview)
      return HttpResponse.json(
        { code: "NOT_FOUND", message: "Missing preview", traceId: "mock" },
        { status: 404 },
      );
    const body = (await request.json()) as components["schemas"]["CompetitionConfirmation"];
    const receipt: Receipt = {
      id: "competition-import-1",
      source: preview.source,
      sourceUrl: preview.sourceUrl,
      season: preview.season,
      importedAt,
      importedRows: Object.keys(body.assignments).length,
      revision: 1,
    };
    receipts = [receipt];
    return HttpResponse.json(receipt);
  }),
];
