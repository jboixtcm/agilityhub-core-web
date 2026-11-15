# Coordinated release — 15 November 2026

Jordi requested production publication of the recent statistics, profile/information, mobile booking and logo changes. Stripe was explicitly deferred until tomorrow and is not part of this release.

The statistics feature remains preserved on `feature/competition-statistics`. This release integrates the independently prepared Info/Profile and mobile-booking patches based on the published web source, retaining both new WebKit suites and all changelog entries. The API snapshot is generated from the statistics API combined with the already merged public-logo cache correction.

Local checks on the integrated web passed: all 38 lint/typecheck/test/build tasks, 4,069 tests in 256 files, API type generation, and translation parity. The statistics feature’s prior complete Docker run passed 404 tests; the integrated full Docker run and official CI results are tracked in the coordinated operations release record. Only artifacts of a successful official main CI may be deployed.

The existing 2 MB public request limit remains in place. Import preview checks the complete JSON envelope before sending escaped saved content; oversized sources can be fetched through the provider URL instead. This is covered by T-STATS-33. Flow server authentication still requires a privately provisioned provider session and real-provider validation.

Operational evidence and final deployment readback are maintained under `SOFTWARE_CANIC/ops/evidence/2026-11-15-joint-release/`. This source note does not claim that deployment or provider activation has already occurred. The SEPA generation and activity-publication email holds, published privacy policy, PWA configuration and existing live data must be preserved.
