# Final real-Core profile runs

Each command used the shared heavy lock, a fresh fictional seed, the exact reviewed API image and local fake providers. Prior attempts are retained separately and are not double-counted.

All stages use the same final product/API source. E2/E4/E5 retain the 946-input baseline; E3/E6/E7 add only the local outbox readiness helper/test and its e2e-core.sh call (948 inputs). Final E8 uses those same readiness files plus its test-only passwordless-owner magic-link helper and atomic mailbox-file filter (948 inputs). Exact stage manifests are retained; earlier successes are not relabelled as later-source reruns.

## e2-r5

Exit 0; 5 passed, zero failed/skipped/not-run; 946 inputs unchanged; owned resources removed.

Shared-lock invocation:

```sh
env PATH=/opt/homebrew/opt/node@22/bin:$PATH HEAVY_WAIT_MIN=120 bash '/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh' python3 roadmap/evidence/2026-10-24-functional-fixes-web/run-core.py e2-r5 sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9
```

Executed stage command:

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-web-e2-r5 pnpm e2e:core 2026-10-24-functional-fixes-web/core-e2-r5 'e2-core.spec.ts --trace=off'
```

Last 40 lines:

```text
+ eslint-plugin-react-hooks 7.1.1
+ globals 17.12.0
+ husky 9.1.7
+ i18next-parser 9.4.0
+ lint-staged 17.5.0
+ msw 2.15.0
+ prettier 3.9.6
+ size-limit 13.0.3
+ turbo 2.10.12
+ typescript 5.9.3
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 7.7s using pnpm v9.15.9
[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:294) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

Running 5 tests using 1 worker

[1/5] e2e/core/e2-core.spec.ts:263:5 › T-03-42 real census flow, booking block and member profile
[2/5] e2e/core/e2-core.spec.ts:455:5 › T-05-22/T-05-25 real catalog create, edit and deactivate round trips
[3/5] e2e/core/e2-core.spec.ts:540:5 › T-02-13/T-14-26 real parameter history, export and audit
[4/5] e2e/core/e2-core.spec.ts:627:5 › T-05-CP-07 real club page edit renders styled Markdown on screen 30
[5/5] e2e/core/e2-core.spec.ts:680:5 › T-03-40 E3-W12 step 4 · screen 13 reads GET /me/dogs only: the seed's document types, «Nivell» per dog, no /parameters (S03 §6)
  5 passed (20.2s)
```

## e3-r5

Exit 0; 5 passed, zero failed/skipped/not-run; 948 inputs unchanged; owned resources removed.

Shared-lock invocation:

```sh
env PATH=/opt/homebrew/opt/node@22/bin:$PATH HEAVY_WAIT_MIN=120 bash '/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh' python3 roadmap/evidence/2026-10-24-functional-fixes-web/run-e3-observed-r5.py sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9
```

Executed stage command:

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-web-e3-r5 pnpm e2e:core 2026-10-24-functional-fixes-web/core-e3-r5 'e3-signup.spec.ts --trace=off'
```

Last 40 lines:

```text
+ eslint-plugin-react-hooks 7.1.1
+ globals 17.12.0
+ husky 9.1.7
+ i18next-parser 9.4.0
+ lint-staged 17.5.0
+ msw 2.15.0
+ prettier 3.9.6
+ size-limit 13.0.3
+ turbo 2.10.12
+ typescript 5.9.3
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 4.4s using pnpm v9.15.9

[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:193) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:294) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

Running 5 tests using 1 worker

[1/5] e2e/core/e3-signup.spec.ts:733:5 › T-02-07 E3-W12 step 5 · the signup's public footer shows /branding's identity and registered office (S02 R-02-02)
[2/5] e2e/core/e3-signup.spec.ts:751:5 › T-04-34 public signup is validated and enters through the N-02 welcome link @critical-alta
[3/5] e2e/core/e3-signup.spec.ts:2102:5 › T-04-34 rejected signup delivers N-03 @critical-alta
[4/5] e2e/core/e3-signup.spec.ts:2109:5 › T-04-34 active member adds a dog and the club validates it @critical-alta
[5/5] e2e/core/e3-signup.spec.ts:2113:5 › T-04-34 signup.enabled=false shows only the configured closed text
  5 passed (40.8s)
```

