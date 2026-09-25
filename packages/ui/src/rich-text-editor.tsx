import {
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Icon } from "./icons/Icon";
import { safeRichTextHref, sanitizeRichText, serializeRichText } from "./rich-text";

export type RichTextTool =
  | "blockquote"
  | "bold"
  | "h3"
  | "h4"
  | "italic"
  | "link"
  | "orderedList"
  | "strike"
  | "underline"
  | "unorderedList";

/** Toolbar order: only the R-07-03 allow-list is offered. */
export const RICH_TEXT_TOOLS: readonly RichTextTool[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "h3",
  "h4",
  "unorderedList",
  "orderedList",
  "blockquote",
  "link",
];

export interface RichTextToolLabel {
  /** Accessible name of the button. */
  label: string;
  /** Visible glyph («B», «H3»…); the link tool shows an icon instead. */
  glyph: string;
}

export interface RichTextEditorLabels {
  linkApply: string;
  linkCancel: string;
  linkInvalid: string;
  linkUrl: string;
  toolbar: string;
  tools: Record<RichTextTool, RichTextToolLabel>;
}

export interface RichTextEditorProps {
  id: string;
  label: string;
  labels: RichTextEditorLabels;
  onChange: (html: string) => void;
  value: string;
  /**
   * The form is saving: the content is read-only (`aria-readonly`) and the toolbar stays in place
   * but disabled, so nothing can be typed that the saved answer would then overwrite.
   */
  busy?: boolean;
  describedBy?: string;
  placeholder?: string;
  readOnly?: boolean;
}

const COMMANDS: Readonly<Record<Exclude<RichTextTool, "link">, [string, string?]>> = {
  blockquote: ["formatBlock", "blockquote"],
  bold: ["bold"],
  h3: ["formatBlock", "h3"],
  h4: ["formatBlock", "h4"],
  italic: ["italic"],
  orderedList: ["insertOrderedList"],
  strike: ["strikeThrough"],
  underline: ["underline"],
  unorderedList: ["insertUnorderedList"],
};

/** The legacy editing command API: still the only editing primitive every browser offers. */
interface LegacyEditingDocument {
  execCommand?: (command: string, showUserInterface: boolean, value?: string) => boolean;
}

function runCommand(command: string, value?: string): void {
  (document as unknown as LegacyEditingDocument).execCommand?.(command, false, value);
}

/**
 * Restricted rich-text editor (R-07-03): a `contenteditable` region whose toolbar only offers
 * the allow-listed elements, and whose output is always the allow-list serializer's HTML
 * (pasted or browser-generated markup such as `<b>`, `<div>` or `style` never leaves it).
 * No runtime dependency.
 */
export function RichTextEditor({
  busy = false,
  describedBy,
  id,
  label,
  labels,
  onChange,
  placeholder,
  readOnly = false,
  value,
}: RichTextEditorProps) {
  const locked = readOnly || busy;
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | undefined>(undefined);
  const savedRange = useRef<Range | undefined>(undefined);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [empty, setEmpty] = useState(value.trim() === "");
  const linkInputId = useId();
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null || value === lastEmitted.current) return;
    editor.innerHTML = sanitizeRichText(value);
    lastEmitted.current = serializeRichText(editor);
    setEmpty(editor.textContent.trim() === "");
  }, [value]);

  const emit = () => {
    const editor = editorRef.current;
    if (editor === null) return;
    if (locked) {
      // Input that reached a locked editor anyway is refused: the content stays the value.
      editor.innerHTML = sanitizeRichText(value);
      return;
    }
    const html = serializeRichText(editor);
    const text = editor.textContent.trim();
    setEmpty(text === "");
    const next = text === "" ? "" : html;
    lastEmitted.current = next;
    onChange(next);
  };

  const keepSelection = (event: MouseEvent) => {
    // The toolbar must not steal the editor's selection.
    event.preventDefault();
  };

  const apply = (tool: RichTextTool) => {
    if (locked) return;
    if (tool === "link") {
      const selection = window.getSelection();
      savedRange.current =
        selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined;
      setLinkValue("");
      setLinkError(false);
      setLinkOpen(true);
      return;
    }
    editorRef.current?.focus();
    const [command, argument] = COMMANDS[tool];
    runCommand(command, argument);
    emit();
  };

  const applyLink = () => {
    if (locked) return;
    const href = safeRichTextHref(linkValue);
    if (href === undefined) {
      setLinkError(true);
      return;
    }
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (savedRange.current !== undefined && selection !== null) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
    runCommand("createLink", href);
    setLinkOpen(false);
    emit();
  };

  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (locked) return;
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (html !== "") {
      runCommand("insertHTML", sanitizeRichText(html));
    } else {
      runCommand("insertText", text);
    }
    emit();
  };

  const linkKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyLink();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setLinkOpen(false);
    }
  };

  return (
    <div
      aria-busy={busy || undefined}
      className={`ah-rich-text-editor${readOnly ? " ah-rich-text-editor--read-only" : ""}`}
    >
      {readOnly ? null : (
        <div
          aria-controls={id}
          aria-label={labels.toolbar}
          className="ah-rich-text-editor__toolbar"
          role="toolbar"
        >
          {RICH_TEXT_TOOLS.map((tool) => (
            <button
              aria-label={labels.tools[tool].label}
              className={`ah-rich-text-editor__tool ah-rich-text-editor__tool--${tool}`}
              disabled={busy}
              key={tool}
              onClick={() => {
                apply(tool);
              }}
              onMouseDown={keepSelection}
              title={labels.tools[tool].label}
              type="button"
            >
              {tool === "link" ? (
                <Icon aria-hidden="true" name="link" />
              ) : (
                <span aria-hidden="true">{labels.tools[tool].glyph}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {linkOpen ? (
        <div className="ah-rich-text-editor__link">
          <label className="ah-sr-only" htmlFor={linkInputId}>
            {labels.linkUrl}
          </label>
          <input
            aria-describedby={linkError ? `${linkInputId}-error` : undefined}
            aria-invalid={linkError || undefined}
            className="ah-input"
            disabled={busy}
            id={linkInputId}
            onChange={(event) => {
              setLinkValue(event.currentTarget.value);
              setLinkError(false);
            }}
            onKeyDown={linkKeyDown}
            placeholder={labels.linkUrl}
            ref={linkInputRef}
            type="url"
            value={linkValue}
          />
          <button
            className="ah-button ah-button--secondary"
            disabled={busy}
            onClick={applyLink}
            type="button"
          >
            <span className="ah-button__content">{labels.linkApply}</span>
          </button>
          <button
            className="ah-button ah-button--ghost"
            onClick={() => {
              setLinkOpen(false);
            }}
            type="button"
          >
            <span className="ah-button__content">{labels.linkCancel}</span>
          </button>
          {linkError ? (
            <p className="ah-form-field__error" id={`${linkInputId}-error`} role="alert">
              {labels.linkInvalid}
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        aria-describedby={describedBy}
        aria-label={label}
        aria-multiline="true"
        aria-readonly={locked || undefined}
        className="ah-input ah-rich-text ah-rich-text-editor__content"
        contentEditable={!locked}
        data-empty={empty || undefined}
        data-placeholder={placeholder}
        id={id}
        onBlur={locked ? undefined : emit}
        onInput={emit}
        onPaste={locked ? undefined : paste}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
        tabIndex={0}
      />
    </div>
  );
}
