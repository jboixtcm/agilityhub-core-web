pnpm --filter clubs exec vitest run src/courses/register-level-labels.test.tsx src/courses/courses.test.tsx
pnpm exec eslint apps/clubs/src/courses/RegisterSetupPage.tsx apps/clubs/src/courses/register-level-labels.test.tsx e2e/core/e3-signup.spec.ts --max-warnings 0
pnpm --filter clubs typecheck
pnpm typecheck:e2e-core
pnpm exec prettier --check apps/clubs/src/courses/RegisterSetupPage.tsx apps/clubs/src/courses/register-level-labels.test.tsx e2e/core/e3-signup.spec.ts
