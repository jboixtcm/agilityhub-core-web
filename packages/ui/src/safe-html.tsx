import { useMemo } from "react";

import { sanitizeRichText } from "./rich-text";

export interface SafeHtmlProps {
  html: string | null | undefined;
  className?: string;
}

/**
 * Renders api rich text (`longDescriptionHtml`, R-07-03) after re-applying the allow-list in the
 * browser: the api already sanitises it, and this second pass keeps the page safe even if a
 * response did not. Nothing is rendered for empty text.
 */
export function SafeHtml({ className, html }: SafeHtmlProps) {
  const safe = useMemo(() => sanitizeRichText(html), [html]);
  if (safe === "") return null;
  return (
    <div
      className={className === undefined ? "ah-rich-text" : `ah-rich-text ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
