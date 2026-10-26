#!/usr/bin/env python3
"""Run each final real-image browser group with its own host lock and fresh stack."""
import os
from pathlib import Path
import subprocess
import sys
import time

folder = Path(__file__).resolve().parent
heavy = "/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh"
environment = os.environ.copy()
environment["PATH"] = "/opt/homebrew/opt/node@22/bin:" + environment["PATH"]
environment["HEAVY_WAIT_MIN"] = "120"
image = "sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9"
for stage in ("e1-r3", "e4w16-r2", "e9-r2", "e10-r2", "auth-r2"):
    result = subprocess.run([heavy, sys.executable, str(folder / "run-core.py"), stage, image], env=environment)
    print(f"ROOT FINAL STAGE {stage}: exit {result.returncode}", flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
    time.sleep(16)

