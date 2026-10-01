import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

// INC-07 evidence: every `POST /oauth2/token` of a real-core run, with the error body of any non-2xx.
// No retries and no relaxed assertions here: the point is to catch the next `400` with its body.

export interface OAuthTokenCall {
  body?: { code?: unknown; error?: unknown; error_description?: unknown } | string;
  /**
   * E7-W06 step 2 (INC-07, INC-36): the browser context that sent it (`c1`, `c2`… in the order the
   * worker saw them), so the calls of one tab can be told from another's.
   */
  context?: string;
  /** Whether the browser sent a Cookie header (the HttpOnly refresh cookie); never its value. */
  cookie: "none" | "sent";
  grantType: string;
  /** Another token call of the same context was still running when this one started. */
  overlap?: string;
  /** The path of the page that sent it, at the time it was sent. */
  page?: string;
  /** The `Set-Cookie` headers of the answer: names and attributes, never a value. */
  setCookie?: string;
  /** When the request left (the time above is when its answer, or its failure, arrived). */
  startedAt?: string;
  status: number | string;
  test: string;
  time: string;
}

export function oauthTokenLogPath(): string {
  const directory =
    process.env.CORE_EVIDENCE_DIRECTORY ??
    resolve(process.cwd(), "roadmap/evidence", process.env.CORE_EVIDENCE_SUBDIRECTORY ?? "E1-W04");
  return join(directory, "oauth-token-calls.log");
}

