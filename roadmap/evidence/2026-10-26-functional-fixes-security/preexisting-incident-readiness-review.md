# Pre-INC-91 incident/readiness cross-review — 26 October 2026

Scope: independent read-only comparison of the still-open and partially open historical rows in the master `INCIDENCIES_OBERTES.md` with current source, retained results and the isolated Clubs demo plan. No historical status, product source, provider, registry or server was changed. No new full test run was needed. The 91-case final real-API acceptance is still in progress at this review; this note does not certify its completion.

| Item | Current evidence and classification |
| --- | --- |
| **INC-86 — placed tunnel geometry** | **Implemented locally, historical row stale.** API `CourseParts.ResolvedObstacle` stores validated `controlPointsMeters`; `PlacementService` persists the resolved obstacles; `CourseViews` returns them. The web serializes the placed ring coordinates and `viewer-model.ts` prefers that snapshot, including an explicit empty array. Only legacy absent/null geometry falls back to the live course. Current `PlacementsIT` report: 9 tests, zero failures/errors/skips; web regressions cover edited/deleted source tunnels and legacy fallback. The review found `docs/qa/CHECKLIST_QA.md:67` still describing the old limitation for every placement. The parent review corrected that current checklist on 26 October to match S16/source and retain only the legacy exception; the historical incident row is preserved. |
| **INC-88 — mutable image tag** | **Release mechanism mitigated; publication/host verification pending.** `deploy/release-preflight.py` rejects `:main`, requires a reviewed `sha-<commit>` reference plus a pinned/expected registry digest, and checks the local pulled image's registry digest. The tested `9f8a…` is a local `linux/arm64` image ID, not a published registry digest. The old register's `sha-de50be0` candidate does not identify today's uncommitted corrections. For the future server, publish the exact reviewed source for its chosen architecture and retain/verify its immutable digest. No publication was performed here. |
| **INC-90 — image vulnerabilities** | **Old HIGH findings no longer describe the tested image.** Dockerfile removes the unused Go `pebble` executable. The retained 26 October Trivy 0.74.0 scan refreshed both databases and scanned exact image `sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9`: **0 CRITICAL, 0 HIGH, 55 MEDIUM, 4 LOW**, 59 package/advisory occurrences and 48 distinct advisory IDs. The policy gate passes; this is not a zero-vulnerability claim. Remaining dependency maintenance, including OGNL in the Java application, is not solved merely by refreshing the base. Scan the eventual published/architecture-specific artifact again. |
| **INC-76 — member home TTI** | **Explicitly accepted post-launch work, not a new failing gate.** E142 accepts a 4.5-second home baseline; the 3-second target applies to login. The current app still imports one `screens` chunk. The historical 4.0–4.2-second measurement was not repeated in this review, so neither that exact value nor a new 3-second home claim is current evidence. Per-tab splitting remains deferred. |
| **INC-80 W14/W17 — admin navigation/bundle margin** | **Accepted post-launch work remains.** Sidebar entries remain normal anchors; page actions also have a separate SPA `navigate` callback. Current final size gate43 passes: admin initial **444.85/460 kB**, all **673.49/675 kB** gzipped, leaving only **1.51 kB (0.22%)** in the all-admin budget. The register's old 1.2% margin is no longer the current measurement. A passing size limit does not establish load time. |
| **INC-80 W16 — production mock worker** | **Packaging source corrected.** All three Vite configs use `copyPublicDir: mockEnabled`; clubs also excludes the mock worker from production precaching. Thus the old assertion that production necessarily publishes that file is stale. Final hosted artifacts must still be checked by the existing preflight. |
| **INC-80 W15 — impersonation popup** | **Existing source-level browser risk; not reproduced by this review.** `CensusRecordPage.tsx:1089–1103` still calls `window.open` after the awaited impersonation POST. The register assigns it to E11-W05, but that task contains no popup fix. Unit tests mock `window.open`; the final real-flow config runs Chromium, which does not establish Safari popup policy. The bounded WebKit calibration subsequently confirmed that this automation browser opens even an unactivated popup; it therefore cannot prove Safari popup blocking or its absence in the app. See the separate calibration report below. Do not state that all supported browser behaviors are proven, and do not claim a demonstrated Safari failure without browser evidence. |

Other historical tails checked:

