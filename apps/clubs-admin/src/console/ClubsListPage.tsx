import { type ApiClient, isApiError, listFields } from "@agilityhub/api-client";
import {
  Button,
  Icon,
  UniversalList,
  type UniversalFilterOperator,
  type UniversalFilterValue,
  type UniversalListColumn,
  type UniversalListFilterColumn,
  type UniversalListLabels,
} from "@agilityhub/ui";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
  apiFilters,
  universalListLabels,
  useListData,
  useUrlListState,
} from "../lists/list-helpers";
import { filterValue } from "../messaging/NotificationLogPage";

import {
  ChecklistSummary,
  CLUB_STATUSES,
  CONSOLE_MODULES,
  COUNTRY_PROFILES,
  type ConsoleNavigate,
  formatBytes,
  formatClubDateTime,
  formatCount,
  ModuleChips,
  type PlatformClubListItem,
  StatusBadge,
} from "./shared";

const LIST_KEY = "platform-clubs";

/**
 * The list's columns and the `fields` each one reads (`x-fields` of `GET /platform/clubs`): S17 §2
 * names «abonats actius», «SMS del mes» and «emmagatzematge», the three counters of `usage`.
 */
const COLUMN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  checklist: ["onboardingChecklist"],
  countryTimeZone: ["countryProfile", "timeZone"],
  lastAdminAccessAt: ["lastAdminAccessAt", "timeZone"],
  membersActive: ["usage"],
  modules: ["modules"],
  name: ["name", "template"],
  slug: ["slug"],
  smsSentMonth: ["usage"],
  status: ["status"],
  storageBytes: ["usage"],
  template: ["template"],
};

const DEFAULT_COLUMNS = [
  "name",
  "slug",
  "status",
  "countryTimeZone",
  "membersActive",
  "modules",
  "lastAdminAccessAt",
  "smsSentMonth",
  "storageBytes",
  "checklist",
];

/** `x-filter-operators` publishes none: one value per filter, kept or excluded. */
const SINGLE_VALUE: readonly UniversalFilterOperator[] = ["eq", "ne"];

