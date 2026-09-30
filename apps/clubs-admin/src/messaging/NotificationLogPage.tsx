import { type ApiClient, type components, isApiError, listFields } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  DataTable,
  Drawer,
  Skeleton,
  type Tone,
  UniversalList,
  type UniversalListColumn,
  type UniversalListFilterColumn,
  type UniversalListLabels,
} from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSavedViews } from "../activities/shared";
import { useListExport } from "../audit/useListExport";
import {
  apiFilters,
  useListData,
  universalListLabels,
  useUrlListState,
} from "../lists/list-helpers";

import "./messaging.css";

type Row = components["schemas"]["NotificationListItem"];
type Detail = components["schemas"]["NotificationDetail"];
type Delivery = components["schemas"]["DeliveryView"];
type DeliveryStatus = components["schemas"]["DeliveryStatus"];

const LIST_KEY = "notifications";
const DEFAULT_COLUMNS = ["createdAt", "code", "category", "recipient", "channels", "readAt"];
/** The keys each column asks for (`fields`, the list's `x-fields`). */
const COLUMN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  category: ["category"],
  channels: ["channels"],
  code: ["code"],
  createdAt: ["createdAt"],
  readAt: ["readAt"],
  recipient: ["recipient", "audience"],
};
/**
 * The export's own columns (`x-columns` of `GET /notifications/export`: createdAt, code,
 * recipient, channels, readAt), by list column: a list column the export does not publish
 * (the category) is left out of the file.
 */
const EXPORT_COLUMNS: Readonly<Record<string, string>> = {
  channels: "channels",
  code: "code",
  createdAt: "createdAt",
  readAt: "readAt",
  recipient: "recipient",
};

/** The export columns of the list's visible ones, in the list's order. */
export function exportColumns(columns: readonly string[]): string {
  return [...new Set(columns.flatMap((column) => EXPORT_COLUMNS[column] ?? []))].join(",");
}

const STATUS_TONES: Readonly<Record<DeliveryStatus, Tone>> = {
  DELIVERED: "success",
  FAILED: "danger",
  QUEUED: "info",
  SENT: "success",
  SKIPPED_BY_PREFERENCE: "neutral",
  SKIPPED_CAP: "warning",
  SKIPPED_MODULE_OFF: "neutral",
  SKIPPED_NOT_ALLOWED: "neutral",
  SKIPPED_NO_CONTACT: "warning",
  SKIPPED_STALE: "neutral",
};

/**
 * A delivery's destination, never printed whole (S11 §2, E7-W01): an e-mail as `l···a@domini`, a
 * phone as its last three digits, a push subscription as «push».
 */
export function maskedTarget(target: string | null | undefined): string | undefined {
  if (target == null || target === "") return undefined;
  const at = target.indexOf("@");
  if (at > 0) {
    const local = target.slice(0, at);
    const masked =
      local.length <= 2
        ? `${local.charAt(0)}···`
        : `${local.charAt(0)}···${local.charAt(local.length - 1)}`;
    return `${masked}${target.slice(at)}`;
  }
  const digits = target.replaceAll(/\D/gu, "");
  if (target.startsWith("+") && digits.length >= 6) return `··· ${digits.slice(-3)}`;
  return "···";
}

/**
 * An applied filter's value as the list's state writes it: a scalar, or a list (`in`, `nin`) or a
 * range (`between`) — the api echoes both as arrays — joined by commas.
 */
export function filterValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => filterValue(item))
      .filter((item) => item !== "")
      .join(",");
  }
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

/**
 * «Avisos enviats» (`/notificacions`, S11 §2, R-11-10, no mockup): the club's notification log as a
 * universal list over `GET /notifications` (date · code · category · recipient · one chip per
 * delivery · read), filtered by `code`, `category`, `channel`, `status`, `memberId` and `createdAt`
 * (D10 links here with `?filter=memberId:eq:{id}`), and a drawer with the rendered texts and every
 * delivery, the destinations masked.
 */
