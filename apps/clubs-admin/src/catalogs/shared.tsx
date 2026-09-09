import { isApiError } from "@agilityhub/api-client";
import { Badge, Button, Card, Icon, IconButton, Skeleton, Toast, type Tone } from "@agilityhub/ui";
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

export interface CatalogColumn<Row> {
  header: string;
  key: string;
  render: (row: Row) => ReactNode;
}

export function CatalogPageHeader({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <header className="catalog-page__header">
      <h1>{title}</h1>
      {action}
    </header>
  );
}

export function CatalogSectionHeader({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <div className="catalog-section__header">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export function CatalogTable<Row extends { active?: boolean; id: string }>({
  actions,
  caption,
  columns,
  empty,
  loading,
  onActivate,
  onEdit,
  onRemove,
  onReorder,
  rows,
}: {
  caption: string;
  columns: CatalogColumn<Row>[];
  empty: string;
  loading: boolean;
  rows: Row[];
  actions?: (row: Row) => ReactNode;
  onActivate?: (row: Row) => void;
  onEdit?: (row: Row) => void;
  onRemove?: (row: Row) => void;
  onReorder?: (sourceId: string, targetId: string) => void;
}) {
  const { t } = useTranslation("admin-catalogs");
  const [dragging, setDragging] = useState<string>();
  const actionable = onActivate !== undefined;
  const keyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: Row) => {
    if (actionable && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onActivate(row);
    }
  };

  return (
    <Card className="catalog-table-card">
      <div className="catalog-table-scroll">
        <table className="catalog-table">
          <caption className="ah-sr-only">{caption}</caption>
          <thead>
            <tr>
              {onReorder === undefined ? null : <th className="catalog-table__drag" scope="col" />}
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
              {actions === undefined && onEdit === undefined && onRemove === undefined ? null : (
                <th className="catalog-table__actions" scope="col" />
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={
                    columns.length +
                    (onReorder === undefined ? 0 : 1) +
                    (actions === undefined && onEdit === undefined && onRemove === undefined
                      ? 0
                      : 1)
                  }
                >
                  <Skeleton label={t("admin-catalogs:common.loading")} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  className="catalog-table__empty"
                  colSpan={
                    columns.length +
                    (onReorder === undefined ? 0 : 1) +
                    (actions === undefined && onEdit === undefined && onRemove === undefined
                      ? 0
                      : 1)
                  }
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  className={row.active === false ? "catalog-table__row--inactive" : undefined}
                  draggable={onReorder !== undefined}
                  key={row.id}
                  onClick={
                    actionable
                      ? () => {
                          onActivate(row);
                        }
                      : undefined
                  }
                  onDragEnd={() => {
                    setDragging(undefined);
                  }}
                  onDragOver={(event: DragEvent<HTMLTableRowElement>) => {
                    if (onReorder !== undefined) {
                      event.preventDefault();
                    }
                  }}
                  onDragStart={(event: DragEvent<HTMLTableRowElement>) => {
                    setDragging(row.id);
                    event.dataTransfer.setData("text/plain", row.id);
                  }}
                  onDrop={(event: DragEvent<HTMLTableRowElement>) => {
                    event.preventDefault();
                    const source = event.dataTransfer.getData("text/plain") || dragging;
                    if (source !== undefined && source !== row.id) {
                      onReorder?.(source, row.id);
                    }
                    setDragging(undefined);
                  }}
                  onKeyDown={
                    actionable
                      ? (event) => {
                          keyDown(event, row);
                        }
                      : undefined
                  }
                  tabIndex={actionable ? 0 : undefined}
                >
                  {onReorder === undefined ? null : (
                    <td className="catalog-table__drag" title={t("admin-catalogs:common.drag")}>
                      <Icon aria-hidden="true" name="swap" />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key}>{column.render(row)}</td>
                  ))}
                  {actions === undefined &&
                  onEdit === undefined &&
                  onRemove === undefined ? null : (
                    <td className="catalog-table__actions">
                      {actions?.(row)}
                      {onEdit === undefined ? null : (
                        <IconButton
                          icon="edit"
                          label={t("admin-catalogs:common.editNamed", { name: row.id })}
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(row);
                          }}
                        />
                      )}
                      {onRemove === undefined ? null : (
                        <IconButton
                          icon="x"
                          label={t("admin-catalogs:common.removeNamed", { name: row.id })}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemove(row);
                          }}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function YesNoBadge({ value }: { value: boolean }) {
  const { t } = useTranslation("admin-catalogs");
  return (
    <Badge tone={value ? "success" : "neutral"}>
      {value ? t("admin-catalogs:common.yes") : t("admin-catalogs:common.no")}
    </Badge>
  );
}

export function ColorValue({ color, text = true }: { color: string; text?: boolean }) {
  return (
    <span className="catalog-color-value" style={{ "--catalog-color": color } as CSSProperties}>
      <span aria-hidden="true" className="catalog-color-value__dot" />
      {text ? color.toLocaleUpperCase() : null}
    </span>
  );
}

export function LocaleTabs({
  locale,
  locales,
  onChange,
}: {
  locale: string;
  locales: readonly string[];
  onChange: (locale: string) => void;
}) {
  const { t } = useTranslation("admin-catalogs");
  return (
    <div
      aria-label={t("admin-catalogs:common.languages")}
      className="catalog-locale-tabs"
      role="tablist"
    >
      {locales.map((candidate) => (
        <button
          aria-selected={candidate === locale}
          key={candidate}
          onClick={() => {
            onChange(candidate);
          }}
          role="tab"
          type="button"
        >
          {candidate.toLocaleUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function CatalogFeedback({
  message,
  onDismiss,
  tone = "danger",
}: {
  message?: string | undefined;
  onDismiss: () => void;
  tone?: Tone;
}) {
  const { t } = useTranslation("admin-catalogs");
  return message === undefined ? null : (
    <Toast dismissLabel={t("admin-catalogs:common.dismiss")} onDismiss={onDismiss} tone={tone}>
      {message}
    </Toast>
  );
}

export function useCatalogData<Item>(load: () => Promise<Item[]>, dependency: unknown) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<unknown>();
  const [reloadKey, setReloadKey] = useState(0);
  const [completedKey, setCompletedKey] = useState(-1);

  useEffect(() => {
    let current = true;
    void load().then(
      (result) => {
        if (current) {
          setItems(result);
          setError(undefined);
          setCompletedKey(reloadKey);
        }
      },
      (reason: unknown) => {
        if (current) {
          setError(reason);
          setCompletedKey(reloadKey);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [dependency, load, reloadKey]);

  return {
    error,
    items,
    loading: completedKey !== reloadKey,
    reload: () => {
      setReloadKey((value) => value + 1);
    },
    setItems,
  };
}

export function useCatalogError() {
  const { t } = useTranslation(["admin-catalogs", "errors"]);
  return (error: unknown): string => {
    if (isApiError(error)) {
      if (error.code === "LAST_ADMIN") {
        return t("admin-catalogs:team.lastAdmin");
      }
      if (error.code === "STALE_VERSION") {
        return t("admin-catalogs:common.stale");
      }
      return t(`errors:${error.code}`, {
        defaultValue: t("admin-catalogs:common.genericError"),
      });
    }
    return t("admin-catalogs:common.genericError");
  };
}

export function LoadFailure({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("admin-catalogs");
  return (
    <Card className="catalog-load-error" role="alert">
      <p>{t("admin-catalogs:common.loadError")}</p>
      <Button onClick={onRetry} variant="secondary">
        {t("admin-catalogs:common.retry")}
      </Button>
    </Card>
  );
}

export function moveBefore<Item extends { id: string }>(
  items: readonly Item[],
  sourceId: string,
  targetId: string,
): Item[] {
  const source = items.find((item) => item.id === sourceId);
  if (source === undefined) {
    return [...items];
  }
  const remaining = items.filter((item) => item.id !== sourceId);
  const targetIndex = remaining.findIndex((item) => item.id === targetId);
  remaining.splice(targetIndex < 0 ? remaining.length : targetIndex, 0, source);
  return remaining;
}
