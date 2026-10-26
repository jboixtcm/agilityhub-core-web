#!/usr/bin/env python3
"""Read-only final integrity checks; never treats an expected product red as green."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

WEB = Path(__file__).resolve().parents[3]
API = WEB.parent / "agilityhub-core-api"
OUT = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def baseline(root, relative, field=None, predicate=lambda name: True):
    data = json.loads((root / relative).read_text())
    hashes = data[field] if field else data
    selected = {name: value for name, value in hashes.items() if predicate(name)}
    changed = [name for name, value in selected.items() if digest(root / name) != value]
    return {"baseline": relative, "checkedFiles": len(selected), "changed": changed,
            "passed": not changed}


def product_web(name):
    parts = Path(name).parts
    if "e2e" in parts or name.startswith(("scripts/", "roadmap/")):
        return False
    return True


def main():
    output = OUT / "final-functional-integrity.json"
    if output.exists():
        raise RuntimeError("Refusing to overwrite the final check")
    checks = {
        "apiUnchangedFromFullVerify": baseline(API,
            "roadmap/evidence/2026-10-23-api-review/13-expanded-clean-verify-tested-inputs.json", "sha256"),
        "webProductUnchangedFromFunctionalStart": baseline(WEB,
            "roadmap/evidence/2026-10-23-functional-release/03-core-production-tested-inputs.json",
            predicate=product_web),
        "newAuthTestAndDependenciesUnchanged": baseline(WEB,
            "roadmap/evidence/2026-10-23-functional-root/auth-tested-inputs.json"),
    }
    checks["adoptedApiContract"] = {"passed": digest(API / "docs/openapi/openapi.json") ==
                                   digest(WEB / "packages/api-client/openapi/openapi.json")}
    for root in (API, WEB):
        result = subprocess.run(["git", "diff", "--check"], cwd=root, capture_output=True, text=True)
        checks[root.name + "Whitespace"] = {"exitCode": result.returncode,
            "output": result.stdout + result.stderr, "passed": result.returncode == 0}
    image = json.loads(subprocess.check_output(
        ["docker", "image", "inspect", "agilityhub-core-api:review-20261023"], text=True))[0]
    checks["sameApiImage"] = {"architecture": image["Architecture"], "passed": image["Id"] ==
        "sha256:1e8060615d372dc826ea431e1cd9ef3733c440d7ce4ecc02199f708e9c6d752e"}
    result = {"checks": checks, "passed": all(row["passed"] for row in checks.values()),
              "scope": "Integrity and whitespace only; functional results and known defects remain in the reports."}
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
