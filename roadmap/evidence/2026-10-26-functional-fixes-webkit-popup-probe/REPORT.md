# WebKit popup-policy feasibility probe — 26 October 2026

**This automated WebKit cannot reproduce a Safari popup blocker.** A popup opens even with no user interaction (`isActive=false`, `hasBeenActive=false`), and another opens six seconds after a real button click when transient activation is already false. Consequently, running the application's delayed impersonation action in this environment would not establish its behavior under Safari's normal popup policy. No speculative product fix or duplicate application suite followed.

| Local control | Activation immediately before `window.open` | Popups opened |
| --- | --- | --- |
| Timer after initial navigation, no click | inactive, never active | 1 |
| Immediate button click | active | 1 |
| 1.5 seconds after click | active | 1 |
| 6 seconds after click | inactive, previously active | 1 |

The probe uses unmodified `window.open('/opened', '_blank', 'noopener,noreferrer')` on a temporary in-container HTTP server. Waiting occurs on the Node side; no page script is polled while the activation interval elapses. Popup events, not the return value of a `noopener` open, establish the count. The browser reports WebKit 26.6 but runs in the official **Linux** Playwright 1.63.0 noble Docker image; its Safari-like user agent is not evidence of macOS Safari coverage.

The known source risk remains: `apps/clubs-admin/src/census/CensusRecordPage.tsx:1089–1103` opens the new tab after awaiting the impersonation POST. Its unit tests spy on `window.open` and cannot prove native popup policy. Current real-core tests prove the handoff in Chromium. The calibration neither demonstrates a Safari failure nor closes INC-80 W15. A normal supported Safari session with popup blocking enabled is the missing evidence.

Exact command: [census-webkit-popup-policy-calibration.command](../2026-10-24-functional-fixes-root/census-webkit-popup-policy-calibration.command). Retained [summary](../2026-10-24-functional-fixes-root/census-webkit-popup-policy-calibration.summary.json): exit **0**, **946 inputs unchanged**, 11.55 seconds, host Node22.23.2; execution held the shared heavy lock. This is an environment calibration, not four additional application acceptance cases.

The [raw observations](popup-policy-result.json), [script](popup-policy.cjs), [runner](run-calibration.sh) and [hash manifest](harness-inputs.json) are retained. The named `agilityhub-webkit-popup-review-20261026` container was absent after completion; no dedicated volumes or networks were created. No provider operation, publication or deployment occurred.
