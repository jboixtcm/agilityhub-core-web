import { type ApiClient, isApiError, useSubmissionKeys } from "@agilityhub/api-client";
import { PlannerCanvas } from "@agilityhub/course-ui";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Icon,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Tabs,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import {
  lazy,
  type SyntheticEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import {
  RegisterSetupModal,
  useBuildSheet,
  useBuildSheetError,
  useStoredBuildSheet,
} from "./RegisterSetupModal";
import {
  AGILITYHUB_LEVELS,
  type AgilityhubLevel,
  apiCode,
  type Course,
  courseFrameRing,
  DISCIPLINES,
  type Discipline,
  framePlacement,
  isCourseData,
  type Placement,
  type Ring,
  useCourseError,
  useCourseLabels,
  useSetupPermission,
} from "./shared";

const CourseViewer3D = lazy(() => import("./CourseViewer3D"));

/** The fields of D18's metadata card (S16 §2 «metadades editables»). */
interface Metadata {
  agilityhubLevel: AgilityhubLevel | "";
  designerName: string;
  discipline: Discipline;
  name: string;
  notes: string;
  tags: string;
}

function metadataOf(course: Course, locale: string): Metadata {
  return {
    agilityhubLevel: course.agilityhubLevel ?? "",
    designerName: course.designerName ?? "",
    discipline: course.discipline,
    name: course.nameI18n?.[locale] ?? course.name,
    notes: course.notes ?? "",
    tags: course.tags.join(", "),
  };
}

function tagsOf(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

/**
 * The metadata card: edits under optimistic locking. After `409 STALE_VERSION` the course is read
 * again and only the fields this user changed are put back on top of it (never a fresh `version`
 * with stale values), so the next save is a deliberate one.
 */
function MetadataCard({
  client,
  course,
  onSaved,
}: {
  client: ApiClient;
  course: Course;
  onSaved: (course: Course) => void;
}) {
  const { t } = useTranslation(["admin-courses", "enums", "errors"]);
  const branding = useBranding();
  const labels = useCourseLabels();
  const errorText = useCourseError();
  const locale = branding.defaultLocale;
  const [base, setBase] = useState(course);
  const [values, setValues] = useState(() => metadataOf(course, locale));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "info" | "ok" }>();
  const original = metadataOf(base, locale);
  const dirty = (Object.keys(values) as (keyof Metadata)[]).filter(
    (key) => values[key] !== original[key],
  );

  // A newer course from the page (the share switch saved it): adopted while rendering, with the
  // user's own edits kept on top (React's «adjusting state when a prop changes»).
  const [seen, setSeen] = useState(course.version);
  if (course.version !== seen) {
    setSeen(course.version);
    if (course.version !== base.version) {
      const own = Object.fromEntries(dirty.map((key) => [key, values[key]]));
      setBase(course);
      setValues({ ...metadataOf(course, locale), ...own });
    }
  }

  const set = <Key extends keyof Metadata>(key: Key, value: Metadata[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage(undefined);
  };

  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (values.name.trim() === "") {
      setMessage({ text: t("admin-courses:detail.nameRequired"), tone: "error" });
      return;
    }
    setPending(true);
    setMessage(undefined);
    try {
      const result = await client.PATCH("/courses/{id}", {
        body: {
          ...(dirty.includes("name")
            ? { name: { ...(base.nameI18n ?? {}), [locale]: values.name.trim() } }
            : {}),
          ...(dirty.includes("discipline") ? { discipline: values.discipline } : {}),
          ...(dirty.includes("designerName") ? { designerName: values.designerName.trim() } : {}),
          ...(dirty.includes("agilityhubLevel")
            ? { agilityhubLevel: values.agilityhubLevel === "" ? null : values.agilityhubLevel }
            : {}),
          ...(dirty.includes("notes") ? { notes: values.notes } : {}),
          ...(dirty.includes("tags") ? { tags: tagsOf(values.tags) } : {}),
          version: base.version,
        },
        params: { path: { id: base.id } },
      });
      if (result.data === undefined) throw new TypeError("Saved course without data");
      setBase(result.data);
      setValues(metadataOf(result.data, locale));
      setMessage({ text: t("admin-courses:detail.saved"), tone: "ok" });
      onSaved(result.data);
    } catch (cause) {
      if (apiCode(cause) === "STALE_VERSION") {
        // Rebase only the user's own edits on the course as it is now.
        const fresh = await client
          .GET("/courses/{id}", { params: { path: { id: base.id } } })
          .then((answer) => answer.data)
          .catch(() => undefined);
        if (fresh !== undefined) {
          const latest = metadataOf(fresh, locale);
          setBase(fresh);
          setValues({
            ...latest,
            ...Object.fromEntries(dirty.map((key) => [key, values[key]])),
          });
          onSaved(fresh);
        }
        setMessage({ text: t("admin-courses:detail.stale"), tone: "info" });
      } else {
        setMessage({ text: errorText(cause), tone: "error" });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Card aria-labelledby="course-metadata-title" className="courses-card" role="region">
      <h2 id="course-metadata-title">{t("admin-courses:detail.metadata")}</h2>
      <form
        className="courses-form courses-form--grid"
        noValidate
        onSubmit={(event) => void save(event)}
      >
        <FormField id="course-name" label={t("admin-courses:fields.name")}>
          <Input
            id="course-name"
            maxLength={120}
            onChange={(event) => {
              set("name", event.currentTarget.value);
            }}
            required
            value={values.name}
          />
        </FormField>
        <FormField id="course-discipline" label={t("admin-courses:fields.discipline")}>
          <Select
            id="course-discipline"
            onChange={(event) => {
              set("discipline", event.currentTarget.value as Discipline);
            }}
            value={values.discipline}
          >
            {DISCIPLINES.map((value) => (
              <option key={value} value={value}>
                {labels.discipline(value)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="course-designer" label={t("admin-courses:fields.designerName")}>
          <Input
            id="course-designer"
            maxLength={120}
            onChange={(event) => {
              set("designerName", event.currentTarget.value);
            }}
            value={values.designerName}
          />
        </FormField>
        <FormField id="course-level" label={t("admin-courses:fields.agilityhubLevel")}>
          <Select
            id="course-level"
            onChange={(event) => {
              set("agilityhubLevel", event.currentTarget.value as AgilityhubLevel | "");
            }}
            value={values.agilityhubLevel}
          >
            <option value="">{t("admin-courses:common.none")}</option>
            {AGILITYHUB_LEVELS.map((value) => (
              <option key={value} value={value}>
                {labels.level(value)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          help={t("admin-courses:fields.tagsHelp")}
          id="course-tags"
          label={t("admin-courses:fields.tags")}
        >
          <Input
            id="course-tags"
            onChange={(event) => {
              set("tags", event.currentTarget.value);
            }}
            value={values.tags}
          />
        </FormField>
        <FormField id="course-notes" label={t("admin-courses:fields.notes")}>
          <Textarea
            id="course-notes"
            maxLength={2000}
            onChange={(event) => {
              set("notes", event.currentTarget.value);
            }}
            value={values.notes}
          />
        </FormField>
        {message === undefined ? null : (
          <p
            className={message.tone === "error" ? "ah-form-field__error" : "courses-muted"}
            role={message.tone === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        )}
        <div className="courses-form__actions">
          <Button
            disabled={dirty.length === 0}
            loading={pending}
            loadingLabel={t("admin-courses:common.saving")}
            type="submit"
          >
            {t("admin-courses:common.save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** «Comparteix amb el club» (S16 §2): a club course PRIVATE (only its author) ↔ CLUB. */
function ShareSwitch({
  client,
  course,
  onSaved,
}: {
  client: ApiClient;
  course: Course;
  onSaved: (course: Course) => void;
}) {
  const { t } = useTranslation("admin-courses");
  const errorText = useCourseError();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "info" }>();
  const change = async (shared: boolean) => {
    setPending(true);
    setMessage(undefined);
    try {
      const result = await client.PATCH("/courses/{id}", {
        body: { version: course.version, visibility: shared ? "CLUB" : "PRIVATE" },
        params: { path: { id: course.id } },
      });
      if (result.data !== undefined) onSaved(result.data);
    } catch (cause) {
      if (apiCode(cause) === "STALE_VERSION") {
        // Like the metadata card: read the course as it is now, so the switch shows what is stored
        // and the next change is made at its version (never a fresh version with a stale view).
        const fresh = await client
          .GET("/courses/{id}", { params: { path: { id: course.id } } })
          .then((answer) => answer.data)
          .catch(() => undefined);
        if (fresh !== undefined) onSaved(fresh);
        setMessage({ text: t("admin-courses:detail.shareStale"), tone: "info" });
      } else {
        setMessage({ text: errorText(cause), tone: "error" });
      }
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="courses-share">
      <label className="courses-share__row">
        <span>{t("admin-courses:detail.share")}</span>
        <Switch
          checked={course.visibility === "CLUB"}
          disabled={pending}
          label={t("admin-courses:detail.share")}
          onCheckedChange={(checked) => void change(checked)}
        />
      </label>
      {message === undefined ? null : (
        <p
          className={message.tone === "error" ? "ah-form-field__error" : "courses-muted"}
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** A confirmation with its own pending state and its error inside (delete, duplicate). */
function ConfirmModal({
  action,
  danger = false,
  message,
  onClose,
  onConfirm,
  title,
}: {
  action: string;
  danger?: boolean;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
}) {
  const { t } = useTranslation("admin-courses");
  const errorText = useCourseError();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Modal closeLabel={t("admin-courses:common.close")} onClose={onClose} open title={title}>
      <p>{message}</p>
      {error === undefined ? null : (
        <p className="ah-form-field__error" role="alert">
          {error}
        </p>
      )}
      <div className="courses-form__actions">
        <Button onClick={onClose} variant="ghost">
          {t("admin-courses:common.cancel")}
        </Button>
        <Button
          loading={pending}
          loadingLabel={t("admin-courses:common.saving")}
          onClick={() => {
            setPending(true);
            setError(undefined);
            onConfirm().catch((cause: unknown) => {
              setError(errorText(cause));
              setPending(false);
            });
          }}
          variant={danger ? "danger" : "primary"}
        >
          {action}
        </Button>
      </div>
    </Modal>
  );
}

/** The course's placements: where it is placed, whether its ring changed (R-16-06), actions. */
function PlacementsCard({
  canPlace,
  canRegister,
  client,
  course,
  onNavigate,
  onPlacementChanged,
  onRegister,
  placements,
  rings,
}: {
  canPlace: boolean;
  canRegister: boolean;
  client: ApiClient;
  course: Course;
  onNavigate: (path: string) => void;
  onPlacementChanged: (placement: Placement) => void;
  onRegister: (placement: Placement) => void;
  placements: readonly Placement[] | undefined;
  rings: readonly Ring[];
}) {
  const { t } = useTranslation("admin-courses");
  const { formatDateTime } = useClubFormats();
  const sheetError = useBuildSheetError();
  const buildSheet = useBuildSheet(client);
  const storedSheet = useStoredBuildSheet(client);
  const [sheet, setSheet] = useState<{ id: string; error?: string }>();
  const ringName = (id: string) => rings.find((ring) => ring.id === id)?.name ?? id;
  const editorPath = (placement?: Placement) =>
    `/recorreguts/${encodeURIComponent(course.id)}/col-locacio${
      placement === undefined ? "" : `?colocacio=${encodeURIComponent(placement.id)}`
    }`;

  const downloadSheet = (placement: Placement, stored: boolean) => {
    setSheet({ id: placement.id });
    const done = stored
      ? storedSheet({
          courseName: course.name,
          placementId: placement.id,
          ringName: ringName(placement.ringId),
        })
      : buildSheet({ courseName: course.name, notes: course.notes, placement }).then((saved) => {
          onPlacementChanged({ ...placement, buildSheetFileKey: saved.buildSheetFileKey });
        });
    done.then(
      () => {
        setSheet(undefined);
      },
      (cause: unknown) => {
        setSheet({ error: sheetError(cause), id: placement.id });
      },
    );
  };

  return (
    <Card aria-labelledby="course-placements-title" className="courses-card" role="region">
      <div className="courses-card__header">
        <h2 id="course-placements-title">{t("admin-courses:detail.placements")}</h2>
        {canPlace ? (
          <Button
            onClick={() => {
              onNavigate(editorPath());
            }}
          >
            <Icon aria-hidden="true" name="grid" />
            {t("admin-courses:detail.place")}
          </Button>
        ) : null}
      </div>
      {placements === undefined ? (
        <Skeleton height="3rem" label={t("admin-courses:common.loading")} />
      ) : placements.length === 0 ? (
        <p className="courses-muted">{t("admin-courses:detail.noPlacements")}</p>
      ) : (
        <ul className="courses-placements">
          {placements.map((placement) => (
            <li key={placement.id}>
              <div>
                <strong>{placement.name ?? ringName(placement.ringId)}</strong>
                <span className="courses-muted">
                  {t("admin-courses:detail.placementLine", {
                    date: formatDateTime(placement.updatedAt),
                    ring: ringName(placement.ringId),
                  })}
                </span>
                {placement.stale ? <Badge tone="warning">{t("admin-courses:stale")}</Badge> : null}
              </div>
              <div className="courses-placements__actions">
                <Button
                  onClick={() => {
                    onNavigate(editorPath(placement));
                  }}
                  variant="secondary"
                >
                  {placement.stale
                    ? t("admin-courses:detail.review")
                    : t("admin-courses:detail.edit")}
                </Button>
                <Button
                  // R-16-06: a stale placement's obstacles no longer match the ring: «Revisa» first.
                  aria-describedby={placement.stale ? `sheet-stale-${placement.id}` : undefined}
                  disabled={
                    placement.stale || (sheet?.id === placement.id && sheet.error === undefined)
                  }
                  loading={sheet?.id === placement.id && sheet.error === undefined}
                  loadingLabel={t("admin-courses:detail.sheetPending")}
                  onClick={() => {
                    downloadSheet(placement, false);
                  }}
                  variant="secondary"
                >
                  <Icon aria-hidden="true" name="doc" />
                  {t("admin-courses:detail.buildSheet")}
                </Button>
                {placement.buildSheetFileKey == null ? null : (
                  <Button
                    disabled={sheet?.id === placement.id && sheet.error === undefined}
                    onClick={() => {
                      downloadSheet(placement, true);
                    }}
                    variant="ghost"
                  >
                    {t("admin-courses:detail.storedSheet")}
                  </Button>
                )}
                {canRegister ? (
                  <Button
                    onClick={() => {
                      onRegister(placement);
                    }}
                    variant="secondary"
                  >
                    <Icon aria-hidden="true" name="cone" />
                    {t("admin-courses:detail.register")}
                  </Button>
                ) : null}
              </div>
              {placement.stale ? (
                <p className="courses-muted" id={`sheet-stale-${placement.id}`}>
                  {t("admin-courses:detail.sheetStale")}
                </p>
              ) : null}
              {sheet?.id === placement.id && sheet.error !== undefined ? (
                <p className="ah-form-field__error" role="alert">
                  {sheet.error}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * D18's course page (`/recorreguts/:id`, S16 §2): the 2D viewer and the 3D tab (loaded on demand),
 * the editable metadata, «Col·loca en una pista», the build sheet, «Registra-ho com a muntat»,
 * «Duplica», «Comparteix amb el club» and «Elimina»; an AgilityHub course is read-only and copied
 * to the club.
 */
export function CourseDetailPage({
  client,
  courseId,
  onNavigate,
}: {
  client: ApiClient;
  courseId: string;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["admin-courses", "enums", "errors"]);
  const branding = useBranding();
  const labels = useCourseLabels();
  const keys = useSubmissionKeys();
  const setupPermission = useSetupPermission(client);
  const [course, setCourse] = useState<Course>();
  /** A failed read, kept with the attempt it belongs to: [Torna-ho a provar] is a new attempt. */
  const [failure, setFailure] = useState<{ attempt: number; error: unknown }>();
  const [placements, setPlacements] = useState<Placement[]>();
  const [rings, setRings] = useState<Ring[]>([]);
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<
    | { kind: "copy" }
    | { kind: "delete" }
    | { kind: "duplicate" }
    | { kind: "register"; placement?: Placement }
  >();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let active = true;
    client.GET("/courses/{id}", { params: { path: { id: courseId } } }).then(
      (result) => {
        if (active && result.data !== undefined) setCourse(result.data);
      },
      (cause: unknown) => {
        if (active) setFailure({ attempt: reload, error: cause });
      },
    );
    client.GET("/placements", { params: { query: { courseId } } }).then(
      (result) => {
        if (active) setPlacements(result.data ?? []);
      },
      () => {
        if (active) setPlacements([]);
      },
    );
    client.GET("/rings", { params: { query: { includeInactive: true } } }).then(
      (result) => {
        if (active) setRings(result.data?.items ?? []);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [client, courseId, reload]);

  const model = course?.normalizedJson;
  const frame = useMemo(() => (isCourseData(model) ? courseFrameRing(model) : null), [model]);
  const placement = useMemo(
    () => (isCourseData(model) && frame !== null ? framePlacement(model, frame) : null),
    [frame, model],
  );
  const select = useCallback(() => undefined, []);

  const loadError = failure?.attempt === reload ? failure.error : undefined;
  if (loadError !== undefined) {
    return (
      <EmptyState
        action={
          <Button
            onClick={() => {
              setReload((value) => value + 1);
            }}
          >
            {t("admin-courses:common.retry")}
          </Button>
        }
        description={
          isApiError(loadError)
            ? t(`errors:${loadError.code}`, { defaultValue: t("admin-courses:detail.loadError") })
            : t("admin-courses:detail.loadError")
        }
        title={t("admin-courses:detail.loadErrorTitle")}
      />
    );
  }
  if (course === undefined) {
    return <Skeleton height="16rem" label={t("admin-courses:common.loading")} />;
  }

  const library = course.ownerType === "AGILITYHUB";
  const editable = !library;
  const withModel = isCourseData(model);

  const viewer2d =
    withModel && frame !== null && placement !== null ? (
      <PlannerCanvas
        course={model}
        labels={{
          ariaLabel: t("admin-courses:detail.plan2d", { name: course.name }),
          entry: t("admin-courses:viewer.entry"),
          exit: t("admin-courses:viewer.exit"),
        }}
        onSelectObstacle={select}
        placement={placement}
        ring={frame}
        selectedObstacleId={null}
        warnings={[]}
      />
    ) : course.imageUrl != null ? (
      <img
        alt={t("admin-courses:detail.image", { name: course.name })}
        className="courses-image"
        src={course.imageUrl}
      />
    ) : (
      <p className="courses-muted">{t("admin-courses:detail.noModel")}</p>
    );

  return (
    <div className="courses-page courses-detail">
      <header className="courses-page__header">
        <div>
          <a
            className="courses-back"
            href="/recorreguts"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("/recorreguts");
            }}
          >
            {t("admin-courses:detail.back")}
          </a>
          <h1>{course.name}</h1>
          <p className="courses-chips-inline">
            <Badge>{labels.discipline(course.discipline)}</Badge>
            <Badge>{labels.source(course.source)}</Badge>
            <Badge tone="info">{t(`admin-courses:list.ownerType.${course.ownerType}`)}</Badge>
            {course.stats.obstacleCount > 0 ? (
              <span className="courses-muted">
                {t("admin-courses:list.statsCount", { count: course.stats.obstacleCount })}
              </span>
            ) : null}
          </p>
        </div>
        <div className="courses-actions">
          {library ? (
            <Button
              onClick={() => {
                setDialog({ kind: "copy" });
              }}
            >
              <Icon aria-hidden="true" name="dup" />
              {t("admin-courses:detail.copy")}
            </Button>
          ) : (
            <>
              {setupPermission.allowed ? (
                <Button
                  onClick={() => {
                    setDialog({ kind: "register" });
                  }}
                  variant="secondary"
                >
                  <Icon aria-hidden="true" name="cone" />
                  {t("admin-courses:detail.register")}
                </Button>
              ) : null}
              <Button
                onClick={() => {
                  setDialog({ kind: "duplicate" });
                }}
                variant="secondary"
              >
                <Icon aria-hidden="true" name="dup" />
                {t("admin-courses:detail.duplicate")}
              </Button>
              <Button
                onClick={() => {
                  setDialog({ kind: "delete" });
                }}
                variant="danger"
              >
                {t("admin-courses:detail.delete")}
              </Button>
            </>
          )}
        </div>
      </header>
      {notice === undefined ? null : (
        <p className="courses-notice" role="status">
          {notice}
        </p>
      )}
      <div className="courses-detail__grid">
        <Card aria-labelledby="course-viewer-title" className="courses-card" role="region">
          <h2 className="ah-sr-only" id="course-viewer-title">
            {t("admin-courses:detail.viewer")}
          </h2>
          {withModel && frame !== null && placement !== null ? (
            <Tabs
              items={[
                { content: viewer2d, label: t("admin-courses:detail.tab2d"), value: "2d" },
                {
                  content: (
                    <Suspense
                      fallback={
                        <Skeleton height="24rem" label={t("admin-courses:common.loading")} />
                      }
                    >
                      <CourseViewer3D
                        ariaLabel={t("admin-courses:detail.plan3d", { name: course.name })}
                        course={model}
                        placement={placement}
                        ring={frame}
                      />
                    </Suspense>
                  ),
                  label: t("admin-courses:detail.tab3d"),
                  value: "3d",
                },
              ]}
              label={t("admin-courses:detail.viewer")}
            />
          ) : (
            viewer2d
          )}
        </Card>
        <div className="courses-detail__side">
          {editable && course.ownerType === "CLUB" ? (
            <ShareSwitch client={client} course={course} onSaved={setCourse} />
          ) : null}
          {editable ? (
            <MetadataCard client={client} course={course} key={course.id} onSaved={setCourse} />
          ) : (
            <Card className="courses-card">
              <p>{t("admin-courses:detail.libraryReadOnly")}</p>
            </Card>
          )}
        </div>
      </div>
      {editable ? (
        <PlacementsCard
          canPlace={withModel}
          canRegister={setupPermission.allowed}
          client={client}
          course={course}
          onNavigate={onNavigate}
          onPlacementChanged={(changed) => {
            setPlacements((current) =>
              current?.map((item) => (item.id === changed.id ? changed : item)),
            );
          }}
          onRegister={(item) => {
            setDialog({ kind: "register", placement: item });
          }}
          placements={placements}
          rings={rings}
        />
      ) : null}
      {dialog?.kind === "register" ? (
        <RegisterSetupModal
          client={client}
          course={course}
          onClose={() => {
            setDialog(undefined);
          }}
          onRefused={setupPermission.refused}
          onRegistered={(message) => {
            setDialog(undefined);
            setNotice(message);
            setReload((value) => value + 1);
          }}
          placement={dialog.placement}
          rings={rings}
          timeZone={branding.timeZone}
        />
      ) : null}
      {dialog?.kind === "duplicate" ? (
        <ConfirmModal
          action={t("admin-courses:detail.duplicate")}
          message={t("admin-courses:detail.duplicateQuestion", { name: course.name })}
          onClose={() => {
            setDialog(undefined);
          }}
          onConfirm={async () => {
            const result = await keys.send(`duplicate:${course.id}`, (key) =>
              client.POST("/courses/{id}/duplicate", {
                body: {},
                headers: { "Idempotency-Key": key },
                params: { path: { id: course.id } },
              }),
            );
            if (result.data === undefined) throw new TypeError("Duplicate without data");
            setDialog(undefined);
            onNavigate(`/recorreguts/${encodeURIComponent(result.data.id)}`);
          }}
          title={t("admin-courses:detail.duplicate")}
        />
      ) : null}
      {dialog?.kind === "copy" ? (
        <ConfirmModal
          action={t("admin-courses:detail.copy")}
          message={t("admin-courses:detail.copyQuestion", { name: course.name })}
          onClose={() => {
            setDialog(undefined);
          }}
          onConfirm={async () => {
            const result = await keys.send(`copy:${course.id}`, (key) =>
              client.POST("/courses/{id}/copy-to-club", {
                body: {},
                headers: { "Idempotency-Key": key },
                params: { path: { id: course.id } },
              }),
            );
            if (result.data === undefined) throw new TypeError("Copy without data");
            setDialog(undefined);
            onNavigate(`/recorreguts/${encodeURIComponent(result.data.id)}`);
          }}
          title={t("admin-courses:detail.copy")}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <ConfirmModal
          action={t("admin-courses:detail.delete")}
          danger
          message={t("admin-courses:detail.deleteQuestion", { name: course.name })}
          onClose={() => {
            setDialog(undefined);
          }}
          onConfirm={async () => {
            await client.DELETE("/courses/{id}", {
              params: { path: { id: course.id }, query: { version: course.version } },
            });
            setDialog(undefined);
            onNavigate("/recorreguts");
          }}
          title={t("admin-courses:detail.delete")}
        />
      ) : null}
    </div>
  );
}
