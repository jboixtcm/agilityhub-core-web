#!/usr/bin/env python3
"""Run one fresh reviewed-image stage after the caller acquires the shared heavy lock."""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
IMAGE = "agilityhub-core-api:review-fixes-20261024"


def output(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def inputs():
    names = output("git", "ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0")
    return {
        name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        for name in sorted(set(names)) if name and (ROOT / name).is_file()
        and (name.startswith(("apps/", "packages/", "scripts/", "e2e/"))
             or name in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json"))
    }


def main():
    if len(sys.argv) != 3 or not re.fullmatch(r"(?:e1|e4w16|e9|e10|auth)(?:-r[2-9])?", sys.argv[1]):
        raise SystemExit("usage: heavy.sh python3 run-core.py e1|e4w16|e9|e10|auth[-rN] sha256:...")
    if not Path("/tmp/agilityhub-heavy.lock").is_dir():
        raise SystemExit("Run through the shared heavy.sh wrapper")
    stage, expected_id = sys.argv[1:]
    stem = OUT / ("core-" + stage)
    if stem.with_suffix(".command").exists():
        raise SystemExit("Refusing to overwrite an existing attempt")
    actual = json.loads(output("docker", "image", "inspect", IMAGE))[0]
    if actual["Id"] != expected_id:
        raise SystemExit("Reviewed image identity mismatch")
    before = inputs()
    stem.with_name(stem.name + "-tested-inputs.json").write_text(json.dumps(before, indent=2) + "\n")
    kind = stage.split("-")[0]
    spec = "functional-auth.spec.ts" if kind == "auth" else kind + "-core.spec.ts"
    project = "agilityhub-functional-fixes-root-" + stage
    command = ["pnpm", "e2e:core", "2026-10-24-functional-fixes-root/core-" + stage, spec + " --trace=off"]
    environment = os.environ.copy()
    environment.update(CORE_IMAGE=IMAGE, CORE_PROJECT_NAME=project)
    stem.with_suffix(".command").write_text(
        shlex.join(["env", "CORE_IMAGE=" + IMAGE, "CORE_PROJECT_NAME=" + project, *command]) + "\n"
    )
    started = time.monotonic()
    with stem.with_suffix(".log").open("w") as log:
        result = subprocess.run(command, cwd=ROOT, env=environment, stdout=log, stderr=subprocess.STDOUT)
    after = inputs()
    changed = sorted(name for name in set(before) | set(after) if before.get(name) != after.get(name))
    cleanup = {}
    for resource, args in [
        ("containers", ("docker", "ps", "-a", "--format", "{{.Names}}")),
        ("networks", ("docker", "network", "ls", "--format", "{{.Name}}")),
        ("volumes", ("docker", "volume", "ls", "--format", "{{.Name}}")),
    ]:
        cleanup[resource] = [name for name in output(*args).splitlines() if name.startswith(project)]
    cleaned = all(not names for names in cleanup.values())
    summary = {
        "stage": stage, "image": IMAGE, "imageId": actual["Id"], "architecture": actual["Architecture"],
        "commandExitCode": result.returncode, "inputCount": len(before), "inputsUnchanged": not changed,
        "changedInputs": changed, "cleanup": cleanup, "cleanupComplete": cleaned,
        "elapsedSeconds": round(time.monotonic() - started, 2),
        "scope": "Fresh fictional demo seed; local-profile API; local fake payment/mail; no external provider or production operations",
    }
    stem.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2), flush=True)
    print("\n".join(stem.with_suffix(".log").read_text().splitlines()[-40:]), flush=True)
    raise SystemExit(result.returncode if not changed and cleaned else 99)


if __name__ == "__main__":
    main()
