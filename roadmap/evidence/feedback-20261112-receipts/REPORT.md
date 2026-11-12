# Receipt simulation diagnostics — 12 November 2026

The existing PROVIDER_DISABLED incident also covers incomplete creditor settings. Production read-only evidence confirms SEPA_XML is enabled but not configured. Keep the API incident catalog, validation and payment behavior intact.

The billing screen now reads the raw provider summary. A shared explanation identifies payment configuration as a club-wide issue. When SEPA is enabled and configured is false, it explicitly names the missing creditor configuration. A disabled provider gets the separate disabled message. A configured=true flag does not prove validity, so the screen retains the generic explanation in that case or if the settings request fails. Refreshing the billing data also refreshes the provider summary.

Provider-incident rows now say disabled or incompletely configured and omit the misleading member-record action. Member-data incidents retain their links; receipt-specific incident references remain usable. Guidance directs the club to its platform administrator and a fresh monthly simulation. New copy is provided in Catalan, Spanish and English without club-specific literals.

No API, generated contract, payment settings, receipt data, remittance, notification or live provider was changed. Real creditor values still need verification and configuration before XML generation is available.

## Verification

- `pnpm --filter clubs-admin exec vitest run src/billing/BillingPage.test.tsx`: exit 0; 75/75 tests passed. `billing-tests.log`.
- `pnpm exec eslint apps/clubs-admin/src/billing/BillingPage.tsx apps/clubs-admin/src/billing/BillingPage.test.tsx apps/clubs-admin/src/billing/shared.ts --max-warnings 0 --config eslint.config.mjs`: exit 0; `billing-lint.log` empty.
- Final strict `configured === false` refinement: `pnpm --filter clubs-admin exec vitest run src/billing/BillingPage.test.tsx -t 'provider incidents identify club configuration'`: exit 0; 5/5 selected tests passed, the other 70 intentionally unselected; `provider-tests-final.log`.
- `git diff --check`: exit 0.

New tests cover enabled/unconfigured, disabled, loosely configured, settings-read failure and member-only incidents. They verify no mutation occurs and ordinary member record actions remain available. Full workspace validation is owned by the web task agent.

## Files

- apps/clubs-admin/src/billing/BillingPage.tsx
- apps/clubs-admin/src/billing/BillingPage.test.tsx
- apps/clubs-admin/src/billing/shared.ts
- packages/i18n/src/locales/{ca,es,en}/admin-billing.json
- packages/i18n/src/locales/{ca,es,en}/enums.json

## Focused test output

```text

 RUN  v5.0.0 /Users/jordib/.config/agilityhub-clubs/production/josep-feedback-20261106/agilityhub-core-web/apps/clubs-admin


 Test Files  1 passed (1)
      Tests  75 passed (75)
   Start at  08:49:44
   Duration  38.91s (tests 95%, transform 2%, environment 2%, import 1%)


```
