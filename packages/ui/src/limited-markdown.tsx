import { Fragment, type ReactNode } from "react";

export interface LimitedMarkdownProps {
  children: string;
  className?: string;
}

function stripUnsupported(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/<[^>]*>/gu, "")
    .replace(/^\s*>\s?/gmu, "")
    .replace(/[`~]/gu, "");
}

function safeHref(value: string): string | undefined {
  return /^(?:https?:\/\/|mailto:)/iu.test(value) ? value : undefined;
}

function inlineNodes(value: string, prefix: string): ReactNode[] {
  const expression = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/gu;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of value.matchAll(expression)) {
    const start = match.index;
    if (start > cursor) {
      nodes.push(value.slice(cursor, start));
    }
    const token = match[0];
    const key = `${prefix}-${String(index)}`;
    if (
      (token.startsWith("**") && token.endsWith("**")) ||
      (token.startsWith("__") && token.endsWith("__"))
    ) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token);
      const href = link?.[2] === undefined ? undefined : safeHref(link[2]);
      nodes.push(
        href === undefined ? (
          (link?.[1] ?? token)
        ) : (
          <a href={href} key={key} rel="noreferrer">
            {link?.[1]}
          </a>
        ),
      );
    }
    cursor = start + token.length;
    index += 1;
  }
  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }
  return nodes;
}

export function LimitedMarkdown({ children, className }: LimitedMarkdownProps) {
  const lines = stripUnsupported(children).split(/\r?\n/u);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    if (heading !== null) {
      const content = inlineNodes(heading[2] ?? "", `heading-${String(index)}`);
      const level = heading[1]?.length ?? 1;
      blocks.push(
        level === 1 ? (
          <h2 key={`block-${String(blocks.length)}`}>{content}</h2>
        ) : level === 2 ? (
          <h3 key={`block-${String(blocks.length)}`}>{content}</h3>
        ) : (
          <h4 key={`block-${String(blocks.length)}`}>{content}</h4>
        ),
      );
      index += 1;
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.+)$/u.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/u.exec(line);
    if (unordered !== null || ordered !== null) {
      const items: ReactNode[] = [];
      const orderedList = ordered !== null;
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const match = orderedList
          ? /^\s*\d+[.)]\s+(.+)$/u.exec(candidate)
          : /^\s*[-*+]\s+(.+)$/u.exec(candidate);
        if (match === null) break;
        items.push(
          <li key={`item-${String(index)}`}>
            {inlineNodes(match[1] ?? "", `item-inline-${String(index)}`)}
          </li>,
        );
        index += 1;
      }
      blocks.push(
        orderedList ? (
          <ol key={`block-${String(blocks.length)}`}>{items}</ol>
        ) : (
          <ul key={`block-${String(blocks.length)}`}>{items}</ul>
        ),
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index] ?? "";
      if (
        candidate.trim() === "" ||
        /^(#{1,3})\s+/u.test(candidate) ||
        /^\s*(?:[-*+]\s+|\d+[.)]\s+)/u.test(candidate)
      ) {
        break;
      }
      paragraph.push(candidate.trim());
      index += 1;
    }
    blocks.push(
      <p key={`block-${String(blocks.length)}`}>
        {paragraph.map((part, partIndex) => (
          <Fragment key={`line-${String(partIndex)}`}>
            {partIndex === 0 ? null : " "}
            {inlineNodes(part, `paragraph-${String(index)}-${String(partIndex)}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <div className={className}>{blocks}</div>;
}
