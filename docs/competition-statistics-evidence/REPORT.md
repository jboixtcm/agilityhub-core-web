# Competition statistics — web validation

Status: implementation complete; final complete Docker browser suite is running. This is an executor report, not organizer verification or production acceptance.

## Changes

Added the module-gated member page and profile entry, own-dog/season/year filters, official standings and run summaries, source freshness, loading/error/empty states, and the administrator preview/review/confirm/history flow. Includes Catalan, Spanish and English translations, generated API types, fictional mocks, seven component tests and two browser flows. Instructor-only accounts do not see the member link.

## Request and boundaries

User-requested implementation on separate `feature/competition-statistics` branches. The isolated checkouts are under `implementation/competition-statistics/`. Existing organizer tasks and verification sections remain unchanged. No production deployment, STATS activation, provider mutation, scheduled synchronization, or live result import was performed.

See [behavior, configuration and limitations](../COMPETITION_STATISTICS.md). FCAG HTTP fetch plus parsing returned 57 rows for 2026–2027. Flow's authenticated browser print layout and `_facom_key` cookie were observed, but a real authenticated server request remains unverified: automatic approval rejected Terminal access for session transfer. No provider session was provisioned or committed. Positive Flow point labels still need a live example; the checked run contained `-`.

## Assumptions and review scope

- This feature uses STATS; SOCIAL_LEAGUE remains separate. New screen copy is proposed in Catalan, Spanish and English because no approved import-screen mockup exists.
- FCAG official net totals are preserved. Flow official points are explicit and never inferred from speed or a clear run.
- Each Flow print page represents one run. Its trial identity uses title plus organizer/date because no trial UUID is exposed; consistent reimport is needed after a provider rename.
- The CSV download is our reviewed interchange template, not a native Flow export claim.
- Task-local test identifiers are T-STATS-01 through T-STATS-32. No existing catalog error, audit or notification code was added.

## Visual review

- [Member at 375 px](member-375.png): dog and period selectors, official standings, summaries and details fit the mobile width.
- [Administrator at 1280 px](admin-1280.png): source entry, matched/unmatched licences, explicit selection and replacement review are visible.

The screenshots were inspected visually. Both contain fictional fixture data. Browser-native file input wording follows the browser locale.

## Validation

Final command tails and Docker suite result will be inserted when the running suite completes. The final web build/lint/typecheck/test pipeline already reports 38 successful tasks, and i18n parity reports 5,690 keys per locale with zero unused or missing entries.
