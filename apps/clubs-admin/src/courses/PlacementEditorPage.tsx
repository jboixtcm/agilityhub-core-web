import {
  type ApiClient,
  type components,
  isApiError,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { plannerPlacement } from "@agilityhub/api-client/core-api-store";
import { useSession } from "@agilityhub/auth";
import type { Warning } from "@agilityhub/course-core";
import {
  computeWarnings,
  INITIAL_STATE,
  PlacementControls,
  PlannerCanvas,
  plannerReducer,
  type PlannerPlacement,
  type PlannerRing,
  type SavePlacementInput,
  WarningsPanel,
} from "@agilityhub/course-ui";
import { useClubFormats, useCourseTexts } from "@agilityhub/i18n";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Icon,
  Input,
  Select,
  Skeleton,
  useBranding,
} from "@agilityhub/ui";
import { type SyntheticEvent, useEffect, useMemo, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  RegisterSetupModal,
  useBuildSheet,
  useBuildSheetError,
  useStoredBuildSheet,
} from "./RegisterSetupModal";
import {
  type Course,
  isCourseData,
  type Placement,
  type Ring,
  useCourseError,
  useCourseStore,
  useSetupPermission,
  useWarningText,
} from "./shared";

type PlacementBlockedDetails = components["schemas"]["PlacementBlockedDetails"];

type SaveFailure =
  | { kind: "blocked"; critical: readonly Warning[] }
  | { kind: "courseStale" }
  | { kind: "error"; message: string }
  | { kind: "stale" };

/**
 * D18's placement editor (`PlacementEditor`, S16 §2, R-16-05): a ring with geometry, the course
 * dragged, turned and mirrored on it with course-core's live warnings, and [DESA LA COL·LOCACIÓ].
 * A new placement is `POST /placements` under one `Idempotency-Key` per payload; an existing one
 * (`?colocacio=`, a stale one too, R-16-06) is `PUT` at the version the user edited. A critical
 * warning is refused (`422 PLACEMENT_BLOCKED`) unless an ADMIN confirms (`force`); an INSTRUCTOR
 * reads why. `?activitat=` places the course for an activity (D7 «Col·locacions»).
 */
