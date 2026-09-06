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

### Changed

- Align the Clubs access and profile screens with approved mockups 01 and 12: always-visible password entry, full Cànic branding, passwordless/reset actions, ordered profile and preference rows, and account-session management reserved for AgilityHub ID.
- Drive the Clubs access footer and full-logo treatment from the tenant branding contract, with name-only and mark/name fallbacks when optional branding fields are absent.

[Unreleased]: https://github.com/agilityhub/agilityhub-core-web/commits/main