export function appendOAuthTokenLog(line: string): void {
  const path = oauthTokenLogPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}\n`);
}

export function formatOAuthTokenCall(call: OAuthTokenCall): string {
  const body =
    call.body === undefined
      ? ""
      : ` body=${typeof call.body === "string" ? call.body : JSON.stringify(call.body)}`;
  const optional = (name: string, value: string | undefined) =>
    value === undefined ? "" : ` ${name}=${value}`;
  return `${call.time} grant_type=${call.grantType} status=${String(call.status)} cookie=${call.cookie}${optional("context", call.context)}${optional("page", call.page)}${optional("started", call.startedAt)}${optional("overlap", call.overlap)}${optional("set-cookie", call.setCookie)} test="${call.test}"${body}`;
}

/**
 * The `Set-Cookie` headers of an answer without their values: `name(Path=…; Max-Age=…; HttpOnly;
 * SameSite=…)`, or `none`. A refresh that rotates the token must set the new cookie; one that
 * clears it says so with `Max-Age=0` or a past `Expires`.
 */
export function describeSetCookies(headers: readonly { name: string; value: string }[]): string {
  const cookies = headers
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .flatMap((header) => header.value.split("\n"))
    .filter((value) => value.trim() !== "")
    .map((value) => {
      const [pair = "", ...attributes] = value.split(";").map((part) => part.trim());
      const name = pair.split("=")[0] ?? "";
      const empty = pair.slice(name.length + 1) === "";
      return `${name}${empty ? "(empty)" : ""}(${attributes.join("; ")})`;
    });
  return cookies.length === 0 ? "none" : cookies.join(",");
}

/** The path (and query names, never their values) of a page or request URL. */
function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    const keys = [...new Set(parsed.searchParams.keys())];
    return `${parsed.host}${parsed.pathname}${keys.length === 0 ? "" : `?${keys.join("&")}`}`;
  } catch {
    return "unknown";
  }
}

async function cookieSent(request: Request): Promise<OAuthTokenCall["cookie"]> {
  try {
    return (await request.allHeaders()).cookie === undefined ? "none" : "sent";
  } catch {
    return "none";
  }
}

function isTokenRequest(request: Request): boolean {
  return request.method() === "POST" && new URL(request.url()).pathname.endsWith("/oauth2/token");
}

function grantType(request: Request): string {
  return new URLSearchParams(request.postData() ?? "").get("grant_type") ?? "unknown";
}

// Only the diagnostic fields: a token response body is never logged.
async function errorBody(response: Response): Promise<NonNullable<OAuthTokenCall["body"]>> {
  try {
    const json = (await response.json()) as Record<string, unknown>;
    return { code: json.code, error: json.error, error_description: json.error_description };
  } catch (cause) {
    return `unreadable body: ${cause instanceof Error ? (cause.message.split("\n")[0] ?? "") : String(cause)}`;
  }
}

/** The page that sent a request, as a path (a worker's request has no frame). */
function pageOf(request: Request): string {
  try {
    return pathOf(request.frame().url());
  } catch {
    return "(no frame)";
  }
}

class OAuthTokenRecorder {
  readonly calls: OAuthTokenCall[] = [];
  currentTest = "(outside a test)";
  private readonly attached = new WeakSet<BrowserContext>();
  private contextCount = 0;
  /** E7-W06 step 2: the token requests of each context that have not answered yet. */
  private readonly inFlight = new Map<string, Map<Request, string>>();
  private readonly pending = new Set<Promise<void>>();
  private readonly starts = new WeakMap<Request, { overlap: string; startedAt: string }>();

  attach(context: BrowserContext): void {
    if (this.attached.has(context)) return;
    this.attached.add(context);
    this.contextCount += 1;
    // Unique across the run: a worker restarted after a failure counts from 1 again, so the id
    // carries Playwright's worker index (never reused within a run).
    const id = `w${process.env.TEST_WORKER_INDEX ?? "0"}c${String(this.contextCount)}`;
    this.inFlight.set(id, new Map());
    context.on("request", (request) => {
      if (!isTokenRequest(request)) return;
      const running = this.inFlight.get(id) ?? new Map<Request, string>();
      // Another token call of this context still out: two renewals racing (INC-36).
      const overlap = [...running.values()].join("+");
      const startedAt = new Date().toISOString();
      running.set(request, `${grantType(request)}@${startedAt}`);
      this.starts.set(request, { overlap: overlap === "" ? "no" : overlap, startedAt });
    });
    context.on("response", (response) => {
      if (!isTokenRequest(response.request())) return;
      this.track(this.fromResponse(response, id));
    });
    context.on("requestfailed", (request) => {
      if (!isTokenRequest(request)) return;
      this.inFlight.get(id)?.delete(request);
      const call = {
        ...this.startOf(request),
        context: id,
        grantType: grantType(request),
        page: pageOf(request),
        status: `failed (${request.failure()?.errorText ?? "unknown"})`,
        test: this.currentTest,
        time: new Date().toISOString(),
      };
      this.track(
        cookieSent(request).then((cookie) => {
          this.record({ ...call, cookie });
        }),
      );
    });
    // E7-W06 step 2: every full page load of the context, with the names, paths and expiry of the
    // cookies the browser holds for it at that moment (never a value), so a load whose refresh
    // goes without a cookie shows whether the jar still had one.
    const watchPage = (page: Page) => {
      page.on("load", () => {
        // The moment and the test of the load itself, not of the cookie read that follows.
        const url = page.url();
        const time = new Date().toISOString();
        const test = this.currentTest;
        this.track(
          context
            .cookies()
            .then(
              (cookies) =>
                cookies
                  .map(
                    (cookie) =>
                      `${cookie.name}(${cookie.domain}${cookie.path}; expires=${cookie.expires === -1 ? "session" : new Date(cookie.expires * 1_000).toISOString()}${cookie.httpOnly ? "; HttpOnly" : ""}; SameSite=${cookie.sameSite})`,
                  )
                  .join(",") || "empty",
              () => "unreadable",
            )
            .then((jar) => {
              appendOAuthTokenLog(
                `${time} load context=${id} page=${pathOf(url)} jar=${jar} test="${test}"`,
              );
            }),
        );
      });
    };
    for (const page of context.pages()) watchPage(page);
    context.on("page", watchPage);
  }

  private startOf(request: Request): { overlap?: string; startedAt?: string } {
    return this.starts.get(request) ?? {};
  }

  watch(browser: Browser): void {
    for (const context of browser.contexts()) this.attach(context);
    browser.on("context", (context) => {
      this.attach(context);
    });
  }

  async settled(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  private track(promise: Promise<void>): void {
    this.pending.add(promise);
    void promise.finally(() => this.pending.delete(promise));
  }

  private async fromResponse(response: Response, context: string): Promise<void> {
    const time = new Date().toISOString();
    const test = this.currentTest;
    const status = response.status();
    const request = response.request();
    this.inFlight.get(context)?.delete(request);
    const call: OAuthTokenCall = {
      ...this.startOf(request),
      context,
      cookie: await cookieSent(request),
      grantType: grantType(request),
      page: pageOf(request),
      setCookie: await response.headersArray().then(describeSetCookies, () => "unreadable"),
      status,
      test,
      time,
    };
    if (status < 200 || status > 299) call.body = await errorBody(response);
    this.record(call);
  }

  private record(call: OAuthTokenCall): void {
    this.calls.push(call);
    // Appended at once, so a worker restarted after a failure keeps what it saw.
    appendOAuthTokenLog(formatOAuthTokenCall(call));
  }
}

export const test = base.extend<
  { oauthTokenCalls: OAuthTokenCall[] },
  { oauthTokenRecorder: OAuthTokenRecorder }
>({
  oauthTokenCalls: [
    async ({ oauthTokenRecorder }, use, testInfo) => {
      oauthTokenRecorder.currentTest = testInfo.titlePath.slice(1).join(" › ");
      const first = oauthTokenRecorder.calls.length;
      await use(oauthTokenRecorder.calls);
      await oauthTokenRecorder.settled();
      if (testInfo.status !== testInfo.expectedStatus) {
        const calls = oauthTokenRecorder.calls.slice(first);
        await testInfo.attach("oauth-token-calls", {
          body:
            calls.length === 0
              ? "(no POST /oauth2/token in this test)"
              : calls.map(formatOAuthTokenCall).join("\n"),
          contentType: "text/plain",
        });
      }
      oauthTokenRecorder.currentTest = "(outside a test)";
    },
    { auto: true },
  ],
  oauthTokenRecorder: [
    async ({ browser }, use) => {
      const recorder = new OAuthTokenRecorder();
      recorder.watch(browser);
      await use(recorder);
      await recorder.settled();
    },
    { auto: true, scope: "worker" },
  ],
});

export { expect };
