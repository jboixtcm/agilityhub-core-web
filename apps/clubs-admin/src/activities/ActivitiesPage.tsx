import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  FormField,
  Icon,
  Input,
  Modal,
  Select,
  type Tone,
  UniversalList,
  type UniversalFilter,
  type UniversalFilterOperator,
  type UniversalListColumn,
  type UniversalListFilterColumn,
  type UniversalListLabels,
  type UniversalListSavedView,
  type UniversalListState,
  readUniversalListState,
  universalListSearchParams,
  useBranding,
} from "@agilityhub/ui";
import {
  type CSSProperties,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { useListExport } from "../audit/useListExport";
import { LocaleTabs } from "../catalogs/shared";

import "./activities.css";
import { ActivityPage } from "./ActivityPage";
import {
  ACTIVITY_TYPES,
  type ActivityListItem,
  type ActivityState,
  type ActivityType,
  dayMonthParts,
  sentenceCase,
  useActivityErrorMessage,
  useSavedViews,
} from "./shared";

type ListFilter = components["schemas"]["Filter"];

interface ListData {
  appliedFilters: ListFilter[];
  items: ActivityListItem[];
  totalPages: number;
}

const LIST_KEY = "activities";
const DEFAULT_COLUMNS = ["title", "date", "rings", "registrations", "state"];
const DEFAULT_FILTERS: UniversalFilter[] = [{ field: "deleted", operator: "eq", value: "false" }];

export const stateTone: Readonly<Record<ActivityState, Tone>> = {
  CANCELLED: "danger",
  DRAFT: "neutral",
  FINISHED: "info",
  PUBLISHED: "success",
};

function filterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

function apiFilters(filters: readonly UniversalFilter[]): string[] {
  return filters.map((filter) => `${filter.field}:${filter.operator}:${filter.value}`);
}

function useListState() {
  const [state, setState] = useState(() =>
    readUniversalListState(
      window.location.pathname === "/activitats" ? window.location.search : "",
      {
        columns: DEFAULT_COLUMNS,
        filters: DEFAULT_FILTERS,
        size: 50,
        sort: ["date,desc"],
      },
    ),
  );
  const update = useCallback((next: UniversalListState) => {
    if (window.location.pathname === "/activitats") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${universalListSearchParams(next).toString()}`,
      );
    }
    setState(next);
  }, []);
  return [state, update, setState] as const;
}

function useActivities(client: ApiClient, state: UniversalListState, reload: number) {
  const [data, setData] = useState<ListData>();
  const [result, setResult] = useState<{ error?: unknown; key: string }>({ key: "" });
  const key = JSON.stringify({ reload, state });
  useEffect(() => {
    let current = true;
    void client
      .GET("/activities", {
        params: {
          query: {
            fields: state.columns.join(","),
            filter: apiFilters(state.filters),
            page: state.page,
            ...(state.q === "" ? {} : { q: state.q }),
            size: state.size,
            sort: state.sort,
          },
        },
      })
      .then(
        (response) => {
          if (!current) return;
          if (response.data !== undefined) setData(response.data);
          setResult({ key });
        },
        (error: unknown) => {
          if (current) setResult({ error, key });
        },
      );
    return () => {
      current = false;
    };
  }, [client, key, state]);
  return {
    data,
    error: result.key === key ? result.error : undefined,
    loading: result.key !== key,
  };
}

/** «Nova activitat»: title per active locale (the default one required) and type (R-07-01). */
function CreateActivityModal({
  client,
  onClose,
  onCreated,
}: {
  client: ApiClient;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation(["admin-activities", "enums", "errors"]);
  const branding = useBranding();
  const errorMessage = useActivityErrorMessage();
  const [locale, setLocale] = useState(branding.defaultLocale);
  const [title, setTitle] = useState<Record<string, string>>({});
  const [type, setType] = useState<ActivityType>("SEMINAR");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field: boolean; message: string }>();

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(
      Object.entries(title)
        .map(([key, value]) => [key, value.trim()] as const)
        .filter(([, value]) => value !== ""),
    );
    if ((values[branding.defaultLocale] ?? "") === "") {
      setLocale(branding.defaultLocale);
      setError({
        field: true,
        message: t("admin-activities:create.titleRequired", {
          locale: branding.defaultLocale.toLocaleUpperCase(),
        }),
      });
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await client.POST("/activities", { body: { title: values, type } });
      if (result.data === undefined) throw new TypeError("Missing created activity");
      onCreated(result.data.id);
    } catch (cause) {
      setError({ field: false, message: errorMessage(cause) });
      setPending(false);
    }
  };

  return (
    <Modal
      closeLabel={t("admin-activities:common.close")}
      onClose={onClose}
      open
      title={t("admin-activities:create.title")}
    >
      <form className="activity-create" noValidate onSubmit={(event) => void submit(event)}>
        {branding.locales.length > 1 ? (
          <LocaleTabs locale={locale} locales={branding.locales} onChange={setLocale} />
        ) : null}
        <FormField
          {...(error?.field === true ? { error: error.message } : {})}
          id="activity-create-title"
          label={t("admin-activities:form.title")}
        >
          <Input
            id="activity-create-title"
            maxLength={80}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setTitle((current) => ({ ...current, [locale]: value }));
            }}
            required={locale === branding.defaultLocale}
            value={title[locale] ?? ""}
          />
        </FormField>
        <FormField id="activity-create-type" label={t("admin-activities:form.type")}>
          <Select
            id="activity-create-type"
            onChange={(event) => {
              setType(event.currentTarget.value as ActivityType);
            }}
            value={type}
          >
            {ACTIVITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {sentenceCase(t(`enums:activityType.${value}`))}
              </option>
            ))}
          </Select>
        </FormField>
        {error === undefined || error.field ? null : (
          <p className="ah-form-field__error" role="alert">
            {error.message}
          </p>
        )}
        <div className="activity-modal__actions">
          <Button onClick={onClose} variant="ghost">
            {t("admin-activities:common.back")}
          </Button>
          <Button
            loading={pending}
            loadingLabel={t("admin-activities:common.saving")}
            type="submit"
          >
            {t("admin-activities:create.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * D7 (`/activitats`, S07 §2): universal list of activities; with `selectedId`
 * (`/activitats/:id`) the maintenance cards of that activity follow the list, as the mockup.
 */
export function ActivitiesPage({
  client,
  onNavigate,
  readOnly,
  selectedId,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
  readOnly: boolean;
  selectedId?: string;
}) {
  const { t } = useTranslation(["admin-activities", "census", "enums", "errors"]);
  const formats = useClubFormats();
  const listExport = useListExport(client);
  const [state, setState, replaceState] = useListState();
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useActivities(client, state, reload);
  const applyView = useCallback(
    (view: UniversalListSavedView) => {
      replaceState((current) => ({
        ...current,
        columns: view.columns,
        filters: view.filters,
        page: 0,
        sort: view.sort,
      }));
    },
    [replaceState],
  );
  const savedViews = useSavedViews(client, LIST_KEY, applyView);
  const [creating, setCreating] = useState(false);
  const today = new Date();

  const columns = useMemo<UniversalListColumn<ActivityListItem>[]>(
    () => [
      {
        key: "title",
        label: t("admin-activities:list.columns.title"),
        render: (item) => (
          <span className="activity-title-cell">
            <Icon aria-hidden="true" name="flag" />
            <strong>{item.title}</strong>
            <span className="activity-title-cell__type">
              {t("admin-activities:list.typeSuffix", {
                type: item.typeDisplay,
              })}
            </span>
          </span>
        ),
        sortKey: "title",
      },
      {
        key: "date",
        label: t("admin-activities:list.columns.date"),
        render: (item) =>
          item.date === null || item.date === undefined
            ? t("admin-activities:list.none")
            : formats.formatActivityDate(item.date, item.startTime, item.endTime, "list", today),
        sortKey: "date",
      },
      {
        key: "rings",
        label: t("admin-activities:list.columns.rings"),
        render: (item) => {
          // `location` is the free text of an activity away from the club; `null` at the club.
          if (item.location !== null) return t("admin-activities:list.offSite");
          if (item.allRings) return t("admin-activities:list.allRings");
          const [first] = item.rings;
          if (item.rings.length === 1 && first !== undefined) {
            return (
              <span className="activity-ring">
                <span
                  aria-hidden="true"
                  className="activity-ring__dot"
                  style={{ "--activity-ring-color": first.color } as CSSProperties}
                />
                {first.name}
              </span>
            );
          }
          return item.rings.length === 0
            ? t("admin-activities:list.none")
            : item.rings.map((ring) => ring.name).join(t("admin-activities:list.ringSeparator"));
        },
      },
      {
        key: "registrations",
        label: t("admin-activities:list.columns.registrations"),
        render: (item) => {
          if (item.state === "DRAFT" || item.state === "CANCELLED") {
            return t("admin-activities:list.none");
          }
          if (item.maxPlaces === null) {
            // «obertes · socis» only while it is published (step 2); finished → «—».
            return item.state === "PUBLISHED"
              ? t("admin-activities:list.registrationsOpen")
              : t("admin-activities:list.none");
          }
          const to = item.registrationTo;
          return item.state !== "PUBLISHED" || to === null || to === undefined
            ? t("admin-activities:list.registrationsCount", {
                active: item.registrations.active,
                max: item.maxPlaces,
              })
            : t("admin-activities:list.registrationsWithMax", {
                active: item.registrations.active,
                date: t("admin-activities:list.shortDate", dayMonthParts(to)),
                max: item.maxPlaces,
              });
        },
      },
      {
        key: "state",
        label: t("admin-activities:list.columns.state"),
        render: (item) => (
          <Badge tone={stateTone[item.state]}>{t(`enums:activityState.${item.state}`)}</Badge>
        ),
        sortKey: "state",
      },
      {
        key: "type",
        label: t("admin-activities:list.columns.type"),
        render: (item) => t(`enums:activityType.${item.type}`),
      },
      {
        key: "slug",
        label: t("admin-activities:list.columns.slug"),
        render: (item) => item.slug,
      },
      {
        key: "registrationTo",
        label: t("admin-activities:list.columns.registrationTo"),
        render: (item) =>
          item.registrationTo === null || item.registrationTo === undefined
            ? t("admin-activities:list.none")
            : formats.formatPlainDate(item.registrationTo),
      },
    ],
    // `today` only decides «the current month»: a render-time value is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formats, t],
  );

  const filterColumns: UniversalListFilterColumn[] = [
    { key: "state", label: t("admin-activities:list.filters.state"), type: "enum" },
    { key: "type", label: t("admin-activities:list.filters.type"), type: "enum" },
    { key: "date", label: t("admin-activities:list.filters.date"), type: "date" },
    { key: "ringId", label: t("admin-activities:list.filters.ringId"), type: "relation" },
    { key: "levelId", label: t("admin-activities:list.filters.levelId"), type: "relation" },
    {
      key: "registrationOpen",
      label: t("admin-activities:list.filters.registrationOpen"),
      type: "boolean",
    },
  ];

  const operators: Record<UniversalFilterOperator, string> = {
    between: t("census:list.operators.between"),
    contains: t("census:list.operators.contains"),
    eq: t("census:list.operators.eq"),
    exists: t("census:list.operators.exists"),
    gt: t("census:list.operators.gt"),
    gte: t("census:list.operators.gte"),
    in: t("census:list.operators.in"),
    lt: t("census:list.operators.lt"),
    lte: t("census:list.operators.lte"),
    ne: t("census:list.operators.ne"),
    nin: t("census:list.operators.nin"),
    startsWith: t("census:list.operators.startsWith"),
  };

  // With a search or a filter beyond «Mostra», the empty list keeps «clear filters» (no create).
  const filtered = state.q !== "" || state.filters.some((filter) => filter.field !== "deleted");
  const labels: UniversalListLabels<ActivityListItem> = {
    addFilter: t("census:list.addFilter"),
    clearFilters: t("census:list.clearFilters"),
    closeError: t("census:list.closeError"),
    columns: t("census:list.columns"),
    createView: t("census:list.createView"),
    defaultView: t("census:list.defaultView"),
    deleteView: t("census:list.deleteView"),
    emptyDescription: filtered
      ? t("admin-activities:list.emptyFilteredDescription")
      : t("admin-activities:list.emptyDescription"),
    emptyTitle: filtered
      ? t("admin-activities:list.emptyFilteredTitle")
      : t("admin-activities:list.emptyTitle"),
    export: t("census:list.export"),
    filter: t("census:list.filter"),
    filterField: t("census:list.filterField"),
    filterOperator: t("census:list.filterOperator"),
    filterValue: t("census:list.filterValue"),
    formatPdf: t("census:list.formatPdf"),
    formatXlsx: t("census:list.formatXlsx"),
    loading: t("census:list.loading"),
    loadingFilterValues: t("census:list.loadingFilterValues"),
    nextPage: t("census:list.nextPage"),
    noSavedView: t("census:list.noSavedView"),
    operators,
    page: (page, totalPages) => t("census:list.page", { page, totalPages }),
    previousPage: t("census:list.previousPage"),
    removeFilter: (field) => t("census:list.removeFilter", { field }),
    renameView: t("census:list.renameView"),
    retry: t("admin-activities:common.retry"),
    rowsPerPage: t("census:list.rowsPerPage"),
    saveError: t("census:list.saveError"),
    saveViewName: t("census:list.saveViewName"),
    search: t("admin-activities:list.search"),
    selectAll: t("census:list.selectAll"),
    selectRow: (item) => t("admin-activities:list.open", { title: item.title }),
    selected: (count) => t("census:list.selected", { count }),
    sharedView: t("census:list.sharedView"),
    sortAscending: (column) => t("census:list.sortAscending", { column }),
    sortDescending: (column) => t("census:list.sortDescending", { column }),
    view: (name) => t("census:list.view", { name }),
    views: t("census:list.views"),
  };

  const loadFilterValues = useCallback(
    async (field: string) => {
      const result = await client.GET("/activities/filter-values", {
        params: {
          query: {
            field,
            filter: apiFilters(state.filters.filter((filter) => filter.field !== field)),
          },
        },
      });
      if (result.data === undefined) throw new TypeError("Missing filter values");
      return result.data.values.map((item) => ({
        count: item.count,
        label:
          field === "state"
            ? t(`enums:activityState.${filterValue(item.value)}`, { defaultValue: item.label })
            : field === "type"
              ? t(`enums:activityType.${filterValue(item.value)}`, { defaultValue: item.label })
              : item.label,
        value: filterValue(item.value),
      }));
    },
    [client, state.filters, t],
  );

  const runExport = (format: "pdf" | "xlsx", current: UniversalListState) => {
    void listExport.run("/activities/export", {
      columns: current.columns.join(","),
      filter: apiFilters(current.filters),
      format,
      ...(current.q === "" ? {} : { q: current.q }),
      sort: current.sort,
    });
  };

  const errorMessage =
    error === undefined
      ? undefined
      : isApiError(error)
        ? t(`errors:${error.code}`, { defaultValue: t("admin-activities:list.error") })
        : t("admin-activities:list.error");

  const applied = (data?.appliedFilters ?? []).map((filter) => {
    const value = filterValue(filter.value);
    return {
      field: filter.field,
      fieldLabel:
        filterColumns.find((column) => column.key === filter.field)?.label ?? filter.field,
      operator: filter.op,
      value,
      valueLabel:
        filter.field === "state"
          ? t(`enums:activityState.${value}`, { defaultValue: value })
          : filter.field === "type"
            ? t(`enums:activityType.${value}`, { defaultValue: value })
            : value === "true"
              ? t("census:values.yes")
              : value === "false"
                ? t("census:values.no")
                : value,
    };
  });

  const newButton = readOnly ? null : (
    <Button
      onClick={() => {
        setCreating(true);
      }}
    >
      <Icon aria-hidden="true" name="plus" />
      {t("admin-activities:list.new")}
    </Button>
  );

  return (
    <div className="activities-page">
      <header className="activities-page__header">
        <h1>{t("admin-activities:list.title")}</h1>
        {newButton}
      </header>
      <UniversalList<ActivityListItem>
        appliedFilters={applied}
        caption={t("admin-activities:list.caption")}
        columns={columns}
        {...(newButton === null || filtered ? {} : { emptyAction: newButton })}
        {...(errorMessage === undefined ? {} : { error: errorMessage })}
        exportable={!readOnly}
        exportBusy={listExport.busy}
        {...(listExport.error === undefined ? {} : { exportError: listExport.error.message })}
        filterColumns={filterColumns}
        labels={labels}
        listKey={LIST_KEY}
        loadFilterValues={loadFilterValues}
        loading={loading}
        onCreateView={savedViews.create}
        onDeleteView={savedViews.remove}
        onExport={runExport}
        onRenameView={savedViews.rename}
        onRetry={() => {
          setReload((value) => value + 1);
        }}
        onRowActivate={(item) => {
          onNavigate(`/activitats/${item.id}`);
        }}
        onStateChange={setState}
        rowHref={(item) => `/activitats/${item.id}`}
        rowKey={(item) => item.id}
        rows={data?.items ?? []}
        savedViews={savedViews.views}
        state={state}
        statusFilter={{
          field: "deleted",
          label: t("admin-activities:list.statusLabel"),
          options: [
            { label: t("admin-activities:list.statuses.withoutDeleted"), value: "false" },
            { label: t("admin-activities:list.statuses.all"), value: "" },
          ],
        }}
        totalPages={data?.totalPages ?? 0}
      />
      {selectedId === undefined ? null : (
        <ActivityPage
          activityId={selectedId}
          client={client}
          key={selectedId}
          onChanged={() => {
            setReload((value) => value + 1);
          }}
          onNavigate={onNavigate}
          readOnly={readOnly}
        />
      )}
      {creating ? (
        <CreateActivityModal
          client={client}
          onClose={() => {
            setCreating(false);
          }}
          onCreated={(id) => {
            setCreating(false);
            setReload((value) => value + 1);
            onNavigate(`/activitats/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}
