#!/usr/bin/env python3
"""Evidence-only exact-image vulnerability scan, serialized by the shared host lock."""
import collections
import datetime
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

EVIDENCE = Path(__file__).resolve().parent
API = Path("/Users/jordib/dev/agilityhub/agilityhub-core-api")
TRIVY = API / ".local/security-tools/trivy-0.74.0"
CACHE = API / ".local/security-tools/db"
HEAVY = Path("/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh")
IMAGE = "agilityhub-core-api:review-fixes-20261024"


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def metadata():
    return {name: json.loads((CACHE / name).read_text()) if (CACHE / name).exists() else None
            for name in ("db/metadata.json", "java-db/metadata.json")}


def run(name, command):
    stem = EVIDENCE / name
    if stem.with_suffix(".command").exists():
        raise SystemExit(f"Refusing to overwrite {name}")
    stem.with_suffix(".command").write_text(shlex.join(command) + "\n")
    with stem.with_suffix(".log").open("w") as log:
        result = subprocess.run(command, cwd=API, stdout=log, stderr=subprocess.STDOUT)
    stem.with_suffix(".exit").write_text(str(result.returncode) + "\n")
    print(f"{name}: exit {result.returncode}", flush=True)
    return result.returncode


def main():
    expected = os.environ.get("FUNCTIONAL_EXPECTED_IMAGE_ID", "")
    if not expected.startswith("sha256:") or len(expected) != 71:
        raise SystemExit("FUNCTIONAL_EXPECTED_IMAGE_ID must pin the newly verified image")
    if sys.argv[1:] != ["--locked"]:
        command = ["env", "HEAVY_WAIT_MIN=120", str(HEAVY), sys.executable, str(Path(__file__).resolve()), "--locked"]
        raise SystemExit(subprocess.run(command).returncode)
    if (EVIDENCE / "40-image-scan-summary.json").exists():
        raise SystemExit("Refusing to overwrite final scan evidence")
    image = json.loads(subprocess.check_output(["docker", "image", "inspect", IMAGE], cwd=API))[0]
    if image["Id"] != expected:
        raise SystemExit("Image identity mismatch")
    started = timestamp()
    before = metadata()
    command = ["env", "TRIVY_CACHE_DIR=" + str(CACHE), str(TRIVY), "image", "--skip-version-check", "--no-progress", "--timeout", "10m"]
    # Each database is requested once. Failure remains visible; a cached fallback is never called fresh.
    db = run("40-update-vulnerability-db", [*command, "--download-db-only"])
    java = run("41-update-java-db", [*command, "--download-java-db-only"])
    after = metadata()
    raw = EVIDENCE / "42-image-scan-raw.json"
    scan = run("42-image-scan", [*command, "--skip-db-update", "--skip-java-db-update", "--offline-scan",
                               "--image-src", "docker", "--scanners", "vuln", "--list-all-pkgs",
                               "--severity", "UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL",
                               "--format", "json", "--output", str(raw), expected])
    report = json.loads(raw.read_text()) if raw.exists() else {}
    findings = [{"target": result.get("Target"), "type": result.get("Type"),
                 "id": item["VulnerabilityID"], "package": item["PkgName"],
                 "installed": item.get("InstalledVersion"), "fixed": item.get("FixedVersion"),
                 "severity": item["Severity"], "packagePath": item.get("PkgPath")}
                for result in report.get("Results", []) for item in result.get("Vulnerabilities", [])]
    counts = collections.Counter(item["severity"] for item in findings)
    summary = {"startedAt": started, "finishedAt": timestamp(), "imageTag": IMAGE, "imageId": expected,
               "architecture": image["Architecture"], "os": image["Os"], "imageCreated": image["Created"],
               "scanner": "Trivy 0.74.0", "scannerSha256": hashlib.sha256(TRIVY.read_bytes()).hexdigest(),
               "databaseUpdateExitCodes": {"vulnerability": db, "java": java},
               "databaseBefore": before, "databaseAfter": after, "scanExitCode": scan,
               "mode": "Exact local Docker image; offline analysis after the recorded database update attempts",
               "packageFindings": len(findings), "distinctVulnerabilityIds": len({item["id"] for item in findings}),
               "severityCounts": {key: counts[key] for key in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN")},
               "scope": "Local architecture only; no registry push, remote deploy or provider operation. A scan is advisory-database coverage, not a proof of absence of vulnerabilities.",
               "findings": findings}
    (EVIDENCE / "40-image-scan-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    previous_path = API / "roadmap/evidence/2026-10-23-release-review/final-image-scan-summary.json"
    if scan == 0 and previous_path.exists():
        previous = json.loads(previous_path.read_text())
        key = lambda item: (item["type"], item["id"], item["package"], item.get("installed"), item["severity"])
        previous_keys = {key(item) for item in previous["findings"]}
        current_keys = {key(item) for item in findings}
        delta = {"baseline": str(previous_path), "baselineImageId": previous["image"]["imageId"],
                 "currentImageId": expected,
                 "scope": "Package/advisory/severity comparison across two local images and the recorded database versions; absence is not a security guarantee.",
                 "addedOrSeverityChanged": [item for item in findings if key(item) not in previous_keys],
                 "removedOrSeverityChanged": [item for item in previous["findings"] if key(item) not in current_keys]}
        (EVIDENCE / "44-image-scan-delta.json").write_text(json.dumps(delta, indent=2) + "\n")
    result = 1 if scan or db or java or counts["CRITICAL"] or counts["HIGH"] else 0
    (EVIDENCE / "43-image-scan-policy.exit").write_text(str(result) + "\n")
    print(json.dumps({key: summary[key] for key in ("imageId", "architecture", "databaseUpdateExitCodes", "scanExitCode", "packageFindings", "distinctVulnerabilityIds", "severityCounts")}), flush=True)
    raise SystemExit(result)


if __name__ == "__main__":
    main()
