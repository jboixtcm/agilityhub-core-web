/**
 * R-07-03 allow-list for activity rich text, shared by the D7 editor serializer and `SafeHtml`:
 * `p, br, strong, em, u, s, h3, h4, ul, ol, li, blockquote, a[href]`, with `href` limited to
 * `http(s):` and `mailto:` (links carry `rel="noopener" target="_blank"`). Every other element or
 * attribute is dropped without error; the text of unknown formatting elements is kept.
 */
export const RICH_TEXT_ELEMENTS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
] as const;

export type RichTextElement = (typeof RICH_TEXT_ELEMENTS)[number];

/** Browser formatting markup mapped onto the allow-list (`<b>` → `strong`, `<i>` → `em`…). */
const ALIASES: Readonly<Record<string, RichTextElement>> = {
  b: "strong",
  del: "s",
  div: "p",
  i: "em",
  strike: "s",
};

/** Dropped together with their content (never rendered as text). */
const DROPPED = new Set([
  "audio",
  "canvas",
  "embed",
  "form",
  "head",
  "iframe",
  "img",
  "input",
  "link",
  "meta",
  "noscript",
  "object",
  "picture",
  "script",
  "select",
  "style",
  "svg",
  "template",
  "textarea",
  "title",
  "video",
]);

const SAFE_HREF = /^(?:https?:|mailto:)/iu;

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

function allowedTag(tagName: string): RichTextElement | undefined {
  const name = tagName.toLowerCase();
  return (RICH_TEXT_ELEMENTS as readonly string[]).includes(name)
    ? (name as RichTextElement)
    : ALIASES[name];
}

/** A link target kept by the allow-list, or `undefined` (the link is unwrapped). */
export function safeRichTextHref(value: string | null | undefined): string | undefined {
  const href = value?.trim() ?? "";
  return SAFE_HREF.test(href) ? href : undefined;
}

function serializeNode(node: Node): string {
  if (node.nodeType === 3) return escapeText(node.textContent ?? "");
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  const name = element.tagName.toLowerCase();
  if (DROPPED.has(name)) return "";
  const inner = serializeChildren(element);
  const tag = allowedTag(name);
  if (tag === undefined) return inner;
  if (tag === "br") return "<br>";
  if (tag === "a") {
    const href = safeRichTextHref(element.getAttribute("href"));
    return href === undefined
      ? inner
      : `<a href="${escapeAttribute(href)}" rel="noopener" target="_blank">${inner}</a>`;
  }
  return `<${tag}>${inner}</${tag}>`;
}

function serializeChildren(parent: Node): string {
  return [...parent.childNodes].map(serializeNode).join("");
}

/** The allow-listed HTML of a DOM subtree (the editor's content element): children only. */
export function serializeRichText(root: Node): string {
  return serializeChildren(root);
}

/**
 * Re-applies the allow-list to an HTML string. Parsing happens in an inert document
 * (`DOMParser`): no script runs and no resource loads while the input is inspected.
 */
export function sanitizeRichText(html: string | null | undefined): string {
  if (html === null || html === undefined || html.trim() === "") return "";
  const document = new DOMParser().parseFromString(html, "text/html");
  return serializeRichText(document.body);
}
