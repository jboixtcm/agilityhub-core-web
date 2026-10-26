pnpm exec eslint e2e/core/e8-core.spec.ts --max-warnings 0
pnpm typecheck:e2e-core
pnpm exec prettier --check e2e/core/e8-core.spec.ts
