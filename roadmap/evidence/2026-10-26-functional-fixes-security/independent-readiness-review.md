# Independent API, CLI and demo-readiness review — 2026-10-26

No new software blocker was found in the API and migration evidence reviewed here. This is a read-only cross-review of retained execution evidence against current source; no application tests were rerun. It does not replace the final web/profile regression runs or establish hosted readiness.

## API provenance

- Reconstructed the API verification runner's input enumeration: all **2,241 retained inputs match the current files**, and the original gate also recorded no input changes during execution. The gate exit is 0.
- Reparsed current Surefire/Failsafe XML and compared it with the retained summary: **4,948 unit tests in 474 classes; 2,308 integration tests in 174 classes; zero failures, errors or skipped tests**. All retained reports were fresh at the gate, and `missingChangedClasses` is empty.
- API and web OpenAPI bytes match. The production seed still matches both the pre-audit baseline and Git HEAD: SHA-256 `956d7a01e69e7d3a23ad8170fa548fd6356e3854c0f3461d15cfff6027162915`.
- The currently tagged API image is the tested local arm64 image `sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9`. Its refreshed vulnerability scan is reported separately in `REPORT.md`; a local image ID does not prove registry publication or a different host architecture.

Machine evidence: [independent-api-cli-review.json](independent-api-cli-review.json).

## Migration CLI provenance and limits

- Groups `08` and `09` contain **30 CLI invocations /68 passing assertions**: 22/44 and 8/24 respectively. Three invocations seed disposable fixtures. Expected rejections have nonzero command exits; all 30 retained exits match their expected assertions. These are not 30 distinct end-user workflows and not 30 successful mutations.
- Both runners pin the reviewed image, create fictional temporary inputs, and use private internal Docker networks with no published ports. The report group exercises `--env=production` under an isolated staging-profile fixture; it is not a deployment or a live production migration.
- The report fault proxy injects a real local HTTP 403 for S3 report uploads. Recovery preserves all 11 captured business collections and the migration-run count, while updating the saved run's report state. Repeating report recovery preserves all 12 captured collections. An unapproved repeat and a stale approval preserve all 12; the approved reapply retains the census cardinalities and records a second run. This scope does not include coordination internals outside the captured collection list.
- S3 encryption, expiry and report-object evidence comes from the local emulator, not a hosted storage provider. The CLI exercises the existing fictional export; it does not establish compatibility of a future real export's optional receipt/pack files.
- Both retained cleanup records pass. Independent live read-only inspection found no containers, networks or volumes with the runners' owned prefixes, and no matching temporary input directories. No unrelated resources were removed.

Machine evidence: [independent-cli-provenance.json](independent-cli-provenance.json). Source evidence remains in the API repository's `roadmap/evidence/2026-10-24-functional-fixes-api/` groups `05`, `08`, `09`, `attempt-01/` and `report-attempt-01/`.

## Operational prerequisites for the isolated hosted demo

The web [deployment document](../../../docs/DEPLOYMENT.md) now distinguishes the disposable local functional stack from the API release recipe. The local profile enables test clock/DNS helpers and fake/local providers; that stack must not be published as the demo. The API production Compose/preflight expects the release profile, reviewed registry artifacts, private configuration, storage and provider settings.

Before preparing the new server, choose its architecture, actual hosts/DNS/TLS, and explicit provider/test policy. Configure real privacy content and its URL: the safe demo seed preserves fictional identity/manual-payment instructions, while shared privacy/image-consent templates still contain controller/contact placeholders. The seed itself does not neutralize provider wiring. Build the three SPAs for the actual origins, retain their hashes and API release digest, prepare private storage/keys and backup/restore, then verify the hosted login/refresh, tenant branding, deep links and permitted provider flows. Learn remains deferred.

These are operational prerequisites for a later deployment, not additional product code changes made by this review. No server, DNS, provider, repository push or deployment action was performed.