## e4

Exit 0; 7 passed, zero failed/skipped/not-run; 946 inputs unchanged; owned resources removed.

Shared-lock invocation:

```sh
env PATH=/opt/homebrew/opt/node@22/bin:$PATH HEAVY_WAIT_MIN=120 bash '/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh' python3 roadmap/evidence/2026-10-24-functional-fixes-web/run-core.py e4 sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9
```

Executed stage command:

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-web-e4 pnpm e2e:core 2026-10-24-functional-fixes-web/core-e4 'e4-core.spec.ts --trace=off'
```

Last 40 lines:

```text
+ husky 9.1.7
+ i18next-parser 9.4.0
+ lint-staged 17.5.0
+ msw 2.15.0
+ prettier 3.9.6
+ size-limit 13.0.3
+ turbo 2.10.12
+ typescript 5.9.3
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 4.4s using pnpm v9.15.9

[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:294) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


Running 7 tests using 1 worker

[1/7] e2e/core/e4-core.spec.ts:539:5 › T-06-28 E2E (a) D3: the three seeded templates, «Setmana B» blocked by its inconsistency, «Setmana A» generates the proposed week, D3b per ring
[2/7] e2e/core/e4-core.spec.ts:674:5 › T-06-28 E2E (b) D4: «Esborrany» opens the seeded draft week, [VALIDAR LA SETMANA], the D4c modal with the 4 registrants (200), «Anul·lades», ring blocks (409 then 201)
[3/7] e2e/core/e4-core.spec.ts:858:5 › T-06-28 E2E (c) screens 10 and 23: the member never sees the cancelled class nor counts, the validated week is visible; the instructor sees the block, the dimmed class and n/n
[4/7] e2e/core/e4-core.spec.ts:913:5 › T-07-32 E2E (d) D7: the four seeded activities, the Torneig blocks every ring on D4, a new seminar published over a class with the conflict dialog; D7 exports against the core
[5/7] e2e/core/e4-core.spec.ts:1158:5 › T-07-32 E2E (e) ca: 04 → detail → register → 03 → cancel in time; the waitlist of the full «Seminari de handling» and the FIFO promotion when the admin adds a place
[6/7] e2e/core/e4-core.spec.ts:1330:5 › T-07-32 E2E (e) es: the same member flow with the es literals, a second FIFO promotion, then the admin cancels the seminar (200) and the registrant reads «cancel·lada pel club»
[7/7] e2e/core/e4-core.spec.ts:1520:5 › E4-W05 step 7 · the «Excel · PDF» menus of D5 and D7 with EXPORT_TOO_LARGE and while an export is pending
  7 passed (33.7s)
```

## e5

Exit 0; 11 passed, zero failed/skipped/not-run; 946 inputs unchanged; owned resources removed.

Shared-lock invocation:

```sh
env PATH=/opt/homebrew/opt/node@22/bin:$PATH HEAVY_WAIT_MIN=120 bash '/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh' python3 roadmap/evidence/2026-10-24-functional-fixes-web/run-core.py e5 sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9
```

Executed stage command:

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-web-e5 pnpm e2e:core 2026-10-24-functional-fixes-web/core-e5 'e5-core.spec.ts --trace=off'
```

Last 40 lines:

