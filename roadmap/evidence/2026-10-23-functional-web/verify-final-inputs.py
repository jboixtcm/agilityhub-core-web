"""Read-only verification of this functional review's inputs and cleanup."""
from pathlib import Path
import hashlib
import json
import subprocess


EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
IMAGE = "agilityhub-core-api:review-20261023"
IMAGE_ID = "sha256:1e8060615d372dc826ea431e1cd9ef3733c440d7ce4ecc02199f708e9c6d752e"
PREFIX = "agilityhub-2026-10-23-functional-web"
EXPECTED = [
    "e2e/core/e4-core.spec.ts",
    "e2e/core/e5-core.spec.ts",
    "e2e/core/e7-core.spec.ts",
    "e2e/core/e8-core.spec.ts",
]


def output(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


baseline = json.loads((EVIDENCE / "functional-baseline-tested-inputs.json").read_text())
final = json.loads((EVIDENCE / "functional-final-tested-inputs.json").read_text())
actual = {
    path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
    for path in baseline
}
assert len(actual) == 34 and actual == final
changed = [path for path in baseline if actual[path] != baseline[path]]
assert changed == EXPECTED, changed
print("34 final inputs match saved manifest; exactly 4 harness deltas:")
print("\n".join(changed))
print("Other 30 baseline inputs unchanged, including every tracked product input.")
assert output("docker", "image", "inspect", IMAGE, "--format", "{{.Id}}") == IMAGE_ID
print("Pinned review image unchanged.")
for kind, args in [
    ("containers", ("docker", "ps", "-a", "--format", "{{.Names}}")),
    ("networks", ("docker", "network", "ls", "--format", "{{.Name}}")),
    ("volumes", ("docker", "volume", "ls", "--format", "{{.Name}}")),
]:
    remaining = [name for name in output(*args).splitlines() if name.startswith(PREFIX)]
    assert not remaining, (kind, remaining)
    print(f"Owned {kind} remaining: 0")
assert not Path("/tmp/agilityhub-heavy.lock").exists()
print("Heavy lock absent.")
archives = [
    str(path.relative_to(EVIDENCE))
    for path in EVIDENCE.rglob("*")
    if path.suffix.lower() in {".zip", ".har", ".webm"}
]
assert not archives, archives
print("Retained trace/HAR/video archives: 0")
subprocess.run(["git", "diff", "--check"], cwd=ROOT, check=True)
print("git diff --check: exit 0")
