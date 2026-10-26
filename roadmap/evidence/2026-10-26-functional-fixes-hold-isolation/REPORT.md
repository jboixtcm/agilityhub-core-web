# Booking test-world isolation — 26 October 2026

The new full CI run failed one existing cancellation test: it observed two hold DELETEs after one click (`28-web-gates-postfix.log`, 752 Clubs tests passed / one failed). The booking helper waited 20 ms after React cleanup and then reset handlers and the fixture. A previous confirmation's delayed cleanup request could cross that boundary, and the reset fixture reused `hold-1`.

## Diagnosis and limits

The evidence-only provenance probe imports the unchanged App and original helper. It holds test A's unmount DELETE before MSW, permits the real 20 ms teardown to finish, then releases A's request after B has opened its own confirmation. B's recorder sees exactly `test-A-cleanup` followed by `test-B-explicit-cancel`, both at `/api/v1/seat-holds/hold-1`. See `controlled-request-provenance.json`. This proves the boundary defect and reproduces the failure mechanism; the original failing full-run log itself does not contain request-owner tags.

The explicit product cancel sets `kept.current = true` before awaiting its DELETE, and unmount cleanup reads that guard. The affected test tree does not use StrictMode. No product lifecycle change was needed. The three newly added INC-99 locale tests are in a separate Vitest worker; direct cross-file state sharing was not established.

## Correction

Only `apps/clubs/src/booking/test-utils.tsx` and the new `apps/clubs/src/booking/test-utils.test.tsx` changed in this fix. The helper captures and tracks the fetch promises used by its clients, lets the unmount timer dispatch, and drains those requests before resetting handlers and fixtures. It waits for both resolved and rejected transports. The fixed 20 ms wait is removed.

The two-case regression leaves a live real App confirmation, delays its cleanup DELETE by 300 ms, and requires that response to have completed before the next case starts. The next case opens another real confirmation and still requires exactly one DELETE for its one-click cancellation. This is intentionally a paired test of the real afterEach boundary. The original cancellation assertions remain unchanged.

## Retained attempts

| Evidence stem in `../2026-10-24-functional-fixes-root/` | Result |
| --- | --- |
| `29-hold-boundary-probe` | Configuration startup failed before tests: evidence config loaded as CJS. Retained, corrected using `.mts`. |
| `30-hold-boundary-probe` | PASS: 2/2 controlled provenance cases; 945 inputs unchanged. |
| `31-hold-isolation-red` | Suite collection failed before tests: this Vitest version has no `describe.sequential`. Retained, changed to the existing default sequential `describe`. |
| `32-hold-isolation-red` | Meaningful RED: 1 passed / 1 failed. B sees the previous response status as undefined instead of 204. 946 inputs unchanged. |
| `33-hold-isolation-green` | GREEN: all 75 booking tests in five files pass. 946 inputs unchanged. |
| `34-hold-isolation-static` | ESLint for both owned files, Clubs TypeScript, Prettier and git diff whitespace pass. 946 inputs unchanged. |

Every execution uses Node 22 and the shared heavy lock through `run-check.py`, with `HEAVY_WAIT_MIN=120`. The adjacent responsive CSS breakpoint change was complete before regression snapshots. Exact commands, full logs, summaries and tested-input manifests are retained with each stem.

The manual-gated provenance probe is historical evidence against the original helper: its gate deliberately opens only in the following test and must not be run against the fixed draining helper, which correctly waits at the boundary. `original-test-utils.tsx.txt` preserves the pre-fix bytes and was checked against the root30 manifest. The normal source regression is the current runnable verification.

Product/source files are frozen after green/static verification. Independent follow-up readback of the parent’s forced full CI run40 confirms 38/38 tasks with zero cache, 3,616 Vitest tests plus 10 Node tests, exit0, and the exact same 946 inputs as focused green33. See `full-ci-crosscheck.json`. The parent owns the subsequent browser reruns. This report makes no hosted, provider or deployment claim.

## Exact commands and output tails

### 30-hold-boundary-probe

```sh
python3 roadmap/evidence/2026-10-24-functional-fixes-root/run-check.py 30-hold-boundary-probe -- corepack pnpm --filter clubs exec vitest run --config ../../roadmap/evidence/2026-10-26-functional-fixes-hold-isolation/vitest.config.mts
```

Exit: `0`. Full log: `../2026-10-24-functional-fixes-root/30-hold-boundary-probe.log`.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - import "../../../apps/clubs/vite.config" without a file extension (../../roadmap/evidence/2026-10-26-functional-fixes-hold-isolation/vitest.config.mts:3:25). Add the file extension
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.0 /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs

Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
 ✓ ../../roadmap/evidence/2026-10-26-functional-fixes-hold-isolation/boundary-probe.test.tsx > test A leaves an active hold; its cleanup DELETE is held before MSW 1209ms
Not implemented: Window's scrollTo() method
 ✓ ../../roadmap/evidence/2026-10-26-functional-fixes-hold-isolation/boundary-probe.test.tsx > test B observes A's pending cleanup and its own one-click cancellation as two DELETEs 266ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  09:32:22
   Duration  4.26s (tests 36%, transform 33%, environment 16%, import 12%, setup 4%)

```

### 32-hold-isolation-red

```sh
python3 roadmap/evidence/2026-10-24-functional-fixes-root/run-check.py 32-hold-isolation-red -- corepack pnpm --filter clubs exec vitest run src/booking/test-utils.test.tsx
```

Exit: `1`. Full log: `../2026-10-24-functional-fixes-root/32-hold-isolation-red.log`.

```text

 RUN  v5.0.0 /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs

Not implemented: Window's scrollTo() method
 ❯ src/booking/test-utils.test.tsx (2 tests | 1 failed) 1331ms
   ❯ booking world teardown keeps a slow hold release in its own test (2)
     × starts after the previous release finishes and records only its own cancellation 315ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/booking/test-utils.test.tsx > booking world teardown keeps a slow hold release in its own test > starts after the previous release finishes and records only its own cancellation
AssertionError: expected undefined to be 204 // Object.is equality

- Expected:
204

+ Received:
undefined

 ❯ src/booking/test-utils.test.tsx:51:37
     49|   it("starts after the previous release finishes and records only its …
     50|     try {
     51|       expect(previousReleaseStatus).toBe(204);
       |                                     ^
     52|       const deletes: string[] = [];
     53|       server.use(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  09:33:41
   Duration  3.40s (tests 40%, transform 34%, environment 13%, import 11%, setup 3%)

undefined
/Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/booking/test-utils.test.tsx
```

### 33-hold-isolation-green

```sh
python3 roadmap/evidence/2026-10-24-functional-fixes-root/run-check.py 33-hold-isolation-green -- corepack pnpm --filter clubs exec vitest run src/booking
```

Exit: `0`. Full log: `../2026-10-24-functional-fixes-root/33-hold-isolation-green.log`.

```text

 RUN  v5.0.0 /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs

Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method

 Test Files  5 passed (5)
      Tests  75 passed (75)
   Start at  09:34:08
   Duration  13.68s (tests 60%, transform 24%, import 8%, environment 7%, setup 2%)

```

### 34-hold-isolation-static

```sh
python3 roadmap/evidence/2026-10-24-functional-fixes-root/run-check.py 34-hold-isolation-static -- bash roadmap/evidence/2026-10-26-functional-fixes-hold-isolation/verify.sh
```

Exit: `0`. Full log: `../2026-10-24-functional-fixes-root/34-hold-isolation-static.log`.

```text
Checking formatting...
All matched files use Prettier code style!
```