```text
+ prettier 3.9.6
+ size-limit 13.0.3
+ turbo 2.10.12
+ typescript 5.9.3
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 4.2s using pnpm v9.15.9
[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:294) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


Running 11 tests using 1 worker

[1/11] e2e/core/e5-core.spec.ts:932:5 › E5-W04 step 2 · the automatic processes off, POST /test/clock to demoNow, and the parameters the flows read @critical-reserva
[2/11] e2e/core/e5-core.spec.ts:1005:7 › week 0 at demoNow › T-08-40 (a)(b) · 03 and 04 from the seed, a booking inside the 30 s hold, an in-time and a late cancellation @critical-reserva
[3/11] e2e/core/e5-core.spec.ts:1117:7 › week 0 at demoNow › T-08-40 (c) · 06 swaps the week's booking in one step; without a swappable one, 29
[4/11] e2e/core/e5-core.spec.ts:1238:7 › week 0 at demoNow › T-08-40 (d) · ALL_AT_ONCE: join a full class, a seat released more than 30 min ahead, NOTIFIED, claim @critical-reserva
[5/11] e2e/core/e5-core.spec.ts:1368:7 › week 0 at demoNow › T-08-40 (g) · the same flows in es: (a) a booking inside the hold, on 03; (d) a waiting entry, gone from 04 and on 03, claimed
[6/11] e2e/core/e5-core.spec.ts:1472:7 › week 0 at demoNow › T-09-40 (e) · 08 counts 3/week in the day+3 window with «Qualsevol»; 24 blocks a ring, never over bookings
[7/11] e2e/core/e5-core.spec.ts:1764:7 › week 0 at demoNow › E5-W04 step 5 · the core's statuses for JOB_UNKNOWN, SLOT_NOT_ON_GRID, DOG_ALREADY_BOOKED and OVERRIDE_NOT_ALLOWED
[8/11] e2e/core/e5-core.spec.ts:1838:7 › week 0 at demoNow › T-15-32/T-15-33 (f) · D11 simulates (nothing changes) and runs the risk review; D1 reports it; P9 by its run
[9/11] e2e/core/e5-core.spec.ts:1969:5 › R-09-05 · 08 counts by session date: on Sunday the day+3 window reaches the next week, and a Monday booking moves only Monday's counter
[10/11] e2e/core/e5-core.spec.ts:2044:5 › R-15-11 (f) · P1 with the clock advanced: NOT_YET_OPEN before Sunday 20:00, BOOKABLE by the clock at 20:01, and [Executa ara] opens the week
[11/11] e2e/core/e5-core.spec.ts:2151:5 › E5-W05 round 2 · E75 · GET /training-bookings?q= and GET /ring-blocks?q= answer the matching rows on the core and narrow both tabs of «Entrenaments»; GET /bookings/filter-values labels every value
  11 passed (56.9s)
```

## e6

Exit 0; 14 passed, zero failed/skipped/not-run; 948 inputs unchanged; owned resources removed.

Shared-lock invocation:

```sh
env PATH=/opt/homebrew/opt/node@22/bin:$PATH HEAVY_WAIT_MIN=120 bash '/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh' python3 roadmap/evidence/2026-10-24-functional-fixes-web/run-core.py e6 sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9
```

Executed stage command:

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-web-e6 pnpm e2e:core 2026-10-24-functional-fixes-web/core-e6 'e6-core.spec.ts --trace=off'
```

Last 40 lines:

```text
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 4.4s using pnpm v9.15.9
[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:294) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


Running 14 tests using 1 worker

