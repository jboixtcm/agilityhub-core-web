import { type ApiClient, type components, isApiError, saveFile } from "@agilityhub/api-client";
import { Button, Card, FormField, Icon, Modal, Select, Skeleton } from "@agilityhub/ui";
import { type SyntheticEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { fileSlug } from "../file-names";

type Placement = components["schemas"]["Placement"];
type CourseListItem = components["schemas"]["CourseListItem"];
type Ring = components["schemas"]["Ring"];

function editorPath(courseId: string, query: string): string {
  return `/recorreguts/${encodeURIComponent(courseId)}/col-locacio?${query}`;
}

/**
 * D7 «Col·locacions» (S16 §2, R-16-13): the activity's placements (`GET /placements?activityId`),
 * each opening D18's editor, and [Afegeix] — a course of the library placed for this activity
 * (`?activitat=` on the editor). Shown only with COURSES; an INSTRUCTOR reads it without [Afegeix],
 * as the rest of D7.
 */
export function ActivityPlacementsCard({
  activityId,
  client,
  onNavigate,
  placementIds,
  readOnly,
  rings,
}: {
  activityId: string;
  client: ApiClient;
  onNavigate: (path: string) => void;
  /** `Activity.placementIds`: a change reloads the list. */
  placementIds: readonly string[];
  readOnly: boolean;
  rings: readonly Ring[];
}) {
  const { t } = useTranslation(["admin-activities", "errors"]);
  const [adding, setAdding] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [sheet, setSheet] = useState<{ id: string; error?: string }>();
  const key = `${activityId}|${placementIds.join(",")}`;
  /** The answer for the activity and placements it was read for (a change reads again). */
  const [read, setRead] = useState<{
    courses: CourseListItem[];
    error: boolean;
    key: string;
    placements: Placement[];
  }>();

  useEffect(() => {
    let active = true;
    Promise.all([
      client.GET("/placements", { params: { query: { activityId } } }),
      client.GET("/courses", {
        params: { query: { fields: "id,name,ownerType", size: 200, sort: ["name,asc"] } },
      }),
    ]).then(
      ([placementAnswer, courseAnswer]) => {
        if (!active) return;
        setRead({
          courses: courseAnswer.data?.items ?? [],
          error: false,
          key,
          placements: placementAnswer.data ?? [],
        });
      },
      () => {
        if (active) setRead({ courses: [], error: true, key, placements: [] });
      },
    );
    return () => {
      active = false;
    };
  }, [activityId, client, key]);

  const current = read?.key === key ? read : undefined;
  const placements = current?.placements;
  const courses = current?.courses ?? [];
  const error = current?.error === true;

  const courseName = (id: string) => courses.find((course) => course.id === id)?.name ?? "";
  const ringName = (id: string) => rings.find((ring) => ring.id === id)?.name ?? "";
  // A course of the club can be placed for the activity (the AgilityHub library is copied first).
  const placeable = courses.filter((course) => course.ownerType !== "AGILITYHUB");

  /** R-16-10: the build sheet the placement stores, as the api keeps it (`application/pdf`). */
  const downloadSheet = (placement: Placement) => {
    setSheet({ id: placement.id });
    client
      .GET("/placements/{id}/build-sheet", {
        params: { path: { id: placement.id } },
        parseAs: "blob",
      })
      .then(
        (answer) => {
          if (answer.data !== undefined) {
            saveFile(
              answer.data,
              t("admin-activities:placements.sheetFile", {
                course: fileSlug(
                  courseName(placement.courseId),
                  t("admin-activities:placements.sheetFallback"),
                ),
              }),
            );
          }
          setSheet(undefined);
        },
        (cause: unknown) => {
          setSheet({
            error: isApiError(cause)
              ? t(`errors:${cause.code}`, { defaultValue: t("admin-activities:placements.error") })
              : t("admin-activities:placements.error"),
            id: placement.id,
          });
        },
      );
  };

  const add = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (courseId === "") return;
    onNavigate(editorPath(courseId, `activitat=${encodeURIComponent(activityId)}`));
  };

  return (
    <Card aria-labelledby="activity-placements-title" className="activity-card" role="region">
      <div className="activity-card__header">
        <h2 className="activity-card__title" id="activity-placements-title">
          {t("admin-activities:placements.title")}
        </h2>
        {readOnly ? null : (
          <Button
            onClick={() => {
              setCourseId(placeable[0]?.id ?? "");
              setAdding(true);
            }}
            variant="secondary"
          >
            <Icon aria-hidden="true" name="plus" />
            {t("admin-activities:placements.add")}
          </Button>
        )}
      </div>
      {error ? (
        <p className="ah-form-field__error" role="alert">
          {t("admin-activities:placements.error")}
        </p>
      ) : placements === undefined ? (
        <Skeleton height="2.5rem" label={t("admin-activities:placements.loading")} />
      ) : placements.length === 0 ? (
        <p>{t("admin-activities:placements.empty")}</p>
      ) : (
        <ul className="activity-placements">
          {placements.map((placement) => {
            const path = editorPath(
              placement.courseId,
              `colocacio=${encodeURIComponent(placement.id)}`,
            );
            return (
              <li key={placement.id}>
                <a
                  href={path}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(path);
                  }}
                >
                  {placement.name == null || placement.name === ""
                    ? t("admin-activities:placements.row", {
                        course: courseName(placement.courseId),
                        ring: ringName(placement.ringId),
                      })
                    : t("admin-activities:placements.rowNamed", {
                        course: courseName(placement.courseId),
                        name: placement.name,
                        ring: ringName(placement.ringId),
                      })}
                </a>
                {placement.buildSheetFileKey == null ? null : (
                  <Button
                    loading={sheet?.id === placement.id && sheet.error === undefined}
                    loadingLabel={t("admin-activities:placements.sheetPending")}
                    onClick={() => {
                      downloadSheet(placement);
                    }}
                    variant="ghost"
                  >
                    <Icon aria-hidden="true" name="doc" />
                    {t("admin-activities:placements.sheet")}
                  </Button>
                )}
                {sheet?.id === placement.id && sheet.error !== undefined ? (
                  <p className="ah-form-field__error" role="alert">
                    {sheet.error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <Modal
          closeLabel={t("admin-activities:common.close")}
          onClose={() => {
            setAdding(false);
          }}
          open
          title={t("admin-activities:placements.addTitle")}
        >
          <form className="activity-placements__form" onSubmit={add}>
            <FormField
              id="activity-placement-course"
              label={t("admin-activities:placements.course")}
            >
              <Select
                id="activity-placement-course"
                onChange={(event) => {
                  setCourseId(event.currentTarget.value);
                }}
                value={courseId}
              >
                {placeable.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name ?? course.id}
                  </option>
                ))}
              </Select>
            </FormField>
            {placeable.length === 0 ? <p>{t("admin-activities:placements.noCourses")}</p> : null}
            <div className="activity-modal__actions">
              <Button
                onClick={() => {
                  setAdding(false);
                }}
                variant="ghost"
              >
                {t("admin-activities:common.back")}
              </Button>
              <Button disabled={courseId === ""} type="submit">
                {t("admin-activities:placements.place")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </Card>
  );
}
