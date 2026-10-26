# Functional release follow-ups — local evidence only

This pass changes test/evidence harnesses only. Product fixes, new images and hosted/provider checks are outside this pass. Priorities below are engineering follow-ups based on the frozen source and retained local scan; they are not a fresh vulnerability intelligence assessment.

## D11 finding identified during screenshot review

**FR-01 — P2 product/UI contract defect: untranslated privacy-process names.** Sign in as the seeded club admin, open `/parametres`, scroll to “Processos automàtics”. The real-image screenshot `core-d11/D11-parametres-core-1280.png` shows `jobs.name.ERASURES` and `jobs.name.RETENTION_SWEEP`. Expected: localized human-readable process names. `apps/clubs-admin/src/catalogs/JobsCard.tsx:655` constructs the translation key; the `jobs.name` map at `packages/i18n/src/locales/ca/admin-settings.json:887` lacks both entries, as do es/en. The adopted OpenAPI includes both enum values; API `platform/application/jobs/JobName.java:8` defines them. No product change made.

**FR-02 — P2 confirmed UI action defect:** the same mandatory processes receive the unconditional switch at `JobsCard.tsx:850`. API `clubs/common/api/JobsController.java:84` documents that they have no switch and return `JOB_UNKNOWN` with `reason=NO_SWITCH`; `platform/application/jobs/JobAdminService.java:141` enforces it. Expected: no usable disable action for a mandatory process. The compiled-browser probe in r3 reproduced HTTP 404 `JOB_UNKNOWN` with `details.reason=NO_SWITCH` after the enabled ERASURES switch and its confirmation. `core-production-r3/d11-mandatory-process-observation.json` preserves the response; `compiled-d11-mandatory-process-rejection-1280.png` shows the dialog still open with the localized error. The desired UI assertion remains red, without an expected-failure annotation.

**FR-03 — P2 test coverage improvement:** `e2e/core/d11-core.spec.ts:106` checks only `.settings-grid h2` and `.settings-parameter__main span`. Its raw-key pattern does not include `jobs.name`, so the 1/1 green run did not detect FR-01. Expand coverage to job names, accessible switch/button labels and dialogs. The green test is valid for its actual narrower assertion; it is not evidence that every D11 label is translated.

## The 26 mock-suite skips

All 26 are explicit, opt-in visual capture galleries, not disabled failing functional scenarios. The full mock run reported 129 admin + 101 member + 1 ID + 4 course-ui passes, with 16 admin and 10 member capture skips.

| File | Expansion | Skips | Source |
|---|---|---:|---|
| `apps/clubs/e2e/courses-gallery.spec.ts` | Two scenarios × two widths × light/dark | 8 | Opt-in line 13; loops 129–130; tests 134 and 159 |
| `apps/clubs/e2e/es-actions-gallery.spec.ts` | One Spanish scenario × two widths | 2 | Opt-in line 12; loop 82; test 86 |
| `apps/clubs-admin/e2e/courses-gallery.spec.ts` | Three scenarios × two widths × light/dark | 12 | Opt-in line 13; loops 112–113; tests 117, 172 and 185 |
| `apps/clubs-admin/e2e/es-actions-gallery.spec.ts` | Two Spanish scenarios × two widths | 4 | Opt-in line 12; loop 73; tests 77 and 92 |

**P3 improvement:** distinguish opt-in visual capture scripts from normal regression reporting, or run a dedicated capture/review job on material visual changes. Do not “fix” the count by removing the skip guard and overwriting historical task screenshots. These galleries remain a visual review opportunity, especially Spanish labels and 375 px light/dark layouts; they are not 26 untested backend flows.

## Retained image vulnerabilities

Source: API `roadmap/evidence/2026-10-23-release-review/final-image-scan-raw.json`, same final image `sha256:1e8060615d372dc826ea431e1cd9ef3733c440d7ce4ecc02199f708e9c6d752e`; Trivy 0.74.0 with cached 22-October data. There are 58 package findings (47 distinct CVE IDs), 0 CRITICAL/HIGH, 54 MEDIUM and 4 LOW. Duplicate CVE IDs occur across related distribution packages; do not describe 58 distinct vulnerabilities.

