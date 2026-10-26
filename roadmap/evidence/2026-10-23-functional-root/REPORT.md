# Extended local functional review — session exploration

User-requested extension before deployment. Product code unchanged; new functional test only. Same final local arm64 API image used by the previous review, fictional seed and local providers. Each new browser context has independent cookies; the multi-tab case deliberately shares one context. No Learn integration, hosted deployment or live provider activity.

## Results

All 3 new real-API browser tests pass (9.7 seconds), no skips.

- T-01-04 / R-01-06: three browser tabs perform two concurrent restoration rounds, all six refreshes return 200 and all account reads succeed. Web Locks are present; refresh cookie is HttpOnly with the expected path; no JWT is found in local/session storage.
- T-01-04 / T-01-22: logout returns 200, the other tab cannot restore and returns to login on reload. An already issued access token still returns 200 immediately afterward; this is the explicitly accepted <=15 minute window in S01 R-01-10, not a new defect or a test expecting instant bearer revocation. This run does not independently wait 15 minutes to measure expiry.
- T-01-20: one injected 503 at the refresh endpoint keeps the protected route and avoids a spurious login form; the real retry returns 200 and restores /perfil. All subsequent requests use the real local API.

Artifacts: auth/three-tabs.json, auth/peer-logout.json and auth/transient-refresh.json. No bearer/cookie/password values are written to these summaries.

## Visual inspection and limits

Root opened auth/peer-logout-375.png and auth/recovered-profile-375.png. The signed-out screen is readable, and the recovered profile shows the expected member, controls and language selector in the 375 px viewport. The profile capture is a viewport, not a full-page visual audit. These are Vite development pages on 127.0.0.1; distinct-host production SPA/cookie checks belong to the release lane.

The suite honors the accepted access-token policy. Immediate cross-tab UI clearing or shortening that policy would be a separate product change, not an unproven security fix.

## Commands and exact final output

### 01-auth-lint

Command: `corepack pnpm exec eslint e2e/core/functional-auth.spec.ts --max-warnings 0`

Exit: **0**. Full output: [01-auth-lint.log](01-auth-lint.log). Last 40 lines:

```text
(no output)
```

### 02-auth-types

Command: `corepack pnpm typecheck:e2e-core`

Exit: **0**. Full output: [02-auth-types.log](02-auth-types.log). Last 40 lines:

```text

> agilityhub-core-web@0.0.0 typecheck:e2e-core /Users/jordib/dev/agilityhub/agilityhub-core-web
> tsc -p e2e/core/tsconfig.json --noEmit

```

### 03-auth-real-core

Command: `HEAVY_WAIT_MIN=120 CORE_IMAGE=agilityhub-core-api:review-20261023 bash /Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh bash scripts/e2e-core.sh 2026-10-23-functional-root/auth functional-auth.spec.ts`

Exit: **0**. Full output: [03-auth-real-core.log](03-auth-real-core.log). Last 40 lines:

```text
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
Done in 6.5s using pnpm v9.15.9

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


Running 3 tests using 1 worker

[1/3] e2e/core/functional-auth.spec.ts:54:5 › T-01-04 R-01-06 functional: three real browser tabs restore and rotate twice without revoking the family
[2/3] e2e/core/functional-auth.spec.ts:105:5 › T-01-04 T-01-22 functional: logout invalidates the shared family and another tab cannot restore it
[3/3] e2e/core/functional-auth.spec.ts:154:5 › T-01-20 functional: one transient refresh503 preserves the route and recovers without another login
  3 passed (9.7s)
```

### 04-final-auth-lint

Command: `corepack pnpm exec eslint e2e/core/functional-auth.spec.ts --max-warnings 0`

Exit: **0**. Full output: [04-final-auth-lint.log](04-final-auth-lint.log). Last 40 lines:

```text
(no output)
```


`auth-tested-inputs.json` preserves the final test and relevant unchanged product/harness hashes. The new test was checked against S01 before execution: an initial draft incorrectly expected immediate rejection of an old bearer; that assertion was corrected before the browser run to reflect R-01-10. No failing product behavior was hidden by a retry.

## Consolidation and product integrity

The coordinator independently inspected the legacy-consent and D11 screenshots, mobile signup/family/payment/closed states, Spanish member/admin activity waitlists, the impersonation banner/tasks, offline recovery, ID product links, the mandatory-job rejection, the ready privacy export and the mixed-language leave screen. `core-e4w16/13-impersonat-core-375.png` actually has a 1280 px-wide desktop canvas; its historical filename is not evidence of a 375 px viewport. Confirmed findings and proposed corrections are recorded in the consolidated audit and INC-91 through INC-96; product code remains frozen.

The final E8 receipt detail and `receipt-presentation.json` were independently inspected: generated, owned, UI-list and detail invoice identity match; the same receipt contains November MONTHLY_FEE EUR 60 plus December INACTIVITY_FEE EUR 20, totaling EUR 80. Both lines and the total render in the mobile detail. The original list assertion was incompatible with its first-line summary and catch-up billing; it does not establish an overcharge. Suggested presentation improvements are a multi-concept cue in the list and keeping the euro symbol with its amount at 375 px.

`python3 roadmap/evidence/2026-10-23-functional-root/verify-functional-close.py` exited **0**. Full output: `05-final-integrity.log`; exact command/exit: `05-final-integrity.json`; structured result: `final-functional-integrity.json`.

- 2,235 API inputs still match the preceding clean-verify manifest.
- 846 web product/configuration inputs still match the functional-release baseline, excluding test/evidence/script paths.
- All 6 inputs for the new session test still match its executed manifest.
- Adopted API and web OpenAPI snapshots have identical bytes; both repositories pass `git diff --check`.
- The API image still has the reviewed immutable ID and arm64 architecture.

These checks establish unchanged inputs and whitespace, not functional success. The web lane separately records the four corrected harness specs (E4, E5, E7 and E8), their final hashes, lint/types and fresh executions. Failed attempts and the compiled-SPA product-red case remain part of the audit.

The final read-only resource check `06-final-resources.json` passes: no named audit containers, networks or volumes remain; the shared heavy lock is absent; no retained ZIP/PEM/key/HAR/env/session-state files were found in the three new web evidence folders; all 34 entries in the final web manifest still match. API cleanup is separately recorded by its lane. Unrelated Docker services were left running.

The first final evidence scan flagged two UUID attachment `fileKey` values in the E3 readmission capture, not API credentials. Root replaced those identifiers with distinct fictional placeholders and preserved every result/status/timing, documenting the change in `07-evidence-redactions.json`. The scan failure remains recorded; no allowlist, product source or test source was changed. The final rescan is stored in API `2026-10-23-review/extended-functional-final-evidence-scan-r2.json`.
