# Notification attention — feedback points 7 and 8

User-requested change, 2026-11-01. Final publication is coordinated with the app-profile and admin-delivery-log work; this report does not claim deployment.

## Behavior

- The home bell has a 44px minimum target, a larger icon and high-contrast emphasis while unread notices exist. It rings for three short cycles (4.2 seconds), then remains visibly highlighted.
- The signed-in app shell shows a read-only banner for an unread club change/cancellation, an enabled waitlist offer, or another notice whose SMS channel reached the recipient. Waitlist offers with disabled actions do not show as urgent.
- The banner links to the existing notification feed. Merely seeing the banner does not mark notices read. Reading the feed clears the banner through the existing unread-count update.
- Refresh on entry, focus, visibility and every visible minute; cancel stale requests. Paginate past routine notices if needed. Account/club/impersonation identity scopes the component.
- Both animations respect reduced-motion preferences. Layout uses theme tokens. New task-specific banner copy supplied in Catalan, Spanish and English; no new backend or delivery-policy changes.

## Local checks

- `pnpm --filter clubs exec vitest run src/notifications/NotificationAttention.test.tsx`: exit 0, 4/4 tests. See `08-tests-final.log`.
- `pnpm exec eslint apps/clubs/src/notifications/NotificationAttention.tsx apps/clubs/src/notifications/NotificationAttention.test.tsx apps/clubs/src/notifications/attention.css apps/clubs/e2e/notification-attention.spec.ts --max-warnings 0`: exit 0, no output. See `07-lint-final.log`.
- `pnpm i18n:check`: exit 0, parity in ca/es/en, 0 unused keys, 0 missing error/parameter keys, 0 Spanish action violations. See `03-i18n.log`.
- New browser test covers 375px/1280px, Chromium/WebKit, dark/light, reduced motion, no mark-read on entry, link to the feed and clearing on return. Execution belongs to the combined release owner.

Earlier fullcheck attempts retained: `02-checks.log` stopped at test optional-property typing (fixed with action:null); `04-checks.log` hit the existing cold mock-import budget under host contention; `05-checks.log` identified six new-file lint issues (fixed and checked in `07-lint-final.log`). The combined owner will run the single complete final check and browser suite after the other workloads finish.

## Regression checks

`pnpm --filter clubs exec vitest run src/NotificationsPage.test.tsx --maxWorkers=1`: exit 0, 23/23 tests (`11-feed-regression.log`).

`pnpm --filter clubs exec vitest run src/booking/home.test.tsx src/booking/detail.test.tsx --maxWorkers=1 --reporter=verbose`: exit 0, 38/38 tests (`15-booking-final.log`). The detail helper now queries the detail-card title explicitly: the new cancellation banner also starts with "Classe", so the old unscoped text matcher was ambiguous. No assertion or product behavior was removed. Earlier attempts are retained; repeated inline fixture-image base64 is omitted from failure output.

## Cold namespace regression

The banner now opts out of Suspense and waits for its namespace to be ready before reading/rendering. This prevents an optional banner from suspending the whole shell, including the instructor entry. A new delayed-namespace test checks that navigation stays usable while translations load, then that the translated banner appears. The dog-note assertion in App.test now selects its actual saved-message text and still checks its status role.

`pnpm --filter clubs exec vitest run src/notifications/NotificationAttention.test.tsx src/App.test.tsx --maxWorkers=2`: exit 0, 103/103 tests (98 App +5 attention), `17-cold-namespace-tests.log`.

`pnpm exec eslint apps/clubs/src/notifications/NotificationAttention.tsx apps/clubs/src/notifications/NotificationAttention.test.tsx apps/clubs/src/App.test.tsx --max-warnings 0`: exit 0, `18-cold-namespace-lint.log` (empty).
