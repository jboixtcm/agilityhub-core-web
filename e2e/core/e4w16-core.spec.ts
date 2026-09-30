import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Browser, type BrowserContext, type Page } from "@playwright/test";

import { expect, test } from "./oauth-token-log";

// E4-W16 real-core stage (steps 11, 10, 1, 5 and 7), on its own fresh core and seed. Steps 1 and
// 10 need api E5-T27 (the impersonation `launchUrl` with a handoff code; the RESET mark): on an
// older image they prove the fallback the web shows and are reported as pending real-core proof.

const clubsUrl = "http://127.0.0.1:4173";
const adminUrl = "http://127.0.0.1:4174";
const corePassword = requiredEnvironment("E1_CORE_PASSWORD");
const mailboxDirectory = requiredEnvironment("E1_MAILBOX_DIRECTORY");
const evidenceDirectory =
  process.env.CORE_EVIDENCE_DIRECTORY ?? resolve(process.cwd(), "roadmap/evidence/E4-W16");
const memberEmail = "member@example.test";
const memberName = "Laia Fictici006";

interface MailMessage {
  html?: string;
  text?: string;
  to?: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function writeEvidence(name: string, value: unknown): void {
  writeFileSync(join(evidenceDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function localizedContext(
  browser: Browser,
  viewport: { height: number; width: number },
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
  });
  return context;
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({ fullPage: true, path: join(evidenceDirectory, name) });
}

async function submitPasswordLogin(page: Page): Promise<void> {
  const tokenResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/oauth2/token") &&
      response.request().method() === "POST" &&
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") === "password",
  );
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click({ noWaitAfter: true });
  expect((await tokenResponse).status()).toBe(200);
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto(`${adminUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  const reveal = page.getByRole("button", { name: "Tinc contrasenya" });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel("Contrasenya").fill(corePassword);
  await submitPasswordLogin(page);
  await page.waitForURL("**/tauler");
  await expect(page.locator(".admin-shell")).toBeVisible();
}

async function loginMember(page: Page, email = memberEmail): Promise<void> {
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(email);
  await page.getByLabel("Contrasenya").fill(corePassword);
  // /inici restores the session with the cookie: leaving the page before that refresh answers
  // aborts it after the core rotated the cookie, and the next page replays the old one
  // (`400 REFRESH_REUSED`). Wait for it, as e2's helper does.
  const routeRefresh = page.waitForResponse(
    (response) =>
      response.url().endsWith("/oauth2/token") &&
      response.request().method() === "POST" &&
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") ===
        "refresh_token" &&
      new URL(response.request().frame().url()).pathname === "/inici",
  );
  await submitPasswordLogin(page);
  await page.waitForURL("**/inici");
  expect((await routeRefresh).status()).toBe(200);
  await expect(page.locator(".clubs-shell")).toBeVisible();
}

async function navigateSpa(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState(null, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u"));
}

/** D10's address of the seeded member, from D5's search. */
async function memberRecordPath(admin: Page): Promise<string> {
  await navigateSpa(admin, "/abonats");
  const search = admin.getByRole("searchbox", { name: "Cerca per nom, DNI, gos…" });
  await search.fill(memberEmail);
  const link = admin.getByRole("link", { exact: true, name: memberName });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  if (href === null) throw new Error("The member row did not contain a record URL");
  return href;
}

function deliveredLink(recipient: string, previous: ReadonlySet<string>): URL | undefined {
  for (const filename of readdirSync(mailboxDirectory)) {
    if (!filename.endsWith(".json") || previous.has(filename)) continue;
    const message = JSON.parse(
      readFileSync(join(mailboxDirectory, filename), "utf8"),
    ) as MailMessage;
    if (message.to?.toLowerCase() !== recipient.toLowerCase()) continue;
    const source = message.html ?? message.text ?? "";
    const match =
      /href=["'](https:\/\/[^"']+)["']/u.exec(source) ?? /(https:\/\/\S+)/u.exec(source);
    if (match?.[1] !== undefined) return new URL(match[1].replaceAll("&amp;", "&"));
  }
  return undefined;
}

test.describe.configure({ mode: "serial" });

// One administrator session for the stage's back-office checks (the api limits password logins).
let adminContext: BrowserContext | undefined;
let adminPage: Page | undefined;

async function sharedAdmin(browser: Browser): Promise<{ admin: Page; context: BrowserContext }> {
  if (adminContext !== undefined && adminPage !== undefined) {
    return { admin: adminPage, context: adminContext };
  }
  const context = await localizedContext(browser, { height: 900, width: 1280 });
  // The api's launchUrl names the club app's public host (app.example.test): in this run that
  // host is the local dev server, so its `/entrar?handoff=` is redirected there with its code.
  await context.route(/\/entrar\?handoff=/u, async (route) => {
    const requested = new URL(route.request().url());
    if (requested.origin === clubsUrl) {
      await route.continue();
      return;
    }
    await route.fulfill({
      headers: { Location: `${clubsUrl}${requested.pathname}${requested.search}` },
      status: 302,
    });
  });
  const admin = await context.newPage();
  await loginAdmin(admin);
  adminContext = context;
  adminPage = admin;
  return { admin, context };
}

test.afterAll(async () => {
  await adminContext?.close();
});

/** The bearer a page's api client sends (read from one of its requests; never written anywhere). */
async function bearerOf(page: Page, trigger: () => Promise<unknown>): Promise<string> {
  const request = page.waitForRequest(
    (candidate) =>
      new URL(candidate.url()).pathname.startsWith("/api/v1/") &&
      candidate.headers().authorization !== undefined,
  );
  await trigger();
  const authorization = (await request).headers().authorization;
  if (authorization === undefined) throw new Error("The page sent no bearer");
  return authorization;
}

interface MeDogsAnswer {
  dogs: {
    id: string;
    name: string;
    status: string;
    tasks?: {
      completed: number;
      items: { doneAt?: string | null; id: string; text: string }[];
      open: number;
    };
  }[];
}

/** 13 after a full-page load: the restore's refresh, then `GET /me/dogs`. */
async function openMyDogs(member: Page): Promise<MeDogsAnswer> {
  const refresh = member.waitForResponse(
    (response) =>
      response.url().endsWith("/oauth2/token") &&
      new URLSearchParams(response.request().postData() ?? "").get("grant_type") ===
        "refresh_token",
  );
  const dogsAnswer = member.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/me/dogs") && response.request().method() === "GET",
  );
  await member.goto(`${clubsUrl}/gossos`);
  expect((await refresh).status()).toBe(200);
  const answer = await dogsAnswer;
  expect(answer.status()).toBe(200);
  await expect(member.getByRole("heading", { name: "Els meus gossos" })).toBeVisible();
  return (await answer.json()) as MeDogsAnswer;
}

test("T-03-40 E4-W16 step 11 · screen 13 lists the task rows, the done ones struck through", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  // The seed gives this member's dogs no tasks (E3-W09 capture: «0 pendents · 0 fetes»): the club
  // adds two (POST /tasks, ADMIN, S10) and the member completes one (POST /tasks/{id}/completion).
  const { admin } = await sharedAdmin(browser);
  const recordPath = await memberRecordPath(admin);
  const adminBearer = await bearerOf(admin, () => navigateSpa(admin, recordPath));
  const texts = [
    "Treballar el balancí amb calma (E4-W16)",
    "Repassar la taula de contactes (E4-W16)",
  ];
  const created = await admin.evaluate(
    async ({ authorization, keys, memberId, taskTexts }) => {
      const overview = (await (
        await fetch(`/api/v1/members/${memberId}/overview`, {
          headers: { Authorization: authorization },
        })
      ).json()) as { dogs: { id: string; name: string }[] };
      const dog = overview.dogs[0];
      if (dog === undefined) return { dogName: "", ids: [], statuses: [] };
      const answers = await Promise.all(
        taskTexts.map(async (text, index) => {
          const response = await fetch("/api/v1/tasks", {
            body: JSON.stringify({ dogId: dog.id, text }),
            headers: {
              Authorization: authorization,
              "Content-Type": "application/json",
              "Idempotency-Key": keys[index] ?? "",
            },
            method: "POST",
          });
          const body = (await response.json()) as { id?: string };
          return { id: body.id ?? "", status: response.status };
        }),
      );
      return {
        dogName: dog.name,
        ids: answers.map((answer) => answer.id),
        statuses: answers.map((answer) => answer.status),
      };
    },
    {
      authorization: adminBearer,
      keys: [randomUUID(), randomUUID()],
      memberId: recordPath.split("/").at(-1) ?? "",
      taskTexts: texts,
    },
  );
  expect(created.statuses).toEqual([201, 201]);

  const context = await localizedContext(browser, { height: 844, width: 375 });
  const member = await context.newPage();
  await loginMember(member);
  const memberBearer = await bearerOf(member, () => openMyDogs(member));
  const completion = await member.evaluate(
    async ({ authorization, id }) =>
      (
        await fetch(`/api/v1/tasks/${id}/completion`, {
          headers: { Authorization: authorization },
          method: "POST",
        })
      ).status,
    { authorization: memberBearer, id: created.ids[1] ?? "" },
  );
  expect(completion).toBe(200);
  const dogs = await openMyDogs(member);
  const withTasks = dogs.dogs.filter((dog) => dog.status === "ACTIVE" && dog.tasks !== undefined);
  for (const dog of withTasks) {
    const card = member
      .locator(".dog-card")
      .filter({ has: member.getByRole("heading", { name: dog.name }) });
    const region = card.getByRole("region", { name: "Tasques" });
    const items = dog.tasks?.items ?? [];
    // Round 2 #5: the counter agrees in number with the api's counts («1 pendent · 1 feta»).
    const open = dog.tasks?.open ?? 0;
    const completed = dog.tasks?.completed ?? 0;
    await expect(
      region.getByText(
        `${String(open)} ${open === 1 ? "pendent" : "pendents"} · ${String(completed)} ${completed === 1 ? "feta" : "fetes"}`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(region.getByRole("listitem")).toHaveCount(items.length);
    for (const task of items) {
      const done = task.doneAt !== undefined && task.doneAt !== null;
      await expect(region.getByRole("checkbox", { name: task.text })).toHaveAttribute(
        "aria-checked",
        String(done),
      );
      await expect(region.getByText(task.text, { exact: true })).toHaveCSS(
        "text-decoration-line",
        done ? "line-through" : "none",
      );
      // Round 2 #3: a done row is never dimmed (AGENTS rule 6).
      await expect(region.getByRole("listitem").filter({ hasText: task.text })).toHaveCSS(
        "opacity",
        "1",
      );
    }
  }
  const target = dogs.dogs.find((dog) => dog.name === created.dogName);
  const targetTasks = target?.tasks?.items ?? [];
  expect(targetTasks.map((task) => task.text).sort()).toEqual([...texts].sort());
  expect(targetTasks.filter((task) => task.doneAt != null).map((task) => task.text)).toEqual([
    texts[1],
  ]);
  writeEvidence("13-tasks-core.json", {
    completion,
    created: created.statuses,
    dogsWithTasks: withTasks.map((dog) => ({
      done: dog.tasks?.items.filter((task) => task.doneAt != null).length ?? 0,
      name: dog.name,
      rows: dog.tasks?.items.length ?? 0,
    })),
  });
  await screenshot(member, "13-tasques-core-375.png");
  await context.close();
});

test("T-01-19 E4-W16 step 10 · a RESET link sets the new password once without `current`", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const recipient = "member.2@example.test";
  const context = await localizedContext(browser, { height: 844, width: 375 });
  const page = await context.newPage();
  const previous = new Set(readdirSync(mailboxDirectory).filter((name) => name.endsWith(".json")));
  await page.goto(`${clubsUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(recipient);
  await page.getByRole("button", { name: "Has oblidat la contrasenya? Recupera-la" }).click();
  await expect(page.getByRole("status")).toContainText("hi rebràs l'enllaç");
  let link: URL | undefined;
  await expect
    .poll(
      () => {
        link = deliveredLink(recipient, previous);
        return link !== undefined;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  if (link === undefined) throw new Error("The RESET link was not delivered");
  // S01 R-01-04 (ruling E70): a RESET link carries `&purpose=reset`, which api E5-T29 adds. The
  // link is single-use, so on an image without it the run opens the delivered link once with
  // that parameter, as the api will send it: the E5-T27 half (a RESET session sets the password
  // once without `current`, E49) is then proven on the core; the link's own shape stays pending.
  const deliveredPurpose = link.searchParams.get("purpose");
  const opened = new URL(link.toString());
  if (deliveredPurpose === null) opened.searchParams.set("purpose", "reset");
  await page.goto(`${clubsUrl}${opened.pathname}${opened.search}`);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  // The link's shape (path, parameter names and `purpose`), never its token.
  writeEvidence("recovery-link-core.json", {
    heading: await heading.textContent(),
    openedWithPurpose: opened.searchParams.get("purpose"),
    parameters: [...link.searchParams.keys()],
    path: link.pathname,
    purpose: deliveredPurpose,
  });
  if (deliveredPurpose === null) {
    test.info().annotations.push({
      description:
        "the api's RESET link carries no purpose yet (api E5-T29): opened with &purpose=reset",
      type: "pending real-core proof",
    });
  }
  // The password form never asks for `current`.
  await expect(page.getByLabel("contrasenya actual")).toHaveCount(0);
  await expect(page.getByLabel("nova contrasenya")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ja hi ets" })).toBeVisible();
  // The same password as the seed's (member.2 has one), so later logins keep working.
  const first = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/me/password") && response.request().method() === "PUT",
  );
  await page.getByLabel("nova contrasenya").fill(corePassword);
  await page.getByLabel("repeteix-la").fill(corePassword);
  await page.getByRole("button", { name: "DESA LA CONTRASENYA" }).click();
  const firstAnswer = await first;
  expect(firstAnswer.request().postDataJSON()).toEqual({ new: corePassword, repeat: corePassword });
  if (firstAnswer.status() === 401) {
    // An image without api E5-T27 still asks for `current` after a RESET link (INC-24): the web
    // maps it to «L'enllaç ja s'ha fet servir…» with «Recupera-la»; the full proof is pending.
    await expect(page.getByRole("alert")).toContainText(
      "L'enllaç ja s'ha fet servir: demana'n un altre",
    );
    await expect(page.getByRole("link", { name: "Recupera-la" })).toHaveAttribute(
      "href",
      "/entrar",
    );
    writeEvidence("recovery-core.json", {
      firstPut: firstAnswer.status(),
      pending: "real-core proof of step 10 waits for the api E5-T27 image (E49)",
    });
    test.info().annotations.push({
      description: "api E5-T27 is not in this image: the RESET session still needs `current`",
      type: "pending real-core proof",
    });
    await screenshot(page, "02-recuperacio-core-375.png");
    await context.close();
    return;
  }
  expect(firstAnswer.status()).toBe(200);
  await expect(page.getByText("Contrasenya desada")).toBeVisible();
  const second = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/me/password") && response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "DESA LA CONTRASENYA" }).click();
  expect((await second).status()).toBe(401);
  await expect(page.getByRole("alert")).toContainText(
    "L'enllaç ja s'ha fet servir: demana'n un altre",
  );
  writeEvidence("recovery-core.json", { firstPut: 200, secondPut: 401 });
  await screenshot(page, "02-recuperacio-core-375.png");
  await context.close();
});

test("T-01-11 E4-W16 step 1 · «Entra com l'abonat» opens the club app through the one-time code, once", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const { admin } = await sharedAdmin(browser);
  await navigateSpa(admin, await memberRecordPath(admin));
  await expect(admin.getByRole("heading", { name: memberName })).toBeVisible();

  await admin.getByRole("button", { name: "Entra com l'abonat" }).click();
  const dialog = admin.getByRole("dialog", { name: "Entra com l'abonat" });
  await dialog.getByLabel("Motiu (opcional)").fill("Validació E4-W16");
  const tokenAnswer = admin.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/v1\/members\/[^/]+\/impersonation-token$/u.test(new URL(response.url()).pathname),
  );
  const popup = admin.waitForEvent("popup", { timeout: 15_000 }).catch(() => undefined);
  // Round 2 #1: the club app's first `/me` after the handoff answers 503 once. The tab keeps the
  // redeemed session and asks again; it never reads the refresh cookie meanwhile.
  let failedMe = 0;
  await admin.context().route("**/api/v1/me", async (route) => {
    if (failedMe === 0 && route.request().frame().page() !== admin) {
      failedMe += 1;
      await route.fulfill({
        body: JSON.stringify({
          code: "INTERNAL_ERROR",
          details: {},
          message: "Unavailable (E4-W16 round 2)",
          traceId: "e2e",
        }),
        contentType: "application/json",
        status: 503,
      });
      return;
    }
    await route.fallback();
  });
  await dialog.getByRole("button", { name: "Entra com l'abonat" }).click();
  const answer = await tokenAnswer;
  expect(answer.status()).toBe(201);
  const body = (await answer.json()) as {
    expiresAt?: string;
    launchUrl?: null | string;
    token: string;
  };
  const launchUrl =
    typeof body.launchUrl === "string" && body.launchUrl !== "" ? body.launchUrl : undefined;

  if (launchUrl === undefined) {
    await admin.context().unroute("**/api/v1/me");
    // api E5-T27 is not in this image: D10 shows its error in the dialog and opens nothing.
    await expect(dialog.getByRole("alert")).toHaveText("No s'ha pogut completar l'acció.");
    expect(await popup).toBeUndefined();
    writeEvidence("impersonation-core.json", {
      launchUrl: body.launchUrl ?? "absent",
      opened: false,
      pending: "real-core proof of step 1 waits for the api E5-T27 image",
      status: answer.status(),
    });
    test.info().annotations.push({
      description:
        "api E5-T27 is not in this image (no launchUrl): the fallback is proven, the handoff is pending",
      type: "pending real-core proof",
    });
    await dialog.getByRole("button", { name: "Cancel·la" }).click();
    return;
  }

  const launch = new URL(launchUrl);
  const code = launch.searchParams.get("handoff") ?? "";
  expect(launch.pathname).toBe("/entrar");
  expect(code).not.toBe("");
  // E47: the JWT never travels in a URL.
  expect(launchUrl).not.toContain(body.token);
  const clubs = await popup;
  if (clubs === undefined) throw new Error("D10 did not open the launchUrl");
  const clubsGrants: string[] = [];
  clubs.on("request", (request) => {
    if (new URL(request.url()).pathname === "/oauth2/token" && request.method() === "POST") {
      clubsGrants.push(new URLSearchParams(request.postData() ?? "").get("grant_type") ?? "");
    }
  });
  // What the club app's `/me` answered (status, the impersonation mark, whose name): the shape
  // the banner reads, never a token.
  const clubsMe: {
    accountName: null | string;
    impersonation: null | string[];
    page: string;
    status: number;
  }[] = [];
  clubs.on("response", (response) => {
    if (new URL(response.url()).pathname !== "/api/v1/me") return;
    let page = "(service worker)";
    try {
      page = new URL(response.request().frame().url()).pathname;
    } catch {
      // A service worker's request has no frame.
    }
    void response
      .json()
      .catch(() => ({}))
      .then((payload: unknown) => {
        const me = payload as { account?: { name?: string }; impersonation?: object | null };
        clubsMe.push({
          accountName: me.account?.name ?? null,
          impersonation:
            me.impersonation === undefined || me.impersonation === null
              ? null
              : Object.keys(me.impersonation).sort(),
          page,
          status: response.status(),
        });
      });
  });
  await clubs.waitForURL((url) => url.pathname === "/inici", { timeout: 30_000 });
  // The banner names the account `/me` carries (its only name). The seed names the account of
  // member@example.test apart from its member record (question Q5 of the round 2 report).
  await expect
    .poll(() => clubsMe.find((answer) => answer.page === "/inici")?.status ?? 0)
    .toBe(200);
  const restored = clubsMe.find((answer) => answer.page === "/inici");
  expect(restored?.impersonation).toEqual(["actorName"]);
  const bannerName = restored?.accountName ?? "";
  expect(bannerName).not.toBe("");
  await expect(clubs.getByText(`Estàs veient l'app com ${bannerName}`)).toBeVisible();
  expect(failedMe).toBe(1);
  await admin.context().unroute("**/api/v1/me");

  // One member action, as the member (the api audits it with both ids, origin BACKOFFICE).
  await clubs.goto(`${clubsUrl}/gossos`);
  await expect(clubs.getByText(`Estàs veient l'app com ${bannerName}`)).toBeVisible();
  const note = clubs.getByLabel(/Notes als instructors/u).first();
  await note.fill("Nota desada des del backoffice (E4-W16)");
  const noteAnswer = clubs.waitForResponse(
    (response) =>
      response.request().method() === "PUT" && response.url().endsWith("/instructor-note"),
  );
  await clubs.getByRole("button", { exact: true, name: "DESA" }).first().click();
  expect((await noteAnswer).status()).toBe(200);
  await screenshot(clubs, "13-impersonat-core-375.png");

  // The code is spent: a second redemption is refused.
  const second = await clubs.evaluate(async (handoff) => {
    const response = await fetch("/oauth2/token", {
      body: new URLSearchParams({
        client_id: "clubs-app",
        grant_type: "urn:agilityhub:grant:handoff",
        token: handoff,
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const payload = (await response.json()) as { code?: string };
    return { code: payload.code ?? null, status: response.status };
  }, code);
  expect(second).toEqual({ code: "HANDOFF_INVALID", status: 400 });
  // The impersonated tab never refreshed (no refresh_token grant, before or after the reload).
  expect(clubsGrants.filter((grant) => grant === "refresh_token")).toEqual([]);
  writeEvidence("impersonation-core.json", {
    clubsMe,
    clubsRefreshGrants: clubsGrants.filter((grant) => grant === "refresh_token").length,
    firstMeAnswered503: failedMe === 1,
    launchUrl: `${launch.origin}${launch.pathname}?handoff=<redacted>`,
    memberAction: "PUT /me/dogs/{id}/instructor-note 200",
    opened: true,
    secondRedemption: second,
    status: answer.status(),
  });
  await clubs.close();
});

test("T-14-26 E4-W16 step 5 · a READY export downloads from the drawer through GET /exports/{id} and the bearer", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { admin } = await sharedAdmin(browser);
  await navigateSpa(admin, "/abonats");
  await expect(admin.getByRole("table", { name: "Llistat d'abonats" })).toBeVisible();
  // S14 R-14-12: every export creates a job; up to 5,000 rows it is born READY and the file comes
  // inline. The drawer then offers it again from the job.
  await admin.getByText("Excel · PDF", { exact: true }).click();
  const inline = admin.waitForEvent("download");
  await admin.getByRole("button", { name: "Excel" }).click();
  await inline;

  await admin.getByRole("button", { exact: true, name: "Exportacions" }).click();
  const drawer = admin.getByRole("dialog", { name: "Exportacions" });
  const ready = drawer
    .getByRole("button", { name: /^Descarrega canic_members_\d{8}-\d{4}\.xlsx$/u })
    .first();
  await expect(ready).toBeVisible();
  const detail = admin.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /\/api\/v1\/exports\/[0-9a-f-]{36}$/u.test(new URL(response.url()).pathname),
  );
  const fileRequest = admin.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith("/download"),
  );
  const download = admin.waitForEvent("download");
  await ready.click();
  const detailAnswer = await detail;
  expect(detailAnswer.status()).toBe(200);
  const job = (await detailAnswer.json()) as {
    downloadUrl?: string;
    fileName?: string;
    status: string;
  };
  expect(job.status).toBe("READY");
  expect(job.downloadUrl).toBeDefined();
  const file = await fileRequest;
  const fileAnswer = await file.response();
  expect(fileAnswer?.status()).toBe(200);
  expect((await file.allHeaders()).authorization).toMatch(/^Bearer \S+$/u);
  const saved = await download;
  expect(saved.suggestedFilename()).toBe(job.fileName);
  const bytes = readFileSync(await saved.path());
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const address = new URL(job.downloadUrl ?? "", adminUrl);
  writeEvidence("export-drawer-download-core.json", {
    bytes: bytes.length,
    downloadRoute: `${address.pathname}?expires=…&signature=…`,
    fileName: saved.suggestedFilename(),
    magic: bytes.subarray(0, 4).toString("hex"),
    status: fileAnswer?.status(),
  });
  await screenshot(admin, "exports-drawer-core-1280.png");
  await drawer.getByRole("button", { name: "Tanca les exportacions" }).click();
});

test("T-03-34 (front) E4-W16 step 7 · D10 keeps the block, «Inactivitat», «Baixa» and the audit whatever BILLING says", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { admin } = await sharedAdmin(browser);
  const modules = await admin.evaluate(async () => {
    const response = await fetch("/api/v1/branding");
    return ((await response.json()) as { modules: string[] }).modules;
  });
  await navigateSpa(admin, await memberRecordPath(admin));
  await expect(admin.getByRole("heading", { name: memberName })).toBeVisible();

  await expect(
    admin.getByRole("button", { name: /^(Bloqueja|Desbloqueja) les reserves$/u }),
  ).toBeVisible();
  await expect(admin.getByRole("link", { name: "Baixa (amb data)" })).toBeVisible();
  await expect(admin.getByRole("link", { name: "Tota l'auditoria ›" })).toBeVisible();
  await expect(admin.getByRole("link", { exact: true, name: "Inactivitat" })).toHaveCount(
    modules.includes("INACTIVITY") ? 1 : 0,
  );
  await expect(admin.getByRole("link", { name: /Tots els rebuts/u })).toHaveCount(
    modules.includes("BILLING") ? 1 : 0,
  );
  writeEvidence("d10-modules-core.json", {
    billing: modules.includes("BILLING"),
    inactivity: modules.includes("INACTIVITY"),
  });
  await screenshot(admin, "D10-accions-core-1280.png");
});
