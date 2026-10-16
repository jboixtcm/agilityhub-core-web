"""E9-W03: run the task's new tests against the sources as they were before it (HEAD).

Each case swaps the listed source files back to their HEAD content (read-only `git show`), runs
the given Vitest files, writes the output to the given log, and restores the working-tree files
in a `finally`, whatever happens. Files the task created have no HEAD version: their tests fail
by construction (module missing) and are not swapped here.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "roadmap/evidence/E9-W03"

CASES = [
    (
        "40-before-core-api-store.log",
        ["packages/api-client/src/core-api-store.ts"],
        "packages/api-client",
        ["src/core-api-store.payloads.test.ts"],
    ),
    (
        "41-before-planner-canvas.log",
        ["packages/course-ui/src/components/PlannerCanvas.tsx"],
        "packages/course-ui",
        ["tests/sheets.test.tsx"],
    ),
    (
        "42-before-planning-mocks.log",
        [
            "packages/api-client/src/mocks/planning-handlers.ts",
            "packages/api-client/src/mocks/calendar-handlers.ts",
            "packages/api-client/src/mocks/fixtures/activities.ts",
            "packages/api-client/src/mocks/activity-handlers.ts",
        ],
        "packages/api-client",
        ["src/mocks/course-handlers.test.ts"],
    ),
    (
        "43-before-class-forms.log",
        [
            "apps/clubs-admin/src/planning/ClassForm.tsx",
            "apps/clubs-admin/src/planning/SelectedClassCard.tsx",
        ],
        "apps/clubs-admin",
        ["src/planning/PlannedCourseSelect.test.tsx"],
    ),
]


def head(relative: str) -> bytes:
    return subprocess.run(
        ["git", "show", f"HEAD:{relative}"], cwd=ROOT, check=True, capture_output=True
    ).stdout


for log, files, package, tests in CASES:
    saved = {relative: (ROOT / relative).read_bytes() for relative in files}
    try:
        for relative in files:
            (ROOT / relative).write_bytes(head(relative))
        result = subprocess.run(
            ["pnpm", "--dir", str(ROOT / package), "exec", "vitest", "run", *tests],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        (EVIDENCE / log).write_text(result.stdout + result.stderr)
        print(f"{log}: exit {result.returncode}")
    finally:
        for relative, content in saved.items():
            (ROOT / relative).write_bytes(content)
        print(f"restored {len(saved)} files")
sys.exit(0)
