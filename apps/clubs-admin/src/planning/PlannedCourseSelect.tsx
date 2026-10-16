import type { ApiClient } from "@agilityhub/api-client";
import { Select, useBranding } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface PlannedCourseOption {
  id: string;
  label: string;
}

/** S16 R-16-15: «Recorregut previst» exists only with COURSES. */
export function useCoursesModule(): boolean {
  return useBranding().modules.includes("COURSES");
}

/**
 * The placements a class on `ringId` can plan (R-16-13: a placement of the class's own ring), each
 * named by its course and its own name. The select is only mounted with COURSES; no ring, none.
 */
function usePlannedCourses(client: ApiClient, ringId: string | null) {
  const { t } = useTranslation("admin-scheduling");
  /** The answer for the ring it was read for: another ring shows «loading» until its own. */
  const [read, setRead] = useState<{
    failed: boolean;
    options: PlannedCourseOption[];
    ringId: string;
  }>();
  useEffect(() => {
    if (ringId === null) return undefined;
    let active = true;
    Promise.all([
      client.GET("/placements", { params: { query: { ringId } } }),
      client.GET("/courses", { params: { query: { fields: "id,name", size: 200 } } }),
    ]).then(
      ([placements, courses]) => {
        if (!active) return;
        const names = new Map(
          (courses.data?.items ?? []).map((item) => [item.id, item.name ?? ""]),
        );
        setRead({
          failed: false,
          options: (placements.data ?? [])
            .filter((placement) => placement.status !== "ARCHIVED")
            .map((placement) => {
              const course = names.get(placement.courseId) ?? "";
              const name = placement.name ?? "";
              return {
                id: placement.id,
                label:
                  name === "" || name === course
                    ? course
                    : t("admin-scheduling:plannedCourse.option", { course, name }),
              };
            }),
          ringId,
        });
      },
      () => {
        if (active) setRead({ failed: true, options: [], ringId });
      },
    );
    return () => {
      active = false;
    };
  }, [client, ringId, t]);
  if (ringId === null) return { failed: false, options: [] };
  return read?.ringId === ringId
    ? { failed: read.failed, options: read.options }
    : { failed: false, options: undefined };
}

/**
 * S16 R-16-13 «Recorregut previst» of a class (D3 and D4): `null` = none; the options are the
 * placements of the class's ring. A value the list does not hold (still loading, or the ring just
 * changed) stays shown, so a save never drops it silently.
 */
export function PlannedCourseSelect({
  className,
  client,
  describedBy,
  disabled = false,
  id,
  onChange,
  ringId,
  value,
}: {
  className?: string;
  client: ApiClient;
  /** The id of the error said under the select (`aria-describedby`). */
  describedBy?: string | undefined;
  disabled?: boolean;
  id?: string;
  onChange: (placementId: string | null) => void;
  ringId: string | null;
  value: string | null;
}) {
  const { t } = useTranslation("admin-scheduling");
  const { failed, options } = usePlannedCourses(client, ringId);
  const known = options?.some((option) => option.id === value) ?? false;
  return (
    <>
      <Select
        aria-busy={options === undefined || undefined}
        aria-describedby={describedBy}
        aria-invalid={describedBy === undefined ? undefined : true}
        {...(className === undefined ? {} : { className })}
        disabled={disabled || ringId === null}
        {...(id === undefined ? {} : { id })}
        onChange={(event) => {
          const next = event.currentTarget.value;
          onChange(next === "" ? null : next);
        }}
        value={value ?? ""}
      >
        <option value="">{t("admin-scheduling:plannedCourse.none")}</option>
        {value !== null && !known ? (
          <option value={value}>
            {options === undefined
              ? t("admin-scheduling:plannedCourse.loading")
              : t("admin-scheduling:plannedCourse.unknown")}
          </option>
        ) : null}
        {(options ?? []).map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </Select>
      {failed ? (
        <span className="ah-form-field__error" role="alert">
          {t("admin-scheduling:plannedCourse.error")}
        </span>
      ) : null}
    </>
  );
}
