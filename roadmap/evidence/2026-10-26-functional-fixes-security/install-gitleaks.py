#!/usr/bin/env python3
"""Install the pinned audit scanner after verifying its official release checksum."""
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import tarfile

version = "8.30.1"
if platform.system() != "Darwin" or platform.machine() != "arm64":
    raise SystemExit("This pinned package is only for Darwin arm64")
base = f"https://github.com/gitleaks/gitleaks/releases/download/v{version}/"
name = f"gitleaks_{version}_darwin_arm64.tar.gz"
checksums_name = f"gitleaks_{version}_checksums.txt"
tools = Path("/Users/jordib/dev/agilityhub/agilityhub-core-api/.local/security-tools")
staging = tools / f"gitleaks-{version}-download"
staging.mkdir(exist_ok=True)
for filename in (checksums_name, name):
    destination = staging / filename
    if not destination.exists():
        data = subprocess.check_output(["curl", "--fail", "--location", "--silent", "--show-error",
                                        "--connect-timeout", "15", "--max-time", "60", base + filename])
        with destination.open("xb") as target:
            target.write(data)
checksums = (staging / checksums_name).read_text()
matching = [line.split()[0] for line in checksums.splitlines() if line.split()[-1].lstrip("*") == name]
if len(matching) != 1:
    raise SystemExit("Expected exactly one checksum entry")
archive = staging / name
actual = hashlib.sha256(archive.read_bytes()).hexdigest()
if actual != matching[0]:
    raise SystemExit("Official release archive checksum mismatch")
with tarfile.open(archive, "r:gz") as bundle:
    member = bundle.getmember("gitleaks")
    if not member.isfile():
        raise SystemExit("Release scanner must be a regular file")
    stream = bundle.extractfile(member)
    if stream is None:
        raise SystemExit("Missing scanner bytes")
    binary = stream.read()
destination = tools / f"gitleaks-{version}"
if destination.exists() and destination.read_bytes() != binary:
    raise SystemExit("Refusing to replace a different existing scanner")
if not destination.exists():
    with destination.open("xb") as target:
        target.write(binary)
os.chmod(destination, 0o755)
installed = subprocess.check_output([str(destination), "version"], text=True).strip()
if installed != version:
    raise SystemExit("Installed version mismatch")
report = {"version": installed, "path": str(destination), "packageUrl": base + name,
          "checksumsUrl": base + checksums_name, "packageSha256": actual,
          "binarySha256": hashlib.sha256(binary).hexdigest(), "checksumVerified": True,
          "method": "Official release archive and checksum file fetched over HTTPS; scanner version executed locally. No sources scanned by this installer."}
output = Path(__file__).resolve().parent / "gitleaks-install.json"
if output.exists():
    raise SystemExit("Refusing to overwrite prior install evidence")
output.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
