import { Button } from "@agilityhub/ui";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** A disclosure keeps infrequent operations behind one explicit action. */
export function RecordActions({ children }: { children: ReactNode }) {
  const { t } = useTranslation("admin-census");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const itemsId = useId();
  useEffect(() => {
    const element = root.current;
    if (!open || element === null) return;
    const close = () => {
      element.querySelector("button")?.focus();
      setOpen(false);
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.contains(event.target)) setOpen(false);
    };
    // Delegate native button/link activation, including keyboard clicks. Portaled dialogs are
    // outside this DOM subtree and retain their own focus and key handlers.
    const selected = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".census-record-actions__items") &&
        event.target.closest("button, a")
      )
        close();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", outside);
    element.addEventListener("click", selected);
    element.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", outside);
      element.removeEventListener("click", selected);
      element.removeEventListener("keydown", keyboard);
    };
  }, [open]);
  return (
    <div
      className="census-record-actions"
      role="group"
      aria-label={t("admin-census:common.actions")}
      ref={root}
    >
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={itemsId}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {t("admin-census:common.actions")}
      </Button>
      <div id={itemsId} hidden={!open} className="census-record-actions__items">
        {children}
      </div>
    </div>
  );
}
