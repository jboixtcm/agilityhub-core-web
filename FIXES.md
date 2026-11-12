# Fix log — pre-production audit (Nov 2026)

Branch `fix/pre-production-audit`, based on the production commit. One entry per audit finding. Statuses: FIXED, PARTIAL, NEEDS-DECISION (no code touched; question and options stated), NOT-CODE (operational, data or process), INVALID, REVERTED-BY-REVIEW. `OTHER-REPO:` marks a change still needed in the other repository. Finding IDs refer to `PRE_PRODUCTION_AUDIT_2026-11-11.md`.

Integration tests (`*IT`) need MongoDB and were not run in the environment where these fixes were written; run the full CI before merging.

## web-01-high

### WEB-01 — NEEDS-DECISION

No code changed. Verified: the login door depends on build flags (`apps/clubs/src/App.tsx:801-803`, `:1019-1045`, cases tested in `App.test.tsx:3025-3057`), the sign-up link is the only call to action below the form (`App.tsx:1062-1069`), and the admin fallback is the one-member access-resend dialog (`apps/clubs-admin/src/census/CensusRecordPage.tsx:1165`).
Question: how do imported members who never set a password get in the first time? Options: (a) passwordless LOGIN link (build without `VITE_EMAIL_LOGIN_ENABLED=false`, server general e-mail delivery on); (b) recovery only (`VITE_EMAIL_RECOVERY_ENABLED=true` plus server `EMAIL_RECOVERY_ENABLED`), with copy telling first-time members to use it; (c) admin-staged access, which needs a new bulk "send access" action from a census selection (screen design, and the api's 60/hour per-IP magic-link limit would need its own decision: OTHER-REPO).
Also to decide: the first-time copy on /entrar (no mockup literal exists) and whether the "Encara no hi ets? Apunta-t'hi" link is hidden or reworded during onboarding.
Operational check before L1 (not code): confirm the flags of the live bundle on /entrar and the server delivery settings (`EMAIL_PUBLIC_DELIVERY_ENABLED`, hosted-demo allow-list), then test with one real imported, never-activated account.

### WEB-02 — NEEDS-DECISION

No code changed. Verified: the switch shows the account preference (`apps/clubs/src/profile/NoticesCard.tsx:244`), `subscribeToPush` is reached only from the switch and the reminder (`:172-181`, `:227`, `:249`), `unavailable` and `failed` show nothing by design (`apps/clubs/src/notifications/push.ts:81-86`), and the worker has no `pushsubscriptionchange` handler (`apps/clubs/src/sw.ts:75-92`).
Each remedy needs a choice: a "turn on notifications on this device" button (new UI and copy outside the mockup), or re-registering an existing browser subscription when 12 opens (R-11-07 only allows the POST when the member turns the switch or a reminder on, and on a shared device it would subscribe a second account that never asked); messages for `unavailable`/`failed` (new copy); an inert switch on iOS outside the app (the switch also holds the account-wide preference, and `NoticesCard.test.tsx:795-814` codifies today's behaviour).
`pushsubscriptionchange` has no single answer either: the worker has no bearer and the logout DELETE uses the id kept in page storage, so it means relaying to an open tab or a new api endpoint (OTHER-REPO).
Before L3 (not code): test on an installed iPhone PWA and an Android phone, including a second device, reinstall and logout/login.
Review note: classification confirmed, nothing here could be fixed without a choice. An interim lever needs no code: PUSH is an admin self-service module (`apps/clubs-admin/src/catalogs/ParameterSettings.tsx:869`; on in the club's preset, api `Module.java:20`). While it is off, 12 shows no push switch (`NoticesCard.tsx:164`, test at `NoticesCard.test.tsx:815`) and in-app and e-mail notices are unchanged (R-11-17). While it is on, `pushClubNews` defaults to `true` (S11 §3), so every member sees the switch ON on a device that has no subscription. Whether the module stays on until these decisions are made is the club's call.

## web-02-web-quality

### WEB-03 — NEEDS-DECISION

No code changed. Verified: the reminder selector is drawn for every member (`apps/clubs/src/profile/NoticesCard.tsx:219`), while the push row depends on `pushRow` (`:164`), and `askForPush` returns at once without it (`:172-173`). N-13 goes to APP + PUSH, plus e-mail only when `emailByCategory.OPERATIONAL` is on, which is off by default (S11 R-11-16, R-11-04). S11 §2 draws the «Recordatori de classe» row on 12 unconditionally.
Question: what should a member without push on this device be told or given? Options: (a) hide the selector without a push subscription (this also hides a working in-app reminder and goes against S11 §2); (b) add a line under it saying where the reminder appears (new copy, no mockup literal); (c) send N-13 by e-mail when the member has no active push subscription (a change to the R-11-16 channels; OTHER-REPO: the api's N-13 channel rule).

### WEB-04 — FIXED

`useLoader` (`apps/clubs/src/booking/shared.ts`) takes a fourth `onFocus` flag: the request is read again quietly on focus, `visibilitychange` (visible) and `online`, reusing `useWindowFocus` from the training screen. `useMeHome`, `useBookableClasses`, `useBooking` and `useWaitlistEntry` turn it on; the other screens that share `useLoader` are unchanged.
A read started by the app coming back keeps the rows on screen if it fails (a phone waking up without network yet), instead of replacing them with the error card; explicit quiet reads (04's join, 07's cancellation) still show their error as before.
Tests: `apps/clubs/src/booking/loader.test.tsx` (new, 3 cases; checked to fail without the keep-rows guard), plus the existing booking, history, instructor, courses, training, App and notifications suites, all run and passing.
Review correction: a read started by the app coming back replaces the read in flight. When that one was an explicit read still unanswered (07's reload after a cancellation, 04's after a join) and the new read failed, the old rows stayed on screen: «confirmada» after a cancellation, which E7-W06 step 3 rules out. Such a read now shows its error, as the read it replaced would have. One more case in `loader.test.tsx` (checked to fail without the correction); the whole clubs vitest suite runs and passes (797 tests).

### WEB-05 — REVERTED-BY-REVIEW

`DogPhoto` (`packages/ui/src/dog-photo.tsx`) renders its image with `loading="lazy"` and `decoding="async"`, so the admin dog list, the census rows and the instructor's student search fetch a photo only when its row nears the viewport. Its box already has a fixed size (`dog-photo.css`: 2.5 rem, 5 rem large), so no width/height attributes were needed to avoid layout shift.
Test: a new case in `packages/ui/src/dog-photo.test.tsx` (run, passing); the admin census list and instructor suites run and pass.
Left, needs a decision: downscaling before upload in `apps/clubs/src/SelfServicePages.tsx` (`changePhoto`) and in the admin photo upload (`apps/clubs-admin/src/census/CensusRecordPage.tsx:2789`). Choose the maximum edge (the audit suggests about 1024 px), the format and quality (JPEG vs WebP; PNG transparency), whether EXIF is stripped (it also removes GPS data) and whether the original is kept. Server-side renditions are OTHER-REPO: the api would store a thumbnail next to the original (`AttachmentService`) and expose its URL for list rows.
Reverted by review: the photo URLs the api hands out are signed for five minutes (`AttachmentService.url`, `plusSeconds(300)`; `CensusResponses` "Short-lived signed dog photo URL"). With `loading="lazy"` a row scrolled into view more than five minutes after the list was read asks for an expired URL, gets 403 and falls back to the initial for good (`DogPhoto` keeps the failed `src`), while today every photo is fetched at render and stays cached. Lazy loading needs a decision on the URL lifetime (OTHER-REPO: longer-lived or unsigned thumbnail URLs) or on re-reading the list's URLs before they expire; it can come back together with the downscaling decision above.

### WEB-06 — NEEDS-DECISION

No code changed. Verified: «Restableix el valor de producte» calls `DELETE /parameters/{key}` directly (`apps/clubs-admin/src/catalogs/ParameterSettings.tsx:750-766`, button at `:799`). The operation accepts only `scopeRef` (`resetParameter` in `packages/api-client/openapi/openapi.json`; S02 §2 and its API table prescribe this direct reset), so the web cannot send the version or a reason. JSON/list parameters without a dedicated form are parsed from a textarea (`:680`).
To decide: (a) a confirmation dialog showing "current value -> default value" (new copy outside the D11 mockup; `Parameter.default` is already in the response) and whether to hide the button when `isOverride` is false; (b) stale-version protection and a reason on reset, OTHER-REPO: `DELETE /parameters/{key}` would take `version` (409 `STALE_VERSION`) and an optional `reason` recorded in the history; (c) which club-editable JSON/list parameters get typed controls, and their design.

### WEB-07 — NEEDS-DECISION

No code changed. Verified: the IBAN input is `type="password"` with the masked account as placeholder and goes out as typed (`apps/clubs-admin/src/census/MemberPaymentMethodDrawer.tsx:96-100`, `:130-131`). S03 R-03-07 forbids reading the IBAN back but does not ask for blind entry. The api validates the check digits (`400 INVALID_IBAN`, which the drawer already shows through `errors:INVALID_IBAN`).
To decide: (a) show the IBAN in clear while it is typed (privacy at the admin's desk vs. checking it by eye; a password field also makes browsers offer to save the IBAN as a password, since `autoComplete="off"` is ignored there); (b) a confirmation step "holder + ···· last four" before saving (new copy). A client-side mod-97 check alone was not added: it repeats the api's `INVALID_IBAN` with the same message and does not catch a valid IBAN entered on the wrong member.
Not code: before L2, export the last-four-digit list and reconcile it against the old system's bank data.

### WEB-08 — NOT-CODE

Before launch, run `pnpm e2e:core` once against a staging copy of the exact release pair (web 256fd5f, api ef8caf0) with the api's test clock available, keep the report, and treat the (c)/(d)/(h) skips (`e2e/core/e7-core.spec.ts:1663`, `:1822`, `:2595`) as failures. Add a manual device matrix (iPhone Safari, installed iPhone PWA, Android Chrome) for login, book, cancel, waitlist, receipts and push. A CI job against a real api needs a staging stack and image access, which is an infrastructure choice.

### WEB-09 — PARTIAL

`BookingDetailPage` (`apps/clubs/src/booking/BookingDetailPage.tsx`): a cancel dialog opened in time now switches to the late warning when `cancellableInTimeUntil` passes while it is still open. A timer is set for that instant and cleared when the dialog closes; delays beyond `setTimeout`'s 24.8-day range are skipped. Before this, the dialog kept the value it computed when it opened.
Test: a new case in `apps/clubs/src/booking/detail.test.tsx` (checked to fail without the timer); the whole file runs and passes (28 tests).
Review correction: a timer does not count the time a phone spends asleep, so a dialog left open on a locked phone would have warned late. The dialog is now also checked when the app comes back (`useWindowFocus`: focus, visible again, online). One more case in `detail.test.tsx` (checked to fail without the correction); the whole file runs and passes (29 tests).
Left: the decision still uses the device clock. Correcting it needs the server's time with the booking, as the seat hold has it. OTHER-REPO: add `serverNow` (date-time) to the `Booking` response of `GET /bookings/{id}`, as `SeatHoldResponse` does; the web would then apply the offset as `useCountdown` does. Rewording the in-time text to "if you cancel before HH:MM" is new copy for 07 (no mockup literal), so it needs a decision.

### WEB-10 — PARTIAL

The i18n loader backend (`packages/i18n/src/backend.ts`, used by clubs, clubs-admin and id) asks a failed locale chunk once more before reporting the error. A dropped connection on a first visit no longer leaves raw keys after a single failure. Unknown namespaces are still refused without loading.
Test: `packages/i18n/src/backend.test.ts` (new, 3 cases); the whole i18n vitest suite runs and passes.
Left, needs a decision: the reload after a deploy (`sw.ts` `skipWaiting` + `clients.claim`, `registerType: "autoUpdate"` in `apps/clubs/vite.config.ts`). Options: keep it and release outside booking peaks; switch to `registerType: "prompt"` with an "update available" notice (new copy); or defer the reload until the page is hidden. A client/API version handshake is a separate choice. Showing a screen error state instead of raw keys after the retry also fails is new UI, so it needs a decision too.
Not code: confirm the reload behaviour on staging with an open tab during a deploy, and schedule releases away from the weekly booking opening.
Review note: the retry is immediate and asks for the same chunk URL. Browsers that keep a failed dynamic `import()` in their module map (Chromium and WebKit have done so) answer the second call with the same failure without going to the network, so the gain may be limited to Firefox and to failures the browser does not cache. Harmless either way; check it on staging with a throttled first visit before counting on it.

### WEB-11 — PARTIAL

The back arrows of 07 and the course viewer (`.booking-screen__back`, `apps/clubs/src/booking/booking.css`) and of the self-service pages (`.self-page__header a`, `apps/clubs/src/styles.css`) keep their 32 px look. An invisible `::before` adds 0.375 rem on each side, so they take taps on a 44 px area. Nothing else that can be tapped sits next to them.
Test: a new case in `apps/clubs/src/polish-styles.test.ts`, which can now read `booking.css` too (run, passing).
Left, needs a decision: the 36 × 20 px switch (`.ah-switch`, `packages/ui/src/components.css`). On screen 12 the rows of switches are about 2 rem apart (`.profile-notices` gap 0.75 rem), so a 44 px invisible area would cover the gap. A tap just below one switch would then toggle the next one. Options: more space between the rows of 12 (moves away from the mockup), a larger switch track, or a smaller non-overlapping area (about 32 px tall).

### WEB-12 — NEEDS-DECISION

No code changed. Verified: `/estadistiques` and `/estadistiques/lliga` are routed to the placeholder and marked "Screens 27 and 27b (reserved for R2)" (`apps/clubs/src/App.tsx:212-214`), with no link to them. The receipts list shows only the `billing:empty` title (`apps/clubs/src/billing/InvoicesPage.tsx:336-337`).
To decide: keep the two reserved routes or remove them until R2; whether the empty receipts state gets a sentence saying that earlier receipts stay in the previous system (new copy in ca/es/en, no mockup literal). INC-11, INC-41, INC-76 and INC-80 stay for after launch, as the audit recommends.

## web-03-web-security

### FE-02 — NEEDS-DECISION

No code changed. Verified: every change of the sign-up form writes the whole draft, IBAN and ID number included, to `sessionStorage` (`signup.draft.v1`), kept 24 h (`apps/clubs/src/SignupPage.tsx:146`, `:2862-2870`, `:2944-2949`). S04 §2 prescribes exactly this ("descartat als 24 h o en enviar") and T-04-29 asks the draft to survive a reload. The steps are separate page loads (`navigateTo`, `:2944`), so the ID number typed on 16 only reaches the `POST` on 19 through that storage, and a Stripe return needs the committed member's `signupToken` from it.
Question: how much of a sign-up may wait in the browser, and for how long? Options: (a) keep the IBAN out of the draft (asked again after a reload, or after an error that sends the member to another step); the ID number cannot leave it unless the steps move to in-app navigation; (b) an idle window of 30–60 min instead of 24 h, long enough for a Stripe checkout; (c) a visible «clear the form» action (new copy in ca/es/en, no mockup literal); (d) clear the draft on `pagehide`, which first needs the flow to tell a step change, a reload and the Stripe redirect from leaving the form. (a), (b) and (d) change S04 §2 and T-04-29.

### FE-03 — NEEDS-DECISION

No code changed. Verified: the member app redeems any `?handoff=` on load without asking (`apps/clubs/src/App.tsx:840-850`), and a non-impersonation code replaces the host's session (`packages/auth/src/auth-client.ts:1313-1356`). The web asks only for clubs-app → clubs-admin codes (`App.tsx:1350`, 03b's portal) and clubs-admin → clubs-app ones (`apps/clubs-admin/src/UserMenu.tsx:144`, the profile switch, also used by instructors); it never asks for a clubs-app → clubs-app code.
Question: what happens when a handoff link is opened on a host that already holds another account's session? Options: (a) a confirmation screen ("signed in as X; continue as Y?") before redeeming (new screen and copy, no mockup); (b) refuse the code, keep the current session and say why (new copy); (c) no web change, rely on the api restriction below.
OTHER-REPO: `HandoffService.create`/`eligible` should refuse a code whose source and target are both `clubs-app` (no client asks for one). Requiring ADMIN for clubs-admin → clubs-app, as the audit suggests, would take the profile switch away from instructors, so it is part of the decision; so is binding a code to the browser that asked for it (a verifier sent at redemption: api and web).

### FE-05 — FIXED

The back office loads its UI gallery with `import()` only when `import.meta.env.DEV` (`apps/clubs-admin/src/App.tsx`), so neither the gallery nor the MSW branding fixture it imports reaches a production build. The entry chunk went from 1,148 kB to 960 kB (gzip 386 → 242 kB) and no longer holds `canic.example.test`. `/_gallery` on the dev server works as before.
New check `scripts/check-production-bundles.mjs`: it searches every text file of `apps/clubs/dist`, `apps/clubs-admin/dist` and `apps/id/dist` for `mockServiceWorker`, `agilityhub.mockScenario` and `example.test`, and refuses MSW's worker file. CI runs it right after the build (step "Check production bundles for mock data"). It failed on the back-office build made before the fix and passes on the three builds after it.
Tests: `scripts/check-production-bundles.test.mjs` (new, 5 cases, node:test; added to the clubs `test:bundle-check` and to turbo's `clubs#test` inputs), run and passing. The back office's `App.test.tsx` and `lazy-chunks.test.tsx` run and pass.

### FE-06 — PARTIAL

Every explicit logout now ends this device's push subscription (S11 R-11-07: "Logout → DELETE de la subscripció del dispositiu"). `unsubscribeFromPush` (`apps/clubs/src/notifications/push.ts`) still sends the DELETE of the stored id. When there is no stored id or the DELETE fails, it unsubscribes the browser's own subscription, as `dropLateSubscription` already did for a subscription that lands after the logout. The «profile unavailable» page (`NoAppProfilePage`, `apps/clubs/src/App.tsx`) logged out without the DELETE; it now goes through `logoutWithPush` like 12 (an impersonated session keeps the plain logout, as on 12).
Tests: 3 new cases in `apps/clubs/src/notifications/push.test.ts` and 1 in `apps/clubs/src/App.test.tsx`, each checked to fail without the change; the App, notifications and profile suites run and pass (189 tests).
Left, needs a decision: a session that ends without a logout (refused refresh, revoked from another device, cleared cookies: `handleRefreshFailure` in `packages/auth/src/auth-client.ts`). Unsubscribing the device then also stops push for a member whose session simply expired on their own phone, while 12 still shows the switch on (WEB-02). Options: (a) unsubscribe on every session that ends; (b) only when the session was revoked, which the web cannot tell today; (c) keep the subscription and rely on the api replacing it when another account subscribes on that browser (E76).
OTHER-REPO (server side of the recommendation, and needed for (b)): push subscriptions are not bound to a session; expiring them when their session is revoked needs the session id stored on the subscription and a hook in the session revocation.

### FE-07 — NEEDS-DECISION

No code changed. Verified: the member app's worker takes over at once (`apps/clubs/src/sw.ts:51-57`, `registerType: "autoUpdate"` in `apps/clubs/vite.config.ts:113-115`), nothing calls `registration.update()`, the back office has no worker, no build id is exchanged with the api, and the only recovery is one reload on a missing chunk (`packages/ui/src/chunk-reload.ts`). Calling `update()` when the app comes back would, with autoUpdate, reload the page under the member more often, so it depends on WEB-10's open choice (keep autoUpdate, `registerType: "prompt"` with a notice, or defer the reload until the page is hidden).
Question: how are members and admins told that a new version is out? Options: (a) a build id (a `/branding` field or a response header: OTHER-REPO) compared by both apps, showing a "new version, reload" notice at a safe moment (new copy, no mockup literal); (b) `registration.update()` on focus, together with WEB-10's prompt mode; (c) leave it to the release procedure (a deploy already takes the service down) plus today's chunk reload.

### FE-08 — NEEDS-DECISION

No code changed. `pnpm audit` re-run today: production has 1 high, zod 3.25.76 (GHSA-mrhx-c7xc-m3w5), pinned in `packages/course-core/package.json:14` and `packages/shared-types/package.json:14`; the fix exists only in zod >= 4.6.6 (no fixed 3.x release). Tooling: 19 high, 24 moderate, 6 low; fixed releases exist in the same majors for vite (8.2.4), @vitest/mocker (5.0.3), undici (7.30.1 / 8.12.2), js-yaml, source-map-js, brace-expansion, fast-uri and serialize-javascript; glob and minimatch need new majors and deepmerge has no fix.
To decide: (a) zod: migrate course-core and shared-types to zod 4 (a major with API changes; `zod-to-json-schema` must be checked too), or cap array sizes in the course schemas (the caps on obstacles, numbers or zones per course have business meaning), or accept the self-inflicted tab DoS until then; (b) when to take the tooling bumps, which change the build tool right before launch; (c) a CI step `pnpm audit --prod --audit-level high` fails today because of zod: blocking with a list of accepted advisories, or report-only until (a); (d) pinning the GitHub actions by commit SHA needs the SHAs looked up on GitHub and an update routine (Dependabot or Renovate).

### FE-09 — FIXED

`navigate()` (`apps/clubs/src/router.ts`) now opens only `http:`/`https:` addresses: a `javascript:`, `data:` or any other scheme does nothing, so no future caller can turn it into a script sink. Every current caller passes app paths or the back office's https handoff URL.
Both WhatsApp links of the back office (member record, `apps/clubs-admin/src/census/CensusRecordPage.tsx`; sign-up review, `apps/clubs-admin/src/dashboard/SignupReviewPage.tsx`) are built by one helper, `whatsAppUrl` (`apps/clubs-admin/src/whatsapp.ts`), which keeps only the digits of the prefix and the number. The member record used to keep everything but the first «+».
Tests: a new case in `apps/clubs/src/router.test.ts` (checked to fail without the guard) and `apps/clubs-admin/src/whatsapp.test.ts` (new, 2 cases); the router, member record and sign-up review suites run and pass, and so does the whole clubs vitest suite (802 tests).

### FE-10 — NEEDS-DECISION

No code changed. Verified: «Surt» revokes the impersonation or support token with `credentials: "include"` (`packages/auth/src/auth-client.ts:919-938`, `:978-993`), and the api answers every token revoke except a bookings-only one with the Set-Cookie that clears `ah_refresh` (`api/.../OAuthController.java:163-171`), although neither kind of session uses that cookie (`apps/clubs-admin/src/support/SupportPages.tsx:36`).
Question: should leaving an impersonation or a support access keep the actor signed in on that host? Options: (a) keep today's behaviour: the actor is signed out there, and a tab left open after «Surt» can only come back anonymous; (b) OTHER-REPO: clear the cookie only on the revoke of a cookie session (never for an `imp` token), and on the web make sure such a tab never restores the actor's own session on reload. Dropping the credentials on the web side alone would keep the cookie but lose that guarantee.

## cross-repo

The api fix log's `OTHER-REPO:` items for this repository, done here or left with their question. The items this repository logged for the api are in the api's `## cross-repo` section.

### SCH-01 — FIXED

D4 (`apps/clubs-admin/src/planning`): the selected-class card of a CANCELLED class whose `cancellation.reason` is not DELETED and whose `startsAt` is still ahead offers [RESTAURA LA CLASSE] to ADMIN only (`isRestorable` in the new `RestoreClassModal.tsx`; INSTRUCTOR's read-only card has none). Its confirmation says the bookings and the waiting list are not recovered and nobody is notified; it sends `POST /class-sessions/{id}/restoration` with `{}` (no Idempotency-Key) and then shows the restored class selected under «Actives». Refusals show inside the dialog: `CLASS_CONFLICT` with its own text («another class on this ring at the same time»; the shared `errors:CLASS_CONFLICT` speaks of a booking), `INVALID_STATE`, `RING_BLOCKED` and `RING_HAS_BOOKINGS` with their `errors:` messages; `INVALID_STATE` also reloads the calendar. New copy in ca/es/en (`calendar.selected.restore`, `calendar.restored`, `restoreModal.*`; es in the infinitive) and the `CLASS_RESTORED` audit label (`admin-audit:actions`).
Contract: the api branch's `docs/openapi/openapi.json` was copied byte for byte into `packages/api-client/openapi/openapi.json` and the types regenerated with `pnpm api:generate` (the documented adoption; `pending.json` is empty). This also brings REL-02's `HealthResponse.commit` (the health mock now answers `commit: null`), COMM-05's description and the `familyGroupHolder` export field. The api snapshot itself was hand-edited there, not regenerated (no Docker): re-copy it once CI regenerates it. The web's copies of S06, S14, `MATRIU_PERMISOS` and `CATALEG_ERRORS` carry the api's SCH-01 amendments.
Tooling: the pre-commit hook (lint-staged) ran eslint on the regenerated `src/generated/schema.d.ts`, which the package's lint script, CI and `.prettierignore` all leave out, so no regeneration could be committed with the hook on. The shared eslint config now ignores that folder and the hook's eslint call passes `--no-warn-ignored` (`packages/config/eslint.config.mjs`, root `package.json`). The hook's `prettier --write` also reformatted the copied snapshot in that commit (same JSON, other bytes); a second commit restores the api's bytes and lists the file in `.prettierignore`, as the generated types already are.
MSW: new `POST /class-sessions/:id/restoration` handler in `calendar-handlers.ts` with the api's refusals (handler count 414 → 415 in `index.test.ts`).
Tests: 3 new cases in `CalendarPage.test.tsx` (restore flow, no button for a deleted, a started class or an INSTRUCTOR, refusal messages; the second fails without the DELETED guard) and 1 in `calendar-handlers.test.ts`; the whole clubs-admin (1151) and api-client (802) suites, `pnpm i18n:check`, the typechecks of api-client, clubs-admin, clubs, id and e2e/core ran and pass. Playwright not run.
Other-repo part done in 68d2ed3 and bead82d.

### AUTH-06 — FIXED

Web part of the api's AUTH-06 (the api's own part, revoking unused links on a password change, is in the api repository). `ActivationPage` (`apps/clubs/src/App.tsx`) reads the link's token once and removes `token` and `t` from the address with `history.replaceState` before `exchangeMagicLink`, keeping `purpose` (and the rest of the query and the hash), as the handoff effect already did; `apps/clubs-admin` and `apps/id` already dropped it.
Test: a new case in `apps/clubs/src/App.test.tsx` (the address the redemption sees and the one left afterwards; checked to fail without the change); the whole file runs and passes (100 tests).
Other-repo part done in 6d13798.

### COMM-02 — FIXED

Web part of the api's COMM-02 (the api part, e-mail for N-15 and the SMS fallback, is a decision logged there). Screen 12's push switch (`apps/clubs/src/profile/NoticesCard.tsx`, `pushRow`) now also needs a non-empty `branding.pushPublicKey`: with PUSH on but no published VAPID key nothing can subscribe (`subscribeToPush` answered «unavailable» silently), so the switch is hidden as R-11-17 hides it with PUSH off. The reminder selector stays (the reminder also arrives in the app, and by e-mail with OPERATIONAL e-mail on); without the key it asks the browser for nothing, as before.
Test: a new case in `NoticesCard.test.tsx` (checked to fail without the change); the profile and notifications suites run and pass (91 tests).
Other-repo part done in 93bb651.

### REL-08 — FIXED

Web part of the api's REL-08 (the api entry stays a decision on a scheduled real-core workflow). (1) The contract copy: `packages/api-client/openapi/openapi.json` now equals the api branch's `docs/openapi/openapi.json` byte for byte and `src/generated/schema.d.ts` is regenerated, done with SCH-01 (see that entry; it brings `familyGroupHolder`, `CLASS_RESTORED`, the restoration route, `HealthResponse.commit` and COMM-05's description). (2) `scripts/e2e-core.sh` no longer defaults `CORE_IMAGE` to `ghcr.io/…/agilityhub-core-api:main`: without `CORE_IMAGE` it stops (exit 2) and asks for the api commit's `sha-<commit>` image, and a `:main` or `:latest` tag is refused; a local image under review (its id or an own tag) still runs. `scripts/core-stack/docker-compose.yml` keeps its `:main` fallback, used only when Compose is run by hand.
Checked: `bash -n`, and the three cases run by hand (unset and `:main` stop with the message; a `sha-` tag goes on to the image check). The real-core suite was not run (no Docker here). Left: the CI check that the copy equals the api snapshot of the paired commit (needs read access to the api repository; the api's REL-08 decision).
Other-repo part done in 1e88729 (script) and 68d2ed3/bead82d (contract copy).

### REL-03 — PARTIAL

Web part of the api's REL-03, item (1): `.github/workflows/ci.yml` no longer cancels runs on `main`. The concurrency group is the ref only for a pull request and the run id for a push, and `cancel-in-progress` is true only for pull requests, as in the api's CI, so every pushed commit keeps a completed run. Checked by parsing the YAML; the workflow did not run here.
Left, to decide: (2) running `scripts/check-production-bundles.mjs` on the build the operator deploys, either a release script (`pnpm build` + the check) the runbook names, or each app's `build` when `VITE_MOCK` is not `1` (the script already takes the dist folders as arguments); this goes with the api's REL-03 decision on CI-built release artifacts. (3) A Playwright smoke against `vite preview` of the clubs build (service worker registration and update, a push subscription): not written here, since Playwright cannot run in this environment and a push subscription needs a decision on what stands in for the push service.
Other-repo part done in 1644ae3 (its message lacks the `fix(<scope>)` prefix: `ci: keep every run on main…`).

### REL-07 — PARTIAL

Web part of the api's REL-07: `.github/dependabot.yml` also watches the `github-actions` ecosystem weekly, as the api repository does, so the workflow actions get update pull requests. Checked by parsing the YAML.
Not done here: pinning `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` and `actions/upload-artifact` (all `@v4`) by commit SHA needs the v4 SHAs looked up on GitHub (no access here; the api pins v7 releases, so copying its SHAs would be an upgrade); once pinned, Dependabot keeps the SHAs current (FE-08 (d)). A gitleaks job like the api's (`gitleaks/gitleaks-action` pinned by SHA) also needs the `GITLEAKS_LICENSE` secret in this repository (NOT-CODE) and a first full-history scan reviewed before it gates `main`. The level that fails `pnpm audit --prod` is the owner's (FE-08 (c)).
Other-repo part done in 72e2524.

### PRIV-01 — NEEDS-DECISION

No code changed. The api entry's option (a), a `/privacy` route in `apps/id`, needs the reviewed platform policy text first. Question: where the policy lives, (a) that route (new page and copy in ca/es/en) or (b) a static page that `PLATFORM_PRIVACY_POLICY_URL` points at (no web change); and its version string.

### AUTH-05 — NEEDS-DECISION

No code changed. The CSP is the api entry's option (c), still open: a header in Caddy or a `<meta http-equiv>` written by each app's build, enforced or report-only first. Only once the build is chosen does the web write the policy (`default-src 'self'`, the inline branding script's hash, the API, Stripe and image origins) and check it on staging in the three SPAs. Same question as CFG-04.

### SEPA-05 — NEEDS-DECISION

No code changed. A collection-date field in D6's generate dialog (`apps/clubs-admin/src/billing/BillingModals.tsx`) depends on the api entry's R-12-12 choice: roll a non-TARGET day forward, refuse it with a 422 that proposes the next business day, or keep it. Until then D6 sends `collectionDate` only after the admin accepts a 422's `earliest`, as today.

### PRIV-05 — NEEDS-DECISION

No code changed. `packages/auth/src/onboarding.tsx:132,176` (the image box's initial state from `GET /me/onboarding`, `imageConsent` sent only when changed) waits for the api entry's choice (2): whose stored IMAGE_USE entries count as the member's own, and whether the api returns the value only for those or adds its source. Once chosen, the box starts unticked otherwise and `imageConsent` is sent on every save.

### CFG-04 — NEEDS-DECISION

No code changed. `apps/clubs/index.html:8-58` and `apps/clubs-admin/index.html:8-58` each carry the inline cached-branding script. Question (with AUTH-05 (c)): emit its sha256 at build time, or move it to a file (it must run before the first paint, so a file means one more blocking request); and whether the policy itself is a `<meta>` from the build or a Caddy header.

### CFG-05 — NEEDS-DECISION

No code changed. Question: whether the hosts publish a `robots.txt` (`Disallow: /` everywhere, or indexing allowed for a club's public pages). Once chosen, each `apps/*/vite.config.ts` emits it explicitly as it emits `favicon.svg` (`public/` is copied only in mock builds).

### COMM-08 — NEEDS-DECISION

No code changed. `apps/clubs/src/UnsubscribePage.tsx:39-45` sends the token on load, as R-11-08 describes the page («que envia el token a `POST /email-unsubscribes`»). Sending it only on a button press stops link scanners and forwarded copies, but adds a tap and new copy in ca/es/en (the page has no mockup); the api left the same choice open for the activation link (AUTH-06, «redeem the link on a button press»). Options: (a) a confirmation button; (b) keep sending on load (the effect is limited to CLUB_NEWS e-mail and the member can turn it back on in 12). It also goes with the RFC 8058 one-click choice of the api entry.

### REL-02 — NEEDS-DECISION

No code changed. Embedding the build's commit in each SPA has more than one form: (a) a `<meta>` in `index.html` from `GITHUB_SHA` or `git rev-parse HEAD` (marking a dirty tree or not); (b) a `version.json` beside it, which FE-07's open option (a), a "new version" notice comparing build ids, could also read. Which one, and where the release build runs (the api's REL-03 decision on CI-built artifacts), decide where the commit comes from.
