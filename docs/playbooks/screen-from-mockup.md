# Build a screen from its mockup

Use this order for every mobile or desktop screen. The approved Catalan mockup and the
screen's spec define the result; this playbook does not create product behavior.

## 1. Establish traceability

1. Open the matching HTML and PNG together under `docs/pantalles/mobil/` or
   `docs/pantalles/escriptori/`. Treat the HTML as the source for copy, icons, and CSS
   values, and the PNG as the source for composition and visual comparison.
2. Inventory every visible Catalan string, interactive control, icon, state, spacing,
   type treatment, and responsive change. Do not silently improve or rewrite the copy.
3. Find the screen in `docs/PLA_FRONTEND.md` section 2, then open its linked spec. Copy
   the spec section 2 row into working notes: screen, route, allowed role, module, API
   method/path, and state. Read all cited `R-xx-nn` rules and `T-xx-nn` tests.
4. Resolve names and behavior through `docs/specs/00-transversal/`: permissions,
   modules, API conventions, errors, i18n, and any parameter/event/notification catalog
   named by the spec. Use the documented assumption in `docs/DECISIONS_PENDENTS.md`;
   do not reopen it.
5. If copy or a contract item has no source, put a proposal in the task report and
   `roadmap/MESSAGES.md`. Do not add it to code as though approved.

## 2. Build the API scenario first

- Use generated OpenAPI request/response types. Never define a parallel API interface.
- Add fictional fixtures in `packages/api-client/src/mocks/fixtures/`, one scenario per
  material state: success, empty, loading transition, permission/module absence, and
  each catalogued failure required by the spec.
- Register every endpoint the screen calls in `handlers.ts`, then expose selectable
  states from `scenarios.ts`. The E0 handler shape is real code from
  `packages/api-client/src/mocks/handlers.ts`:

```ts
export const handlers = [
  http.get("*/api/v1/branding", () =>
    HttpResponse.json(currentMockScenario().branding, {
      headers: { ETag: '"mock-branding-v1"' },
    }),
  ),
];
```

- Browser scenarios are selected with `agilityhub.mockScenario`; keep node tests on
  the same shared handler list. An unhandled request means the screen is incomplete.

## 3. Move all copy to i18n

1. Choose an existing namespace or add the feature namespace to `namespaces` and all
   three loaders in `packages/i18n/src/resources.ts`.
2. Add identical key trees in `ca`, `es`, and `en`. Catalan is copied exactly from the
   mockup; Spanish and English ship in the same task. Use ICU for plural/select text.
3. Render no UI literal. `apps/clubs/src/App.tsx` shows the established form:

```tsx
const { t } = useTranslation("shell");
return <EmptyState
  description={t("shell:placeholder.description")}
  title={t("shell:placeholder.title")}
/>;
```

4. Use `useClubFormats()` for dates, times, durations, and money so locale, club time
   zone, and currency remain authoritative. Do not format those values in components.
5. Run `pnpm i18n:check` after the screen and tests exist; it checks locale parity,
   forbidden vocabulary, and unused keys.

## 4. Compose the screen

- Reuse exports from `@agilityhub/ui` (`AppBar`, `Button`, `Card`, `DataTable`,
  `EmptyState`, `FormField`, inputs, overlays, `Skeleton`, tabs, toasts, and icons).
  Extend `packages/ui` only for a genuinely reusable primitive.
- Put literal colors only in `packages/ui/src/tokens.css`. Feature CSS consumes
  `var(--ah-*)`; verify both the Cànic and minimal-branding fixtures.
- Preserve semantic HTML, visible labels, accessible names, keyboard order, focus
  restoration, status announcements, and AA contrast.
- Register module-owned routes, tabs, and menu entries in
  `packages/ui/src/modules.ts`. Wrap routes with `RequireModule` and
  `RequireRole`/`RequireAuth`; filter navigation so disabled modules leave no dead link.
  This route pattern is from `apps/clubs/src/App.tsx`:

```tsx
const requiredModules = requiredModulesForUiItem("routes", route.path);
requiredModules.forEach((module) => {
  content = <RequireModule module={module}>{content}</RequireModule>;
});
if (route.roles !== undefined) {
  content = <RequireRole roles={route.roles}>{content}</RequireRole>;
}
```

## 5. Prove behavior and fidelity

- Add Vitest/Testing Library coverage for rules, states, accessibility, module absence,
  and role absence. Test suites and cases carry the spec ID. Existing precedent in
  `apps/clubs/src/App.test.tsx` is `describe("T-02-14 clubs shell", ...)`.
- Add a Playwright happy path plus required failure/empty paths, also named with the
  `T-xx-nn` ID. Select scenarios before navigation and query by accessible role/name.
- Capture the implemented route at 375 px and 1280 px. Save committed images under
  `roadmap/evidence/<TASK-ID>/`, and compare each side by side with the approved PNG.
  Record visible differences and the reason; color and logos are not optional here.
- Run Playwright through `scripts/e2e-docker.sh`. If Docker is unavailable, record the
  full failure and leave screenshot capture to the organizer; browser sandbox failure
  is not a task blocker.

## 6. Finish the task

Run every task-specific verification command, `pnpm i18n:check`, and the proportionate
lint/typecheck/test/build commands. Paste full outputs in the executor report, list the
implemented rules/tests and evidence paths, update `CHANGELOG.md`, then set the task to
`awaiting_verification` with `roadmap/tools/check.py`.
