import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), "utf8");

// E11-W02 step 6 (TTI < 3 s): the screens behind the access screen are one lazy chunk; a static
// import from the entry (`main.tsx`, `App.tsx`) would pull its module back into the first load.
describe("E11-W02 step 6: the screens stay out of the first load", () => {
  const screens = [...read("screens.ts").matchAll(/export \{ ([^}]+) \} from "(\.[^"]+)";/gu)];

  it("lists the screens it lazy-loads", () => {
    expect(screens.length).toBeGreaterThan(20);
  });

  it.each(["App.tsx", "main.tsx"])("%s imports no screen module statically", (entry) => {
    const source = read(entry);
    const offenders = screens
      .map(([, , path = ""]) => path)
      .filter((path) => new RegExp(`from "${path.replaceAll(".", "\\.")}";`, "u").test(source));
    expect(offenders).toEqual([]);
    if (entry === "App.tsx") expect(source).toMatch(/import\("\.\/screens"\)/u);
  });
});
