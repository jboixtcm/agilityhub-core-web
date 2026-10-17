import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COURSE_NUMBER_BADGE } from "../src/components/Planner3D";

import { contrast } from "./helpers/tokens";

const SOURCE = resolve(process.cwd(), "src");

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

/** Every class list literal of the package (quoted strings holding Tailwind utilities). */
function classLists(): { file: string; classes: string[] }[] {
  return tsxFiles(SOURCE).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/(["'`])([^"'`\n]*\b(?:bg|text)-[^"'`\n]*)\1/gu)].map(
      (match) => ({ classes: (match[2] ?? "").split(/\s+/u), file: relative(SOURCE, file) }),
    ),
  );
}

describe("E9-W02 round 2 #7/#8/#11: course-ui reads the club's theme pairs (AGENTS rules 2 and 6)", () => {
  it("every solid primary background carries the primary foreground (no text-on-primary at 1:1)", () => {
    const offending: string[] = [];
    let checked = 0;
    for (const { file, classes } of classLists()) {
      for (const variant of ["", "file:"]) {
        if (!classes.includes(`${variant}bg-primary`)) continue;
        checked += 1;
        if (!classes.includes(`${variant}text-primary-fg`)) {
          offending.push(`${file}: ${classes.join(" ")}`);
        }
      }
    }
    // Button primary, IconButton filled, UnitsToggle's pressed unit, UploadCourse's file button.
    expect(checked).toBeGreaterThanOrEqual(4);
    expect(offending).toEqual([]);
  });

  it("E11-W02 (INC-60): no solid danger fill carries text — white on the product red is 3.6:1, below AA", () => {
    const filled = classLists()
      .filter(({ classes }) => classes.some((name) => /^(?:[a-z-]+:)*bg-danger$/u.test(name)))
      .map(({ file, classes }) => `${file}: ${classes.join(" ")}`);
    expect(filled).toEqual([]);
    expect(contrast("--ah-color-primary-fg", "--ah-color-danger", "light")).toBeLessThan(4.5);
  });

  it("no Tailwind palette colour (the fixed red/white utilities of review #11) is left in the package", () => {
    const palette =
      /^(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d+)?$/u;
    const found = classLists().flatMap(({ file, classes }) =>
      classes.filter((name) => palette.test(name)).map((name) => `${file}: ${name}`),
    );
    expect(found).toEqual([]);
  });

  it.each(["light", "dark"] as const)(
    "the primary pair and the 3D obstacle number badge reach AA (4.5:1) in the %s theme",
    (theme) => {
      expect(contrast("--ah-color-primary-fg", "--ah-color-primary", theme)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrast(COURSE_NUMBER_BADGE.foreground, COURSE_NUMBER_BADGE.background, theme),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
