import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApiClient } from "./client";
import { attachmentName } from "./followup";
import { mockScenario, resetFollowupMockState } from "./mocks/handlers";
import { server } from "./mocks/server";
import { loadFileLimits, uploadSigned } from "./uploads";

const base = "https://core.example.test/api/v1";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  resetFollowupMockState();
  mockScenario("admin");
});
afterAll(() => {
  server.close();
});

describe("E6-W02 step 3 · one uploadSigned helper (CONVENCIONS_API §5)", () => {
  it("asks for the signed url with the bearer, then PUTs the file with the returned headers unchanged and no bearer", async () => {
    const seen: { authorization: string | null; headers: Record<string, string>; url: string }[] =
      [];
    server.use(
      http.post(`${base}/attachments/upload-url`, ({ request }) => {
        seen.push({
          authorization: request.headers.get("Authorization"),
          headers: {},
          url: request.url,
        });
        return HttpResponse.json(
          {
            expiresAt: "2026-08-03T07:00:00Z",
            fileKey: "task/mock/key-1",
            headers: { "Content-Type": "video/mp4", "If-None-Match": "*", "x-amz-meta-club": "c1" },
            uploadUrl: "https://storage.example.test/bucket/key-1?X-Amz-Signature=s",
          },
          { status: 201 },
        );
      }),
      http.put("https://storage.example.test/bucket/key-1", ({ request }) => {
        seen.push({
          authorization: request.headers.get("Authorization"),
          headers: {
            "content-type": request.headers.get("Content-Type") ?? "",
            "if-none-match": request.headers.get("If-None-Match") ?? "",
            "x-amz-meta-club": request.headers.get("x-amz-meta-club") ?? "",
          },
          url: request.url,
        });
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const client = createApiClient({ baseUrl: base, getAccessToken: () => "secret-token" });
    const file = new File(["video"], "vídeo_balancí.mp4", { type: "video/mp4" });

    await expect(uploadSigned(client, file, "TASK")).resolves.toBe("task/mock/key-1");
    expect(seen[0]?.authorization).toBe("Bearer secret-token");
    expect(seen[1]).toEqual({
      authorization: null,
      headers: { "content-type": "video/mp4", "if-none-match": "*", "x-amz-meta-club": "c1" },
      url: "https://storage.example.test/bucket/key-1?X-Amz-Signature=s",
    });
  });

  it("a file without a type is declared as application/octet-stream; a refused PUT throws", async () => {
    let declared = "";
    server.use(
      http.post(`${base}/attachments/upload-url`, async ({ request }) => {
        declared = ((await request.json()) as { mimeType: string }).mimeType;
        return HttpResponse.json(
          {
            expiresAt: "2026-08-03T07:00:00Z",
            fileKey: "k",
            headers: {},
            uploadUrl: "https://storage.example.test/bucket/k",
          },
          { status: 201 },
        );
      }),
      http.put(
        "https://storage.example.test/bucket/k",
        () => new HttpResponse(null, { status: 403 }),
      ),
    );
    const client = createApiClient({ baseUrl: base });

    await expect(uploadSigned(client, new File(["x"], "nota"), "DOG_DOCUMENT")).rejects.toThrow(
      "The signed file upload failed",
    );
    expect(declared).toBe("application/octet-stream");
  });

  it("the club's file limits come from its parameters; a session that cannot read them gets none (the api refuses instead)", async () => {
    mockScenario("admin");
    await expect(loadFileLimits(createApiClient({ baseUrl: base }))).resolves.toEqual({
      allowedTypes: ["image/*", "video/mp4", "video/quicktime", "application/pdf"],
      maxPerEntity: 10,
      maxSizeMb: 25,
    });
    mockScenario("instructor");
    await expect(loadFileLimits(createApiClient({ baseUrl: base }))).resolves.toEqual({});
  });

  it("an attachment name keeps at most 80 characters and its extension (S10 §3)", () => {
    expect(attachmentName("foto.jpg")).toBe("foto.jpg");
    const long = `${"a".repeat(100)}.mp4`;
    expect(attachmentName(long)).toHaveLength(80);
    expect(attachmentName(long).endsWith(".mp4")).toBe(true);
  });
});
