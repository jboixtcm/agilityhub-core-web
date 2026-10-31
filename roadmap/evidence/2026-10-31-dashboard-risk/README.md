# Dashboard risk review readability — 31 October 2026

Separate the review title from its schedule, put date/ring below each class name, align booking counts, and keep notification recipients outside status badges. Long text wraps on phones. Existing ca/es/en wording, API status decisions and calendar links are preserved.

Validation: 35 dashboard component tests; 5 focused Chromium/WebKit browser tests in Docker; lint, i18n, TypeScript/build and whitespace checks pass. Visual checks cover light/dark at 375, 768, 1280 and 1920px, plus long-text layout at 320px and keyboard navigation. The obsolete CSS-text ellipsis assertion is replaced by browser geometry checks. Captures use fictional mock data.

Jordi approved production publication after reviewing the preview. Production activation is recorded separately in SOFTWARE_CANIC/ops/evidence/2026-10-31-dashboard-risk-deployment; this implementation record alone does not claim deployment.
