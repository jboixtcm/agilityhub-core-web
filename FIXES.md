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

### WEB-04 — FIXED

`useLoader` (`apps/clubs/src/booking/shared.ts`) takes a fourth `onFocus` flag: the request is read again quietly on focus, `visibilitychange` (visible) and `online`, reusing `useWindowFocus` from the training screen. `useMeHome`, `useBookableClasses`, `useBooking` and `useWaitlistEntry` turn it on; the other screens that share `useLoader` are unchanged.
A read started by the app coming back keeps the rows on screen if it fails (a phone waking up without network yet), instead of replacing them with the error card; explicit quiet reads (04's join, 07's cancellation) still show their error as before.
Tests: `apps/clubs/src/booking/loader.test.tsx` (new, 3 cases; checked to fail without the keep-rows guard), plus the existing booking, history, instructor, courses, training, App and notifications suites, all run and passing.

### WEB-05 — PARTIAL

`DogPhoto` (`packages/ui/src/dog-photo.tsx`) renders its image with `loading="lazy"` and `decoding="async"`, so the admin dog list, the census rows and the instructor's student search fetch a photo only when its row nears the viewport. Its box already has a fixed size (`dog-photo.css`: 2.5 rem, 5 rem large), so no width/height attributes were needed to avoid layout shift.
Test: a new case in `packages/ui/src/dog-photo.test.tsx` (run, passing); the admin census list and instructor suites run and pass.
Left, needs a decision: downscaling before upload in `apps/clubs/src/SelfServicePages.tsx` (`changePhoto`) and in the admin photo upload. Choose the maximum edge (the audit suggests about 1024 px), the format and quality (JPEG vs WebP; PNG transparency), whether EXIF is stripped (it also removes GPS data) and whether the original is kept. Server-side renditions are OTHER-REPO: the api would store a thumbnail next to the original (`AttachmentService`) and expose its URL for list rows.

### WEB-09 — PARTIAL

`BookingDetailPage` (`apps/clubs/src/booking/BookingDetailPage.tsx`): a cancel dialog opened in time now switches to the late warning when `cancellableInTimeUntil` passes while it is still open. A timer is set for that instant and cleared when the dialog closes; delays beyond `setTimeout`'s 24.8-day range are skipped. Before this, the dialog kept the value it computed when it opened.
Test: a new case in `apps/clubs/src/booking/detail.test.tsx` (checked to fail without the timer); the whole file runs and passes (28 tests).
Left: the decision still uses the device clock. Correcting it needs the server's time with the booking, as the seat hold has it. OTHER-REPO: add `serverNow` (date-time) to the `Booking` response of `GET /bookings/{id}`, as `SeatHoldResponse` does; the web would then apply the offset as `useCountdown` does. Rewording the in-time text to "if you cancel before HH:MM" is new copy for 07 (no mockup literal), so it needs a decision.

### WEB-10 — PARTIAL

The i18n loader backend (`packages/i18n/src/backend.ts`, used by clubs, clubs-admin and id) asks a failed locale chunk once more before reporting the error. A dropped connection on a first visit no longer leaves raw keys after a single failure. Unknown namespaces are still refused without loading.
Test: `packages/i18n/src/backend.test.ts` (new, 3 cases); the whole i18n vitest suite runs and passes.
Left, needs a decision: the reload after a deploy (`sw.ts` `skipWaiting` + `clients.claim`, `registerType: "autoUpdate"` in `apps/clubs/vite.config.ts`). Options: keep it and release outside booking peaks; switch to `registerType: "prompt"` with an "update available" notice (new copy); or defer the reload until the page is hidden. A client/API version handshake is a separate choice. Showing a screen error state instead of raw keys after the retry also fails is new UI, so it needs a decision too.
Not code: confirm the reload behaviour on staging with an open tab during a deploy, and schedule releases away from the weekly booking opening.

### WEB-11 — PARTIAL

The back arrows of 07 and the course viewer (`.booking-screen__back`, `apps/clubs/src/booking/booking.css`) and of the self-service pages (`.self-page__header a`, `apps/clubs/src/styles.css`) keep their 32 px look. An invisible `::before` adds 0.375 rem on each side, so they take taps on a 44 px area. Nothing else that can be tapped sits next to them.
Test: a new case in `apps/clubs/src/polish-styles.test.ts`, which can now read `booking.css` too (run, passing).
Left, needs a decision: the 36 × 20 px switch (`.ah-switch`, `packages/ui/src/components.css`). On screen 12 the rows of switches are about 2 rem apart (`.profile-notices` gap 0.75 rem), so a 44 px invisible area would cover the gap. A tap just below one switch would then toggle the next one. Options: more space between the rows of 12 (moves away from the mockup), a larger switch track, or a smaller non-overlapping area (about 32 px tall).
