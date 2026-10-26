#!/usr/bin/env python3
"""Retain exact local verification commands, results and source identities."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
HEAVY = "/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh"


def inputs():
    paths = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
    ).decode().split("\0")
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in sorted(set(paths)) if name and (ROOT / name).is_file()
            and (name.startswith(("apps/", "packages/", "scripts/", "e2e/"))
                 or name in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json"))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("name")
    parser.add_argument("--light", action="store_true")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command or "/" in args.name:
        parser.error("Use a unique evidence stem followed by -- and the command")
    stem = OUT / args.name
    if stem.with_suffix(".command").exists():
        raise RuntimeError("Refusing to overwrite a previous attempt")
    environment = os.environ.copy()
    environment["PATH"] = "/opt/homebrew/opt/node@22/bin:" + environment["PATH"]
    environment["HEAVY_WAIT_MIN"] = "120"
    if not args.light:
        # Snapshot only after the shared lock is acquired, never while a command is queued.
        locked = [HEAVY, sys.executable, str(Path(__file__).resolve()), "--light", args.name, "--", *command]
        raise SystemExit(subprocess.run(locked, cwd=ROOT, env=environment).returncode)
    before = inputs()
    (OUT / (args.name + "-tested-inputs.json")).write_text(json.dumps(before, indent=2) + "\n")
    stem.with_suffix(".command").write_text(shlex.join(command) + "\n")
    started = time.monotonic()
    with stem.with_suffix(".log").open("w") as log:
        result = subprocess.run(command, cwd=ROOT, env=environment, stdout=log, stderr=subprocess.STDOUT)
    after = inputs()
    changed = sorted(name for name in set(before) | set(after) if before.get(name) != after.get(name))
    summary = {"commandExitCode": result.returncode, "inputCount": len(before),
               "inputsUnchanged": not changed, "changedInputs": changed,
               "elapsedSeconds": round(time.monotonic() - started, 2),
               "node": subprocess.check_output(["node", "--version"], env=environment, text=True).strip()}
    stem.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    print("\n".join(stem.with_suffix(".log").read_text().splitlines()[-40:]))
    raise SystemExit(result.returncode if not changed else 99)


if __name__ == "__main__":
    main()
