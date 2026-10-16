import { type PdfFont, textWidthMm } from "./pdf-document.js";

/** Paper sizes the sheets print on (the planner's `PAPER_PRESETS`, portrait). */
export const SHEET_PAPER = {
  a4: { heightMm: 297, widthMm: 210 },
  letter: { heightMm: 279.4, widthMm: 215.9 },
} as const;

export type SheetPaper = keyof typeof SHEET_PAPER;

/** `text` broken into lines no wider than `maxWidthMm` (words never split unless one is longer). */
export function wrapText(
  text: string,
  maxWidthMm: number,
  sizePt: number,
  font: PdfFont = "regular",
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    let line = "";
    for (const word of paragraph.split(/\s+/u).filter((part) => part !== "")) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (textWidthMm(candidate, sizePt, font) <= maxWidthMm || line === "") {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}
