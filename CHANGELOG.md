# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial pnpm and Turborepo workspace with the three applications, shared package skeletons, strict TypeScript, linting, formatting, tests, and commit hooks.
- Add the shared themed UI system with branding tokens, accessible base components, extracted mockup icons, Cànic fixtures, and the development component gallery.
- Add the shared i18n foundation with lazy ICU namespaces, Catalan/Spanish/English catalogs, club-aware formats, catalog-complete error messages, and translation CI checks.
- Add the generated OpenAPI client, standard API errors, host-scoped TanStack Query hooks, and switchable MSW bootstrap fixtures.
- Add the shared authentication session layer with encrypted IndexedDB refresh tokens, single-flight 401 refresh, and authentication, role, and module guards.
- Add themed, host-cached shells for Clubs, Clubs Admin, and AgilityHub ID with module/role-gated navigation, placeholder route registries, dynamic PWA manifests, and browser-flow evidence.
- Add the frontend CI gate, Docker-based Playwright runner, weekly Dependabot updates, and a 300 kB gzip budget for the Clubs entry chunk.
- Add frontend playbooks for mockup-driven screen delivery, API client usage, and the reusable task Definition of Done checklist.
- Add the Clubs and Clubs Admin access flows, including magic-link activation, password entry, profile selection, account security controls, impersonation exit, cross-app handoff, translated MSW scenarios, and mobile screenshot evidence.
- Add the AgilityHub ID login and magic-link continuation flows, account and session management, password and product pages, global logout, three-locale copy, and desktop browser evidence.
- Add the reusable UniversalList pattern and the Clubs Admin member and dog census screens with URL-synced filters, configurable columns, saved views, bulk selection, exports, and three-locale coverage.
- Add the Clubs Admin member and dog records with D10 actions, optimistic concurrency, payment and role management, booking controls, consent and notification settings, dog level and document workflows, translated mocks, and browser evidence.
- Add the Clubs member self-service dog and personal-data screens with country-aware validation, postal locality lookup, uploads, task and module gating, translated mocks, and mobile browser evidence.
- Add Clubs Admin catalog maintenance for rings, instructors, administrators, local levels, FAQ entries, plans, and price validity, with tenant-module gates, three-locale copy, MSW contracts, and desktop browser evidence.
- Add the catalog-driven Clubs Admin parameters workspace with typed editors, reset and audit history, module controls, opening hours, holidays, translated copy, and desktop browser evidence.
- Add imported-account onboarding and versioned privacy re-consent across Clubs and Clubs Admin, with postponement limits, route blocking, typed API mocks, and three-locale coverage.
- Add versioned, multilingual club-page editing with limited-Markdown previews in Clubs Admin and active club-page tabs on the Clubs Info screen.
- Add the Clubs Admin audit trail, masked change inspection, entity-scoped last-change links, and global asynchronous export drawer with translated filters, status handling, and browser evidence.

### Changed

- Make each cross-app Playwright project start both Clubs and Clubs Admin, gate popup readiness on the destination shell, and serialize app e2e suites on constrained CI runners.
- Complete the E1 frontend integration gate against the published core image, including real password and magic-link sessions, remembered profiles, onboarding, backoffice handoff, the server-side OIDC flow bridge, and mobile/desktop screenshot evidence.
- Complete the D11 settings overview with module-gated level-capacity, free-training, pack-expiry, and masked SEPA summaries, and make the Clubs Admin integration-test timeout robust on slower CI runners.
- Stabilize frontend tests on constrained CI runners with bounded Turbo concurrency and shared Testing Library/Vitest timeouts.
- Adopt the verified E2 census, catalog, parameter, audit, and export OpenAPI snapshot; regenerate client types; prune published pending contracts; and align E2 screens, mocks, fixtures, translations, tests, and visual evidence with the real wire shapes plus the staged guide, licence, and billing-mode fields.
- Align the Clubs access and profile screens with approved mockups 01 and 12: always-visible password entry, full Cànic branding, passwordless/reset actions, ordered profile and preference rows, and account-session management reserved for AgilityHub ID.
- Drive the Clubs access footer and full-logo treatment from the tenant branding contract, with name-only and mark/name fallbacks when optional branding fields are absent.
- Apply placement-aware tenant branding—mark plus club name in compact shells, theme-aware full logos on access screens, and initial/name fallbacks—and align D10 access-role chips with the approved student terminology.
- Adopt the verified S01 OpenAPI snapshot as the generated client source, retain unpublished E2 operations in `pending.json`, validate JSON mocks against component schemas, and route core authentication APIs separately from identity-host OAuth2 endpoints.
- Align mobile screen 28 with its approved mockup by keeping language on screen 12 and consent management out of the member data form.
- Replace browser-readable refresh-token storage with the same-site HttpOnly cookie flow, relative API/identity routes, credentialed requests, cookie-session bootstrap and logout, guarded memory-only MSW support, and local Vite proxies.

[Unreleased]: https://github.com/agilityhub/agilityhub-core-web/commits/main
