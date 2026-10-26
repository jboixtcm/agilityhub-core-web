# Independent functional release pass — completed local coverage

Assigned browser coverage is complete: **6 passed and 1 product-red case** across D11 (1), E11 (2) and the four compiled-SPA cases. The red case preserves two confirmed D11 UI defects; it is not marked as an expected failure. Screenshot review adds a smaller stale export-progress message. This report does not claim the product is defect-free or deployed.

All groups used `agilityhub-core-api:review-20261023`, inspected image ID `sha256:1e8060615d372dc826ea431e1cd9ef3733c440d7ce4ecc02199f708e9c6d752e`, linux/arm64. Each group used fresh fictional members and transactions with canonical club configuration. That configuration retains existing public club/contact/payment fields; it is not wholly synthetic. No real member exports, external Learn navigation/authentication, provider action, push or deployment occurred. Only evidence/test harness files changed in this lane.

| Group | Actual result | Input evidence |
|---|---|---|
| D11 real Core | 1/1 passed, 4.8 s, suite exit 0; wrapper 99 explained below | `01-core-d11.*` |
| E11 real Core | 2/2 passed, 12.2 s, suite exit 0; wrapper 99 explained below | `02-core-e11.*` |
| Compiled SPAs on three HTTPS hosts, r4 | 3 passed / 1 failed, 27.7 s, exit 1; two explicit product assertions in the failed case | `03-core-production-r4.*`; all 947 input hashes unchanged |

## What passed and what remains

The compiled run served the actual production bundles for Clubs, admin and ID on `app.example.test`, `admin.example.test` and `id.example.test`. `core-production-r4/distinct-host-results.json` records their hashed asset URLs, three distinct host-only refresh cookies (`Secure`, `HttpOnly`, `SameSite=Strict`, path `/oauth2/token`), only the two club-host cookies remaining after ID logout, and zero uncaught page errors. Each app's deep route survived direct navigation and reload. A member's attempt to read admin parameters returned 403 with no parameter blocks. Loading skeletons were visible; a selected training slot had an enabled Confirm before offline mode disabled it; an online API read restored the grid. A cold branding 503 displayed a readable error and retry recovered the login form.

E11 followed the member's queued ZIP, downloaded it with HTTP 200 and ZIP content type, rejected an immediate repeat, reopened the ready package from N-50 after a fresh tab launch, and rejected an impersonated export. The admin flow queued its own package with `deliverToMember=false`, downloaded it, rendered consent history, scheduled erasure for an eligible departed member and cancelled that request. These are real API/application flows using local storage and fictional people; they are not hosted-provider or live-data checks.

Findings and exact source references are in [FOLLOW_UP_TRIAGE.md](FOLLOW_UP_TRIAGE.md):

- **FR-01, P2:** untranslated `jobs.name.ERASURES` and `jobs.name.RETENTION_SWEEP` labels.
- **FR-02, P2:** the enabled ERASURES switch offers a disable action that returns 404 `JOB_UNKNOWN`, `details.reason=NO_SWITCH`. The API correctly refuses the unsupported action. Both desired UI assertions remain red; `core-production-r4/d11-mandatory-process-observation.json` retains the response.
- **FR-03, P2 test improvement:** the existing D11 label assertion omits process names, which explains its green result despite the visible defects.
- **FR-04, P3 environment improvement:** the browser container uses Node 24.20.0 while the repository declares Node >=22 <23. This pass is not Node 22 coverage.
- **FR-05, P3 demo preparation:** runtime DOM shows external Learn and public Clubs links on ID `/products`, and the module-gated Learn entry on the member profile. No link was followed. Disable `LEARN_LINK` in the separate demo club configuration and decide how the ID catalogue should present external products; the club switch alone does not hide the ID card. This is navigation clarity, not proof of shared identity or a requirement to deploy Learn.
- **FR-06, P3:** admin export progress copy remains “preparing” beside a ready, downloadable ZIP.

Coordinator demo note F04 / INC-94: the canonical API seed's approved public bank/Bizum destinations remain unchanged. Replace them in a separate demo configuration before external exposure. The current-consent/history inconsistency already found by the web lane is also visible in E11's D10 captures; it is not counted as a separate discovery here.

## Visual inspection

