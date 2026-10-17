import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "universal-list.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//gu,
  "",
);

function declarations(selector: string): Map<string, string> {
  const escaped = selector.replaceAll(/[.[\]]/gu, (match) => `\\${match}`);
  const block = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^{}]*)\\}`, "u").exec(css)?.[1] ?? "";
  return new Map(
    block
      .split(";")
      .map((line) => line.trim())
      .filter((line) => line.includes(":"))
      .map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()] as const;
      }),
  );
}

// jsdom has no layout: the stylesheet itself is the test. In Chromium (E11-W02) the rows'
// `.ah-sr-only` texts, absolutely positioned, escaped a wrapper that was not their containing block:
// 50 rows of /abonats stretched the page to 2886 px of empty scroll (and the back office's sidebar
// background ended at 1315 px).
describe("E11-W02 (INC-11): the universal list's table scrolls inside its own box", () => {
  it("the table wrapper is a scroll box and the containing block of what it holds", () => {
    const wrap = declarations(".ah-universal-list__table-wrap");
    expect(wrap.get("overflow")).toBe("auto");
    expect(wrap.get("position")).toBe("relative");
  });
});
