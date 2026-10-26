# Independent final acceptance ledger — 26 October 2026

**91/91 selected real-API browser cases pass across 15 stages**, with zero accounting issues. The independent checker exits **0** with `--require-complete`, and agrees with the parent collector. Each selected stage has its exact expected case count, distinct test identities, no skipped summary, API image `sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9`, unchanged recorded inputs, and empty owned container/network/volume cleanup arrays.

| Accepted cases | Exact source baseline | Permitted difference |
| --- | --- | --- |
| 55 | Gate40, 946 inputs; compiled-SPA stage also records exactly nine reviewed harness files | Original passing groups retained at their actual source identity |
| 30 | Manifest48, 948 inputs: E3-r5, E6, E7 | Only `scripts/e2e-core.sh` plus the outbox readiness helper/test |
| 6 | Manifest54, 948 inputs: E8-r3 | Only `e2e/core/e8-core.spec.ts` differs from manifest48 |

All current application/package files still match gate40, and the complete current manifest matches54. The three runner files and one E8 spec are the only differences across the acceptance baselines; no arbitrary source mismatch is allowed. The nine compiled-SPA harness hashes still match their execution manifest. Failed, pending, superseded and repeated attempts are excluded from the 91-case total.

Conditional coverage is explicit: E7 recorded HTTP200 for the test clock and no clock-skipped branch records; E8-r3 recorded `familyPartnerChecked=true`. E8's normal owner used the actual local magic-link UI/mailbox path, request202 then exchange200, `normalAccount=true`, expected local host; the test also asserts the exact owner identity and no impersonation before the locale change. Full E8-r3 passes6/6 after excluding unpublished `.pending-` mail files, consistent with the API sink's atomic publication.

CI40 accounting is independently **3,616 Vitest +20 Node** across two distinct 10-test TAP suites. The **six additional outbox readiness tests** belong to their separate focused check, not CI40. The 11 root `FINAL_COMMANDS.md` sections checked here match their exact retained commands, exits, input counts, unchanged-input claims and last40 log lines.

Evidence:

- [Independent final JSON](independent-ledger-final.json), emitted by [review-final-ledger.py](review-final-ledger.py) with `--require-complete`.
- [Earlier incomplete ledger](independent-ledger-interim.json) and [946→948 transition](independent-ledger-harness-transition.json), retained without overwriting failures or pending states.
- [E8 fixture causality](e8-fixture-causality-review.md); its pending correction is now resolved by the selected E8-r3 result above.
- [Root selected-stage collector](../2026-10-24-functional-fixes-root/collect-final-runs.py), [outbox-only delta](../2026-10-24-functional-fixes-root/48-harness-only-delta.json) and [E8-only delta](../2026-10-24-functional-fixes-root/54-e8-fixture-delta.json).

This review read retained evidence and source hashes only; it did not rerun tests, alter product code, call providers, publish artifacts or deploy. Local-profile/fake-provider browser acceptance remains distinct from future hosted/provider verification and the separately documented Safari popup-policy limitation.