/** S17 §2 row «D19 Llista» (WP-17-C): the platform's clubs as a universal list. */
export function ClubsListPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: ConsoleNavigate;
}) {
  const { i18n, t } = useTranslation(["console", "census", "errors"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [state, setState] = useUrlListState({
    columns: DEFAULT_COLUMNS,
    size: 50,
    sort: ["name,asc"],
  });
  const { data, error, loading, retry } = useListData<PlatformClubListItem>(async () => {
    const result = await client.GET("/platform/clubs", {
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
    if (result.data === undefined) throw new TypeError("Platform club list without data");
    return result.data;
  }, JSON.stringify(state));

  const filterColumns: UniversalListFilterColumn[] = [
    {
      key: "status",
      label: t("console:list.columns.status"),
      operators: SINGLE_VALUE,
      type: "enum",
    },
    {
      key: "countryProfile",
      label: t("console:list.columns.countryProfile"),
      operators: SINGLE_VALUE,
      type: "enum",
    },
    {
      key: "module",
      label: t("console:list.columns.module"),
      operators: SINGLE_VALUE,
      type: "enum",
    },
    {
      key: "template",
      label: t("console:list.columns.template"),
      operators: ["eq"],
      type: "boolean",
    },
  ];

  const valueLabel = useCallback(
    (field: string, value: string) => {
      if (field === "status") return t(`console:status.${value}`, { defaultValue: value });
      if (field === "countryProfile") {
        return t(`console:countryProfile.${value}`, { defaultValue: value });
      }
      if (field === "module") return t(`console:modules.${value}.label`, { defaultValue: value });
      if (field === "template")
        return value === "true" ? t("console:common.yes") : t("console:common.no");
      return value;
    },
    [t],
  );

  // The contract has no `filter-values` for this list: the values are its enums (no counts).
  const loadFilterValues = useCallback(
    (field: string): Promise<UniversalFilterValue[]> => {
      const values: readonly string[] =
        field === "status"
          ? CLUB_STATUSES
          : field === "countryProfile"
            ? COUNTRY_PROFILES
            : field === "module"
              ? CONSOLE_MODULES
              : field === "template"
                ? ["true", "false"]
                : [];
      return Promise.resolve(values.map((value) => ({ label: valueLabel(field, value), value })));
    },
    [valueLabel],
  );

  // The chips come from the api's `appliedFilters` (CONVENCIONS_API §4), never from the request.
  const applied = (data?.appliedFilters ?? []).map((filter) => {
    const value = filterValue(filter.value);
    return {
      field: filter.field,
      fieldLabel:
        filterColumns.find((column) => column.key === filter.field)?.label ?? filter.field,
      operator: filter.op,
      value,
      valueLabel: valueLabel(filter.field, value),
    };
  });

  const empty = t("console:list.none");
  const columns: UniversalListColumn<PlatformClubListItem>[] = [
    {
      key: "name",
      label: t("console:list.columns.name"),
      render: (row) => (
        <span className="console-club-name">
          <strong>{row.name ?? empty}</strong>
          {row.template === true ? <small>{t("console:list.templateClub")}</small> : null}
        </span>
      ),
      sortKey: "name",
    },
    {
      key: "slug",
      label: t("console:list.columns.slug"),
      render: (row) => row.slug ?? empty,
      sortKey: "slug",
    },
    {
      key: "status",
      label: t("console:list.columns.status"),
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "countryTimeZone",
      label: t("console:list.columns.countryTimeZone"),
      render: (row) =>
        t("console:list.countryTimeZone", {
          country: row.countryProfile ?? empty,
          timeZone: row.timeZone ?? empty,
        }),
    },
    {
      key: "membersActive",
      label: t("console:list.columns.membersActive"),
      render: (row) => formatCount(row.usage?.membersActive, locale),
    },
    {
      key: "modules",
      label: t("console:list.columns.modules"),
      render: (row) => <ModuleChips modules={row.modules} />,
    },
    {
      key: "lastAdminAccessAt",
      label: t("console:list.columns.lastAdminAccessAt"),
      // The club's own zone, never the reader's device (S02 §3).
      render: (row) =>
        formatClubDateTime(row.lastAdminAccessAt, row.timeZone, locale) ?? t("console:list.never"),
    },
    {
      key: "smsSentMonth",
      label: t("console:list.columns.smsSentMonth"),
      render: (row) => formatCount(row.usage?.smsSentMonth, locale),
    },
    {
      key: "storageBytes",
      label: t("console:list.columns.storageBytes"),
      render: (row) => formatBytes(row.usage?.storageBytes, locale),
    },
    {
      key: "checklist",
      label: t("console:list.columns.checklist"),
      render: (row) => <ChecklistSummary checklist={row.onboardingChecklist} />,
    },
    {
      key: "template",
      label: t("console:list.columns.template"),
      render: (row) => (row.template === true ? t("console:common.yes") : t("console:common.no")),
    },
  ];

  const labels: UniversalListLabels<PlatformClubListItem> = {
    ...universalListLabels(t, t("console:list.emptyDescription")),
    emptyTitle: t("console:list.emptyTitle"),
    search: t("console:list.search"),
    selectRow: (row) => t("console:list.openRecord", { name: row.name ?? row.id }),
  };

  return (
    <div className="console-page">
      <header className="console-page__header">
        <div>
          <h1>{t("console:list.title")}</h1>
          <p className="console-muted">{t("console:list.description")}</p>
        </div>
        <Button
          onClick={() => {
            onNavigate("/consola/clubs/nou");
          }}
        >
          <Icon aria-hidden="true" name="plus" />
          {t("console:list.newClub")}
        </Button>
      </header>
      <UniversalList<PlatformClubListItem>
        appliedFilters={applied}
        caption={t("console:list.caption")}
        columns={columns}
        {...(error === undefined
          ? {}
          : {
              error: isApiError(error)
                ? t(`errors:${error.code}`, { defaultValue: t("console:list.error") })
                : t("console:list.error"),
            })}
        // `x-exportable: false`: no «Excel · PDF» menu.
        exportable={false}
        filterColumns={filterColumns}
        labels={labels}
        listKey={LIST_KEY}
        loadFilterValues={loadFilterValues}
        loading={loading}
        onExport={() => undefined}
        onRetry={retry}
        onRowActivate={(row) => {
          onNavigate(`/consola/clubs/${encodeURIComponent(row.id)}/identitat`);
        }}
        onStateChange={setState}
        rowHref={(row) => `/consola/clubs/${encodeURIComponent(row.id)}/identitat`}
        rowKey={(row) => row.id}
        rows={data?.items ?? []}
        state={state}
        statusFilter={{
          field: "status",
          label: t("console:list.columns.status"),
          options: [
            { label: t("console:list.allStatuses"), value: "" },
            ...CLUB_STATUSES.map((status) => ({
              label: t(`console:status.${status}`),
              value: status,
            })),
          ],
        }}
        totalPages={data?.totalPages ?? 0}
      />
    </div>
  );
}
