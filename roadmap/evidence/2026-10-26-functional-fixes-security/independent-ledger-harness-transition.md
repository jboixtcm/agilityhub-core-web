# Independent review of the outbox-readiness evidence transition

The explicit **946 → 948 input baseline pair is valid** for the selected final runs. Independently comparing `40-final-ci-tested-inputs.json` and `48-harness-final-inputs.json` finds exactly one changed file (`scripts/e2e-core.sh`) and two additions (`scripts/core-stack/wait-for-outbox.mjs` and its test), with no removals. Every application, package and browser-spec hash is identical; the current checkout matches the 948-input manifest. The API image is unchanged.

The helper is confined to local disposable-stack preparation. It reads `domain_events` and counts every PENDING record, including leased and future-retry entries, plus FAILED records. This matches the current repository lifecycle: claiming an event retains PENDING, and publication follows the handler transactions. It does not filter out leased parents, delete records, alter clocks, disable jobs or extend the browser's existing delivery assertion. Invalid/unavailable counts and FAILED events fail immediately; the overall wait is bounded at 180 seconds, individual Mongo reads at five seconds, and success requires three empty observations spanning at least two seconds. This establishes domain-event backlog readiness, not a claim that all provider deliveries or every application queue is empty.

The retained `12-outbox-readiness-checks.log` proves six focused Node regressions plus lint/format/shell checks. These **six supplemental tests are separate from CI40's 3,616 Vitest +20 Node**, whose exact 946-input result remains historical evidence for identical product sources.

The independent checker now requires:

- Exact three-file delta between the two manifests; no removals or broader source exception.
- 948 inputs for `core-e3-r5`, E6, E7 and E8; the exact old 946 inputs for already-passing selected groups, plus exactly the nine unchanged compiled-SPA harness inputs where applicable.
- Unchanged API image, successful commands, complete expected case identities/counts, zero skips, empty owned-resource cleanup and conditional E7/E8 proofs.

The retained [transition result](independent-ledger-harness-transition.json) is **partial: 55/91, zero accounting issues**, agreeing with the parent collector. E3-r5, E6, E7 and E8 were still pending at capture. No completed-suite claim follows from this review. The earlier E3-r4 failure and 44-case interim record remain retained and excluded from accepted totals.

The original checker is preserved byte-for-byte as [review-final-ledger.pre-readiness.py.txt](review-final-ledger.pre-readiness.py.txt), with SHA256 `3d1c573928657d8662c78eec9539e0f394cade1b726995739c1895c6d2207b0e`, matching the first review's hash manifest. The updated [checker](review-final-ledger.py) changes only the explicit baseline/stage accounting. No product source, shared report, test execution or external operation was performed for this independent review.
