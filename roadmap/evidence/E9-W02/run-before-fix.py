"""E9-W02 round 2: run the round-2 tests against the pre-round-2 sources (commit HEAD).

Every source file the round changed is temporarily replaced by its HEAD version (read with the
read-only `git show`), the new and updated tests run, and the round-2 versions are restored in a
`finally` block, whatever happens. Test files are left as they are: this is the "fails without
the fix" run. Usage (repo root): python3 roadmap/evidence/E9-W02/run-before-fix.py
"""

import os
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
EVIDENCE = os.path.join(ROOT, "roadmap", "evidence", "E9-W02")
FILES = [
    "packages/api-client/src/core-api-store.ts",
    "packages/course-core/src/geometry/units.ts",
    "packages/course-ui/src/components/PlacementControls.tsx",
    "packages/course-ui/src/components/Planner3D.tsx",
    "packages/course-ui/src/components/PlannerCanvas.tsx",
    "packages/course-ui/src/components/RingDoorEditor.tsx",
    "packages/course-ui/src/components/RingInventoryEditor.tsx",
    "packages/course-ui/src/components/RingMarkerDiagram.tsx",
    "packages/course-ui/src/components/UnitsToggle.tsx",
    "packages/course-ui/src/components/UploadCourse.tsx",
    "packages/course-ui/src/components/WarningsPanel.tsx",
    "packages/course-ui/src/components/ui/Badge.tsx",
    "packages/course-ui/src/components/ui/Button.tsx",
    "packages/course-ui/src/components/ui/IconButton.tsx",
    "packages/course-ui/src/index.ts",
    "packages/course-ui/src/lib/marker-layout.ts",
    "packages/course-ui/src/lib/storage/types.ts",
    "packages/ui/src/tokens.css",
]
RUNS = [
    (
        "23-r2-tests-before-fix-course-ui.log",
        ["pnpm", "--dir", "packages/course-ui", "exec", "vitest", "run"],
    ),
    (
        "24-r2-tests-before-fix-api-client.log",
        [
            "pnpm",
            "--dir",
            "packages/api-client",
            "exec",
            "vitest",
            "run",
            "src/core-api-store.payloads.test.ts",
            "src/core-api-store.ui.test.tsx",
            "src/core-api-store.test.ts",
        ],
    ),
    (
        "25-r2-tests-before-fix-course-core.log",
        ["pnpm", "--dir", "packages/course-core", "exec", "vitest", "run", "tests/units.test.ts"],
    ),
]


def head_version(path):
    result = subprocess.run(
        ["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, check=True
    )
    return result.stdout


saved = {}
try:
    for path in FILES:
        absolute = os.path.join(ROOT, path)
        saved[path] = open(absolute, "rb").read() if os.path.exists(absolute) else None
        with open(absolute, "wb") as handle:
            handle.write(head_version(path))
    for log, command in RUNS:
        with open(os.path.join(EVIDENCE, log), "w") as handle:
            handle.write("$ " + " ".join(command) + "  (sources at HEAD, round-2 tests)\n")
            handle.flush()
            code = subprocess.run(command, cwd=ROOT, stdout=handle, stderr=subprocess.STDOUT).returncode
            handle.write(f"\nexit {code}\n")
        print(log, "exit", code)
finally:
    for path, content in saved.items():
        absolute = os.path.join(ROOT, path)
        if content is None:
            os.remove(absolute)
        else:
            with open(absolute, "wb") as handle:
                handle.write(content)
    print("restored", len(saved), "files")