[1/14] e2e/core/e6-core.spec.ts:1202:5 › E6-W04 step 2 · preflight (S10 answers), the processes off, POST /test/clock to Monday 04:00 and the parameters the flows read @critical-llista
[2/14] e2e/core/e6-core.spec.ts:1318:7 › Monday 04:00 › T-10-28 (f) 22 · the seeded month gives the card's metrics (86%, 7 classes, 2,3 a week) and its three blocks, before anything is marked
[3/14] e2e/core/e6-core.spec.ts:1377:7 › Monday 04:00 › T-10-27 T-10-23 (a)(c) 20 → 21 · the seeded class, Rita present and Nil «no presentat» against the second instructor's save: 409 STALE_VERSION, the merge keeps them, the second [DESA] saves @critical-llista
[4/14] e2e/core/e6-core.spec.ts:1511:7 › Monday 04:00 › T-10-11 T-10-27 (b) R-10-05 · «ha avisat» more than 4 h ahead: CANCELLED, the seat released, the waitlist notified; the row stays, final and inert @critical-llista
[5/14] e2e/core/e6-core.spec.ts:1597:7 › Monday 04:00 › T-10-29 (d) D12 · the week with the class, a training at half height and a block; the panel cycles Martí to «present» through the same contract; the week PDF
[6/14] e2e/core/e6-core.spec.ts:1722:7 › Monday 04:00 › T-10-28 T-10-15 (f) 26 → D13 → 13 · a task with a real signed upload, edited, done and reopened; D13 shows it with the counters; Rita sees it on her screens, completes it as a member, and no /me answer carries DOG_OBSERVATIONS
[7/14] e2e/core/e6-core.spec.ts:1992:7 › Monday 04:00 › T-10-30 T-10-18 (h) D14 · per-account unread marks: instructor A reads the member's note, unread for instructor B too, and then everything; B still has them unread (the note after A's read as well), never the task she wrote; D14's filter values and search on the core
[8/14] e2e/core/e6-core.spec.ts:2210:7 › Monday 04:00 › T-10-02 T-10-15 T-10-22 E6-W04 step 5 · the core's statuses for ATTENDANCE_NOTIFIED_FINAL, TASK_ALREADY_DONE (a second completion), TASK_NOT_DONE and a member's read of the instructor card
[9/14] e2e/core/e6-core.spec.ts:2257:7 › Monday 04:00 › T-10-01 T-10-11 T-10-22 E6-W04 review #3 · the core's statuses for ATTENDANCE_NOT_OPEN (Tuesday's class), ATTENDANCE_BOOKING_NOT_ACTIVE (a late-cancelled booking, as ADMIN), INSTRUCTOR_NOTICE_DISABLED (the parameter off) and IMPERSONATION_DENIED (an impersonated GET /instructor/day and GET /followup)
[10/14] e2e/core/e6-core.spec.ts:2402:5 › (e) P8 at 09:46 from D11: the dry run plans the class and the waiting entry and writes nothing; the run finishes it, the sheet stays markable and the entry leaves the waitlist @critical-llista
[11/14] e2e/core/e6-core.spec.ts:2518:5 › T-10-26 (e) P3 at Tuesday 08:00 from D11: Nil's row says «avís ja enviat», one N-19, and a second run sends nothing new
[12/14] e2e/core/e6-core.spec.ts:2716:5 › T-10-31 (g) 25 · Rita's history: the Monday class «feta», the seeded no-show, the club's cancellation with its message, the late cancellation; Alba's notice never on her account; an activity row with its activityId links the activity's page @critical-llista
[13/14] e2e/core/e6-core.spec.ts:2785:5 › (i) es · T-10-32 on real data: 20 and 21 in Spanish (a save round trip that leaves the states), and 25's badges and detail lines
[14/14] e2e/core/e6-core.spec.ts:2842:5 › T-10-01 T-10-27 E6-W04 review #3 · at Wednesday 00:00 the Monday sheet is closed to an instructor: 21's circles inert, and a PUT answers 422 ATTENDANCE_WINDOW_CLOSED with its editableUntil; nothing changes
  14 passed (37.7s)
e6 notifications: /Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-24-functional-fixes-web/core-e6/e6-notifications.json
```

## e7

Exit 0; 11 passed, zero failed/skipped/not-run; 948 inputs unchanged; owned resources removed.

Shared-lock invocation:

```sh
env PATH=/opt/homebrew/opt/node@22/bin:$PATH HEAVY_WAIT_MIN=120 bash '/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh' python3 roadmap/evidence/2026-10-24-functional-fixes-web/run-core.py e7 sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9
```

Executed stage command:

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-web-e7 pnpm e2e:core 2026-10-24-functional-fixes-web/core-e7 'e7-core.spec.ts --trace=off'
```

