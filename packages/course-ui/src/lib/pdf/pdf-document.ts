/**
 * A minimal PDF 1.4 writer for the sheets S16 generates in the browser (R-16-10 build sheet, A8b
 * marker sheet): vector lines, rectangles, polygons and circles in grey levels, and text in the
 * two standard Helvetica faces with WinAnsi encoding (every Catalan, Spanish and English letter;
 * the document properties in UTF-16BE). No fonts are embedded and nothing depends on the DOM, so
 * the output is byte-for-byte deterministic (snapshot tests, T-16-04) and works in workers and
 * tests alike.
 *
 * Coordinates are millimetres from the page's top-left corner, as on paper; the writer turns them
 * into PDF points from the bottom-left. Colours are grey levels (0 = black, 1 = white): print
 * sheets carry no theme colour.
 */

export type PdfFont = "regular" | "bold";
export type PdfAlign = "left" | "center" | "right";

export interface PdfPageSize {
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface PdfShapeStyle {
  /** Fill grey (0 black … 1 white); absent = no fill. */
  readonly fill?: number;
  /** Stroke grey; absent = no stroke. */
  readonly stroke?: number;
  /** Stroke width in millimetres (default 0.3). */
  readonly lineWidthMm?: number;
  /** Dash pattern in millimetres `[on, off]`. */
  readonly dashMm?: readonly [number, number];
}

export interface PdfTextStyle {
  /** Font size in points (default 10). */
  readonly sizePt?: number;
  readonly font?: PdfFont;
  readonly align?: PdfAlign;
  /** Text grey (default 0, black). */
  readonly grey?: number;
}

const PT_PER_MM = 72 / 25.4;

/** Helvetica advance widths (1/1000 em) for ASCII 32–126, from the Adobe core-14 AFM files. */
const HELVETICA_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD_ASCII = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** WinAnsi code points outside Latin-1 (the 0x80–0x9F block) for the characters our copy uses. */
const WIN_ANSI_EXTRA: Readonly<Record<string, number>> = {
  "€": 0x80,
  "‚": 0x82,
  "„": 0x84,
  "…": 0x85,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
};

/** The letter whose width an accented Latin-1 letter shares (Helvetica keeps base widths). */
const LATIN1_BASE: Readonly<Record<string, string>> = {
  À: "A",
  Á: "A",
  Â: "A",
  Ã: "A",
  Ä: "A",
  Ç: "C",
  È: "E",
  É: "E",
  Ê: "E",
  Ë: "E",
  Ì: "I",
  Í: "I",
  Î: "I",
  Ï: "I",
  Ñ: "N",
  Ò: "O",
  Ó: "O",
  Ô: "O",
  Õ: "O",
  Ö: "O",
  Ù: "U",
  Ú: "U",
  Û: "U",
  Ü: "U",
  à: "a",
  á: "a",
  â: "a",
  ã: "a",
  ä: "a",
  ç: "c",
  è: "e",
  é: "e",
  ê: "e",
  ë: "e",
  ñ: "n",
  ò: "o",
  ó: "o",
  ô: "o",
  õ: "o",
  ö: "o",
  ù: "u",
  ú: "u",
  û: "u",
  ü: "u",
  ý: "y",
  ÿ: "y",
};

/** Widths of the non-letter symbols the sheets print (both faces share them). */
const SYMBOL_WIDTHS: Readonly<Record<string, number>> = {
  "·": 278,
  "×": 584,
  "°": 400,
  "–": 556,
  "—": 1000,
  "’": 222,
  "‘": 222,
  "“": 333,
  "”": 333,
  "…": 1000,
  "€": 556,
  "•": 350,
  "«": 556,
  "»": 556,
  ì: 278,
  í: 278,
  î: 278,
  ï: 278,
};

/** The WinAnsi byte of `char`, or `undefined` when WinAnsi has no such character. */
function winAnsiCode(char: string): number | undefined {
  const extra = WIN_ANSI_EXTRA[char];
  if (extra !== undefined) return extra;
  const code = char.codePointAt(0) ?? 0;
  if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return code;
  return undefined;
}

/**
 * `text` in characters WinAnsi can show. Composed first (NFC: a decomposed «é» is one letter);
 * a character still outside WinAnsi becomes its compatibility form when that one fits (U+0140
 * «ŀ» → «l·», a thin space → a space), else the WinAnsi parts of its decomposition with the
 * combining marks dropped; only what is left reads as «?».
 */
function toWinAnsi(text: string): string {
  let out = "";
  for (const char of text.normalize("NFC")) {
    if (winAnsiCode(char) !== undefined) {
      out += char;
      continue;
    }
    const compatible = char.normalize("NFKC");
    if (Array.from(compatible).every((part) => winAnsiCode(part) !== undefined)) {
      out += compatible;
      continue;
    }
    for (const part of char.normalize("NFKD")) {
      if (winAnsiCode(part) !== undefined) out += part;
      else if (!/\p{M}/u.test(part)) out += "?";
    }
  }
  return out;
}

/** Advance width of one WinAnsi character in 1/1000 em. */
function charWidth(char: string, font: PdfFont): number {
  const table = font === "bold" ? HELVETICA_BOLD_ASCII : HELVETICA_ASCII;
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) return table[code - 0x20] ?? 556;
  const symbol = SYMBOL_WIDTHS[char];
  if (symbol !== undefined) return symbol;
  const base = LATIN1_BASE[char];
  if (base !== undefined) return charWidth(base, font);
  return code === 0x00a0 ? 278 : 556;
}