export function NotificationLogPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["admin-messaging", "census", "enums", "errors"]);
  const formats = useClubFormats();
  const [state, setState, applySavedView] = useUrlListState({
    columns: DEFAULT_COLUMNS,
    size: 50,
    sort: ["createdAt,desc"],
  });
  const savedViews = useSavedViews(client, LIST_KEY, applySavedView);
  const listExport = useListExport(client);
  // A row opened in a new tab (`?avis=`) opens its drawer.
  const [openId, setOpenId] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("avis") ?? undefined,
  );
  const { data, error, loading, retry } = useListData<Row>(async () => {
    const result = await client.GET("/notifications", {
      params: {
        query: {
          fields: listFields(state.columns.flatMap((column) => COLUMN_FIELDS[column] ?? [])),
          filter: apiFilters(state.filters),
          page: state.page,
          ...(state.q === "" ? {} : { q: state.q }),
          size: state.size,
          sort: state.sort,
        },
      },
    });
    if (result.data === undefined) throw new TypeError("Notification log without data");
    return result.data;
  }, JSON.stringify(state));

  const dateTime = (instant: string) =>
    t("admin-messaging:log.dateTime", {
      date: formats.formatDate(instant, "short"),
      time: formats.formatTime(instant),
    });

  const enumLabel = (field: string, value: string) => {
    switch (field) {
      case "category":
        return t(`enums:notificationCategory.${value}`, { defaultValue: value });
      case "channel":
        return t(`enums:notificationChannel.${value}`, { defaultValue: value });
      case "status":
        return t(`enums:deliveryStatus.${value}`, { defaultValue: value });
      default:
        return value;
    }
  };

  const loadFilterValues = useCallback(
    async (field: string) => {
      const result = await client.GET("/notifications/filter-values", {
        params: {
          query: {
            field,
            filter: apiFilters(state.filters.filter((filter) => filter.field !== field)),
            ...(state.q === "" ? {} : { q: state.q }),
          },
        },
      });
      if (result.data === undefined) throw new TypeError("Notification filter values without data");
      return result.data.values.map((item) => {
        const value = filterValue(item.value);
        return { count: item.count, label: enumLabel(field, item.label), value };
      });
    },
    // `enumLabel` only reads `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, state.filters, state.q, t],
  );

  const filterColumns: UniversalListFilterColumn[] = [
    { key: "code", label: t("admin-messaging:log.column.code"), type: "enum" },
    { key: "category", label: t("admin-messaging:log.column.category"), type: "enum" },
    { key: "channel", label: t("admin-messaging:log.filter.channel"), type: "enum" },
    { key: "status", label: t("admin-messaging:log.filter.status"), type: "enum" },
    {
      key: "memberId",
      label: t("admin-messaging:log.filter.memberId"),
      operators: ["eq", "ne", "in", "nin"],
      type: "relation",
    },
    { key: "createdAt", label: t("admin-messaging:log.column.createdAt"), type: "date" },
  ];

  const columns: UniversalListColumn<Row>[] = [
    {
      key: "createdAt",
      label: t("admin-messaging:log.column.createdAt"),
      render: (row) => (row.createdAt === undefined ? "" : dateTime(row.createdAt)),
      sortKey: "createdAt",
    },
    { key: "code", label: t("admin-messaging:log.column.code"), render: (row) => row.code ?? "" },
    {
      key: "category",
      label: t("admin-messaging:log.column.category"),
      render: (row) =>
        row.category === undefined ? "" : t(`enums:notificationCategory.${row.category}`),
    },
    {
      key: "recipient",
      label: t("admin-messaging:log.column.recipient"),
      render: (row) => (
        <span className="messaging-log__recipient">
          {row.recipient?.displayName ?? ""}
          {row.audience == null || row.audience === "MEMBER" ? null : (
            <small>{t(`enums:notificationAudience.${row.audience}`)}</small>
          )}
        </span>
      ),
    },
    {
      key: "channels",
      label: t("admin-messaging:log.column.channels"),
      render: (row) => (
        <span className="messaging-log__channels">
          {(row.channels ?? []).map((item, index) => (
            <Badge key={`${item.channel}-${String(index)}`} tone={STATUS_TONES[item.status]}>
              {t("admin-messaging:log.channelState", {
                channel: t(`enums:notificationChannel.${item.channel}`),
                status: t(`enums:deliveryStatus.${item.status}`, { defaultValue: item.status }),
              })}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: "readAt",
      label: t("admin-messaging:log.column.readAt"),
      render: (row) =>
        row.readAt == null ? t("admin-messaging:log.noValue") : dateTime(row.readAt),
    },
  ];

  /** A date bound of a `createdAt` filter: a club-local day, or an instant in the club's zone. */
  const dateLabel = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/u.test(value)
      ? formats.formatPlainDate(value, "short")
      : Number.isNaN(Date.parse(value))
        ? value
        : formats.formatDate(value, "short");

  /**
   * An applied filter's chip: each value of a list (`in`, `nin`) by its label — the member's name
   * from the rows the api sent for `memberId` — and a range (`between`) as «from – to».
   */
  const valueLabel = (field: string, operator: string, value: string) => {
    const parts = value.split(",");
    const label = (part: string) =>
      field === "memberId"
        ? (data?.items.find((row) => row.recipient?.memberId === part)?.recipient?.displayName ??
          part)
        : field === "createdAt"
          ? dateLabel(part)
          : enumLabel(field, part);
    if (operator === "between" && parts.length === 2) {
      return t("admin-messaging:log.range", {
        from: label(parts[0] ?? ""),
        to: label(parts[1] ?? ""),
      });
    }
    return parts.map(label).join(t("admin-messaging:log.valueSeparator"));
  };

  const applied = (data?.appliedFilters ?? []).map((filter) => {
    const value = filterValue(filter.value);
    return {
      field: filter.field,
      fieldLabel:
        filterColumns.find((column) => column.key === filter.field)?.label ?? filter.field,
      operator: filter.op,
      value,
      valueLabel: valueLabel(filter.field, filter.op, value),
    };
  });

  const labels: UniversalListLabels<Row> = {
    ...universalListLabels(t, t("admin-messaging:log.emptyDescription")),
    emptyTitle: t("admin-messaging:log.empty"),
    search: t("admin-messaging:log.search"),
    selectRow: (row) =>
      t("admin-messaging:log.selectRow", { name: row.recipient?.displayName ?? "" }),
  };
  const listError =
    error === undefined
      ? undefined
      : isApiError(error)
        ? t(`errors:${error.code}`, { defaultValue: t("admin-messaging:log.error") })
        : t("admin-messaging:log.error");

  return (
    <section className="messaging-log">
      <h1>{t("admin-messaging:log.title")}</h1>
      <UniversalList<Row>
        appliedFilters={applied}
        caption={t("admin-messaging:log.caption")}
        columns={columns}
        {...(listError === undefined ? {} : { error: listError })}
        exportBusy={listExport.busy}
        {...(listExport.error === undefined ? {} : { exportError: listExport.error.message })}
        filterColumns={filterColumns}
        labels={labels}
        listKey={LIST_KEY}
        loadFilterValues={loadFilterValues}
        loading={loading}
        onCreateView={savedViews.create}
        onDeleteView={savedViews.remove}
        onExport={(format, current) => {
          void listExport.run("/notifications/export", {
            columns: exportColumns(current.columns),
            filter: apiFilters(current.filters),
            format,
            ...(current.q === "" ? {} : { q: current.q }),
            sort: current.sort,
          });
        }}
        onRenameView={savedViews.rename}
        onRetry={retry}
        onRowActivate={(row) => {
          setOpenId(row.id);
        }}
        onStateChange={setState}
        rowHref={(row) => `/notificacions?avis=${encodeURIComponent(row.id)}`}
        rowKey={(row) => row.id}
        rows={data?.items ?? []}
        savedViews={savedViews.views}
        state={state}
        totalPages={data?.totalPages ?? 0}
      />
      {openId === undefined ? null : (
        <NotificationDrawer
          client={client}
          id={openId}
          onClose={() => {
            setOpenId(undefined);
          }}
        />
      )}
    </section>
  );
}

function NotificationDrawer({
  client,
  id,
  onClose,
}: {
  client: ApiClient;
  id: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(["admin-messaging", "enums", "errors"]);
  const formats = useClubFormats();
  const [state, setState] = useState<{ detail: Detail } | { error: unknown } | undefined>();

  useEffect(() => {
    let current = true;
    client.GET("/notifications/{id}", { params: { path: { id } } }).then(
      ({ data }) => {
        if (current && data !== undefined) setState({ detail: data });
      },
      (error: unknown) => {
        if (current) setState({ error });
      },
    );
    return () => {
      current = false;
    };
  }, [client, id]);

  const dateTime = (instant: string | null | undefined) =>
    instant == null
      ? t("admin-messaging:log.noValue")
      : t("admin-messaging:log.dateTime", {
          date: formats.formatDate(instant, "short"),
          time: formats.formatTime(instant),
        });

  return (
    <Drawer
      closeLabel={t("admin-messaging:log.detail.close")}
      onClose={onClose}
      open
      title={
        state !== undefined && "detail" in state
          ? t("admin-messaging:log.detail.title", { code: state.detail.code })
          : t("admin-messaging:log.title")
      }
    >
      {state === undefined ? (
        <Skeleton height="16rem" label={t("admin-messaging:log.detail.loading")} />
      ) : "error" in state ? (
        <p className="messaging-editor__error" role="alert">
          {isApiError(state.error) && state.error.status !== 0
            ? t(`errors:${state.error.code}`, { defaultValue: t("admin-messaging:log.error") })
            : t("admin-messaging:log.error")}
        </p>
      ) : (
        <div className="messaging-log__detail">
          <p>
            <strong>{state.detail.title}</strong>
          </p>
          <p className="messaging-log__body">{state.detail.body}</p>
          {state.detail.smsBody == null ? null : (
            <p className="messaging-log__sms">
              {t("admin-messaging:log.detail.sms")}: «{state.detail.smsBody}»
            </p>
          )}
          <dl className="messaging-log__facts">
            <dt>{t("admin-messaging:log.detail.recipient")}</dt>
            <dd>
              {state.detail.recipient.displayName}
              {state.detail.audience == null
                ? null
                : ` · ${t(`enums:notificationAudience.${state.detail.audience}`)}`}
            </dd>
            <dt>{t("admin-messaging:log.detail.createdAt")}</dt>
            <dd>{dateTime(state.detail.createdAt)}</dd>
            <dt>{t("admin-messaging:log.detail.locale")}</dt>
            <dd>{state.detail.locale.toLocaleUpperCase()}</dd>
            <dt>{t("admin-messaging:log.detail.template")}</dt>
            <dd>
              {state.detail.templateId == null
                ? t("admin-messaging:log.detail.productText")
                : t("admin-messaging:log.detail.templateVersion", {
                    code: state.detail.code,
                    version: state.detail.templateVersion ?? 1,
                  })}
            </dd>
            <dt>{t("admin-messaging:log.detail.event")}</dt>
            <dd>{state.detail.eventType ?? t("admin-messaging:log.detail.direct")}</dd>
            <dt>{t("admin-messaging:log.detail.readAt")}</dt>
            <dd>{dateTime(state.detail.readAt)}</dd>
          </dl>
          <DataTable<Delivery>
            caption={t("admin-messaging:log.detail.deliveries")}
            columns={[
              {
                header: t("admin-messaging:log.detail.channel"),
                key: "channel",
                render: (row) => t(`enums:notificationChannel.${row.channel}`),
              },
              {
                header: t("admin-messaging:log.detail.target"),
                key: "target",
                render: (row) => maskedTarget(row.target) ?? t("admin-messaging:log.noValue"),
              },
              {
                header: t("admin-messaging:log.detail.status"),
                key: "status",
                render: (row) => (
                  <Badge tone={STATUS_TONES[row.status]}>
                    {t(`enums:deliveryStatus.${row.status}`, { defaultValue: row.status })}
                  </Badge>
                ),
              },
              {
                header: t("admin-messaging:log.detail.attempts"),
                key: "attempts",
                render: (row) => String(row.attempts),
              },
              {
                header: t("admin-messaging:log.detail.providerRef"),
                key: "providerRef",
                render: (row) => row.providerRef ?? t("admin-messaging:log.noValue"),
              },
              {
                header: t("admin-messaging:log.detail.lastError"),
                key: "lastError",
                render: (row) => row.lastError ?? t("admin-messaging:log.noValue"),
              },
            ]}
            empty={t("admin-messaging:log.detail.noDeliveries")}
            loadingLabel={t("admin-messaging:log.detail.loading")}
            rowKey={(row) => `${row.channel}-${row.target ?? "app"}`}
            rows={state.detail.deliveries}
          />
        </div>
      )}
    </Drawer>
  );
}
