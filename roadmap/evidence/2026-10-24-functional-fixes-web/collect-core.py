#!/usr/bin/env python3
"""Collect only finished successful unique stages, retaining exact commands and log tails."""
import hashlib
import json
from pathlib import Path
import re
import sys

out = Path(__file__).resolve().parent
expected = {"e2": 5, "e3": 5, "e4": 7, "e5": 11, "e6": 14, "e7": 11, "e8": 6}
stages = sys.argv[1:]
assert len(stages) == 7 and {stage.split("-")[0] for stage in stages} == set(expected)
results = []
baseline_path = out / "../2026-10-24-functional-fixes-root/40-final-ci-tested-inputs.json"
baseline = json.loads(baseline_path.read_text())
allowed_changed = {"scripts/e2e-core.sh"}
allowed_added = {"scripts/core-stack/wait-for-outbox.mjs", "scripts/core-stack/wait-for-outbox.test.mjs"}
markdown = ["# Final real-Core profile runs\n", "Each command used the shared heavy lock, a fresh fictional seed, the exact reviewed API image and local fake providers. Prior attempts are retained separately and are not double-counted.\n"]
for stage in stages:
    stem = out / ("core-" + stage)
    summary = json.loads(stem.with_suffix(".summary.json").read_text())
    log = stem.with_suffix(".log").read_text()
    tail = "\n".join(log.splitlines()[-40:])
    totals = {}
    for key, pattern in [("passed", r"(?m)^\s*(\d+) passed\b"), ("failed", r"(?m)^\s*(\d+) failed\b"), ("skipped", r"(?m)^\s*(\d+) skipped\b"), ("notRun", r"(?m)^\s*(\d+) did not run\b")]:
        matches = re.findall(pattern, log)
        totals[key] = int(matches[-1]) if matches else 0
    assert totals == {"passed": expected[stage.split("-")[0]], "failed": 0, "skipped": 0, "notRun": 0}, (stage, totals)
    assert summary["commandExitCode"] == 0 and summary["inputsUnchanged"] and summary["cleanupComplete"], summary
    assert summary["imageId"] == "sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9", summary
    manifest = stem.with_name(stem.name + "-tested-inputs.json")
    inputs = json.loads(manifest.read_text())
    changed = sorted(key for key in inputs.keys() & baseline.keys() if inputs[key] != baseline[key])
    added = sorted(inputs.keys() - baseline.keys())
    removed = sorted(baseline.keys() - inputs.keys())
    stage_allowed_changed = allowed_changed | ({"e2e/core/e8-core.spec.ts"} if stage.startswith("e8") else set())
    assert not removed and set(changed) <= stage_allowed_changed and set(added) <= allowed_added, (stage, changed, added, removed)
    assert (not changed and not added) or (set(changed) == stage_allowed_changed and set(added) == allowed_added), (stage, changed, added)
    kind = "original-product-freeze" if not changed else ("same-product-with-local-outbox-readiness-and-passwordless-owner-fixture" if stage.startswith("e8") else "same-product-with-local-outbox-readiness")
    provenance = {"baseline": str(baseline_path.relative_to(out)), "kind": kind, "changed": changed, "added": added, "removed": removed, "productInputsMatchBaseline": True}
    result = {"stage": stage, "provenance": provenance, **totals, **summary, "manifestSha256": hashlib.sha256(manifest.read_bytes()).hexdigest(), "logSha256": hashlib.sha256(stem.with_suffix(".log").read_bytes()).hexdigest()}
    if changed:
        readiness_path = stem / "outbox-ready-files.jsonl"
        readiness = [json.loads(line) for line in readiness_path.read_text().splitlines()]
        assert len(readiness) >= 3 and all(row["pending"] == 0 and row["failed"] == 0 for row in readiness[-3:]), (stage, readiness[-3:])
        assert readiness[-1]["elapsedMs"] - readiness[-3]["elapsedMs"] >= 2000, stage
        result["outboxReadiness"] = {"initialPending": readiness[0]["pending"], "elapsedMs": readiness[-1]["elapsedMs"], "quietSpanMs": readiness[-1]["elapsedMs"] - readiness[-3]["elapsedMs"], "samples": len(readiness), "path": str(readiness_path.relative_to(out))}
    results.append(result)
    command = stem.with_suffix(".command").read_text()
    launcher = "run-e3-observed-r5.py" if stage == "e3-r5" else f"run-core.py {stage}"
    outer_command = "env PATH=/opt/homebrew/opt/node@22/bin:$PATH HEAVY_WAIT_MIN=120 bash '/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament/roadmap-kit/mac/heavy.sh' python3 roadmap/evidence/2026-10-24-functional-fixes-web/" + launcher + " sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9"
    result["outerCommand"] = outer_command
    markdown.extend(["## " + stage + "\n", f"Exit 0; {totals['passed']} passed, zero failed/skipped/not-run; {summary['inputCount']} inputs unchanged; owned resources removed.\n", "Shared-lock invocation:\n\n```sh\n" + outer_command + "\n```\n", "Executed stage command:\n\n```sh\n" + command + "```\n", "Last 40 lines:\n\n```text\n" + tail + "\n```\n"])
e7stage = next(stage for stage in stages if stage.startswith("e7"))
e7record = json.loads((out / ("core-" + e7stage) / "e7-core-run.json").read_text())
assert e7record["steps"]["clock"]["status"] == 200, "E7 local clock did not run"
assert not any(key.endswith("-skipped") for key in e7record["steps"]), "E7 conditional branch skipped"
assert e7record["steps"]["j-clock-restored"] == {"moved": True, "status": 200}, "E7 local clock did not restore"
e8stage = next(stage for stage in stages if stage.startswith("e8"))
e8record = json.loads((out / ("core-" + e8stage) / "e8-gate-record.json").read_text())
assert e8record["permissions"]["familyPartnerChecked"] is True, "Same-family isolation branch did not run"
assert e8record["ownerLocaleAuthentication"]["method"] == "magic-link" and e8record["ownerLocaleAuthentication"]["normalAccount"] is True and e8record["ownerLocaleAuthentication"]["exchangeStatus"] == 200, "Passwordless normal owner authentication not proven"
provenance_note = "All stages use the same final product/API source. E2/E4/E5 retain the 946-input baseline; E3/E6/E7 add only the local outbox readiness helper/test and its e2e-core.sh call (948 inputs). Final E8 uses those same readiness files plus its test-only passwordless-owner magic-link helper and atomic mailbox-file filter (948 inputs). Exact stage manifests are retained; earlier successes are not relabelled as later-source reruns."
markdown.insert(2, provenance_note + "\n")
collection = {"provenance": provenance_note, "allProductInputsMatchBaseline": all(item["provenance"]["productInputsMatchBaseline"] for item in results), "totalUniquePassed": sum(item["passed"] for item in results), "failed": 0, "skipped": 0, "notRun": 0, "sameManifestAcrossStages": len({item["manifestSha256"] for item in results}) == 1, "e7Clock": e7record["steps"]["clock"], "e7ClockRestored": e7record["steps"]["j-clock-restored"], "e8Permissions": e8record["permissions"], "e8OwnerAuthentication": e8record["ownerLocaleAuthentication"], "stages": results}
(out / "FINAL_CORE_RESULTS.json").write_text(json.dumps(collection, indent=2) + "\n")
(out / "FINAL_CORE_COMMANDS.md").write_text("\n".join(markdown))
print(json.dumps({key: value for key, value in collection.items() if key != "stages"}, indent=2))
