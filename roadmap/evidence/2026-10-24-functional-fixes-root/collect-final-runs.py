#!/usr/bin/env python3
"""Read the unique final real-browser runs; do not add retries or subassertions."""
import json
import hashlib
from pathlib import Path
import re
import sys
base = Path(__file__).resolve().parents[1]
root = Path(__file__).resolve().parent
baseline = json.loads((root / "40-final-ci-tested-inputs.json").read_text())
final_baseline = json.loads((root / "48-harness-final-inputs.json").read_text())
e8_baseline = json.loads((root / "54-final-browser-tested-inputs.json").read_text())
allowed_delta = {"scripts/core-stack/wait-for-outbox.mjs", "scripts/core-stack/wait-for-outbox.test.mjs", "scripts/e2e-core.sh"}
actual_delta = {name for name in set(baseline) | set(final_baseline) if baseline.get(name) != final_baseline.get(name)}
if actual_delta != allowed_delta:
    raise SystemExit("Unexpected change outside the reviewed local-runner readiness correction")
e8_delta = {name for name in set(final_baseline) | set(e8_baseline) if final_baseline.get(name) != e8_baseline.get(name)}
if e8_delta != {"e2e/core/e8-core.spec.ts"}:
    raise SystemExit("Unexpected change outside the reviewed passwordless-owner fixture correction")
workspace = root.parents[2]
current_mismatches = [name for name,digest in e8_baseline.items() if not (workspace/name).is_file() or hashlib.sha256((workspace/name).read_bytes()).hexdigest()!=digest]
new_harness_groups = {"core-e3-r5", "core-e6", "core-e7"}
image = "sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9"
groups = [("web", "core-" + stage, count) for stage, count in [("e2-r5",5),("e3-r5",5),("e4",7),("e5",11),("e6",14),("e7",11),("e8-r3",6)]]
groups += [("root", "core-" + stage, count) for stage, count in [("e1-r3",8),("e4w16-r2",5),("e9-r2",3),("e10-r2",6),("auth-r2",3)]]
groups += [("release", stem, count) for stem,count in [("01-core-d11-r3",1),("02-core-e11-r3",2),("03-core-production-r3",4)]]
rows=[]
for lane,stem,expected in groups:
    folder=base / ("2026-10-24-functional-fixes-" + lane)
    path=folder / (stem + ".summary.json")
    if not path.exists():
        rows.append({"stage":stem,"status":"pending","expected":expected});continue
    summary=json.loads(path.read_text())
    log=re.sub(r"\x1b\[[0-9;]*m", "", (folder/(stem+".log")).read_text())
    passed=[int(x) for x in re.findall(r"\b(\d+) passed \(",log)]
    skipped=sum(int(x) for x in re.findall(r"\b(\d+) skipped",log))
    tested=json.loads((folder/(stem+"-tested-inputs.json")).read_text())
    expected_baseline = e8_baseline if stem=="core-e8-r3" else final_baseline if stem in new_harness_groups else baseline
    mismatches=[name for name,digest in expected_baseline.items() if tested.get(name)!=digest]
    extras=sorted(set(tested)-set(expected_baseline))
    expected_extras=sorted("roadmap/evidence/2026-10-24-functional-fixes-release/"+name for name in (
        "check-https-config.py", "https-compose.override.yml", "https-server.mjs",
        "playwright.production.config.ts", "production-functional.spec.ts", "run-check.py",
        "run-core.py", "run-image-scan.py", "with-https-compose.py"
    )) if stem=="03-core-production-r3" else []
    branch_proof={}
    if stem=="core-e7":
        record=folder/stem/"e7-core-run.json"
        branch_proof["testClockAvailable"]=record.exists() and json.loads(record.read_text()).get("steps",{}).get("clock",{}).get("status")==200
    if stem=="core-e8-r3":
        record=folder/stem/"e8-gate-record.json"
        gate=json.loads(record.read_text()) if record.exists() else {}
        branch_proof["familyPartnerChecked"]=gate.get("permissions",{}).get("familyPartnerChecked") is True
        branch_proof["normalOwnerMagicLink"]=gate.get("ownerLocaleAuthentication")=={"exchangeStatus":200,"host":"app.example.test","method":"magic-link","normalAccount":True,"requestStatus":202}
    ok=(summary.get("commandExitCode",summary.get("exitCode"))==0 and summary.get("inputsUnchanged") is True and summary.get("cleanupComplete") is True and summary.get("imageId")==image and passed==[expected] and skipped==0 and not mismatches and not current_mismatches and extras==expected_extras and all(branch_proof.values()))
    rows.append({"stage":stem,"status":"passed" if ok else "attention","expected":expected,"passed":passed,"skipped":skipped,"sourceMismatches":mismatches,"baselineInputCount":len(expected_baseline),"extraHarnessInputs":extras,"expectedExtraInputs":extras==expected_extras,"conditionalCoverage":branch_proof,"summary":str(path),"cleanupComplete":summary.get("cleanupComplete")})
result={"imageId":image,"expectedUniqueCases":sum(row[2] for row in groups),"passedUniqueCases":sum(row["expected"] for row in rows if row["status"]=="passed"),"allPassed":not current_mismatches and all(row["status"]=="passed" for row in rows),"currentSourceMismatches":current_mismatches,"harnessOnlyDelta":sorted(actual_delta),"e8FixtureOnlyDelta":sorted(e8_delta),"groups":rows}
if "--save" in sys.argv:
    target=root/"final-real-browser-summary.json"
    if target.exists():raise SystemExit("Refusing to overwrite final summary")
    if not result["allPassed"]:raise SystemExit("Final evidence incomplete; not saving")
    target.write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,indent=2))