/** The width of `text` in millimetres at `sizePt` (for alignment and fitting). */
export function textWidthMm(text: string, sizePt: number, font: PdfFont = "regular"): number {
  let units = 0;
  for (const char of toWinAnsi(text)) units += charWidth(char, font);
  return ((units / 1000) * sizePt) / PT_PER_MM;
}

/** `text` shortened with «…» so it fits `maxWidthMm`. */
export function fitText(text: string, maxWidthMm: number, sizePt: number, font: PdfFont): string {
  if (textWidthMm(text, sizePt, font) <= maxWidthMm) return text;
  // Composed first, so shortening never leaves a letter without its accent.
  const chars = Array.from(text.normalize("NFC"));
  while (chars.length > 0 && textWidthMm(`${chars.join("")}…`, sizePt, font) > maxWidthMm) {
    chars.pop();
  }
  return `${chars.join("")}…`;
}

/** A number for a content stream: at most three decimals, no exponent, no `-0`. */
function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) || rounded === 0 ? "0" : String(rounded);
}

/** A page string (`Tj`): WinAnsi bytes, the delimiters escaped. */
function pdfString(text: string): string {
  let out = "(";
  for (const char of toWinAnsi(text)) {
    const code = winAnsiCode(char) ?? 0x3f;
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else out += String.fromCharCode(code);
  }
  return `${out})`;
}

/**
 * A document-properties string (the Info dictionary): readers decode those as PDFDocEncoding,
 * not WinAnsi (’ would read as ™), so they travel as UTF-16BE with its byte-order mark, in hex.
 */
function pdfTextString(text: string): string {
  const normalized = text.normalize("NFC");
  let hex = "FEFF";
  for (let index = 0; index < normalized.length; index += 1) {
    hex += normalized.charCodeAt(index).toString(16).toUpperCase().padStart(4, "0");
  }
  return `<${hex}>`;
}

export class PdfPage {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly #ops: string[] = [];

  constructor(size: PdfPageSize) {
    this.widthMm = size.widthMm;
    this.heightMm = size.heightMm;
  }

  /** The content stream of the page (PDF operators). */
  get content(): string {
    return this.#ops.join("\n");
  }

