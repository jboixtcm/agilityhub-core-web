"""E9-W03 round 2: run the round's new tests against the sources as they were before it (HEAD).

Each case swaps the listed source files back to their HEAD content (read-only `git show`), runs
the given Vitest files, writes the output to the given log, and restores the working tree in a
`finally`, whatever happens. A file the round deleted is recreated from HEAD for the run and
deleted again; the tests themselves are always the round's.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "roadmap/evidence/E9-W03"

# What `core-api-store.ts` at HEAD needs to load: course-ui's old geometry export.
COURSE_UI_GEOMETRY = [
    "packages/course-ui/src/index.ts",
    "packages/course-ui/src/lib/resolved-obstacles.ts",
]

CASES = [
    (
        "60-before-store.log",
        [
            "packages/api-client/src/core-api-store.ts",
            "packages/api-client/src/core-api-store.fake.ts",
            *COURSE_UI_GEOMETRY,
        ],
        "packages/api-client",
        ["src/core-api-store.payloads.test.ts"],
    ),
    (
        "61-before-course-screens.log",
        [
            "apps/clubs-admin/src/courses/CourseDetailPage.tsx",
            "apps/clubs-admin/src/courses/CoursesPage.tsx",
            "apps/clubs-admin/src/courses/PlacementEditorPage.tsx",
            "apps/clubs-admin/src/courses/RegisterSetupModal.tsx",
            "apps/clubs-admin/src/courses/RingGeometryPage.tsx",
            "packages/api-client/src/core-api-store.ts",
            *COURSE_UI_GEOMETRY,
        ],
        "apps/clubs-admin",
        ["src/courses/courses.test.tsx"],
    ),
    (
        "62-before-class-forms.log",
        [
            "apps/clubs-admin/src/planning/CreateClassDrawer.tsx",
            "apps/clubs-admin/src/planning/SelectedClassCard.tsx",
            "apps/clubs-admin/src/planning/PlannedCourseSelect.tsx",
            "apps/clubs-admin/src/activities/ActivityPlacementsCard.tsx",
        ],
        "apps/clubs-admin",
        ["src/planning/PlannedCourseSelect.test.tsx"],
    ),
    (
        "63-before-sheets-canvas.log",
        [
            "packages/course-ui/src/lib/pdf/pdf-document.ts",
            "packages/course-ui/src/lib/pdf/marker-sheet.ts",
            "packages/course-ui/src/lib/pdf/build-sheet.ts",
            "packages/course-ui/src/components/PlannerCanvas.tsx",
            *COURSE_UI_GEOMETRY,
        ],
        "packages/course-ui",
        ["tests/sheets.test.tsx"],
    ),
    (
        "64-before-course-mocks.log",
        [
            "packages/api-client/src/mocks/course-handlers.ts",
            "packages/api-client/src/mocks/fixtures/courses.ts",
            "packages/api-client/src/mocks/scenarios.ts",
            "packages/api-client/src/mocks/planning-handlers.ts",
            "packages/api-client/src/mocks/calendar-handlers.ts",
        ],
        "packages/api-client",
        ["src/mocks/course-handlers.test.ts"],
    ),
    (
        "65-before-clubs-namespaces.log",
        ["apps/clubs/src/main.tsx", "apps/clubs/src/today/OverviewPage.tsx"],
        "apps/clubs",
        ["src/i18n-namespaces.test.ts"],
    ),
]


def head(relative: str) -> bytes:
    return subprocess.run(
        ["git", "show", f"HEAD:{relative}"], cwd=ROOT, check=True, capture_output=True
    ).stdout


for log, files, package, tests in CASES:
    saved = {
        relative: (ROOT / relative).read_bytes() if (ROOT / relative).exists() else None
        for relative in files
    }
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
            if content is None:
                (ROOT / relative).unlink(missing_ok=True)
            else:
                (ROOT / relative).write_bytes(content)
        print(f"restored {len(saved)} files")
sys.exit(0)
