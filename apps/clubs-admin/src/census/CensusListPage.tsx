import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import {
  Badge,
  Button,
  Icon,
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
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type MemberListItem = components["schemas"]["MemberListItem"];
type DogListItem = Omit<components["schemas"]["DogListItem"], "licenses"> &
  components["schemas"]["DogPendingFields"] & {
    licenses: components["schemas"]["LicenseWithPendingFields"][];
  };
type ListFilter = components["schemas"]["Filter"];
type MemberListResponse = components["schemas"]["ListPageMemberListItem"];
type DogListResponse = components["schemas"]["ListPageDogListItem"];
type SavedView = components["schemas"]["SavedView"];
type SavedViewCreate = components["schemas"]["SavedViewCreate"];
type SavedViewUpdate = components["schemas"]["SavedViewUpdate"];

type CensusKind = "dogs" | "members";

interface ListData<Row> {
  appliedFilters: ListFilter[];
  items: Row[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

const MEMBER_DEFAULT_COLUMNS = ["fullName", "dogs", "plan", "displayStatus"];
const DOG_DEFAULT_COLUMNS = [
  "name",
  "breed",
  "level",
  "owner",
  "freeTraining",
  "licenses",
  "displayStatus",
];
const MEMBER_DEFAULT_FILTERS: UniversalFilter[] = [
  { field: "status", operator: "eq", value: "ACTIVE" },
  { field: "planId", operator: "eq", value: "plan-member" },
];
const DOG_DEFAULT_FILTERS: UniversalFilter[] = [
  { field: "status", operator: "eq", value: "ACTIVE" },
];

function filterValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

function apiFilters(filters: readonly UniversalFilter[]): string[] {
  return filters.map((filter) => `${filter.field}:${filter.operator}:${filter.value}`);
}

function savedViewFilters(filters: readonly UniversalFilter[]): ListFilter[] {
  return filters.map((filter) => ({
    field: filter.field,
    op: filter.operator,
    value: filter.value,
  }));
}

function universalFilters(filters: readonly ListFilter[]): UniversalFilter[] {
  return filters.map((filter) => ({
    field: filter.field,
    operator: filter.op,
    value: filterValue(filter.value),
  }));
}

function toUniversalSavedView(view: SavedView): UniversalListSavedView {
  return {
    columns: [...view.columns],
    filters: universalFilters(view.filters),
    id: view.id,
    name: view.name,
    shared: view.shared,
    sort: [...view.sort],
  };
}

function queryFor(state: UniversalListState) {
  return {
    fields: state.columns.join(","),
    filter: apiFilters(state.filters),
    page: state.page,
    ...(state.q === "" ? {} : { q: state.q }),
    size: state.size,
    sort: state.sort,
  };
}

function exportHref(kind: CensusKind, format: "pdf" | "xlsx", state: UniversalListState): string {
  const parameters = universalListSearchParams(state);
  parameters.delete("page");
  parameters.delete("size");
  parameters.delete("fields");
  parameters.set("format", format);
  parameters.set("columns", state.columns.join(","));
  return `/api/v1/${kind}/export?${parameters.toString()}`;
}

function formatDate(value: string, locale: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function toneForStatus(kind: components["schemas"]["DisplayStatus"]["kind"]) {
  if (kind === "ACTIVE") {
    return "success" as const;
  }
  if (kind === "INACTIVE_PERIOD" || kind === "LEAVE_SCHEDULED" || kind === "PENDING") {
    return "warning" as const;
  }
  return "danger" as const;
}

function levelChip(code: string): ReactNode {
  return <span className="census-level-chip">{code}</span>;
}

function useCensusData<Row extends DogListItem | MemberListItem>(
  client: ApiClient,
  kind: CensusKind,
  state: UniversalListState,
) {
  const [data, setData] = useState<ListData<Row>>();
  const [failure, setFailure] = useState<{ error: unknown; key: string }>();
  const [completedKey, setCompletedKey] = useState("");
  const [reload, setReload] = useState(0);
  const requestKey = JSON.stringify({ kind, reload, state });

  useEffect(() => {
    let current = true;
    const request: Promise<{ data?: DogListResponse | MemberListResponse }> =
      kind === "members"
        ? client.GET("/members", { params: { query: queryFor(state) } })
        : client.GET("/dogs", { params: { query: queryFor(state) } });
    void request.then(
      (result) => {
        if (!current) {
          return;
        }
        if (result.data === undefined) {
          setFailure({
            error: new TypeError("List response did not contain data"),
            key: requestKey,
          });
        } else {
          setData(result.data as ListData<Row>);
          setFailure(undefined);
        }
        setCompletedKey(requestKey);
      },
      (reason: unknown) => {
        if (current) {
          setFailure({ error: reason, key: requestKey });
          setCompletedKey(requestKey);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [client, kind, reload, requestKey, state]);

  return {
    data,
    error: failure?.key === requestKey ? failure.error : undefined,
    loading: completedKey !== requestKey,
    retry: () => {
      setReload((value) => value + 1);
    },
  };
}

function useSavedViews(
  client: ApiClient,
  listKey: CensusKind,
  onDefaultView: (view: UniversalListSavedView) => void,
) {
  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => {
    let current = true;
    void client.GET("/saved-views", { params: { query: { listKey } } }).then((result) => {
      if (current && result.data !== undefined) {
        setViews(result.data);
        const defaultViewId = localStorage.getItem(`agilityhub.list.defaultView.${listKey}`);
        const defaultView = result.data.find((view) => view.id === defaultViewId);
        if (defaultView !== undefined && new URLSearchParams(window.location.search).size === 0) {
          onDefaultView(toUniversalSavedView(defaultView));
        }
      }
    });
    return () => {
      current = false;
    };
  }, [client, listKey, onDefaultView]);

  const create = async (
    name: string,
    shared: boolean,
    state: UniversalListState,
  ): Promise<UniversalListSavedView> => {
    const body: SavedViewCreate = {
      columns: state.columns,
      filters: savedViewFilters(state.filters),
      listKey,
      name,
      shared,
      sort: state.sort,
    };
    const result = await client.POST("/saved-views", { body });
    if (result.data === undefined) {
      throw new TypeError("Saved view response did not contain data");
    }
    setViews((current) => [...current, result.data]);
    return toUniversalSavedView(result.data);
  };

  const rename = async (
    view: UniversalListSavedView,
    name: string,
  ): Promise<UniversalListSavedView> => {
    const source = views.find((item) => item.id === view.id);
    if (source === undefined) {
      throw new TypeError("Saved view version is unavailable");
    }
    const body: SavedViewUpdate = {
      columns: view.columns,
      filters: savedViewFilters(view.filters),
      listKey,
      name,
      shared: view.shared,
      sort: view.sort,
      version: source.version,
    };
    const result = await client.PUT("/saved-views/{id}", {
      body,
      params: { path: { id: view.id } },
    });
    if (result.data === undefined) {
      throw new TypeError("Saved view response did not contain data");
    }
    setViews((current) => current.map((item) => (item.id === view.id ? result.data : item)));
    return toUniversalSavedView(result.data);
  };

  const remove = async (id: string): Promise<void> => {
    await client.DELETE("/saved-views/{id}", { params: { path: { id } } });
    setViews((current) => current.filter((view) => view.id !== id));
  };

  return { create, remove, rename, views: views.map(toUniversalSavedView) };
}

function useSyncedListState(kind: CensusKind, modules: readonly string[]) {
  const defaults =
    kind === "members"
      ? {
          columns: MEMBER_DEFAULT_COLUMNS.filter(
            (column) => column !== "plan" || modules.includes("BILLING"),
          ),
          filters: MEMBER_DEFAULT_FILTERS.filter(
            (filter) => filter.field !== "planId" || modules.includes("BILLING"),
          ),
          size: 50 as const,
          sort: ["memberNumber,asc"],
        }
      : {
          columns: DOG_DEFAULT_COLUMNS.filter(
            (column) => column !== "freeTraining" || modules.includes("FREE_TRAINING"),
          ),
          filters: DOG_DEFAULT_FILTERS,
          size: 50 as const,
          sort: [],
        };
  const [state, setState] = useState(() =>
    readUniversalListState(window.location.search, defaults),
  );
  const update = useCallback((next: UniversalListState) => {
    const parameters = universalListSearchParams(next);
    window.history.replaceState(null, "", `${window.location.pathname}?${parameters.toString()}`);
    setState(next);
  }, []);
  const applySavedView = useCallback((view: UniversalListSavedView) => {
    setState((current) => {
      const next = {
        ...current,
        columns: view.columns,
        filters: view.filters,
        page: 0,
        sort: view.sort,
      };
      const parameters = universalListSearchParams(next);
      window.history.replaceState(null, "", `${window.location.pathname}?${parameters.toString()}`);
      return next;
    });
  }, []);
  return [state, update, applySavedView] as const;
}

function useFilterValues(client: ApiClient, kind: CensusKind, state: UniversalListState) {
  return useCallback(
    async (field: string) => {
      const query = {
        field,
        filter: apiFilters(state.filters.filter((filter) => filter.field !== field)),
        ...(state.q === "" ? {} : { q: state.q }),
      };
      const result =
        kind === "members"
          ? await client.GET("/members/filter-values", { params: { query } })
          : await client.GET("/dogs/filter-values", { params: { query } });
      if (result.data === undefined) {
        throw new TypeError("Filter values response did not contain data");
      }
      return result.data.values.map((item) => ({
        ...item,
        value: filterValue(item.value),
      }));
    },
    [client, kind, state.filters, state.q],
  );
}

function useActiveCount(client: ApiClient, kind: CensusKind) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let current = true;
    const query = {
      fields: "id",
      filter: ["status:eq:ACTIVE"],
      page: 0,
      size: 20 as const,
      sort: [] as string[],
    };
    const request =
      kind === "members"
        ? client.GET("/members", { params: { query } })
        : client.GET("/dogs", { params: { query } });
    void request.then((result) => {
      if (current && result.data !== undefined) {
        setCount(result.data.totalItems);
      }
    });
    return () => {
      current = false;
    };
  }, [client, kind]);
  return count;
}

function CensusListPage({ client, kind }: { client: ApiClient; kind: CensusKind }) {
  const { i18n, t } = useTranslation(["census", "errors"]);
  const branding = useBranding();
  const modules = branding.modules;
  const [state, setState, applySavedView] = useSyncedListState(kind, modules);
  const { data, error, loading, retry } = useCensusData<DogListItem | MemberListItem>(
    client,
    kind,
    state,
  );
  const savedViews = useSavedViews(client, kind, applySavedView);
  const loadFilterValues = useFilterValues(client, kind, state);
  const activeCount = useActiveCount(client, kind);
  const locale = i18n.resolvedLanguage ?? branding.defaultLocale;

  const operatorLabels: Record<UniversalFilterOperator, string> = {
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

  const commonLabels = {
    addFilter: t("census:list.addFilter"),
    clearFilters: t("census:list.clearFilters"),
    closeError: t("census:list.closeError"),
    columns: t("census:list.columns"),
    createView: t("census:list.createView"),
    defaultView: t("census:list.defaultView"),
    deleteView: t("census:list.deleteView"),
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
    operators: operatorLabels,
    page: (page: number, totalPages: number) => t("census:list.page", { page, totalPages }),
    previousPage: t("census:list.previousPage"),
    removeFilter: (field: string) => t("census:list.removeFilter", { field }),
    renameView: t("census:list.renameView"),
    retry: t("census:list.retry"),
    rowsPerPage: t("census:list.rowsPerPage"),
    saveError: t("census:list.saveError"),
    saveViewName: t("census:list.saveViewName"),
    selectAll: t("census:list.selectAll"),
    selected: (count: number) => t("census:list.selected", { count }),
    sharedView: t("census:list.sharedView"),
    sortAscending: (column: string) => t("census:list.sortAscending", { column }),
    sortDescending: (column: string) => t("census:list.sortDescending", { column }),
    view: (name: string) => t("census:list.view", { name }),
    views: t("census:list.views"),
  };

  const memberStatus = useCallback(
    (item: MemberListItem) => {
      const label =
        item.displayStatus.kind === "ACTIVE"
          ? t("census:values.activeMember")
          : item.displayStatus.label;
      return <Badge tone={toneForStatus(item.displayStatus.kind)}>{label}</Badge>;
    },
    [t],
  );

  const dogStatus = useCallback(
    (item: DogListItem) => {
      const label =
        item.displayStatus.kind === "ACTIVE"
          ? t("census:values.activeDog")
          : item.displayStatus.label;
      return <Badge tone={toneForStatus(item.displayStatus.kind)}>{label}</Badge>;
    },
    [t],
  );

  const memberColumns = useMemo<UniversalListColumn<MemberListItem>[]>(
    () =>
      [
        {
          key: "fullName",
          label: t("census:members.columns.fullName"),
          render: (item) => item.fullName,
          sortKey: "lastName",
        },
        {
          key: "dogs",
          label: t("census:members.columns.dogs"),
          render: (item) => (
            <span className="census-dogs-cell">
              {item.dogs.map((dog) => (
                <span key={dog.id}>
                  {dog.name} {dog.level === undefined ? null : levelChip(dog.level.code)}
                </span>
              ))}
            </span>
          ),
        },
        ...(modules.includes("BILLING")
          ? [
              {
                key: "plan",
                label: t("census:members.columns.plan"),
                render: (item: MemberListItem) => item.plan?.name ?? t("census:values.empty"),
              },
            ]
          : []),
        {
          key: "displayStatus",
          label: t("census:members.columns.displayStatus"),
          render: memberStatus,
        },
        {
          key: "memberNumber",
          label: t("census:members.columns.memberNumber"),
          render: (item) => item.memberNumber,
          sortKey: "memberNumber",
        },
        {
          key: "contact",
          label: t("census:members.columns.contact"),
          render: (item) =>
            [
              ...(item.contact?.emails.map((entry) => entry.email) ?? []),
              ...(item.contact?.phones.map((entry) => `${entry.prefix}${entry.number}`) ?? []),
            ].join(" · "),
        },
        ...(modules.includes("BILLING")
          ? [
              {
                key: "paymentMethod",
                label: t("census:members.columns.paymentMethod"),
                render: (item: MemberListItem) =>
                  item.paymentMethod?.maskedAccount ??
                  item.paymentMethod?.channel ??
                  item.paymentMethod?.type ??
                  t("census:values.empty"),
              },
              {
                key: "nextInvoiceDate",
                label: t("census:members.columns.nextInvoiceDate"),
                render: (item: MemberListItem) =>
                  item.nextInvoiceDate === undefined
                    ? t("census:values.empty")
                    : formatDate(item.nextInvoiceDate, locale),
                sortKey: "nextInvoiceDate",
              },
            ]
          : []),
        ...(modules.includes("FAMILY_GROUP")
          ? [
              {
                key: "familyGroup",
                label: t("census:members.columns.familyGroup"),
                render: (item: MemberListItem) =>
                  item.familyGroup?.name ?? t("census:values.empty"),
              },
            ]
          : []),
        {
          key: "joinedAt",
          label: t("census:members.columns.joinedAt"),
          render: (item) =>
            item.joinedAt === undefined
              ? t("census:values.empty")
              : new Date(item.joinedAt).getUTCFullYear(),
          sortKey: "joinedAt",
        },
        {
          key: "leaveDate",
          label: t("census:members.columns.leaveDate"),
          render: (item) =>
            item.leaveDate === undefined
              ? t("census:values.empty")
              : formatDate(item.leaveDate, locale),
          sortKey: "leaveDate",
        },
        {
          key: "bookingBlocked",
          label: t("census:members.columns.bookingBlocked"),
          render: (item) => (item.bookingBlocked ? t("census:values.yes") : t("census:values.no")),
        },
        {
          key: "imageRights",
          label: t("census:members.columns.imageRights"),
          render: (item) =>
            item.imageRights?.granted === true ? t("census:values.yes") : t("census:values.no"),
        },
        {
          key: "roles",
          label: t("census:members.columns.roles"),
          render: (item) =>
            (item.roles ?? [])
              .map((role) =>
                role === "INSTRUCTOR"
                  ? t("census:values.instructor")
                  : role === "ADMIN"
                    ? t("census:values.admin")
                    : t("census:values.member"),
              )
              .join(", "),
        },
        {
          key: "city",
          label: t("census:members.columns.city"),
          render: (item) => item.city,
          sortKey: "city",
        },
        {
          key: "postalCode",
          label: t("census:members.columns.postalCode"),
          render: (item) => item.postalCode,
        },
        {
          key: "pendingDocuments",
          label: t("census:members.columns.pendingDocuments"),
          render: (item) => item.pendingDocuments?.join(" · ") ?? t("census:values.empty"),
        },
        ...(modules.includes("FREE_TRAINING")
          ? [
              {
                key: "freeTraining",
                label: t("census:members.columns.freeTraining"),
                render: (item: MemberListItem) =>
                  item.freeTraining === true ? t("census:values.yes") : t("census:values.no"),
              },
            ]
          : []),
        {
          key: "birthDate",
          label: t("census:members.columns.birthDate"),
          render: (item) =>
            item.birthDate === undefined
              ? t("census:values.empty")
              : formatDate(item.birthDate, locale),
        },
        {
          key: "gender",
          label: t("census:members.columns.gender"),
          render: (item) =>
            item.gender === "FEMALE"
              ? t("census:values.female")
              : item.gender === "MALE"
                ? t("census:values.male")
                : t("census:values.unspecified"),
        },
        {
          key: "idDocument",
          label: t("census:members.columns.idDocument"),
          render: (item) => item.idDocument,
        },
      ] satisfies UniversalListColumn<MemberListItem>[],
    [locale, memberStatus, modules, t],
  );

  const dogColumns = useMemo<UniversalListColumn<DogListItem>[]>(
    () =>
      [
        {
          key: "name",
          label: t("census:dogs.columns.name"),
          render: (item) => item.name,
          sortKey: "name",
        },
        {
          key: "breed",
          label: t("census:dogs.columns.breed"),
          render: (item) => item.breed,
          sortKey: "breed",
        },
        {
          key: "level",
          label: t("census:dogs.columns.level"),
          render: (item) =>
            item.level === undefined ? t("census:values.empty") : levelChip(item.level.code),
          sortKey: "levelOrder",
        },
        {
          key: "owner",
          label: t("census:dogs.columns.owner"),
          render: (item) => item.owner.fullName,
          sortKey: "ownerLastName",
        },
        {
          key: "handler",
          label: t("census:dogs.columns.handler"),
          render: (item) => item.handlerName ?? t("census:values.empty"),
        },
        ...(modules.includes("FREE_TRAINING")
          ? [
              {
                key: "freeTraining",
                label: t("census:dogs.columns.freeTraining"),
                render: (item: DogListItem) =>
                  item.freeTraining?.allowed === true ? (
                    <Badge tone="success">{t("census:values.freeTraining")}</Badge>
                  ) : (
                    t("census:values.empty")
                  ),
              },
            ]
          : []),
        {
          key: "licenses",
          label: t("census:dogs.columns.licenses"),
          render: (item) =>
            item.licenses.length === 0
              ? t("census:values.empty")
              : item.licenses
                  .map(
                    (license) =>
                      `${license.organisation} ${license.number}${license.grade === undefined ? "" : ` (${license.grade})`}`,
                  )
                  .join(" · "),
        },
        {
          key: "displayStatus",
          label: t("census:dogs.columns.displayStatus"),
          render: dogStatus,
        },
        {
          key: "sex",
          label: t("census:dogs.columns.sex"),
          render: (item) =>
            item.sex === "FEMALE" ? t("census:values.female") : t("census:values.male"),
        },
        {
          key: "age",
          label: t("census:dogs.columns.age"),
          render: (item) => t("census:values.years", { count: item.age }),
        },
        {
          key: "chip",
          label: t("census:dogs.columns.chip"),
          render: (item) => item.chip,
        },
        {
          key: "pendingDocuments",
          label: t("census:dogs.columns.pendingDocuments"),
          render: (item) => item.pendingDocuments.join(" · "),
        },
        {
          key: "levelAssignedAt",
          label: t("census:dogs.columns.levelAssignedAt"),
          render: (item) =>
            item.levelAssignedAt === undefined
              ? t("census:values.empty")
              : formatDate(item.levelAssignedAt, locale),
          sortKey: "levelAssignedAt",
        },
        ...(modules.includes("PACKS")
          ? [
              {
                key: "pack",
                label: t("census:dogs.columns.pack"),
                render: (item: DogListItem) =>
                  item.pack === undefined
                    ? t("census:values.empty")
                    : `${String(item.pack.remaining)}/${String(item.pack.total)}`,
              },
            ]
          : []),
        {
          key: "registeredAt",
          label: t("census:dogs.columns.registeredAt"),
          render: (item) => formatDate(item.registeredAt, locale),
          sortKey: "registeredAt",
        },
      ] satisfies UniversalListColumn<DogListItem>[],
    [dogStatus, locale, modules, t],
  );

  const memberFilterColumns: UniversalListFilterColumn[] = [
    { key: "memberNumber", label: t("census:members.columns.memberNumber"), type: "number" },
    { key: "lastName", label: t("census:members.filters.lastName"), type: "text" },
    { key: "fullName", label: t("census:members.filters.fullName"), type: "text" },
    { key: "status", label: t("census:members.filters.status"), type: "enum" },
    { key: "displayStatus", label: t("census:members.filters.displayStatus"), type: "enum" },
    ...(modules.includes("BILLING")
      ? [
          {
            key: "planId",
            label: t("census:members.filters.planId"),
            type: "relation" as const,
          },
          {
            key: "priceId",
            label: t("census:members.filters.priceId"),
            type: "relation" as const,
          },
          {
            key: "paymentMethodType",
            label: t("census:members.filters.paymentMethodType"),
            type: "enum" as const,
          },
          {
            key: "nextInvoiceDate",
            label: t("census:members.columns.nextInvoiceDate"),
            type: "date" as const,
          },
        ]
      : []),
    { key: "joinedAt", label: t("census:members.columns.joinedAt"), type: "date" },
    { key: "leaveDate", label: t("census:members.columns.leaveDate"), type: "date" },
    { key: "bookingBlocked", label: t("census:members.filters.bookingBlocked"), type: "boolean" },
    ...(modules.includes("FAMILY_GROUP")
      ? [
          {
            key: "familyGroupId",
            label: t("census:members.filters.familyGroupId"),
            type: "relation" as const,
          },
        ]
      : []),
    {
      key: "imageRightsGranted",
      label: t("census:members.filters.imageRightsGranted"),
      type: "boolean",
    },
    { key: "roles", label: t("census:members.columns.roles"), type: "enum" },
    { key: "city", label: t("census:members.columns.city"), type: "relation" },
    { key: "postalCode", label: t("census:members.columns.postalCode"), type: "text" },
    { key: "dogLevelId", label: t("census:members.filters.dogLevelId"), type: "relation" },
    { key: "dogName", label: t("census:members.filters.dogName"), type: "text" },
    {
      key: "hasPendingDocuments",
      label: t("census:members.filters.hasPendingDocuments"),
      type: "boolean",
    },
    ...(modules.includes("FREE_TRAINING")
      ? [
          {
            key: "freeTrainingAllowed",
            label: t("census:members.filters.freeTrainingAllowed"),
            type: "boolean" as const,
          },
        ]
      : []),
    { key: "gender", label: t("census:members.columns.gender"), type: "enum" },
    { key: "birthDate", label: t("census:members.columns.birthDate"), type: "date" },
  ];
  const dogFilterColumns: UniversalListFilterColumn[] = [
    { key: "name", label: t("census:dogs.columns.name"), type: "text" },
    { key: "breed", label: t("census:dogs.columns.breed"), type: "text" },
    { key: "levelId", label: t("census:dogs.columns.level"), type: "relation" },
    { key: "memberId", label: t("census:dogs.filters.memberId"), type: "relation" },
    { key: "ownerName", label: t("census:dogs.filters.ownerName"), type: "text" },
    { key: "handlerName", label: t("census:dogs.filters.handlerName"), type: "text" },
    { key: "status", label: t("census:dogs.filters.status"), type: "enum" },
    ...(modules.includes("FREE_TRAINING")
      ? [
          {
            key: "freeTrainingAllowed",
            label: t("census:dogs.filters.freeTrainingAllowed"),
            type: "boolean" as const,
          },
        ]
      : []),
    { key: "hasLicense", label: t("census:dogs.filters.hasLicense"), type: "boolean" },
    {
      key: "licenseOrganisation",
      label: t("census:dogs.filters.licenseOrganisation"),
      type: "relation",
    },
    {
      key: "hasPendingDocuments",
      label: t("census:dogs.filters.hasPendingDocuments"),
      type: "boolean",
    },
    { key: "sex", label: t("census:dogs.columns.sex"), type: "enum" },
    { key: "birthDate", label: t("census:members.columns.birthDate"), type: "date" },
    { key: "chip", label: t("census:dogs.columns.chip"), type: "text" },
    { key: "registeredAt", label: t("census:dogs.columns.registeredAt"), type: "date" },
    { key: "levelAssignedAt", label: t("census:dogs.columns.levelAssignedAt"), type: "date" },
  ];

  const memberLabels: UniversalListLabels<MemberListItem> = {
    ...commonLabels,
    emptyDescription: t("census:members.emptyDescription"),
    emptyTitle: t("census:members.emptyTitle"),
    search: t("census:members.search"),
    selectRow: (item) => t("census:members.selectRow", { name: item.fullName }),
  };
  const dogLabels: UniversalListLabels<DogListItem> = {
    ...commonLabels,
    emptyDescription: t("census:dogs.emptyDescription"),
    emptyTitle: t("census:dogs.emptyTitle"),
    search: t("census:dogs.search"),
    selectRow: (item) => t("census:dogs.selectRow", { name: item.name }),
  };

  const errorMessage =
    error === undefined
      ? undefined
      : isApiError(error, "INVALID_FILTER")
        ? t("errors:INVALID_FILTER")
        : t("census:list.genericError");
  const applied = (data?.appliedFilters ?? []).map((filter) => {
    const definitions = kind === "members" ? memberFilterColumns : dogFilterColumns;
    const value = filterValue(filter.value);
    const memberItems = (data?.items ?? []) as MemberListItem[];
    const dogItems = (data?.items ?? []) as DogListItem[];
    const valueLabel =
      kind === "members" && filter.field === "planId"
        ? (memberItems.find((item) => item.plan?.id === value)?.plan?.name ?? value)
        : kind === "dogs" && filter.field === "levelId"
          ? (dogItems.find((item) => item.level?.id === value)?.level?.name ?? value)
          : kind === "dogs" && filter.field === "memberId"
            ? (dogItems.find((item) => item.owner.id === value)?.owner.fullName ?? value)
            : value === "true"
              ? t("census:values.yes")
              : value === "false"
                ? t("census:values.no")
                : value;
    return {
      field: filter.field,
      fieldLabel:
        definitions.find((definition) => definition.key === filter.field)?.label ?? filter.field,
      operator: filter.op,
      value,
      valueLabel,
    };
  });

  return (
    <div className="census-page">
      <header className="census-page__header">
        <h1>
          {kind === "members" ? t("census:members.title") : t("census:dogs.title")}
          <Badge>
            {kind === "members"
              ? t("census:members.activeCount", { count: activeCount })
              : t("census:dogs.activeCount", { count: activeCount })}
          </Badge>
        </h1>
        {kind === "members" ? (
          <a className="census-page__new" href="/preinscripcions/nova">
            <Icon aria-hidden="true" name="plus" />
            {t("census:members.new")}
          </a>
        ) : null}
      </header>

      {kind === "members" ? (
        <UniversalList<MemberListItem>
          appliedFilters={applied}
          bulkActions={(ids) => (
            <>
              <Button variant="ghost">
                <Icon aria-hidden="true" name="send" />
                {t("census:members.bulk.sendAnnouncement")}
              </Button>
              <a
                className="ah-button ah-button--ghost"
                download
                href={`${exportHref("members", "xlsx", state)}&filter=id%3Ain%3A${ids.join("%2C")}`}
              >
                <span className="ah-button__content">
                  <Icon aria-hidden="true" name="export" />
                  {t("census:members.bulk.exportSelection")}
                </span>
              </a>
              <Button variant="ghost">
                <Icon aria-hidden="true" name="up" />
                {t("census:members.bulk.changeLevel")}
              </Button>
            </>
          )}
          caption={t("census:members.caption")}
          columns={memberColumns}
          {...(errorMessage === undefined ? {} : { error: errorMessage })}
          filterColumns={memberFilterColumns}
          getExportHref={(format, current) => exportHref("members", format, current)}
          labels={memberLabels}
          listKey="members"
          loadFilterValues={loadFilterValues}
          loading={loading}
          onCreateView={savedViews.create}
          onDeleteView={savedViews.remove}
          onRenameView={savedViews.rename}
          onRetry={retry}
          onStateChange={setState}
          rowHref={(item) => `/abonats/${item.id}`}
          rowKey={(item) => item.id}
          rows={(data?.items ?? []) as MemberListItem[]}
          savedViews={savedViews.views}
          selectable
          state={state}
          statusFilter={{
            field: "status",
            label: t("census:members.statusLabel"),
            options: [
              { label: t("census:members.statuses.active"), value: "ACTIVE" },
              { label: t("census:members.statuses.left"), value: "LEFT" },
              { label: t("census:members.statuses.all"), value: "" },
            ],
          }}
          totalPages={data?.totalPages ?? 0}
        />
      ) : (
        <UniversalList<DogListItem>
          appliedFilters={applied}
          caption={t("census:dogs.caption")}
          columns={dogColumns}
          {...(errorMessage === undefined ? {} : { error: errorMessage })}
          filterColumns={dogFilterColumns}
          getExportHref={(format, current) => exportHref("dogs", format, current)}
          labels={dogLabels}
          listKey="dogs"
          loadFilterValues={loadFilterValues}
          loading={loading}
          onCreateView={savedViews.create}
          onDeleteView={savedViews.remove}
          onRenameView={savedViews.rename}
          onRetry={retry}
          onStateChange={setState}
          rowHref={(item) => `/gossos/${item.id}`}
          rowKey={(item) => item.id}
          rows={(data?.items ?? []) as DogListItem[]}
          savedViews={savedViews.views}
          state={state}
          statusFilter={{
            field: "status",
            label: t("census:dogs.statusLabel"),
            options: [
              { label: t("census:dogs.statuses.active"), value: "ACTIVE" },
              { label: t("census:dogs.statuses.inactive"), value: "INACTIVE" },
              { label: t("census:dogs.statuses.all"), value: "" },
            ],
          }}
          totalPages={data?.totalPages ?? 0}
        />
      )}
    </div>
  );
}

export function MembersPage({ client }: { client: ApiClient }) {
  return <CensusListPage client={client} kind="members" />;
}

export function DogsPage({ client }: { client: ApiClient }) {
  return <CensusListPage client={client} kind="dogs" />;
}
