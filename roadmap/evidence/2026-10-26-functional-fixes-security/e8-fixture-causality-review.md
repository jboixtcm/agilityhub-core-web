# Independent E8 fixture-causality review — 26 October 2026

The first retained E8 failure is the password login used by `withMemberAccountLocale`, before the Spanish leave action runs. `core-e8.log` records expected HTTP 200 versus actual 401 at that helper; the OAuth trace separately records the failed password grant. The prior inactivity case, pack case and fake-card case pass.

The fixture assumption is incompatible with the seed contract:

- `lifecycleCandidates()` selects an eligible monthly SEPA family member from a descending member-number list; it does not restrict selection to accounts with a seeded password.
- `seeds/demo-canic.yaml` declares only 15 existing login identities, but 12 family groups contain 24 members. The seed explicitly documents later accounts as passwordless.
- `DemoDataset.generate()` assigns generated `example.test` accounts after the declared list, and `DemoIdentityService.link()` passes a null password to `AccountService.getOrCreate`, preserving existing credentials.
- The helper calls the ordinary password login with the global fixture password for that arbitrarily selected member. A legitimate passwordless account therefore cannot satisfy it.

The later failures are downstream dependencies: billing expects the member to be absent after an approved leave that never happened, and the permission case explicitly reports missing leave/invoice IDs. They are not independent evidence of a billing or privacy defect. Full E8 must still pass after the helper is corrected before those behaviors are accepted.

The proposed test-only correction uses the selected account's real magic-link flow through the disposable local mailbox, then changes/restores the account locale through the ordinary UI. It need not add a password, mutate authentication rules, or borrow administrative permission to change another account. No product source was changed by this review. The new exact manifest and replacement E8 result are pending; the old failed attempt remains retained and excluded from the 91-case total.

References:

- [Failed E8 log](../2026-10-24-functional-fixes-web/core-e8.log)
- [E8 retained partial record](../2026-10-24-functional-fixes-web/core-e8/e8-gate-record.json)
- [E8 source](/Users/jordib/dev/agilityhub/agilityhub-core-web/e2e/core/e8-core.spec.ts)
- [Demo seed](/Users/jordib/dev/agilityhub/agilityhub-core-api/seeds/demo-canic.yaml)
- [Dataset account selection](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/main/java/com/agilityhub/core/clubs/census/domain/DemoDataset.java)
- [Passwordless seed identity boundary](/Users/jordib/dev/agilityhub/agilityhub-core-api/src/main/java/com/agilityhub/core/identity/application/DemoIdentityService.java)