export function PlacementEditorPage({
  activityId,
  client,
  courseId,
  onNavigate,
  placementId,
}: {
  activityId?: string | undefined;
  client: ApiClient;
  courseId: string;
  onNavigate: (path: string) => void;
  placementId?: string | undefined;
}) {
  const { t } = useTranslation(["admin-courses", "enums", "errors"]);
  const branding = useBranding();
  const session = useSession();
  const admin = session.roles.includes("ADMIN");
  const store = useCourseStore(client);
  const texts = useCourseTexts();
  const errorText = useCourseError();
  const { locale } = useClubFormats();
  const keys = useSubmissionKeys();
  const buildSheet = useBuildSheet(client);
  const storedSheet = useStoredBuildSheet(client);
  const sheetErrorText = useBuildSheetError();
  const setupPermission = useSetupPermission(client);
  const [sheetPending, setSheetPending] = useState(false);
  const [course, setCourse] = useState<Course>();
  const [rings, setRings] = useState<readonly PlannerRing[]>();
  const [catalogRings, setCatalogRings] = useState<Ring[]>([]);
  const [stored, setStored] = useState<PlannerPlacement>();
  const [storedResolved, setStoredResolved] = useState<Placement>();
  const [loadError, setLoadError] = useState<unknown>();
  const [name, setName] = useState("");
  const [state, dispatch] = useReducer(plannerReducer, INITIAL_STATE);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<SaveFailure>();
  const [savedMessage, setSavedMessage] = useState<string>();
  const [sheetError, setSheetError] = useState<string>();
  const [registering, setRegistering] = useState(false);
  const model = course?.normalizedJson;

  // The course, the rings with geometry and, for an existing placement, what it stores.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [courseAnswer, venueRings, catalog, placement] = await Promise.all([
        client.GET("/courses/{id}", { params: { path: { id: courseId } } }),
        store.listRings(branding.club.slug ?? ""),
        client.GET("/rings", { params: { query: { includeInactive: false } } }),
        placementId === undefined
          ? Promise.resolve(undefined)
          : client.GET("/placements/{id}", { params: { path: { id: placementId } } }),
      ]);
      if (!active) return;
      const loaded = courseAnswer.data;
      if (loaded === undefined || !isCourseData(loaded.normalizedJson)) {
        throw new TypeError("COURSE_WITHOUT_MODEL");
      }
      setCourse(loaded);
      setRings(venueRings);
      setCatalogRings(catalog.data?.items ?? []);
      const ring = venueRings.find((item) => item.id === placement?.data?.ringId) ?? venueRings[0];
      dispatch({
        course: loaded.normalizedJson,
        courseDbId: loaded.id,
        filename: loaded.name,
        type: "SET_COURSE",
      });
      if (ring !== undefined) dispatch({ ring, type: "SET_RING" });
      if (placement?.data !== undefined) {
        const saved = placement.data;
        setStoredResolved(saved);
        setName(saved.name ?? "");
        const reopened = plannerPlacement(saved);
        setStored(reopened);
        dispatch({ placement: reopened.placement, type: "SET_PLACEMENT" });
      }
    };
    load().catch((cause: unknown) => {
      if (active) setLoadError(cause);
    });
    return () => {
      active = false;
    };
  }, [branding.club.slug, client, courseId, placementId, store]);

  const warnings = useMemo(() => computeWarnings(state), [state]);
  const warningText = useWarningText(isCourseData(model) ? model : null, state.ring);
  const editorPath = `/recorreguts/${encodeURIComponent(courseId)}`;

  if (loadError !== undefined) {
    return (
      <EmptyState
        description={
          isApiError(loadError)
            ? t(`errors:${loadError.code}`, { defaultValue: t("admin-courses:editor.loadError") })
            : t("admin-courses:editor.loadError")
        }
        title={t("admin-courses:editor.loadErrorTitle")}
      />
    );
  }
  if (course === undefined || rings === undefined || !isCourseData(model)) {
    return <Skeleton height="20rem" label={t("admin-courses:common.loading")} />;
  }
  if (rings.length === 0) {
    return (
      <EmptyState
        description={t("admin-courses:editor.noRings")}
        title={t("admin-courses:editor.noRingsTitle")}
      />
    );
  }

  const ring = state.ring;
  const editing = stored !== undefined;
  const activity = stored?.activityId ?? activityId ?? null;

  /** A move or a turn: course-core judges the new position, so an old refusal no longer applies. */
  const move = (action: Parameters<typeof dispatch>[0]) => {
    dispatch(action);
    setFailure(undefined);
  };

  /**
   * After `409 STALE_VERSION`: the placement or the course changed meanwhile. Both are read
   * again; the user's transform and name stay, the course's new model and version are adopted
   * (the warnings follow it), so the next save is made at the versions now stored.
   */
  const recoverStale = async () => {
    const [freshCourse, freshPlacement] = await Promise.all([
      client
        .GET("/courses/{id}", { params: { path: { id: course.id } } })
        .then((answer) => answer.data)
        .catch(() => undefined),
      stored === undefined
        ? Promise.resolve(undefined)
        : client
            .GET("/placements/{id}", { params: { path: { id: stored.id } } })
            .then((answer) => answer.data)
            .catch(() => undefined),
    ]);
    const courseChanged = freshCourse !== undefined && freshCourse.version !== course.version;
    if (courseChanged && isCourseData(freshCourse.normalizedJson)) {
      setCourse(freshCourse);
      dispatch({
        course: freshCourse.normalizedJson,
        courseDbId: freshCourse.id,
        filename: freshCourse.name,
        type: "SET_COURSE",
      });
      dispatch({ placement: state.placement, type: "SET_PLACEMENT" });
    }
    if (freshPlacement !== undefined) {
      setStored(plannerPlacement(freshPlacement));
      setStoredResolved(freshPlacement);
    }
    setFailure({ kind: courseChanged ? "courseStale" : "stale" });
  };

  const save = async (force: boolean) => {
    if (ring === null) return;
    setPending(true);
    setFailure(undefined);
    setSavedMessage(undefined);
    const trimmed = name.trim();
    try {
      let saved: PlannerPlacement;
      if (editing) {
        saved = await store.updatePlacement({
          course: model,
          courseVersion: course.version,
          // Only what the user edits here; the rest of the placement goes back as stored.
          edits: { name: trimmed === "" ? null : trimmed },
          ...(force ? { force: true } : {}),
          placement: state.placement,
          stored,
          warnings,
        });
      } else {
        const input: Omit<SavePlacementInput, "submissionKey"> = {
          activityId: activity,
          course: model,
          courseId: course.id,
          courseVersion: course.version,
          ...(force ? { force: true } : {}),
          ...(activity === null ? {} : { mode: "event" as const }),
          ...(trimmed === "" ? {} : { name: trimmed }),
          placement: state.placement,
          ringId: ring.id,
          thresholdMeters: null,
          venueId: branding.club.slug ?? "",
          warnings,
        };
        // One key per payload: what the user placed, where, under which name, forced or not.
        const signature = JSON.stringify({
          activity,
          courseId: course.id,
          courseVersion: course.version,
          force,
          name: trimmed,
          placement: state.placement,
          ringId: ring.id,
        });
        saved = await keys.send(signature, (key) =>
          store.savePlacement({ ...input, submissionKey: key }),
        );
        // Further saves are updates of this placement (its version), also after a reload.
        const search = new URLSearchParams(window.location.search);
        search.set("colocacio", saved.id);
        window.history.replaceState(null, "", `${window.location.pathname}?${search.toString()}`);
      }
      setStored(saved);
      setSavedMessage(t("admin-courses:editor.saved"));
      // The stored obstacles for the build sheet and the setup: best effort, the save is done.
      client.GET("/placements/{id}", { params: { path: { id: saved.id } } }).then(
        (fresh) => {
          const read = fresh.data;
          if (read === undefined) return;
          // A late answer never replaces what a later save already read.
          setStoredResolved((current) =>
            current?.id === read.id && current.version > read.version ? current : read,
          );
        },
        () => undefined,
      );
    } catch (cause) {
      if (isApiError(cause, "PLACEMENT_BLOCKED")) {
        const details = cause.details as Partial<PlacementBlockedDetails> | null | undefined;
        setFailure({ critical: details?.warnings ?? [], kind: "blocked" });
      } else if (isApiError(cause, "STALE_VERSION")) {
        await recoverStale();
      } else {
        setFailure({ kind: "error", message: errorText(cause) });
      }
    } finally {
      setPending(false);
    }
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(false);
  };

  const critical = warnings.filter((warning) => warning.severity === "critical").length;

  return (
    <div className="courses-page courses-editor">
      <header className="courses-page__header">
        <div>
          <a
            className="courses-back"
            href={editorPath}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(editorPath);
            }}
          >
            {t("admin-courses:editor.back", { name: course.name })}
          </a>
          <h1>{t("admin-courses:editor.title")}</h1>
          <p className="courses-muted">{course.name}</p>
        </div>
      </header>
      {stored?.stale === true ? (
        <p className="courses-warning" role="status">
          {t("admin-courses:editor.staleHint")}
        </p>
      ) : null}
      <div className="courses-editor__grid">
        <Card aria-labelledby="editor-plan-title" className="courses-card" role="region">
          <h2 id="editor-plan-title">{t("admin-courses:editor.plan")}</h2>
          <p className="courses-muted">{t("admin-courses:editor.dragHint")}</p>
          {ring === null ? null : (
            <PlannerCanvas
              course={model}
              labels={{
                ariaLabel: t("admin-courses:editor.planLabel", { ring: ring.name }),
                entry: t("admin-courses:viewer.entry"),
                exit: t("admin-courses:viewer.exit"),
              }}
              onDragPlacement={(dxMeters, dyMeters) => {
                move({ dxMeters, dyMeters, type: "NUDGE" });
              }}
              onSelectObstacle={(id) => {
                dispatch({ obstacleId: id, type: "SELECT_OBSTACLE" });
              }}
              placement={state.placement}
              ring={ring}
              selectedObstacleId={state.selectedObstacleId}
              warnings={warnings}
            />
          )}
        </Card>
        <form className="courses-editor__side" noValidate onSubmit={submit}>
          <Card className="courses-card">
            <FormField
              help={
                editing ? t("admin-courses:editor.ringFixed") : t("admin-courses:editor.ringHelp")
              }
              id="editor-ring"
              label={t("admin-courses:editor.ring")}
            >
              <Select
                disabled={editing}
                id="editor-ring"
                onChange={(event) => {
                  const next = rings.find((item) => item.id === event.currentTarget.value);
                  if (next !== undefined) move({ ring: next, type: "SET_RING" });
                }}
                value={ring?.id ?? ""}
              >
                {rings.map((item) => (
                  <option key={item.id} value={item.id}>
                    {catalogRings.find((candidate) => candidate.id === item.id)?.name ?? item.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="editor-name" label={t("admin-courses:editor.name")}>
              <Input
                id="editor-name"
                maxLength={120}
                onChange={(event) => {
                  setName(event.currentTarget.value);
                }}
                placeholder={t("admin-courses:editor.namePlaceholder")}
                value={name}
              />
            </FormField>
          </Card>
          <PlacementControls
            disabled={pending}
            flipX={state.placement.flipX}
            flipY={state.placement.flipY}
            labels={{
              center: t("admin-courses:controls.center"),
              flipHorizontal: t("admin-courses:controls.flipHorizontal"),
              flipVertical: t("admin-courses:controls.flipVertical"),
              nudgeDown: t("admin-courses:controls.nudgeDown"),
              nudgeLeft: t("admin-courses:controls.nudgeLeft"),
              nudgeRight: t("admin-courses:controls.nudgeRight"),
              nudgeUp: t("admin-courses:controls.nudgeUp"),
              reset: t("admin-courses:controls.reset"),
              rotateFineLeft: t("admin-courses:controls.rotateFineLeft"),
              rotateFineRight: t("admin-courses:controls.rotateFineRight"),
              rotateLeft: t("admin-courses:controls.rotateLeft"),
              rotateRight: t("admin-courses:controls.rotateRight"),
              stepSize: t("admin-courses:controls.stepSize"),
              title: t("admin-courses:controls.title"),
            }}
            locale={locale}
            onCenter={() => {
              move({ type: "CENTER" });
            }}
            onFlipX={() => {
              move({ type: "FLIP_X" });
            }}
            onFlipY={() => {
              move({ type: "FLIP_Y" });
            }}
            onNudge={(dxMeters, dyMeters) => {
              move({ dxMeters, dyMeters, type: "NUDGE" });
            }}
            onReset={() => {
              move({ type: "RESET_PLACEMENT" });
            }}
            onRotate={(deltaDegrees) => {
              move({ deltaDegrees, type: "ROTATE" });
            }}
            units="M"
          />
          <WarningsPanel
            labels={{
              empty: t("admin-courses:editor.noWarnings"),
              rule: texts.warningRule,
              severity: {
                critical: t("admin-courses:severity.critical"),
                info: t("admin-courses:severity.info"),
                warning: t("admin-courses:severity.warning"),
              },
              title: (count) => t("admin-courses:editor.warnings", { count }),
              warning: warningText,
            }}
            locale={locale}
            onSelectObstacle={(id) => {
              dispatch({ obstacleId: id, type: "SELECT_OBSTACLE" });
            }}
            selectedObstacleId={state.selectedObstacleId}
            units="M"
            warnings={warnings}
          />
          <Card className="courses-card">
            {critical > 0 ? (
              <p className="courses-warning">
                {admin
                  ? t("admin-courses:editor.criticalAdmin", { count: critical })
                  : t("admin-courses:editor.criticalInstructor", { count: critical })}
              </p>
            ) : null}
            {failure?.kind === "blocked" ? (
              <div className="courses-blocked" role="alert">
                <p>{t("errors:PLACEMENT_BLOCKED")}</p>
                {failure.critical.length === 0 ? null : (
                  // What the api judged critical (`details.warnings`), in the reader's language.
                  <ul aria-label={t("admin-courses:editor.blockedBy")}>
                    {failure.critical.map((warning) => (
                      <li key={warning.id}>{warningText(warning)}</li>
                    ))}
                  </ul>
                )}
                {admin ? (
                  <>
                    <p>{t("admin-courses:editor.forceQuestion")}</p>
                    <Button
                      loading={pending}
                      loadingLabel={t("admin-courses:common.saving")}
                      onClick={() => void save(true)}
                      variant="danger"
                    >
                      {t("admin-courses:editor.force")}
                    </Button>
                  </>
                ) : (
                  <p>{t("admin-courses:editor.forceAdminOnly")}</p>
                )}
              </div>
            ) : null}
            {failure?.kind === "stale" ? (
              <p className="ah-form-field__error" role="alert">
                {t("admin-courses:editor.stale")}
              </p>
            ) : null}
            {failure?.kind === "courseStale" ? (
              <p className="ah-form-field__error" role="alert">
                {t("admin-courses:editor.courseStale")}
              </p>
            ) : null}
            {failure?.kind === "error" ? (
              <p className="ah-form-field__error" role="alert">
                {failure.message}
              </p>
            ) : null}
            {savedMessage === undefined ? null : (
              <p className="courses-notice" role="status">
                {savedMessage}
              </p>
            )}
            <div className="courses-form__actions">
              <Button
                disabled={ring === null}
                loading={pending}
                loadingLabel={t("admin-courses:common.saving")}
                type="submit"
              >
                {t("admin-courses:editor.save")}
              </Button>
            </div>
            {storedResolved === undefined || stored === undefined ? null : (
              <div className="courses-form__actions">
                <Button
                  // R-16-06: a stale placement's obstacles no longer match the ring: save it first.
                  aria-describedby={stored.stale ? "editor-sheet-stale" : undefined}
                  disabled={stored.stale || sheetPending}
                  loading={sheetPending}
                  loadingLabel={t("admin-courses:detail.sheetPending")}
                  onClick={() => {
                    setSheetError(undefined);
                    setSheetPending(true);
                    buildSheet({
                      courseName: course.name,
                      notes: course.notes,
                      placement: storedResolved,
                    })
                      .then((saved) => {
                        setStored((current) =>
                          current === undefined
                            ? current
                            : { ...current, buildSheetFileKey: saved.buildSheetFileKey },
                        );
                      })
                      .catch((cause: unknown) => {
                        setSheetError(sheetErrorText(cause));
                      })
                      .finally(() => {
                        setSheetPending(false);
                      });
                  }}
                  variant="secondary"
                >
                  <Icon aria-hidden="true" name="doc" />
                  {t("admin-courses:detail.buildSheet")}
                </Button>
                {stored.buildSheetFileKey === null ? null : (
                  <Button
                    // R-16-06: the stored sheet was made on the old geometry too: save it first.
                    aria-describedby={stored.stale ? "editor-sheet-stale" : undefined}
                    disabled={stored.stale || sheetPending}
                    onClick={() => {
                      setSheetError(undefined);
                      storedSheet({
                        courseName: course.name,
                        placementId: stored.id,
                        ringName: ring?.name ?? "",
                      }).catch((cause: unknown) => {
                        setSheetError(sheetErrorText(cause));
                      });
                    }}
                    variant="ghost"
                  >
                    {t("admin-courses:detail.storedSheet")}
                  </Button>
                )}
                {setupPermission.allowed ? (
                  <Button
                    onClick={() => {
                      setRegistering(true);
                    }}
                    variant="secondary"
                  >
                    <Icon aria-hidden="true" name="cone" />
                    {t("admin-courses:detail.register")}
                  </Button>
                ) : null}
              </div>
            )}
            {stored?.stale === true && storedResolved !== undefined ? (
              <p className="courses-muted" id="editor-sheet-stale">
                {t("admin-courses:editor.sheetStale")}
              </p>
            ) : null}
            {sheetError === undefined ? null : (
              <p className="ah-form-field__error" role="alert">
                {sheetError}
              </p>
            )}
          </Card>
        </form>
      </div>
      {registering && storedResolved !== undefined ? (
        <RegisterSetupModal
          client={client}
          course={course}
          onClose={() => {
            setRegistering(false);
          }}
          onRefused={setupPermission.refused}
          onRegistered={(message) => {
            setRegistering(false);
            setSavedMessage(message);
          }}
          placement={storedResolved}
          rings={catalogRings}
          timeZone={branding.timeZone}
        />
      ) : null}
    </div>
  );
}
