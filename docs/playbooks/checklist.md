# Frontend task Definition of Done

Paste this checklist into a frontend task report and retain the items that apply. An
unchecked applicable item means the task is not ready for `awaiting_verification`.

## Sources and traceability

- [ ] I opened the approved mockup HTML and PNG together.
- [ ] I found the `docs/PLA_FRONTEND.md` mapping and the spec section 2 row.
- [ ] I listed the route, roles, module, API operations, states, `R-xx-nn` rules, and
      `T-xx-nn` tests in the report.
- [ ] I followed existing decisions and transversal catalogs without inventing contract
      items; every missing item is a report/message proposal.

## UI, copy, and theme

- [ ] Catalan copy matches the mockup or approved spec literal exactly.
- [ ] Every visible/accessibility string uses `t("namespace:key")`; matching Catalan,
      Spanish, and English keys exist, with ICU where needed.
- [ ] Dates, times, durations, and money use club-aware i18n formatters.
- [ ] The screen composes `@agilityhub/ui` primitives and approved sprite icons.
- [ ] Feature CSS uses `var(--ah-*)`; no literal color was added outside `tokens.css`.
- [ ] Cànic and minimal branding both render correctly.
- [ ] Labels, semantics, focus order/restoration, keyboard use, live status, contrast,
      loading, empty, error, and success states are accessible.

## Access and contract

- [ ] Routes, tabs, and menu entries are registered/gated through `modules.ts`.
- [ ] `RequireAuth`, `RequireRole`, and `RequireModule` enforce the spec; disabled modules
      leave no screen fragment or dead navigation link.
- [ ] Request/response types and operations come from generated OpenAPI code.
- [ ] Every screen endpoint has fictional MSW fixtures and handlers for required states.
- [ ] API errors map by catalogued code to the `errors` namespace in all three locales;
      server messages and diagnostic details are not rendered as copy.
- [ ] Idempotency and optimistic behavior follow the API contract and task spec; no
      undeclared header, parameter, event, notification, or error code was added.

## Tests and visual evidence

- [ ] Vitest/Testing Library tests cover the cited rules, states, roles, modules, and
      accessibility, and their names include the relevant `T-xx-nn` IDs.
- [ ] Playwright covers the required happy, empty, and failure flows using accessible
      locators and selectable MSW scenarios.
- [ ] Screenshots at 375 px and 1280 px are committed under
      `roadmap/evidence/<TASK-ID>/` and compared beside the approved PNG.
- [ ] Visual differences are fixed or explicitly explained in the report.
- [ ] Playwright/screenshots ran through `scripts/e2e-docker.sh`, or Docker unavailability
      and full failure output are recorded for organizer capture.

## Verification and handoff

- [ ] Every command under the task's Verification section passed.
- [ ] `pnpm i18n:check` passed for a UI task.
- [ ] Proportionate lint, typecheck, test, build, and E2E commands passed.
- [ ] Full command outputs—not summaries—are pasted into Executor report → Evidence.
- [ ] Evidence paths, files changed, implemented `R-xx-nn`/`T-xx-nn`, assumptions,
      dependency status, and catalog proposals/questions are recorded.
- [ ] `CHANGELOG.md` Unreleased is updated; no secret or personal data was added.
- [ ] Only this task's files/report were edited; Organizer verification is untouched.
- [ ] `python3 roadmap/tools/check.py --set <ID> awaiting_verification` succeeds.
