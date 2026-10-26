#!/usr/bin/env python3
"""Evidence-only runner for isolated final-image functional stages."""
import hashlib
import json
import os
import re
from pathlib import Path
import shlex
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
HEAVY = "/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh"
IMAGE = "agilityhub-core-api:review-fixes-20261024"
IMAGE_ID = os.environ.get("FUNCTIONAL_EXPECTED_IMAGE_ID")
if IMAGE_ID is None:
    raise SystemExit("FUNCTIONAL_EXPECTED_IMAGE_ID must pin the newly verified image")


def inputs():
    names = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
    ).decode().split("\0")
    selected = sorted(set(name for name in names if name and (
        name.startswith(("apps/", "packages/", "scripts/", "e2e/"))
        or name in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json")
    )))
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in selected if (ROOT / name).is_file()}


def main():
    locked = "--locked" in sys.argv
    if locked:
        sys.argv.remove("--locked")
    if len(sys.argv) != 2 or not re.fullmatch(r"(?:d11|e11|production)(?:-r[2-9])?", sys.argv[1]):
        raise SystemExit("usage: run-core.py d11|e11|production[-rN]")
    if not locked:
        env = os.environ.copy()
        env["HEAVY_WAIT_MIN"] = "120"
        env["PATH"] = "/opt/homebrew/opt/node@22/bin:" + env["PATH"]
        raise SystemExit(subprocess.run([HEAVY, sys.executable, str(Path(__file__).resolve()), "--locked", sys.argv[1]], cwd=ROOT, env=env).returncode)
    stage = sys.argv[1]
    kind = stage.split("-")[0]
    prefix = {"d11": "01-core-", "e11": "02-core-", "production": "03-core-"}[kind] + stage
    stem = EVIDENCE / prefix
    if stem.with_suffix(".command").exists():
        raise SystemExit("Refusing to overwrite existing stage evidence")
    actual = json.loads(subprocess.check_output(["docker", "image", "inspect", IMAGE], cwd=ROOT))[0]
    if actual["Id"] != IMAGE_ID:
        raise SystemExit("Final image identity mismatch")
    before = inputs()
    if kind == "production":
        before.update({str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                       for path in EVIDENCE.iterdir() if path.suffix in (".mjs", ".ts", ".py", ".yml")})
    stem.with_name(prefix + "-tested-inputs.json").write_text(json.dumps(before, indent=2) + "\n")
    relative = f"2026-10-24-functional-fixes-release/core-{stage}"
    specification = ("--config=roadmap/evidence/2026-10-24-functional-fixes-release/playwright.production.config.ts production-functional.spec.ts"
                     if kind == "production" else kind + "-core.spec.ts --trace=off")
    command = ["env", "HEAVY_WAIT_MIN=120", "CORE_IMAGE=" + IMAGE,
               "CORE_PROJECT_NAME=agilityhub-functional-release-" + stage,
               *([sys.executable, str(EVIDENCE / "with-https-compose.py")] if kind == "production" else []),
               "bash", "scripts/e2e-core.sh", relative, specification]
    stem.with_suffix(".command").write_text(shlex.join(command) + "\n")
    print("START " + prefix, flush=True)
    started = time.monotonic()
    with stem.with_suffix(".log").open("w") as log:
        result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, env=os.environ.copy())
    stem.with_suffix(".exit").write_text(str(result.returncode) + "\n")
    after = inputs()
    if kind == "production":
        after.update({str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                      for path in EVIDENCE.iterdir() if path.suffix in (".mjs", ".ts", ".py", ".yml")})
    stem.with_name(prefix + "-after-tested-inputs.json").write_text(json.dumps(after, indent=2) + "\n")
    changed = sorted(name for name in set(before) | set(after) if before.get(name) != after.get(name))
    project = "agilityhub-functional-release-" + stage
    cleanup = {}
    for resource, args in [("containers", ["docker", "ps", "-a", "--format", "{{.Names}}"]),
                           ("networks", ["docker", "network", "ls", "--format", "{{.Name}}"]),
                           ("volumes", ["docker", "volume", "ls", "--format", "{{.Name}}"])]:
        cleanup[resource] = [name for name in subprocess.check_output(args, text=True).splitlines() if name.startswith(project)]
    cleaned = all(not names for names in cleanup.values())
    summary = {"cleanup": cleanup, "cleanupComplete": cleaned, "elapsedSeconds": round(time.monotonic()-started, 2), "stage": stage, "image": IMAGE, "imageId": actual["Id"], "architecture": actual["Architecture"],
               "exitCode": result.returncode, "inputCount": len(before), "inputsUnchanged": before == after, "changedInputs": changed,
               "scope": "Fresh fictional members and transactions; isolated safe demo club configuration; local-profile API; no provider operations"}
    stem.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary), flush=True)
    raise SystemExit(result.returncode if before == after and cleaned else 99)


if __name__ == "__main__":
    main()
