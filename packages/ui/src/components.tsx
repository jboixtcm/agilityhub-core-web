import {
  createContext,
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

export function FormField({ children, error, help, id, label }: FormFieldProps) {
  return (
    <div className={classes("ah-form-field", error !== undefined && "ah-form-field--error")}>
      <label className="ah-form-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {help !== undefined ? <div className="ah-form-field__help">{help}</div> : null}
      {error !== undefined ? (
        <div className="ah-form-field__error" role="alert">
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

function useOverlay(open: boolean, onClose: () => void, dismissible: boolean) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (dismissible && event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    if (dismissible) {
      closeRef.current?.focus();
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [dismissible, onClose, open]);

  return closeRef;
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
  const closeRef = useOverlay(open, onClose, dismissible);
  if (!open) {
    return null;
  }

  return (
    <div className="ah-overlay">
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
  const closeRef = useOverlay(open, onClose, true);
  if (!open) {
    return null;
  }

  return (
    <div className="ah-overlay ah-overlay--drawer">
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
                {entry.count === undefined ? null : <Badge>{entry.count}</Badge>}
              </a>
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}

export interface EmptyStateProps {
  description: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}

export function EmptyState({ action, description, icon = "info", title }: EmptyStateProps) {
  return (
    <section className="ah-empty-state">
      <Icon aria-hidden="true" name={icon} />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
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
