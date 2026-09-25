import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { isApiError } from "./api-error";
import { createApiClient } from "./client";
import {
  contentDispositionFileName,
  type ListExportPath,
  type ListExportQuery,
  requestExport,
  saveFile,
} from "./exports";
import { server } from "./mocks/server";

// Built after `server.listen()`: openapi-fetch keeps the `fetch` it sees when it is created.
let client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// `PK\x03\x04`, then NUL, 0xFF and lone continuation bytes: a text read (UTF-8) corrupts them.
const BINARY = Uint8Array.from([
  0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x80, 0x81, 0xc3, 0x28, 0xe2, 0x82, 0x00, 0x0a, 0x0d,
]);
const QUERY: ListExportQuery = {
  columns: "fullName,dogs",
  filter: ["status:eq:ACTIVE"],
  format: "xlsx",
  q: "laia",
  sort: ["lastName,asc"],
};

// Every list export of the census, audit and activities screens takes the list's parameters; the
// instructor's week PDF is not a list export.
const LIST_EXPORT_PATHS: ListExportPath[] = [
  "/members/export",
  "/dogs/export",
  "/audit-entries/export",
  "/activities/export",
  "/activity-registrations/export",
];
// @ts-expect-error `/instructor/week/export` takes `date`/`ringId`, not the list's parameters.
const NOT_A_LIST_EXPORT: ListExportPath = "/instructor/week/export";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  client = createApiClient({ baseUrl: "https://core.example.test/api/v1" });
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
afterAll(() => {
  server.close();
});

function answerWithFile(headers: Record<string, string>) {
  let requested: URL | undefined;
  server.use(
    http.get("https://core.example.test/api/v1/members/export", ({ request }) => {
      requested = new URL(request.url);
      return new HttpResponse(BINARY, { headers, status: 200 });
    }),
  );
  return () => requested;
}

/** A DOM-less `document` whose hidden link records what `saveFile` clicked. */
function fakeDocument() {
  const clicked: { download: string; hidden: boolean; href: string }[] = [];
  const appended: unknown[] = [];
  const link = {
    click() {
      clicked.push({ download: link.download, hidden: link.hidden, href: link.href });
    },
    download: "",
    hidden: false,
    href: "",
    remove() {
      appended.splice(appended.indexOf(link), 1);
    },
  };
  vi.stubGlobal("document", {
    body: {
      append(node: unknown) {
        appended.push(node);
      },
    },
    createElement: (tag: string) => {
      expect(tag).toBe("a");
      return link;
    },
  });
  vi.stubGlobal("window", { setTimeout: globalThis.setTimeout });
  return { appended, clicked };
}

