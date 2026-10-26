#!/usr/bin/env python3
"""Focused INC-99/E3 checks; caller acquires the shared heavy lock."""
import importlib.util
import json
from pathlib import Path
import shlex
import subprocess
import time

out = Path(__file__).resolve().parent
root = out.parents[2]
spec = importlib.util.spec_from_file_location("profile_runner", out / "run-core.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
commands = [
    ["pnpm", "--filter", "clubs", "exec", "vitest", "run", "src/courses/register-level-labels.test.tsx", "src/courses/courses.test.tsx"],
    ["pnpm", "exec", "eslint", "apps/clubs/src/courses/RegisterSetupPage.tsx", "apps/clubs/src/courses/register-level-labels.test.tsx", "e2e/core/e3-signup.spec.ts", "--max-warnings", "0"],
    ["pnpm", "--filter", "clubs", "typecheck"],
    ["pnpm", "typecheck:e2e-core"],
    ["pnpm", "exec", "prettier", "--check", "apps/clubs/src/courses/RegisterSetupPage.tsx", "apps/clubs/src/courses/register-level-labels.test.tsx", "e2e/core/e3-signup.spec.ts"],
]
stem = out / "11-inc99-and-e3-focused-r2"
assert Path("/tmp/agilityhub-heavy.lock").is_dir()
assert not stem.with_suffix(".command").exists()
before = module.inputs()
stem.with_name(stem.name + "-tested-inputs.json").write_text(json.dumps(before, indent=2) + "\n")
stem.with_suffix(".command").write_text("\n".join(shlex.join(command) for command in commands) + "\n")
started = time.monotonic()
code = 0
with stem.with_suffix(".log").open("w") as log:
    for command in commands:
        print("$ " + shlex.join(command), file=log, flush=True)
        code = subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT).returncode
        if code:
            break
after = module.inputs()
changed = sorted(name for name in set(before) | set(after) if before.get(name) != after.get(name))
summary = {"commandExitCode": code, "inputCount": len(before), "inputsUnchanged": not changed, "changedInputs": changed, "elapsedSeconds": round(time.monotonic() - started, 2)}
stem.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
print("\n".join(stem.with_suffix(".log").read_text().splitlines()[-40:]))
raise SystemExit(code if not changed else 99)
