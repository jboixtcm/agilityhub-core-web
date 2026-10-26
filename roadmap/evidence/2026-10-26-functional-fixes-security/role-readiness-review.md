# Independent role and readiness review — 2026-10-26

Read-only source/evidence review while the final real-Core stages continue. No new permission, privacy or cross-record-state defect was found within this targeted review. This is not a claim that the pending real-browser stages have passed or that every possible role/data combination has been exhaustively tested.

## E1 and E3 are test expectation mismatches

- E1's failed mobile assertion asks for a visible heading named `Tauler` after already reaching `/tauler`. `DashboardPage.tsx` renders its h1 from `admin-dashboard:greeting`; `Tauler` is the sidebar group label, hidden with the collapsed mobile navigation. The assertion should identify the actual dashboard content while retaining the login, redirect and handoff checks. No dashboard product change is indicated.
- E3's helper assumes the number of radios always equals the quote's options. `SignupPage.tsx` explicitly renders one eligible start option as a `.signup-upfront__line`, without a radio or choice legend. `SignupPage.test.tsx` already covers day 26, the single TODAY line, the correct total and the submitted `additionalDogOption: TODAY`. The helper must validate that intended representation when only one option is returned. No payment product change is indicated. The retained failing run is 1 passed /1 failed /3 not run, not a complete E3 pass.

## Role and privacy coverage inspected

| Profile or boundary | Concrete coverage inspected |
| --- | --- |
| Public applicant / signed-out account | E1 password, magic link, kept destination and ID authorization; E3 public form, approval/rejection/add-dog/closed registration; API security inventory checks every published operation's bearer requirement and every anonymous write's rate-limit route. |
| MEMBER | Member routing/profile choices, own billing/lifecycle routes, data export and notification preferences; E8 checks another member's invoice/inactivity/leave access is 404 and renders no secret; compiled HTTPS probe verifies a member cannot obtain admin parameter blocks. |
| INSTRUCTOR | Member/admin-shell route and navigation gates; E8 checks hidden billing/lifecycle routes and real billing 403; instructor counters are not requested; role-specific mobile agenda/navigation has browser coverage. |
| Club ADMIN | Census/catalogs, consent, billing/lifecycle and privacy actions; E2's final real SPA navigation has one correct preference card and no old-member feedback; E11 covers own-club admin export and erasure scheduling/cancellation. |
| AGILITYHUB_ADMIN | Console entry, product-host/password/magic-link paths, platform role provisioning and second-club setup are in E10; ordinary accounts receive PLATFORM_ONLY. Impersonation does not inherit the actor's platform role. |
| Impersonated MEMBER | Handoff is one-use, exit revokes its token, no refresh family is created; no personal export/password/language mutation is offered; temporary locale restores after exit/expiry, including delayed language loading. E8/E11 exercise the real restrictions. |
| Platform support | E10 checks temporary locale/device preservation, exit/revocation and 403 SUPPORT_RESTRICTED for export/erasure operations. API SupportAccessIT additionally verifies masked IBAN, own-tenant enforcement, restricted SEPA/data routes, auditing, role/club/grant expiry and handler-level restrictions. |
| Cross-record asynchronous state | INC-98 keyed member/dog content boundaries and distinct preference/privacy sibling keys; completed A→B and delayed A mutation→B tests, plus final E2 real member navigation. |

The complete API gate's current 2,241-input identity was independently verified in `independent-api-cli-review.json`. Targeted current XML was also inspected: `SecurityInventoryIT` (4), `SupportAccessIT` (8), `MemberDataExportIT` (2), `ErasureIT` (21), `SignupSecurityFixesIT` (54), `SecurityHardeningIT` (5), `SecurityHeadersIT` (2), `TenantFilterTest` (3), `FollowupContractAccessTest` (7): **106 tests, zero failures/errors/skips**. These supplement the browser flows; they are not extra tests to add again to the full API total. Web gates 21 and mock-browser 22 both record exit 0 and unchanged 944-input manifests. Real-Core production-r2 records exit 0 and unchanged 953 inputs, with owned cleanup complete; its API is still the local profile behind a local HTTPS proxy.

## Final-ledger checks that must remain explicit

- E8's same-family denial branch is conditional on fixture discovery. Its final `e8-gate-record.json` must show `permissions.familyPartnerChecked: true` before reporting same-family browser coverage. A false value is a browser coverage gap, not evidence of an authorization flaw; API regressions cover cross-account and cross-club privacy separately.
- E7 has three conditional no-test-clock skips. Record the actual final skipped count and clock availability; planned/listed cases do not establish execution.
- Failed, cancelled, superseded and repeated runs must not be counted as additional unique passing workflows. Correcting E1/E3 helpers requires their final successful reruns; source review alone does not close those stages.
- The course-ui unit tests use a recording WebGL renderer and empty FBX models. Their transform cases mount fresh, and the interaction harness contains only the 2D canvas. Existing browser post-nudge assertions also cover 2D. The separate `2026-10-26-functional-fixes-course3d-probe/REPORT.md` now closes the narrow real-WebGL post-nudge evidence gap: 2/2 light/dark probes pass with actual FBX readiness; the four before/after canvas originals and two after-edit viewport originals were inspected. Models/numbers remain visible, shift relative to fixed ring markers, and show the new warning halos. This is one fixture and three eastward nudges, not exhaustive edit/browser/hardware coverage. The blank immediate screenshot was not a product defect finding.

## Local versus hosted readiness

After the remaining final real-Core stages and any confirmed minor visual corrections pass on their recorded source, the local evidence can support preparing the isolated Clubs demo. It does not establish the new DigitalOcean host, chosen architecture, registry publication, actual DNS/public TLS, actual SPA build origins, real privacy text/URL, private storage/keys/backups or permitted provider behavior. Those operational steps are listed in `docs/DEPLOYMENT.md` and the API deployment runbook. Learn federation remains deferred. No deploy or provider action was performed by this review.