describe("E4-W07 requestExport (CONVENCIONS_API §4, R-14-12)", () => {
  it("types every list export path and nothing else", () => {
    expect(LIST_EXPORT_PATHS).toHaveLength(5);
    expect(NOT_A_LIST_EXPORT).toBe("/instructor/week/export");
  });

  it("200: returns the file with the Content-Type and the Content-Disposition name, and sends the list's parameters", async () => {
    const requested = answerWithFile({
      "Content-Disposition": 'attachment; filename="canic_members_20260810-0912.xlsx"',
      "Content-Type": XLSX,
    });

    const result = await requestExport(client, "/members/export", QUERY);

    expect(result.kind).toBe("file");
    if (result.kind !== "file") throw new TypeError("Expected a file");
    expect(result.fileName).toBe("canic_members_20260810-0912.xlsx");
    expect(result.blob.type).toBe(XLSX);
    const url = requested();
    expect(url?.searchParams.get("format")).toBe("xlsx");
    expect(url?.searchParams.get("columns")).toBe("fullName,dogs");
    expect(url?.searchParams.getAll("filter")).toEqual(["status:eq:ACTIVE"]);
    expect(url?.searchParams.get("q")).toBe("laia");
    expect(url?.searchParams.getAll("sort")).toEqual(["lastName,asc"]);
  });

  it("binary-safe: the bytes saveFile hands to the browser are the response bytes", async () => {
    answerWithFile({
      "Content-Disposition": 'attachment; filename="canic_members_20260810-0912.xlsx"',
      "Content-Type": XLSX,
    });
    const saved: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      saved.push(blob as Blob);
      return "blob:https://admin.example.test/export";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    fakeDocument();

    const result = await requestExport(client, "/members/export", QUERY);
    if (result.kind !== "file") throw new TypeError("Expected a file");
    saveFile(result.blob, result.fileName);

    expect(saved).toHaveLength(1);
    const blob = saved[0];
    if (blob === undefined) throw new TypeError("Expected a saved file");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(BINARY);
    expect(blob.type).toBe(XLSX);
  });

  it("200 without Content-Disposition: falls back to {list}.{format}", async () => {
    server.use(
      http.get(
        "https://core.example.test/api/v1/activity-registrations/export",
        () => new HttpResponse(BINARY, { headers: { "Content-Type": "application/pdf" } }),
      ),
    );

    const result = await requestExport(client, "/activity-registrations/export", {
      ...QUERY,
      format: "pdf",
    });

    expect(result).toMatchObject({ fileName: "activity-registrations.pdf", kind: "file" });
  });

  it("202: returns the queued job id without reading a file", async () => {
    server.use(
      http.get("https://core.example.test/api/v1/audit-entries/export", () =>
        HttpResponse.json(
          {
            jobId: "00000000-0000-4000-8000-000000000402",
            statusUrl: "/api/v1/exports/00000000-0000-4000-8000-000000000402",
          },
          { status: 202 },
        ),
      ),
    );

    await expect(requestExport(client, "/audit-entries/export", QUERY)).resolves.toEqual({
      jobId: "00000000-0000-4000-8000-000000000402",
      kind: "queued",
    });
  });

  it("202 without a job id is an error, not a download", async () => {
    server.use(
      http.get("https://core.example.test/api/v1/audit-entries/export", () =>
        HttpResponse.json({}, { status: 202 }),
      ),
    );

    await expect(requestExport(client, "/audit-entries/export", QUERY)).rejects.toThrow(TypeError);
  });

  it.each(["EXPORT_TOO_LARGE", "EXPORT_LIMIT"])(
    "422 %s arrives as the ApiError of the middleware",
    async (code) => {
      server.use(
        http.get("https://core.example.test/api/v1/activities/export", () =>
          HttpResponse.json(
            { code, details: {}, message: code, traceId: "trace-export" },
            { status: 422 },
          ),
        ),
      );

      const failure: unknown = await requestExport(client, "/activities/export", QUERY).catch(
        (error: unknown) => error,
      );

      expect(isApiError(failure, code)).toBe(true);
    },
  );
});

describe("E4-W07 contentDispositionFileName", () => {
  it.each([
    ['attachment; filename="canic_members_20260810-0912.xlsx"', "canic_members_20260810-0912.xlsx"],
    ["attachment; filename=canic_dogs_20260810-0912.pdf", "canic_dogs_20260810-0912.pdf"],
    [
      "attachment; filename=\"=?UTF-8?Q?x?=\"; filename*=UTF-8''c%C3%A0nic_members_20260810-0912.xlsx",
      "cànic_members_20260810-0912.xlsx",
    ],
    ['attachment; filename="a \\"quoted\\" name.pdf"', 'a "quoted" name.pdf'],
    ['attachment; filename="../../etc/members.xlsx"', "members.xlsx"],
    ["attachment", undefined],
    [null, undefined],
  ] as const)("%s → %s", (header, expected) => {
    expect(contentDispositionFileName(header)).toBe(expected);
  });
});

describe("E4-W07 saveFile", () => {
  it("clicks one hidden link with the file name, removes it and revokes the URL later", () => {
    vi.useFakeTimers();
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:https://admin.example.test/1");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const { appended, clicked } = fakeDocument();
    vi.stubGlobal("window", { setTimeout });
    const blob = new Blob([BINARY], { type: XLSX });

    saveFile(blob, "canic_members_20260810-0912.xlsx");

    expect(create).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual([
      {
        download: "canic_members_20260810-0912.xlsx",
        hidden: true,
        href: "blob:https://admin.example.test/1",
      },
    ]);
    expect(appended).toHaveLength(0);
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:https://admin.example.test/1");
  });
});