- **INC-45** is present as `SecurityInventoryIT`: it enumerates every published operation against the live security chain, and also checks hidden signed routes, anonymous write quotas and support restrictions. Its current retained report is **4/4**, zero failures/errors/skips. The open E11-T03 assignment is stale; this is not a remaining absence of the inventory test.
- **INC-52 point 2** is already implemented: `NotificationDispatcher.settleWaiting()` writes/renews the acceptance before another settlement attempt. `T_11_09_INC_52_aWaitingSettlementWritesTheAcceptanceFirstSoTheEmailIsNeverSentAgain` covers the failed initial acceptance writes. This corrects the specific historical missing-retry claim; it does not promise provider exactly-once delivery through every outage/crash.
- **INC-55** has the equal-field-count regression in `packages/api-client/src/preferences-saver.test.ts` and the unconditional queue update in the saver. **INC-56** has exact `SKIPPED_BY_PREFERENCE`, unconditional `TEMPLATE_MANDATORY` and restoration checks in `e7-core.spec.ts`. **INC-11/41/59/60** were addressed in the verified E11-W02/W05 corrections; current default course updates poll when no stream is configured. The historic open labels must not be interpreted as proof those original gaps remain. Approved layout/copy exceptions and small visual follow-ups are still distinct from universal pixel equivalence.
- **INC-83** is largely superseded by the 23 October completion changes: current `ActivityTransactions` delegates duplicate-key classification to `TransactionRetries`, `CensusErasure.erased()` projects only needed fields, both TTL repositories use `IndexDrops.ifPresent()` (only Mongo code 27 is ignored), signup review tolerates ambiguous prices, the trace script prioritizes mixed skipped results, and the executable billing-smoke regression runs in CI. These are not current open defects merely because the older register assigns follow-up work. The old informational test-ID naming list was not remapped here. **INC-89** remains the accepted shared-JVM PIT contract-test investigation; normal API tests do not certify that historical PIT combination. **INC-85**'s production-host seed warning is operational: the functional stack now applies the separate demo definition and rewrites only its local hosts; the production definition remains unchanged. The current E10 test imports generated `components` and aliases its response types (including `ProductBranding`), so its historical handwritten-type tail is also superseded.
- **INC-38 point 11 / INC-53 point 13 / INC-54 point 2** concern provisional/translated club content and actual provider verification. For a shared demo, replace legal/controller/contact placeholders and verify the chosen communication/payment policy. Actual provider delivery cannot be inferred from local adapters. Live-provider acceptance belongs to the eventual enabled service, not an unsolicited external operation now.

## What still prevents sharing the hosted demo

No newly confirmed high/medium code blocker was found by this bounded historical-ledger review. It does **not** certify all browsers, arbitrary outages or all performance targets. The final real-API acceptance result remains the parent review's gate.

Hosted readiness remains separate: create/configure the new server later; choose architecture, real domains/origins and DNS/TLS; publish and verify the exact immutable API artifact; build the three SPAs for those origins; configure private keys, storage, backups/restore and the provider/test policy; replace legal/contact placeholders; then perform hosted login/refresh, tenant/deep-link and permitted provider checks. The disposable local profile exposes test helpers and must not be published. These prerequisites are already documented in `docs/DEPLOYMENT.md` and the API production runbook. Learn stays unlinked, per the user's isolated-demo decision.

Readiness wording must therefore distinguish **local code/tests**, **accepted post-launch maintenance**, **unverified browser/provider behavior**, and **future hosted preparation**. “Everything deployed/production-ready,” “all browsers verified,” “zero vulnerabilities,” “home under 3 seconds,” or a registry digest attributed to the local image ID would overstate the evidence.

## Exact references