**P2 — OGNL dependency upgrade investigation.** The one Java finding is `ognl:ognl 3.3.4`, `CVE-2026-113730`; this cached report names `3.4.13` as a fixed version. The dependency comes through the explicit Thymeleaf dependency (`API pom.xml:69`). Current source creates `ClassLoaderTemplateResolver` in `configuration/EmailConfiguration.java:48` and `MessagingConfiguration.java:124`; renderers call the fixed classpath templates `email/system` and `email/notification`. This pass found no user-selected OGNL expression template in those paths. That narrows the observed entry points but does not prove non-exploitability. Review a supported Thymeleaf/OGNL update and run system/notification/migration-welcome template tests before changing the image; do not assume a transitive major/minor override is compatible.

**P2 before production publication — refresh the scan and verify both architectures.** The retained assessment is arm64-only and the general advisory database predates the run. Rebuild/re-scan the approved immutable release for arm64 and amd64 with current advisories before publication. The present cached report lists no fixed-version string for the 57 OS package rows; that does not establish that no vendor fix is available now.

**P3 — reduce and pin the runtime footprint after compatibility review.** Twenty MEDIUM rows concern `rust-coreutils`; other groups include PCRE2 (8), glibc-related packages (8 repeated rows), GnuTLS (5), p11-kit (3), dash (2), tar (2), SASL (2), and single libexpat/wget/zlib rows. The four LOW rows concern systemd-related libraries and shadow account tools. The Core entrypoint is Java under UID 10001; the Dockerfile uses curl for health checks. These shell/native-library findings do not by themselves demonstrate a remotely reachable product exploit. Evaluate an immutable supported base and removal of truly unused tooling; do not blindly remove libc, TLS or compression libraries. The backup helper is a separate image and needs its own assessment: Core's tar finding cannot be assigned automatically to the tested backup implementation.

No advisory was hidden, severity changed, allowlist broadened or package changed during this functional pass.

## Test environment consistency

**FR-04 — P3 harness improvement:** the Playwright image in `scripts/core-stack/docker-compose.yml` supplies Node `v24.20.0`, whereas root `package.json:7` declares `>=22 <23`. The exact warning is preserved in `01-core-d11.log:69`. D11 still passes, so this is environment drift rather than evidence of a product defect. Align the browser/build container runtime with the supported engine, or explicitly validate and adopt the newer runtime through the normal toolchain review. Do not hide the warning or reinterpret a passing Node 24 run as Node 22 coverage.

## Isolated Clubs demo boundary

**FR-05 — P3 demo configuration/navigation improvement, not a shared-identity defect.** The fictional seed enables `LEARN_LINK`. Clubs `apps/clubs/src/App.tsx:1473` gates the profile row on that module and line 1498 links to `https://learn.agilitydoghub.com` in a new tab. S11 §13 explicitly specifies this external entry. Separately, authenticated ID `/products` unconditionally renders a Learn card (`apps/id/src/App.tsx:829`) and the public Clubs URL (`:836`); only the platform-console card is role gated. `ProductCard` at line 800 uses an ordinary anchor; it neither checks Learn membership nor performs an identity handoff. For an isolated Clubs demo, disable `LEARN_LINK` in the demo club configuration and explicitly decide whether the ID catalogue's external product cards should remain visible or be adapted for the demo environment. Disabling the club module alone does not hide the ID card. This is a navigation/scope-preparation issue; it does not require deploying Learn or prove shared authentication. Runtime r4 DOM confirms both ID product anchors and the Clubs profile anchor (`core-production-r4/isolated-demo-external-links.json`); the `/products` and mobile profile screenshots were inspected. No external link was clicked or authenticated.

## E11 screenshot follow-up

**FR-06 — P3 product progress-copy defect (coordinator F05 / INC-95):** after the administrator queues and successfully downloads a member-data package, `core-e11/D10-paquet-rgpd-core-1280.png` shows “Preparant l’exportació…” above the file marked “Preparada”; the member header still says the package is preparing. Expected: the queued notice should clear or change when the requested job reaches a terminal state. Actual download returned HTTP 200 `application/zip`, so this did not block the functional flow. `apps/clubs-admin/src/audit/ExportsDrawer.tsx:103` stores the queued notice; the polling result at lines 129–130 updates jobs without clearing that notice, and line 167 renders it. `apps/clubs-admin/src/census/MemberPrivacyCard.tsx:110` separately keeps its queued message without observing job completion. Follow-up: bind progress copy to the requested job status and cover READY/FAILED transitions. No product edit or additional heavy run was made. The same D10 captures show the already documented current-consent/history mismatch from the web lane; this is corroboration, not another incident.

The coordinator found that historical INC-81(h) described the export-copy behavior and was marked resolved. This report records a new reproduction on the current image and links that history; it does not change the earlier verification or claim when the behavior returned.
