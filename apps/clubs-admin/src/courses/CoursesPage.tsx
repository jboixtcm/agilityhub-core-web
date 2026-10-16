import {
  type ApiClient,
  isApiError,
  listFields,
  putSignedFile,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import type { CourseData } from "@agilityhub/course-core";
import { UploadCourse, type UploadCourseLabels } from "@agilityhub/course-ui";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Button,
  FormField,
  Icon,
  Input,
  Modal,
  Select,
  UniversalList,
  useBranding,
  type UniversalFilter,
  type UniversalFilterOperator,
  type UniversalFilterValue,
  type UniversalListColumn,
  type UniversalListFilterColumn,
  type UniversalListLabels,
} from "@agilityhub/ui";
import {
  type KeyboardEvent,
  type SyntheticEvent,
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import {
  apiFilters,
  universalListLabels,
  useListData,
  useUrlListState,
} from "../lists/list-helpers";

import {
  AGILITYHUB_LEVELS,
  type CourseListItem,
  COURSE_SOURCES,
  courseThumbnail,
  DISCIPLINES,
  type Discipline,
  useCourseError,
  useCourseLabels,
  useCourseStore,
  useMetres,
} from "./shared";

const LIST_KEY = "courses";

/** The columns and the `fields` each one reads (`x-fields` of `GET /courses`). */
const COLUMN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  activeOnRings: ["activeOnRings"],
  designerName: ["designerName"],
  discipline: ["discipline"],
  level: ["level"],
  name: ["name", "thumbnailUrl", "ownerType"],
  source: ["source"],
  stats: ["stats"],
};

const DEFAULT_COLUMNS = [
  "name",
  "discipline",
  "level",
  "designerName",
  "source",
  "activeOnRings",
  "stats",
];

/** D18's chips (S16 §2): the club's, the AgilityHub library (`PUBLIC`), mine (`ACCOUNT`). */
const OWNERS = ["CLUB", "AGILITYHUB", "MINE"] as const;
type Owner = (typeof OWNERS)[number];

const ENUM: readonly UniversalFilterOperator[] = ["eq", "ne", "in", "nin"];

type NewCourseKind = "image" | "smarter";

