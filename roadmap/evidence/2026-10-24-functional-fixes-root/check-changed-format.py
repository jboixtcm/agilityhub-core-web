#!/usr/bin/env python3
import subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[3]
files = set()
for command in (["git", "diff", "--name-only", "-z"], ["git", "ls-files", "--others", "--exclude-standard", "-z"]):
    files.update(subprocess.check_output(command, cwd=root).decode().split("\0"))
# The copied OpenAPI snapshot is byte-for-byte API output, never manually reformatted.
files.discard("packages/api-client/openapi/openapi.json")
files = sorted(f for f in files if f.startswith(("apps/", "packages/", "e2e/", "scripts/")) and Path(f).suffix in (".ts", ".tsx", ".css", ".json", ".mjs", ".yml"))
raise SystemExit(subprocess.run(["corepack", "pnpm", "exec", "prettier", "--check", *files], cwd=root).returncode)
