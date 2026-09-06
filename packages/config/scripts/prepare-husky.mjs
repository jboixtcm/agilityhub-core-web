import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";

const hooks = [".husky/pre-commit", ".husky/commit-msg"];

await Promise.all(hooks.map((hook) => access(hook)));

if (process.env.CODEX_SANDBOX === undefined) {
  const result = spawnSync("husky", { stdio: "inherit" });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} else {
  console.log("Husky hooks verified; Git activation skipped in the read-only Codex sandbox.");
}