/** «Nou recorregut»: the ways in (S16 §2). The editor («Dibuixa'l») has no screen yet. */
function NewCourseMenu({
  onChoose,
  onLibrary,
}: {
  onChoose: (kind: NewCourseKind) => void;
  onLibrary: () => void;
}) {
  const { t } = useTranslation("admin-courses");
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const close = () => {
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") close();
  };
  return (
    <div className="courses-menu">
      <Button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={onKeyDown}
      >
        <Icon aria-hidden="true" name="plus" />
        {t("admin-courses:list.new")}
      </Button>
      {open ? (
        <div
          className="courses-menu__list"
          id={menuId}
          onKeyDown={onKeyDown}
          role="menu"
          tabIndex={-1}
        >
          <button
            onClick={() => {
              close();
              onChoose("smarter");
            }}
            role="menuitem"
            type="button"
          >
            {t("admin-courses:list.newSmarter")}
          </button>
          <button
            onClick={() => {
              close();
              onChoose("image");
            }}
            role="menuitem"
            type="button"
          >
            {t("admin-courses:list.newImage")}
          </button>
          <button
            onClick={() => {
              close();
              onLibrary();
            }}
            role="menuitem"
            type="button"
          >
            {t("admin-courses:list.newCopy")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * R-16-02 «Importa un fitxer Smarter (.txt)»: course-ui's upload (parse in the browser, preview,
 * signed upload, `POST /courses` under one key), then the list's thumbnail (S16 §3: generated on
 * the client, best effort) and the new course's page.
 */
function ImportCourseModal({
  client,
  onClose,
  onImported,
}: {
  client: ApiClient;
  onClose: () => void;
  onImported: (courseId: string) => void;
}) {
  const { t } = useTranslation("admin-courses");
  useCourseStore(client);
  const errorText = useCourseError();
  const metres = useMetres();
  const labels: UploadCourseLabels = {
    continue: t("admin-courses:import.save"),
    dimensions: (length, width) =>
      t("admin-courses:import.dimensions", { length: metres(length), width: metres(width) }),
    error: errorText,
    file: t("admin-courses:import.file"),
    ignoredLogos: (count) => t("admin-courses:import.ignoredLogos", { count }),
    noGoZones: (count) => t("admin-courses:import.noGoZones", { count }),
    numbers: (count) => t("admin-courses:import.numbers", { count }),
    obstacles: (count) => t("admin-courses:import.obstacles", { count }),
    parseError: t("admin-courses:import.parseError"),
    parsing: (filename) => t("admin-courses:import.parsing", { filename }),
    savedContinue: t("admin-courses:import.saved"),
    title: t("admin-courses:import.heading"),
    units: (value) => t("admin-courses:import.units", { value }),
    uploading: t("admin-courses:import.saving"),
  };
  const finish = async (course: CourseData, courseId: string) => {
    await attachThumbnail(client, course, courseId);
    onImported(courseId);
  };
  return (
    <Modal
      closeLabel={t("admin-courses:common.close")}
      onClose={onClose}
      open
      title={t("admin-courses:import.title")}
    >
      <div className="courses-import">
        <UploadCourse
          labels={labels}
          onUploaded={(course, courseId) => {
            void finish(course, courseId);
          }}
        />
      </div>
    </Modal>
  );
}

/**
 * The list's thumbnail of a new course: PNG → `POST /courses/upload-urls {THUMBNAIL}` → signed
 * `PUT` → `PATCH /courses/{id} {thumbnailFileKey, version}`. Best effort: the course is saved
 * whatever happens here, and the list shows its placeholder without one.
 */
export async function attachThumbnail(
  client: ApiClient,
  model: CourseData,
  courseId: string,
): Promise<void> {
  try {
    const image = await courseThumbnail(model);
    if (image === null) return;
    const grant = await client.POST("/courses/upload-urls", {
      body: { contentType: "image/png", purpose: "THUMBNAIL", size: image.size },
    });
    if (grant.data === undefined) return;
    await putSignedFile(
      { headers: { "Content-Type": "image/png" }, uploadUrl: grant.data.uploadUrl },
      image,
    );
    const current = await client.GET("/courses/{id}", { params: { path: { id: courseId } } });
    if (current.data === undefined) return;
    await client.PATCH("/courses/{id}", {
      body: { thumbnailFileKey: grant.data.fileKey, version: current.data.version },
      params: { path: { id: courseId } },
    });
  } catch {
    // A missing thumbnail only shows the list's placeholder.
  }
}

/**
 * «Puja un plànol o foto» (S16 §2): a course of source `IMAGE` — its name, discipline and the
 * picture (signed upload of purpose `COURSE_IMAGE`) under one `Idempotency-Key` per payload.
 */
function ImageCourseModal({
  client,
  onClose,
  onCreated,
}: {
  client: ApiClient;
  onClose: () => void;
  onCreated: (courseId: string) => void;
}) {
  const { t } = useTranslation(["admin-courses", "errors"]);
  const branding = useBranding();
  const labels = useCourseLabels();
  const errorText = useCourseError();
  const keys = useSubmissionKeys();
  const [name, setName] = useState("");
  const [discipline, setDiscipline] = useState<Discipline>("OTHER");
  const [file, setFile] = useState<File>();
  /** The stored picture of this file: a retry never uploads it again (CONVENCIONS_API §7). */
  const [uploaded, setUploaded] = useState<{ file: File; fileKey: string }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field?: "file" | "name"; message: string }>();

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim() === "") {
      setError({ field: "name", message: t("admin-courses:image.nameRequired") });
      return;
    }
    if (file === undefined) {
      setError({ field: "file", message: t("admin-courses:image.fileRequired") });
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      let fileKey = uploaded?.file === file ? uploaded.fileKey : undefined;
      if (fileKey === undefined) {
        const grant = await client.POST("/courses/upload-urls", {
          body: { contentType: file.type, purpose: "COURSE_IMAGE", size: file.size },
        });
        if (grant.data === undefined) throw new TypeError("Upload grant without data");
        await putSignedFile(
          { headers: { "Content-Type": file.type }, uploadUrl: grant.data.uploadUrl },
          file,
        );
        fileKey = grant.data.fileKey;
        setUploaded({ file, fileKey });
      }
      const body = {
        discipline,
        imageFileKey: fileKey,
        levelIds: [],
        name: { [branding.defaultLocale]: name.trim() },
        source: "IMAGE" as const,
        tags: [],
        visibility: "CLUB" as const,
      };
      const created = await keys.send(JSON.stringify(body), (key) =>
        client.POST("/courses", { body, headers: { "Idempotency-Key": key } }),
      );
      if (created.data === undefined) throw new TypeError("Created course without data");
      onCreated(created.data.id);
    } catch (cause) {
      const code = isApiError(cause) ? cause.code : undefined;
      setError({
        ...(code === "FILE_TOO_LARGE" || code === "FILE_TYPE_NOT_ALLOWED" ? { field: "file" } : {}),
        message: errorText(cause),
      });
      setPending(false);
    }
  };

  return (
    <Modal
      closeLabel={t("admin-courses:common.close")}
      onClose={onClose}
      open
      title={t("admin-courses:image.title")}
    >
      <form className="courses-form" noValidate onSubmit={(event) => void submit(event)}>
        <FormField
          {...(error?.field === "name" ? { error: error.message } : {})}
          id="course-image-name"
          label={t("admin-courses:fields.name")}
        >
          <Input
            id="course-image-name"
            maxLength={120}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            required
            value={name}
          />
        </FormField>
        <FormField id="course-image-discipline" label={t("admin-courses:fields.discipline")}>
          <Select
            id="course-image-discipline"
            onChange={(event) => {
              setDiscipline(event.currentTarget.value as Discipline);
            }}
            value={discipline}
          >
            {DISCIPLINES.map((value) => (
              <option key={value} value={value}>
                {labels.discipline(value)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          {...(error?.field === "file" ? { error: error.message } : {})}
          help={t("admin-courses:image.fileHelp")}
          id="course-image-file"
          label={t("admin-courses:image.file")}
        >
          <Input
            accept="image/*"
            id="course-image-file"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0]);
            }}
            type="file"
          />
        </FormField>
        {error === undefined || error.field !== undefined ? null : (
          <p className="ah-form-field__error" role="alert">
            {error.message}
          </p>
        )}
        <div className="courses-form__actions">
          <Button onClick={onClose} variant="ghost">
            {t("admin-courses:common.cancel")}
          </Button>
          <Button loading={pending} loadingLabel={t("admin-courses:common.saving")} type="submit">
            {t("admin-courses:image.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** An applied filter's value as the list shows it (a list of values joined by commas). */
function filterValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(filterValue).filter((item) => item !== "").join(",");
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

function ownerOf(filters: readonly UniversalFilter[]): Owner | undefined {
  const value = filters.find(
    (filter) => filter.field === "owner" && filter.operator === "eq",
  )?.value;
  return (OWNERS as readonly string[]).includes(value ?? "") ? (value as Owner) : undefined;
}

/**
 * D18 «Biblioteca de recorreguts» (`/recorreguts`, S16 §2, no mockup): the universal list of the
 * club's courses, the AgilityHub library and the reader's own, with a thumbnail, and the ways in.
 */
export function CoursesPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["admin-courses", "census", "enums", "errors"]);
  const labels = useCourseLabels();
  const { locale } = useClubFormats();
  // The path length is course-core's, to 0.1 m (stats.pathLengthM).
  const pathLength = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    [locale],
  );
  const [state, setState] = useUrlListState({
    columns: DEFAULT_COLUMNS,
    size: 50,
    sort: ["updatedAt,desc"],
  });
  const [creating, setCreating] = useState<NewCourseKind>();
  const { data, error, loading, retry } = useListData<CourseListItem>(async () => {
    const result = await client.GET("/courses", {
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
    if (result.data === undefined) throw new TypeError("Course list without data");
    return result.data;
  }, JSON.stringify(state));

  const owner = ownerOf(state.filters);
  const chooseOwner = (next: Owner | undefined) => {
    setState({
      ...state,
      filters: [
        ...state.filters.filter((filter) => filter.field !== "owner"),
        ...(next === undefined ? [] : [{ field: "owner", operator: "eq" as const, value: next }]),
      ],
      page: 0,
    });
  };

  const valueLabel = useCallback(
    (field: string, value: string) => {
      if (field === "discipline")
        return t(`enums:courseDiscipline.${value}`, { defaultValue: value });
      if (field === "source") return t(`enums:courseSource.${value}`, { defaultValue: value });
      if (field === "agilityhubLevel") {
        return t(`enums:agilityhubLevel.${value}`, { defaultValue: value });
      }
      if (field === "owner") return t(`admin-courses:list.owner.${value}`, { defaultValue: value });
      return value;
    },
    [t],
  );

  const filterColumns: UniversalListFilterColumn[] = [
    {
      key: "discipline",
      label: t("admin-courses:list.columns.discipline"),
      operators: ENUM,
      type: "enum",
    },
    {
      key: "agilityhubLevel",
      label: t("admin-courses:list.columns.agilityhubLevel"),
      operators: ENUM,
      type: "enum",
    },
    { key: "source", label: t("admin-courses:list.columns.source"), operators: ENUM, type: "enum" },
    { key: "designerName", label: t("admin-courses:list.columns.designerName"), type: "text" },
    { key: "obstacleCount", label: t("admin-courses:list.columns.obstacleCount"), type: "number" },
  ];

  // The contract publishes no `/courses/filter-values`: the enums are the values (no counts).
  const loadFilterValues = useCallback(
    (field: string): Promise<UniversalFilterValue[]> => {
      const values: readonly string[] =
        field === "discipline"
          ? DISCIPLINES
          : field === "source"
            ? COURSE_SOURCES
            : field === "agilityhubLevel"
              ? AGILITYHUB_LEVELS
              : [];
      return Promise.resolve(values.map((value) => ({ label: valueLabel(field, value), value })));
    },
    [valueLabel],
  );

  const applied = (data?.appliedFilters ?? [])
    .filter((filter) => filter.field !== "owner")
    .map((filter) => {
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

  const none = t("admin-courses:common.none");
  const columns: UniversalListColumn<CourseListItem>[] = [
    {
      key: "name",
      label: t("admin-courses:list.columns.name"),
      render: (row) => (
        <span className="courses-name-cell">
          {row.thumbnailUrl === null || row.thumbnailUrl === undefined ? (
            <span aria-hidden="true" className="courses-thumb courses-thumb--empty">
              <Icon name="grid" />
            </span>
          ) : (
            <img alt="" className="courses-thumb" src={row.thumbnailUrl} />
          )}
          <span>
            <strong>{row.name ?? none}</strong>
            {row.ownerType === undefined ? null : (
              <small>{t(`admin-courses:list.ownerType.${row.ownerType}`)}</small>
            )}
          </span>
        </span>
      ),
      sortKey: "name",
    },
    {
      key: "discipline",
      label: t("admin-courses:list.columns.discipline"),
      render: (row) => (row.discipline === undefined ? none : labels.discipline(row.discipline)),
    },
    {
      key: "level",
      label: t("admin-courses:list.columns.level"),
      render: (row) => labels.level(row.level),
    },
    {
      key: "designerName",
      label: t("admin-courses:list.columns.designerName"),
      render: (row) => row.designerName ?? none,
    },
    {
      key: "source",
      label: t("admin-courses:list.columns.source"),
      render: (row) => (row.source === undefined ? none : labels.source(row.source)),
    },
    {
      key: "activeOnRings",
      label: t("admin-courses:list.columns.activeOnRings"),
      render: (row) =>
        row.activeOnRings === undefined || row.activeOnRings.length === 0
          ? none
          : row.activeOnRings.map((ring) => ring.name).join(t("admin-courses:list.separator")),
    },
    {
      key: "stats",
      label: t("admin-courses:list.columns.stats"),
      render: (row) =>
        row.stats === undefined
          ? none
          : row.stats.pathLengthM > 0
            ? t("admin-courses:list.statsWithLength", {
                count: row.stats.obstacleCount,
                length: pathLength.format(row.stats.pathLengthM),
              })
            : t("admin-courses:list.statsCount", { count: row.stats.obstacleCount }),
    },
  ];

  const filtered = state.q !== "" || state.filters.length > 0;
  const listLabels: UniversalListLabels<CourseListItem> = {
    ...universalListLabels(
      t,
      filtered ? t("admin-courses:list.emptyFiltered") : t("admin-courses:list.empty"),
    ),
    emptyTitle: filtered
      ? t("admin-courses:list.emptyFilteredTitle")
      : t("admin-courses:list.emptyTitle"),
    search: t("admin-courses:list.search"),
    selectRow: (row) => t("admin-courses:list.open", { name: row.name ?? row.id }),
  };

  const open = (courseId: string) => {
    onNavigate(`/recorreguts/${encodeURIComponent(courseId)}`);
  };

  return (
    <div className="courses-page">
      <header className="courses-page__header">
        <div>
          <h1>{t("admin-courses:list.title")}</h1>
          <p className="courses-muted">{t("admin-courses:list.description")}</p>
        </div>
        <NewCourseMenu
          onChoose={setCreating}
          onLibrary={() => {
            chooseOwner("AGILITYHUB");
          }}
        />
      </header>
      <div aria-label={t("admin-courses:list.ownerLabel")} className="courses-chips" role="group">
        {OWNERS.map((value) => (
          <button
            aria-pressed={owner === value}
            className="courses-chip"
            key={value}
            onClick={() => {
              chooseOwner(owner === value ? undefined : value);
            }}
            type="button"
          >
            {t(`admin-courses:list.owner.${value}`)}
          </button>
        ))}
      </div>
      {owner === "AGILITYHUB" ? (
        <p className="courses-muted" role="status">
          {t("admin-courses:list.libraryHint")}
        </p>
      ) : null}
      <UniversalList<CourseListItem>
        appliedFilters={applied}
        caption={t("admin-courses:list.caption")}
        columns={columns}
        {...(error === undefined
          ? {}
          : {
              error: isApiError(error)
                ? t(`errors:${error.code}`, { defaultValue: t("admin-courses:list.error") })
                : t("admin-courses:list.error"),
            })}
        exportable={false}
        filterColumns={filterColumns}
        labels={listLabels}
        listKey={LIST_KEY}
        loadFilterValues={loadFilterValues}
        loading={loading}
        onExport={() => undefined}
        onRetry={retry}
        onRowActivate={(row) => {
          open(row.id);
        }}
        onStateChange={setState}
        rowHref={(row) => `/recorreguts/${encodeURIComponent(row.id)}`}
        rowKey={(row) => row.id}
        rows={data?.items ?? []}
        state={state}
        totalPages={data?.totalPages ?? 0}
      />
      {creating === "smarter" ? (
        <ImportCourseModal
          client={client}
          onClose={() => {
            setCreating(undefined);
          }}
          onImported={(courseId) => {
            setCreating(undefined);
            open(courseId);
          }}
        />
      ) : null}
      {creating === "image" ? (
        <ImageCourseModal
          client={client}
          onClose={() => {
            setCreating(undefined);
          }}
          onCreated={(courseId) => {
            setCreating(undefined);
            open(courseId);
          }}
        />
      ) : null}
    </div>
  );
}