Last 40 lines:

```text
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 4s using pnpm v9.15.9
[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:294) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

Running 11 tests using 1 worker

[1/11] e2e/core/e7-core.spec.ts:1340:5 › E7-W03 steps 1–2 · preflight (the S11 answers, the VAPID key, the jobs, the core's build), the processes off, POST /test/clock to demoNow (Monday 07:00) or, without it, the reason (c), (d) and (h) skip; the parameters and the scene read from the core
[2/11] e2e/core/e7-core.spec.ts:1428:5 › T-11-35 (b) R-11-15 · screen 12: the second registrant picks «Castellano» (PATCH /me {locale: es} → 200) before the cancellation — the seed has no es account
[3/11] e2e/core/e7-core.spec.ts:1456:5 › T-11-39 (a)(b)(g) R-11-01 R-11-02 R-11-10 R-11-11 · D4c cancels the seeded class → N-08a on 11 first with the x icon, ERROR tone, its border and « · i per SMS», the bell quiet after read-all, [CANVIA DE CLASSE] → 04 with her dog; the mailbox message per registrant; the es registrant in Spanish; the SMS delivery
e2e/core/e7-core.spec.ts:1456:5 › T-11-39 (a)(b)(g) R-11-01 R-11-02 R-11-10 R-11-11 · D4c cancels the seeded class → N-08a on 11 first with the x icon, ERROR tone, its border and « · i per SMS», the bell quiet after read-all, [CANVIA DE CLASSE] → 04 with her dog; the mailbox message per registrant; the es registrant in Spanish; the SMS delivery
real SMS skipped: no Twilio credentials on the local stack, fictional numbers

[4/11] e2e/core/e7-core.spec.ts:1658:5 › T-11-37 (c) R-11-12 · D9 edits N-08a's ca and es bodies with the run's marker, [DESA] → 200; the next cancellation carries it in each registrant's language while the cards of (a)/(b) stay as they were; «Restaura el text per defecte» → not customized
[5/11] e2e/core/e7-core.spec.ts:1817:5 › T-11-35 T-11-38 (d) R-11-03 R-11-04 · screen 12 turns «Canvis en reserves…» off under «Correu»: the next N-08a reaches the feed with « · i per SMS» and no e-mail, the log shows EMAIL «omès per preferència» and APP «lliurat»; D10 turns it back on and 12 shows it
[6/11] e2e/core/e7-core.spec.ts:1968:5 › T-11-35 (f) R-11-07 · web push in context: no permission prompt at boot nor on 12; turning the push switch on asks once and POST /push-subscriptions → 201 with the stubbed PushManager.subscribe
[7/11] e2e/core/e7-core.spec.ts:2097:5 › T-11-38 T-11-18 (e) R-11-13 · D5 selects the ten fictional members, «Enviar comunicat» with the seeded CUSTOM template, «S'enviarà a 10 abonats», [ENVIA] → 202; the log lists ten rows of one batch and no other recipient; one of them sees it in her feed, admin@ (not selected) does not; the filter shape counts what D5 lists; the push subscription is deleted at logout
[8/11] e2e/core/e7-core.spec.ts:2393:5 › T-11-12 T-11-16 T-11-18 T-11-20 T-11-21 E7-W03 step 5 · the core's codes and statuses for STALE_VERSION, TEMPLATE_MANDATORY, CHANNEL_NOT_ALLOWED, TEMPLATE_NOT_CATALOG, TEMPLATE_NOT_SENDABLE, NO_RECIPIENTS, INVALID_REMINDER_OPTION and PUSH_SUBSCRIPTION_INVALID
[9/11] e2e/core/e7-core.spec.ts:2520:5 › T-11-36 T-11-34 T-11-35 (i) R-11-14 · screen 30: the FAQ groups in R-05-22's order, the exclusive accordion and «Normes»; the es pass of 11 and 12: « · y por SMS», [CAMBIAR DE CLASE] and the preference rows in Spanish
[10/11] e2e/core/e7-core.spec.ts:2590:5 › T-11-35 (h) R-11-16 R-15-14 · «Recordatori de classe: 2 h abans» on 12, the clock two hours before her class, D11's [Simula] lists her booking and changes nothing, [Executa ara] gives one N-13 with the clock icon and no e-mail, a second run gives none
[11/11] e2e/core/e7-core.spec.ts:2705:5 › (j) cleanup for idempotence · the reminder back to «Mai», the run's booking cancelled, the es member back to Catalan; the template is the seed's, the matrix restored and the push subscription deleted
  11 passed (33.4s)
e7 notifications: /Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-24-functional-fixes-web/core-e7/e7-notifications.json
```