  #x(xMm: number): string {
    return num(xMm * PT_PER_MM);
  }

  #y(yMm: number): string {
    return num((this.heightMm - yMm) * PT_PER_MM);
  }

  #paint(style: PdfShapeStyle): void {
    const fill = style.fill !== undefined;
    const stroke = style.stroke !== undefined;
    this.#ops.push(fill && stroke ? "B" : fill ? "f" : stroke ? "S" : "n");
  }

  #begin(style: PdfShapeStyle): void {
    this.#ops.push("q");
    if (style.fill !== undefined) this.#ops.push(`${num(style.fill)} g`);
    if (style.stroke !== undefined) {
      this.#ops.push(`${num(style.stroke)} G`);
      this.#ops.push(`${num((style.lineWidthMm ?? 0.3) * PT_PER_MM)} w`);
      if (style.dashMm !== undefined) {
        this.#ops.push(
          `[${num(style.dashMm[0] * PT_PER_MM)} ${num(style.dashMm[1] * PT_PER_MM)}] 0 d`,
        );
      }
    }
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    style: Omit<PdfShapeStyle, "fill"> = { stroke: 0 },
  ): void {
    this.#begin(style);
    this.#ops.push(`${this.#x(x1)} ${this.#y(y1)} m ${this.#x(x2)} ${this.#y(y2)} l`);
    this.#ops.push("S", "Q");
  }

  rect(x: number, y: number, width: number, height: number, style: PdfShapeStyle): void {
    this.#begin(style);
    this.#ops.push(
      `${this.#x(x)} ${this.#y(y + height)} ${num(width * PT_PER_MM)} ${num(height * PT_PER_MM)} re`,
    );
    this.#paint(style);
    this.#ops.push("Q");
  }

  polygon(
    points: readonly { readonly x: number; readonly y: number }[],
    style: PdfShapeStyle,
  ): void {
    const [first, ...rest] = points;
    if (first === undefined) return;
    this.#begin(style);
    this.#ops.push(`${this.#x(first.x)} ${this.#y(first.y)} m`);
    for (const point of rest) this.#ops.push(`${this.#x(point.x)} ${this.#y(point.y)} l`);
    this.#ops.push("h");
    this.#paint(style);
    this.#ops.push("Q");
  }

  circle(cx: number, cy: number, radius: number, style: PdfShapeStyle): void {
    // Four cubic Béziers; k is the usual 4/3·(√2 − 1) control distance.
    const k = 0.5523 * radius;
    const p = (x: number, y: number) => `${this.#x(x)} ${this.#y(y)}`;
    this.#begin(style);
    this.#ops.push(
      `${p(cx + radius, cy)} m`,
      `${p(cx + radius, cy - k)} ${p(cx + k, cy - radius)} ${p(cx, cy - radius)} c`,
      `${p(cx - k, cy - radius)} ${p(cx - radius, cy - k)} ${p(cx - radius, cy)} c`,
      `${p(cx - radius, cy + k)} ${p(cx - k, cy + radius)} ${p(cx, cy + radius)} c`,
      `${p(cx + k, cy + radius)} ${p(cx + radius, cy + k)} ${p(cx + radius, cy)} c`,
      "h",
    );
    this.#paint(style);
    this.#ops.push("Q");
  }

  /** `text` with its baseline at `y`; `x` is its left edge, centre or right edge per `align`. */
  text(x: number, y: number, text: string, style: PdfTextStyle = {}): void {
    if (text === "") return;
    const size = style.sizePt ?? 10;
    const font = style.font ?? "regular";
    const width = textWidthMm(text, size, font);
    const left = style.align === "center" ? x - width / 2 : style.align === "right" ? x - width : x;
    this.#ops.push(
      "BT",
      `/${font === "bold" ? "F2" : "F1"} ${num(size)} Tf`,
      `${num(style.grey ?? 0)} g`,
      `${this.#x(left)} ${this.#y(y)} Td`,
      `${pdfString(text)} Tj`,
      "ET",
    );
  }
}

export interface PdfDocumentInfo {
  readonly title: string;
  /** Who made it (e.g. the product name); no personal data. */
  readonly producer: string;
}

export class PdfDocument {
  readonly #info: PdfDocumentInfo;
  readonly #pages: PdfPage[] = [];

  constructor(info: PdfDocumentInfo) {
    this.#info = info;
  }

  /** The pages so far, in order (a footer pass numbers them once they all exist). */
  get pages(): readonly PdfPage[] {
    return this.#pages;
  }

  addPage(size: PdfPageSize): PdfPage {
    const page = new PdfPage(size);
    this.#pages.push(page);
    return page;
  }

  /** The file: header, objects, cross-reference table and trailer, as bytes. */
  toBytes(): Uint8Array {
    const objects: string[] = [];
    const pageIds = this.#pages.map((_, index) => 6 + index * 2);
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(" ")}] /Count ${String(this.#pages.length)} >>`,
    );
    objects.push(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    );
    objects.push(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );
    objects.push(
      `<< /Title ${pdfTextString(this.#info.title)} /Producer ${pdfTextString(this.#info.producer)} >>`,
    );
    this.#pages.forEach((page, index) => {
      const contentId = (pageIds[index] ?? 0) + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.widthMm * PT_PER_MM)} ${num(page.heightMm * PT_PER_MM)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${String(contentId)} 0 R >>`,
      );
      const stream = page.content;
      objects.push(`<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`);
    });

    let out = "%PDF-1.4\n%âãÏÓ\n";
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(out.length);
      out += `${String(index + 1)} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
    for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;

    // Every character above is a single byte (WinAnsi, hex or the binary-comment marker).
    const bytes = new Uint8Array(out.length);
    for (let index = 0; index < out.length; index += 1) bytes[index] = out.charCodeAt(index) & 0xff;
    return bytes;
  }
}
