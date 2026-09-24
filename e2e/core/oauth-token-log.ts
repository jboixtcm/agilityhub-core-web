import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Request,
  type Response,
} from "@playwright/test";

// INC-07 evidence: every `POST /oauth2/token` of a real-core run, with the error body of any non-2xx.
// No retries and no relaxed assertions here: the point is to catch the next `400` with its body.

export interface OAuthTokenCall {
  body?: { code?: unknown; error?: unknown; error_description?: unknown } | string;
  /** Whether the browser sent a Cookie header (the HttpOnly refresh cookie); never its value. */
  cookie: "none" | "sent";
  grantType: string;
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
  return `${call.time} grant_type=${call.grantType} status=${String(call.status)} cookie=${call.cookie} test="${call.test}"${body}`;
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

class OAuthTokenRecorder {
  readonly calls: OAuthTokenCall[] = [];
  currentTest = "(outside a test)";
  private readonly attached = new WeakSet<BrowserContext>();
  private readonly pending = new Set<Promise<void>>();

  attach(context: BrowserContext): void {
    if (this.attached.has(context)) return;
    this.attached.add(context);
    context.on("response", (response) => {
      if (!isTokenRequest(response.request())) return;
      this.track(this.fromResponse(response));
    });
    context.on("requestfailed", (request) => {
      if (!isTokenRequest(request)) return;
      const call = {
        grantType: grantType(request),
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

  private async fromResponse(response: Response): Promise<void> {
    const time = new Date().toISOString();
    const test = this.currentTest;
    const status = response.status();
    const request = response.request();
    const call: OAuthTokenCall = {
      cookie: await cookieSent(request),
      grantType: grantType(request),
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