| Inspected capture | Observation |
|---|---|
| `core-d11/D11-parametres-core-1280.png` | Full parameter page; two raw process labels, no observed parameter-key leak or clipping |
| `core-production-r4/compiled-d11-mandatory-process-dialog-viewport.png` | Readable 1280 px viewport showing the raw process name and localized rejection |
| `core-production-r4/compiled-id-products-1280.png` and `compiled-member-profile-learn-link-375.png` | External product cards/profile link visible; DOM hrefs retained separately |
| `core-production-r3/compiled-member-training-loading-375.png` and `compiled-member-training-offline-375.png` | Loading skeleton, preserved offline grid and stale notice |
| `core-production-r4/compiled-member-training-recovered-375.png` | Chosen slot retained and enabled confirmation restored |
| `core-production-r3/compiled-branding-error-375.png` and `compiled-branding-recovered-375.png` | Readable outage retry and recovered login form |
| `core-production-r4/compiled-id-logout-1280.png` | Signed-out ID form after server revoke |
| `core-e11/12-dades-personals-ready-core-375.png` and `12-dades-n50-core-375.png` | Ready ZIP, expiry date and working download after notification launch |
| `core-e11/D10-paquet-rgpd-core-1280.png` and `D10-supressio-programada-core-1280.png` | Ready admin ZIP, erasure schedule/cancel control; stale progress copy and known consent mismatch visible |

## Harness corrections and provenance

Earlier attempts remain intact: initial `03-core-production` exited 1 before browser tests because Playwright resolved the server command from the config directory; r2 exited 1 before tests because CommonJS rejected `import.meta.dirname`. The evidence config now has explicit repository cwd using `__dirname`, verified by `--list`. R3 executed all four cases (one pass, three failures): it reproduced the D11 product defects, but first stopped on an insecure cookie from an HTTP upstream and the offline case raced a delayed route callback during unroute. These two were harness errors. R4 sanitizes forwarding headers and trusts only the dedicated proxy address `172.31.247.11` on its disposable network, and waits for interception callbacks before removing them. Cookie assertions were not weakened. The read-only Compose merge check is `00-production-compose-r4.*`.

D11 wrapper 99 reflects one added unrelated test, `e2e/core/functional-auth.spec.ts`, while queued/running; all 939 existing files stayed unchanged. E11 wrapper 99 reflects only the coordinated changes to `e2e/core/e4-core.spec.ts` and `e5-core.spec.ts`; all 938 other inputs stayed unchanged, with no additions/removals. E11's own test, imported helpers, application source and configuration did not change. The precise path deltas and before/after input hashes are retained; the original summary files were not rewritten, and these suites were not repeated for unrelated inventory changes.

The HTTPS proxy is an evidence harness serving compiled assets, not Caddy. The test browser trusts only a generated certificate's public-key fingerprint; no public CA, external DNS, hosted TLS, amd64 runtime, Safari/Firefox or live-provider claim is made. Core uses its local profile. No extra disabled-module browser scenario was added to these four cases. Authentication traces were disabled for compiled/E11 runs; only cookie attributes were recorded, never values. The generated local TLS key/certificate and disposable containers were removed. No PEM/key/trace ZIP is retained in this folder. `04-cleanup.json` confirms no owned containers, networks or volumes remain.

The 26 prior mock skips were all traced to opt-in visual galleries (8+2 member, 12+4 admin), not 26 failing or skipped backend flows. The retained arm64 scan has 58 package findings / 47 distinct CVEs (54 MEDIUM, 4 LOW, no CRITICAL/HIGH) from cached 22-October advisories. The single Java fixed-version recommendation concerns OGNL; follow-up and compatibility caveats are in `FOLLOW_UP_TRIAGE.md` and `vulnerability-triage.json`. No dependency, advisory allowlist or scanner result was changed.

## Exact final commands and output tails

Commands ran from `/Users/jordib/dev/agilityhub/agilityhub-core-web`. The runner records the image check, input hashes, full output and actual process exit. Host-heavy work used `HEAVY_WAIT_MIN=120`, with separate disposable groups and lock release between them.

### D11 — suite exit 0, wrapper 99

```sh
env HEAVY_WAIT_MIN=120 CORE_IMAGE=agilityhub-core-api:review-20261023 CORE_PROJECT_NAME=agilityhub-functional-release-d11 /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh bash scripts/e2e-core.sh 2026-10-23-functional-release/core-d11 d11-core.spec.ts
```