## e8-r3

Exit 0; 6 passed, zero failed/skipped/not-run; 948 inputs unchanged; owned resources removed.

Shared-lock invocation:

```sh
env PATH=/opt/homebrew/opt/node@22/bin:$PATH HEAVY_WAIT_MIN=120 bash '/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh' python3 roadmap/evidence/2026-10-24-functional-fixes-web/run-core.py e8-r3 sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9
```

Executed stage command:

```sh
env CORE_IMAGE=agilityhub-core-api:review-fixes-20261024 CORE_PROJECT_NAME=agilityhub-functional-fixes-web-e8-r3 pnpm e2e:core 2026-10-24-functional-fixes-web/core-e8-r3 'e8-core.spec.ts --trace=off'
```

Last 40 lines:

```text
+ husky 9.1.7
+ i18next-parser 9.4.0
+ lint-staged 17.5.0
+ msw 2.15.0
+ prettier 3.9.6
+ size-limit 13.0.3
+ turbo 2.10.12
+ typescript 5.9.3
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 6.2s using pnpm v9.15.9

[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:294) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

Running 6 tests using 1 worker

[1/6] e2e/core/e8-core.spec.ts:955:5 › E8-W04 T-13-32 (e·1): screen 14 request → her class inside the period booked → «Inactivitats» → D10 approval cancels it → 04 shows it NOT_BOOKABLE{INACTIVITY}; D5/D10 «inactiva fins» @critical-remesa
[2/6] e2e/core/e8-core.spec.ts:1181:5 › E8-W04 T-13-32 (e·2) in es: her inactivity fee simulated (R-13-08) → 15 → «Baixes» → D10 approval → D5 «baixa dd/mm» and «Baixes previstes»; the ungenerated month after the leave no longer bills her, the leave's month still does (R-13-11) @critical-remesa
[3/6] e2e/core/e8-core.spec.ts:1343:5 › E8-W04 (d) R-12-23/24 pack: a 04 booking consumes one session, an in-time 07 cancellation returns it, 13 shows both; the expired pack stays unusable
[4/6] e2e/core/e8-core.spec.ts:1466:5 › E8-W04 T-12-27 (a)(b) + step 3 + step 5: simulate → generate → XML → returned → rollback → same numbers; cash paid; accounting export; GET /invoices timings @critical-remesa
[5/6] e2e/core/e8-core.spec.ts:1910:5 › E8-W04 (f) T-13-24 / T-12-21: instructor gates, another member's /me/…/{id} (also a family member's) is not found, nothing secret rendered
[6/6] e2e/core/e8-core.spec.ts:2002:5 › E8-W04 (c) card leg on the fictional Stripe club: [COBRA LES TARGETES] → 202 → CHARGING settles on its own (6b(a)) → «cobrat»; invalid-card fallback → [Actualitza la targeta] → checkout
E8 fake card: payment_intent.succeeded delivered (provider reference redacted)
  6 passed (2.1m)
```
