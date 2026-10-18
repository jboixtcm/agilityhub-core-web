import {
  cloneElement,
  createContext,
  isValidElement,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Icon, type IconName } from "./icons/Icon";

function classes(...values: (false | string | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

export type ButtonVariant = "danger" | "ghost" | "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: string;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  disabled,
  loading = false,
  loadingLabel,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={classes("ah-button", `ah-button--${variant}`, className)}
      disabled={disabled === true || loading}
      type={type}
    >
      {loading ? <span aria-hidden="true" className="ah-spinner" /> : null}
      <span className={classes("ah-button__content", loading && "ah-button__content--loading")}>
        {children}
      </span>
      {loading && loadingLabel !== undefined ? (
        <span className="ah-sr-only">{loadingLabel}</span>
      ) : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  label: string;
  variant?: ButtonVariant;
}

export function IconButton({
  className,
  icon,
  label,
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Button
      {...props}
      aria-label={label}
      className={classes("ah-icon-button", className)}
      variant={variant}
    >
      <Icon aria-hidden="true" name={icon} />
    </Button>
  );
}

export type Tone = "danger" | "info" | "neutral" | "success" | "warning";

interface ToneProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Chip({ className, tone = "neutral", ...props }: ToneProps) {
  return <span {...props} className={classes("ah-chip", `ah-tone--${tone}`, className)} />;
}

export function Badge({ className, tone = "neutral", ...props }: ToneProps) {
  return <span {...props} className={classes("ah-badge", `ah-tone--${tone}`, className)} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={classes("ah-card", className)} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={classes("ah-input", className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={classes("ah-input ah-textarea", className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={classes("ah-input ah-select", className)} />;
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={classes("ah-checkbox", className)} type="checkbox" />;
}

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-checked" | "children" | "role"
> {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({ checked, className, label, onCheckedChange, ...props }: SwitchProps) {
  return (
    <button
      {...props}
      aria-checked={checked}
      aria-label={label}
      className={classes("ah-switch", checked && "ah-switch--checked", className)}
      onClick={() => {
        onCheckedChange(!checked);
      }}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" className="ah-switch__thumb" />
    </button>
  );
}

export interface RadioOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  label: string;
  onValueChange: (value: string) => void;
  options: RadioOption[];
  value: string;
  name?: string;
}

export function RadioGroup({ label, name, onValueChange, options, value }: RadioGroupProps) {
  const generatedName = useId();
  return (
    <fieldset className="ah-radio-group">
      <legend className="ah-sr-only">{label}</legend>
      {options.map((option) => (
        <label className="ah-radio" key={option.value}>
          <input
            checked={option.value === value}
            disabled={option.disabled}
            name={name ?? generatedName}
            onChange={() => {
              onValueChange(option.value);
            }}
            type="radio"
            value={option.value}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export interface FormFieldProps {
  children: ReactNode;
  id: string;
  label: string;
  error?: string;
  help?: string;
}

interface DescribedControlProps {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  id?: string;
}

/**
 * The field's control with its error linked (E11-W02 round 2, INC-41): `aria-invalid` and the
 * error's id in its description, beside what it already names. Only the control the label is for.
 */
function linkedControl(children: ReactNode, id: string, error: string | undefined): ReactNode {
  if (error === undefined || !isValidElement<DescribedControlProps>(children)) return children;
  if (children.props.id !== id) return children;
  const described = (children.props["aria-describedby"] ?? "").split(/\s+/u).filter(Boolean);
  const errorId = `${id}-error`;
  return cloneElement(children, {
    "aria-describedby": (described.includes(errorId) ? described : [...described, errorId]).join(
      " ",
    ),
    "aria-invalid": children.props["aria-invalid"] ?? true,
  });
}

export function FormField({ children, error, help, id, label }: FormFieldProps) {
  return (
    <div className={classes("ah-form-field", error !== undefined && "ah-form-field--error")}>
      <label className="ah-form-field__label" htmlFor={id}>
        {label}
      </label>
      {linkedControl(children, id, error)}
      {help !== undefined ? (
        <div className="ah-form-field__help" id={`${id}-help`}>
          {help}
        </div>
      ) : null}
      {error !== undefined ? (
        <div className="ah-form-field__error" id={`${id}-error`} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

interface OverlayProps {
  children: ReactNode;
  closeLabel: string;
  onClose: () => void;
  open: boolean;
  title: string;
  dismissible?: boolean;
}

/** The overlays open now (their root elements): Escape belongs to the topmost one only. */
const openOverlays = new Set<{ current: HTMLElement | null }>();
/** The overlay an Escape was meant for, decided once per key press (see `topOverlay`). */
const escapeTargets = new WeakMap<Event, { current: HTMLElement | null } | undefined>();

/**
 * The topmost open overlay when `event` started: the last one in document order (a confirmation
 * inside a drawer comes after it, and two siblings paint in that order). Decided at the first
 * listener and kept for the others, so the order in which the overlays' listeners run, or a close
 * applied between two of them, never lets one Escape close two overlays (AGENTS rule 6).
 */
function topOverlay(event: Event): { current: HTMLElement | null } | undefined {
  if (!escapeTargets.has(event)) {
    let top: { current: HTMLElement | null } | undefined;
    for (const overlay of openOverlays) {
      const element = overlay.current;
      if (!element?.isConnected) continue;
      const current = top?.current;
      if (
        current === null ||
        current === undefined ||
        current.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        top = overlay;
      }
    }
    escapeTargets.set(event, top);
  }
  return escapeTargets.get(event);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A region that speaks for itself (a toast, a status): it stays readable over an overlay. */
function isLiveRegion(element: Element): boolean {
  return element.matches('[aria-live], [role="status"], [role="alert"], [role="log"]');
}

/**
 * E11-W02 round 2 (INC-41): the page outside an open overlay is `inert`, so neither the keyboard
 * nor a screen reader reaches what the backdrop covers: every sibling of the overlay and of each of
 * its ancestors, live regions aside. The undo clears only what this overlay made inert, so a
 * confirmation over a drawer gives the drawer back as the drawer left the page.
 */
function inertOutside(root: HTMLElement): () => void {
  const made: Element[] = [];
  for (let node: HTMLElement = root; node.parentElement !== null; node = node.parentElement) {
    if (node === document.body) break;
    for (const sibling of node.parentElement.children) {
      if (sibling === node || sibling.hasAttribute("inert") || isLiveRegion(sibling)) continue;
      if (["SCRIPT", "STYLE", "TEMPLATE"].includes(sibling.tagName)) continue;
      sibling.setAttribute("inert", "");
      made.push(sibling);
    }
  }
  return () => {
    for (const element of made) element.removeAttribute("inert");
  };
}

/** Tab and Shift+Tab cycle inside the overlay: from its last control to its first, and back. */
function trapTab(event: KeyboardEvent, root: HTMLElement): void {
  const focusable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.closest("[inert]") === null,
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  const inside = active instanceof Node && root.contains(active);
  if (event.shiftKey ? !inside || active === first : !inside || active === last) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

function useOverlay(open: boolean, onClose: () => void, dismissible: boolean) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // The latest `onClose`, read on Escape: a parent that passes a new closure on every render must
  // not re-run the focus effect, which moved the focus to the close button (and scrolled a drawer
  // back to its top) after each keystroke or change inside it.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    // Every open overlay takes part, the ones that need an explicit action too: an Escape over
    // them closes nothing below.
    openOverlays.add(rootRef);
    const restoreOutside = rootRef.current === null ? undefined : inertOutside(rootRef.current);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== "Escape" && event.key !== "Tab") || topOverlay(event) !== rootRef) return;
      if (event.key === "Tab") {
        if (rootRef.current !== null) trapTab(event, rootRef.current);
        return;
      }
      if (dismissible) {
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    if (dismissible) {
      closeRef.current?.focus();
    }
    return () => {
      openOverlays.delete(rootRef);
      document.removeEventListener("keydown", onKeyDown);
      restoreOutside?.();
      previousFocus?.focus();
    };
  }, [dismissible, open]);

  return { closeRef, rootRef };
}

export function Modal({
  children,
  closeLabel,
  dismissible = true,
  onClose,
  open,
  title,
}: OverlayProps) {
  const titleId = useId();
  const { closeRef, rootRef } = useOverlay(open, onClose, dismissible);
  if (!open) {
    return null;
  }

  return (
    <div className="ah-overlay" ref={rootRef}>
      <section aria-labelledby={titleId} aria-modal="true" className="ah-modal" role="dialog">
        <div className="ah-overlay__header">
          <h2 id={titleId}>{title}</h2>
          {dismissible ? (
            <button
              aria-label={closeLabel}
              className="ah-overlay__close"
              onClick={onClose}
              ref={closeRef}
            >
              <Icon aria-hidden="true" name="x" />
            </button>
          ) : null}
        </div>
        <div className="ah-overlay__body">{children}</div>
      </section>
    </div>
  );
}

export function Drawer({ children, closeLabel, onClose, open, title }: OverlayProps) {
  const titleId = useId();
  const { closeRef, rootRef } = useOverlay(open, onClose, true);
  if (!open) {
    return null;
  }

  return (
    <div className="ah-overlay ah-overlay--drawer" ref={rootRef}>
      <aside aria-labelledby={titleId} aria-modal="true" className="ah-drawer" role="dialog">
        <div className="ah-overlay__header">
          <h2 id={titleId}>{title}</h2>
          <button
            aria-label={closeLabel}
            className="ah-overlay__close"
            onClick={onClose}
            ref={closeRef}
          >
            <Icon aria-hidden="true" name="x" />
          </button>
        </div>
        <div className="ah-overlay__body">{children}</div>
      </aside>
    </div>
  );
}

interface ToastProps {
  children: ReactNode;
  tone?: Tone;
  dismissLabel?: string;
  onDismiss?: () => void;
}

export function Toast({ children, dismissLabel, onDismiss, tone = "info" }: ToastProps) {
  return (
    <div
      className={classes("ah-toast", `ah-tone--${tone}`)}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span>{children}</span>
      {onDismiss !== undefined && dismissLabel !== undefined ? (
        <button aria-label={dismissLabel} onClick={onDismiss} type="button">
          <Icon aria-hidden="true" name="x" />
        </button>
      ) : null}
    </div>
  );
}

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: Tone;
}

interface ToastApi {
  dismiss: (id: number) => void;
  push: (message: ReactNode, tone?: Tone) => number;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

export function ToastProvider({
  children,
  dismissLabel,
}: {
  children: ReactNode;
  dismissLabel: string;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const push = useCallback((message: ReactNode, tone: Tone = "info") => {
    const id = nextId.current;
    nextId.current += 1;
    setItems((current) => [...current, { id, message, tone }]);
    return id;
  }, []);
  const value = useMemo(() => ({ dismiss, push }), [dismiss, push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="ah-toast-viewport">
        {items.map((item) => (
          <Toast
            dismissLabel={dismissLabel}
            key={item.id}
            onDismiss={() => {
              dismiss(item.id);
            }}
            tone={item.tone}
          >
            {item.message}
          </Toast>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (value === undefined) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return value;
}

export interface TabItem {
  content: ReactNode;
  label: string;
  value: string;
}

export interface TabsProps {
  items: TabItem[];
  label: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  value?: string;
}

export function Tabs({ defaultValue, items, label, onValueChange, value }: TabsProps) {
  const id = useId();
  const [internalValue, setInternalValue] = useState(defaultValue ?? items[0]?.value ?? "");
  const selected = value ?? internalValue;
  const select = (next: string) => {
    setInternalValue(next);
    onValueChange?.(next);
  };
  const item = items.find((candidate) => candidate.value === selected);

  return (
    <div className="ah-tabs">
      <div aria-label={label} className="ah-tabs__list" role="tablist">
        {items.map((tab) => (
          <button
            aria-controls={`${id}-panel-${tab.value}`}
            aria-selected={tab.value === selected}
            className="ah-tabs__tab"
            id={`${id}-tab-${tab.value}`}
            key={tab.value}
            onClick={() => {
              select(tab.value);
            }}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {item === undefined ? null : (
        <div
          aria-labelledby={`${id}-tab-${item.value}`}
          className="ah-tabs__panel"
          id={`${id}-panel-${item.value}`}
          role="tabpanel"
        >
          {item.content}
        </div>
      )}
    </div>
  );
}

export interface AppBarProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  end?: ReactNode;
  start?: ReactNode;
}

export function AppBar({ className, end, start, title, ...props }: AppBarProps) {
  return (
    <header {...props} className={classes("ah-app-bar", className)}>
      <div className="ah-app-bar__side">{start}</div>
      <div className="ah-app-bar__title">{title}</div>
      <div className="ah-app-bar__side ah-app-bar__side--end">{end}</div>
    </header>
  );
}

export interface TabBarItem {
  href: string;
  icon: IconName;
  label: string;
  active?: boolean;
}

export function TabBar({ items, label }: { items: TabBarItem[]; label: string }) {
  if (items.length > 6) {
    throw new Error("TabBar supports a maximum of six items");
  }
  return (
    <nav aria-label={label} className="ah-tab-bar">
      {items.map((item) => (
        <a
          aria-current={item.active === true ? "page" : undefined}
          className="ah-tab-bar__item"
          href={item.href}
          key={item.href}
        >
          <Icon aria-hidden="true" name={item.icon} />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

export interface SidebarEntry {
  href: string;
  icon: IconName;
  label: string;
  active?: boolean;
  count?: number;
}

export interface SidebarGroup {
  entries: SidebarEntry[];
  label: string;
}

export function Sidebar({ groups, label }: { groups: SidebarGroup[]; label: string }) {
  return (
    <aside className="ah-sidebar">
      <nav aria-label={label}>
        {groups.map((group) => (
          <section className="ah-sidebar__group" key={group.label}>
            <h2>{group.label}</h2>
            {group.entries.map((entry) => (
              <a
                aria-current={entry.active === true ? "page" : undefined}
                className="ah-sidebar__entry"
                href={entry.href}
                key={entry.href}
              >
                <Icon aria-hidden="true" name={entry.icon} />
                <span>{entry.label}</span>
                {entry.count === undefined ? null : (
                  <Badge className="ah-sidebar__count">{entry.count}</Badge>
                )}
              </a>
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}

export interface EmptyStateProps {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  /** A second line under the title; a one-line empty state has none (E11-W02 round 2). */
  description?: ReactNode;
  icon?: IconName;
}

export function EmptyState({
  action,
  className,
  description,
  icon = "info",
  title,
}: EmptyStateProps) {
  return (
    <section className={classes("ah-empty-state", className)}>
      <Icon aria-hidden="true" name={icon} />
      <h2>{title}</h2>
      {description === undefined ? null : <p>{description}</p>}
      {action}
    </section>
  );
}

/**
 * The empty state of a read that failed (E11-W02 step 4): the same layout, with the warning icon,
 * announced as an alert so a screen reader hears that the content is missing and why.
 */
export function ErrorState({
  action,
  description,
  title,
}: Omit<EmptyStateProps, "className" | "icon">) {
  return (
    <section className="ah-empty-state ah-empty-state--error" role="alert">
      <Icon aria-hidden="true" name="warn" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

export interface BootFailureProps {
  message: string;
  onRetry: () => void;
  retryLabel: string;
  title: string;
}

/**
 * The page an app shows when it cannot start (E11-W02, INC-41): `/branding` failed and nothing is
 * cached, so there is no club theme nor shell — the product theme, the reason and a retry, never a
 * blank page.
 */
export function BootFailure({ message, onRetry, retryLabel, title }: BootFailureProps) {
  return (
    <main className="ah-boot-failure">
      <EmptyState
        action={
          <Button onClick={onRetry} type="button">
            {retryLabel}
          </Button>
        }
        description={message}
        icon="warn"
        title={title}
      />
    </main>
  );
}

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: string;
  height?: string;
  width?: string;
}

export function Skeleton({ className, height, label, style, width, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      aria-label={label}
      className={classes("ah-skeleton", className)}
      role="status"
      style={{ ...style, height, width }}
    />
  );
}

export function Avatar({ kind = "person", name }: { name: string; kind?: "dog" | "person" }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join("");
  return (
    <span aria-label={name} className={classes("ah-avatar", `ah-avatar--${kind}`)} role="img">
      {initials}
    </span>
  );
}

export type Level = "a" | "b" | "c" | "d" | "therapy";

export function LevelDot({ label, level }: { label: string; level: Level }) {
  return (
    <span
      aria-label={label}
      className={classes("ah-level-dot", `ah-level-dot--${level}`)}
      role="img"
    />
  );
}

export interface DataTableColumn<Row> {
  header: string;
  key: string;
  render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  caption: string;
  columns: DataTableColumn<Row>[];
  empty: ReactNode;
  loadingLabel: string;
  rowKey: (row: Row) => string;
  rows: Row[];
  loading?: boolean;
}

export function DataTable<Row>({
  caption,
  columns,
  empty,
  loading = false,
  loadingLabel,
  rowKey,
  rows,
}: DataTableProps<Row>) {
  const content = loading ? (
    <tr>
      <td colSpan={columns.length}>
        <Skeleton label={loadingLabel} />
      </td>
    </tr>
  ) : rows.length === 0 ? (
    <tr>
      <td className="ah-data-table__empty" colSpan={columns.length}>
        {empty}
      </td>
    </tr>
  ) : (
    rows.map((row) => (
      <tr key={rowKey(row)}>
        {columns.map((column) => (
          <td key={column.key}>{column.render(row)}</td>
        ))}
      </tr>
    ))
  );

  return (
    <div className="ah-data-table__scroll">
      <table className="ah-data-table">
        <caption className="ah-sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{content}</tbody>
      </table>
    </div>
  );
}

export interface BarChartDatum {
  highlighted: number;
  label: string;
  total: number;
  /** Tooltip of the column and its data row (e.g. the resolved level name behind a code). */
  title?: string;
}

export function BarChart({
  data,
  highlightedLabel,
  label,
  totalLabel,
  valueLabel = (item) => `${String(item.total)} · ${String(item.highlighted)}`,
}: {
  data: readonly BarChartDatum[];
  highlightedLabel: string;
  label: string;
  totalLabel: string;
  valueLabel?: (item: BarChartDatum) => string;
}) {
  const maximum = Math.max(1, ...data.map((item) => item.total));
  return (
    <figure aria-label={label} className="ah-bar-chart">
      <div aria-hidden="true" className="ah-bar-chart__plot">
        {data.map((item) => (
          <div className="ah-bar-chart__column" key={item.label} title={item.title}>
            <div className="ah-bar-chart__bars">
              <span
                className="ah-bar-chart__bar ah-bar-chart__bar--total"
                style={{ height: `${String((item.total / maximum) * 100)}%` }}
              />
              <span
                className="ah-bar-chart__bar ah-bar-chart__bar--highlighted"
                style={{ height: `${String((item.highlighted / maximum) * 100)}%` }}
              />
            </div>
            <strong>{item.label}</strong>
            <small>{valueLabel(item)}</small>
          </div>
        ))}
      </div>
      <table className="ah-sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col">{totalLabel}</th>
            <th scope="col">{highlightedLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.label} title={item.title}>
              <th scope="row">{item.label}</th>
              <td>{item.total}</td>
              <td>{item.highlighted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