Full output: `01-core-d11.log`. Last 40 lines:

```text
+ eslint-import-resolver-typescript 4.4.5
+ eslint-plugin-import 2.32.0
+ eslint-plugin-jsx-a11y 6.10.2
+ eslint-plugin-react 7.37.5
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
Done in 6.6s using pnpm v9.15.9
[WebServer] (node:116) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

[WebServer] (node:196) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:291) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
[WebServer] (node:392) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)


[WebServer] (node:487) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

Running 1 test using 1 worker

[1/1] e2e/core/d11-core.spec.ts:60:5 › T-02-13 E4-W06 D11 on the published core names every block and parameter (no raw keys)
  1 passed (4.8s)
```

### E11 — suite exit 0, wrapper 99

```sh
env HEAVY_WAIT_MIN=120 CORE_IMAGE=agilityhub-core-api:review-20261023 CORE_PROJECT_NAME=agilityhub-functional-release-e11 /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh bash scripts/e2e-core.sh 2026-10-23-functional-release/core-e11 'e11-core.spec.ts --trace=off'
```

Full output: `02-core-e11.log`. Last 40 lines:

```text
+ eslint-plugin-import 2.32.0
+ eslint-plugin-jsx-a11y 6.10.2
+ eslint-plugin-react 7.37.5
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

Running 2 tests using 1 worker

[1/2] e2e/core/e11-core.spec.ts:163:5 › E11-W01 · T-14-17: screen 12 follows and downloads the member's ZIP, N-50 opens it again from a fresh launch; impersonation is refused
[2/2] e2e/core/e11-core.spec.ts:297:5 › E11-W01 · T-14-17/T-14-18/R-14-18: D10 queues the admin data package, schedules and cancels erasure and renders consent history
  2 passed (12.2s)
```

### Compiled HTTPS — suite and wrapper exit 1 (product assertions)

```sh
env HEAVY_WAIT_MIN=120 CORE_IMAGE=agilityhub-core-api:review-20261023 CORE_PROJECT_NAME=agilityhub-functional-release-production-r4 /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 /Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-23-functional-release/with-https-compose.py bash scripts/e2e-core.sh 2026-10-23-functional-release/core-production-r4 '--config=roadmap/evidence/2026-10-23-functional-release/playwright.production.config.ts production-functional.spec.ts'
```

Full output: `03-core-production-r4.log`. Last 40 lines:

```text
    - Array []
    + Array [
    +   "jobs.name.ERASURES",
    +   "jobs.name.RETENTION_SWEEP",
    + ]

      178 |   await page.screenshot({ path: join(evidence, 'compiled-d11-mandatory-process-dialog-viewport.png'), fullPage: false });
      179 |   await context.close();
    > 180 |   expect.soft(raw, 'All automatic-process labels must be translated').toEqual([]);
          |                                                                       ^
      181 |   expect.soft(answer.status(), 'The UI must not offer a non-switchable action that returns JOB_UNKNOWN').not.toBe(404);
      182 | });
      183 |
        at /work/roadmap/evidence/2026-10-23-functional-release/production-functional.spec.ts:180:71

    Error: The UI must not offer a non-switchable action that returns JOB_UNKNOWN

    expect(received).not.toBe(expected) // Object.is equality

    Expected: not 404

      179 |   await context.close();
      180 |   expect.soft(raw, 'All automatic-process labels must be translated').toEqual([]);
    > 181 |   expect.soft(answer.status(), 'The UI must not offer a non-switchable action that returns JOB_UNKNOWN').not.toBe(404);
          |                                                                                                              ^
      182 | });
      183 |
        at /work/roadmap/evidence/2026-10-23-functional-release/production-functional.spec.ts:181:110

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    ../evidence/2026-10-23-functional-release/core-production-r4/test-results/production-functional-D11--37e07--no-unusable-disable-action/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: ../evidence/2026-10-23-functional-release/core-production-r4/test-results/production-functional-D11--37e07--no-unusable-disable-action/error-context.md


  1 failed
    roadmap/evidence/2026-10-23-functional-release/production-functional.spec.ts:156:5 › D11 mandatory privacy processes have translated labels and no unusable disable action 
  3 passed (27.7s)

```
