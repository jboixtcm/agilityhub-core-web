import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "../styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//gu,
  "",
);

/** The declarations every top-level rule listing `selector` gives it, the later ones winning. */
function declarations(selector: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [, selectors = "", block = ""] of css.matchAll(
    /(?<=^|\})\s*([^{}@]+?)\s*\{([^{}]*)\}/gu,
  )) {
    if (!selectors.split(",").some((one) => one.trim() === selector)) continue;
    for (const line of block.split(";")) {
      const colon = line.indexOf(":");
      if (colon > 0) result.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
  }
  return result;
}

// jsdom has no layout: the stylesheet itself is the test. At 1280 px the card is about 440 px
// wide, too narrow for «Nivell D · avui 17:40 · Petita», «1 inscrit» and «anul·lada · avisada
// Laura + Duna» on one line (mockup D1 is drawn at 1920): the status goes under, never the title.
describe("E11-W02 (INC-11, mockup D1): a risk row keeps its class on one line", () => {
  it("the row wraps its status, not its title", () => {
    expect(declarations(".dashboard-risk__row").get("flex-wrap")).toBe("wrap");
    const title = declarations(".dashboard-risk__row > a");
    expect(title.get("white-space")).toBe("nowrap");
    expect(title.get("flex")).toBe("1 0 auto");
    // A title longer than the card (a phone) ends in «…» instead of overflowing it.
    expect(title.get("max-width")).toBe("100%");
    expect(title.get("text-overflow")).toBe("ellipsis");
    expect(declarations(".dashboard-risk__row > .ah-badge").get("margin-left")).toBe("auto");
  });
});