- [Historical incident register](/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/INCIDENCIES_OBERTES.md)
- [INC86 contract](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/main/java/com/agilityhub/core/courses/domain/CourseParts.java)
- [INC86 persistence](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/main/java/com/agilityhub/core/courses/application/PlacementService.java)
- [INC86 API regression](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/test/java/com/agilityhub/core/courses/api/PlacementsIT.java)
- [INC86 current API report](/Users/jordib/dev/agilityhub/agilityhub-core-api/target/failsafe-reports/TEST-com.agilityhub.core.courses.api.PlacementsIT.xml)
- [INC86 viewer and legacy fallback](/Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs/src/courses/viewer-model.ts)
- [INC86 viewer regressions](/Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs/src/courses/viewer-model.test.ts)
- [INC86 payload regressions](/Users/jordib/dev/agilityhub/agilityhub-core-web/packages/api-client/src/core-api-store.payloads.test.ts)
- [Tunnel QA row corrected after this review](/Users/jordib/dev/agilityhub/agilityhub-core-web/docs/qa/CHECKLIST_QA.md)
- [INC88 release preflight](/Users/jordib/dev/agilityhub/agilityhub-core-api/deploy/release-preflight.py)
- [INC90 Dockerfile](/Users/jordib/dev/agilityhub/agilityhub-core-api/Dockerfile)
- [INC90 refreshed image scan report](/Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-26-functional-fixes-security/REPORT.md)
- [INC76 accepted baseline E142](/Users/jordib/dev/agilityhub/agilityhub-core-web/docs/DECISIONS_PENDENTS.md)
- [INC76 current lazy screens](/Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs/src/App.tsx)
- [INC80 sidebar](/Users/jordib/dev/agilityhub/agilityhub-core-web/packages/ui/src/components.tsx)
- [INC80 popup source](/Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs-admin/src/census/CensusRecordPage.tsx)
- [INC80 popup unit test](/Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs-admin/src/census/CensusRecordPage.test.tsx)
- [INC80 current bundle gate43](/Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-24-functional-fixes-root/43-final-bundle-size.log)
- [INC45 inventory source](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/test/java/com/agilityhub/core/configuration/SecurityInventoryIT.java)
- [INC45 current API report](/Users/jordib/dev/agilityhub/agilityhub-core-api/target/failsafe-reports/TEST-com.agilityhub.core.configuration.SecurityInventoryIT.xml)
- [INC52 retry implementation](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/main/java/com/agilityhub/core/clubs/messaging/application/engine/NotificationDispatcher.java)
- [INC52 regression](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/test/java/com/agilityhub/core/clubs/messaging/application/engine/NotificationDispatcherIT.java)
- [INC55 regression](/Users/jordib/dev/agilityhub/agilityhub-core-web/packages/api-client/src/preferences-saver.test.ts)
- [INC56 current real-API tests](/Users/jordib/dev/agilityhub/agilityhub-core-web/e2e/core/e7-core.spec.ts)
- [Historical web correction review](/Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/tasks/E11-W02.md)
- [Historical follow-up correction review](/Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/tasks/E11-W05.md)
- [Future hosted demo prerequisites](/Users/jordib/dev/agilityhub/agilityhub-core-web/docs/DEPLOYMENT.md)
- [Production topology/runbook](/Users/jordib/dev/agilityhub/agilityhub-core-api/docs/DEPLOY.md)
- [Current API/CLI provenance](/Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-26-functional-fixes-security/independent-api-cli-review.json)

Reference hashes are retained in [preexisting-incident-readiness-inputs.json](preexisting-incident-readiness-inputs.json).

The follow-up [WebKit popup-policy calibration](../2026-10-26-functional-fixes-webkit-popup-probe/REPORT.md) records why the remaining Safari-specific risk cannot be validated by the existing automated browser.
- [INC83 completed API review](/Users/jordib/dev/agilityhub/agilityhub-core-api/roadmap/evidence/2026-10-23-review/README.md)
- [INC83 duplicate-key classification](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/main/java/com/agilityhub/core/clubs/activities/application/ActivityTransactions.java)
- [INC83 narrow census projection](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/main/java/com/agilityhub/core/clubs/census/application/CensusErasure.java)
- [INC83 concurrent index helper](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/main/java/com/agilityhub/core/shared/application/IndexDrops.java)
- [INC83 signup review](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/main/java/com/agilityhub/core/clubs/census/application/SignupService.java)
- [INC83 spec trace](/Users/jordib/dev/agilityhub/agilityhub-core-api/roadmap/evidence/E11-T12/trace.py)
- [INC83 Python regressions in CI](/Users/jordib/dev/agilityhub/agilityhub-core-api/.github/workflows/ci.yml)
- [INC85 generated E10 response types](/Users/jordib/dev/agilityhub/agilityhub-core-web/e2e/core/e10-core.spec.ts)
