import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/** The `ruleId`s of course-core's warning engine (`WarningRuleId`, S16 R-16-05, §14.4). */
export type CourseWarningRule =
  | "border-clearance"
  | "course-larger-than-ring"
  | "course-no-go"
  | "door-clearance"
  | "obstacle-inventory"
  | "outside-ring"
  | "ring-no-go";

type Translate = (key: string, options?: { defaultValue?: string }) => string;

/** The texts `@agilityhub/course-ui` takes from its caller that are shared by every screen. */
export interface CourseTexts {
  /**
   * An api failure by its `code` (`errors:<CODE>`, never the api `message`): `STALE_VERSION`,
   * `GEOMETRY_INVALID`, `FILE_TOO_LARGE`, `PLACEMENT_BLOCKED`… each read its own catalog text; a
   * keyed write still running reads `common:inProgress` (CONVENCIONS_API §7); a network failure or
   * an unknown code, the generic `errors:INTERNAL_ERROR`.
   */
  errorText: (error: unknown) => string;
  /** A warning's rule in the reader's language (R-16-17), never its identifier. */
  warningRule: (ruleId: CourseWarningRule) => string;
}

/** The `code` of an answer the api gave (an `ApiError` with a status); none for a network failure. */
function apiCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { code, status } = error as { code?: unknown; status?: unknown };
  return typeof code === "string" && typeof status === "number" && status !== 0 ? code : undefined;
}

function inProgress(error: unknown, code: string | undefined): boolean {
  if (code !== "IDEMPOTENCY_KEY_REUSED") return false;
  const { details } = error as { details?: unknown };
  return (
    typeof details === "object" &&
    details !== null &&
    (details as { reason?: unknown }).reason === "IN_PROGRESS"
  );
}

export function createCourseTexts(t: Translate): CourseTexts {
  const rules: Readonly<Record<CourseWarningRule, string>> = {
    "border-clearance": t("enums:courseWarningRule.border-clearance"),
    "course-larger-than-ring": t("enums:courseWarningRule.course-larger-than-ring"),
    "course-no-go": t("enums:courseWarningRule.course-no-go"),
    "door-clearance": t("enums:courseWarningRule.door-clearance"),
    "obstacle-inventory": t("enums:courseWarningRule.obstacle-inventory"),
    "outside-ring": t("enums:courseWarningRule.outside-ring"),
    "ring-no-go": t("enums:courseWarningRule.ring-no-go"),
  };
  const generic = t("errors:INTERNAL_ERROR");
  return {
    errorText: (error) => {
      const code = apiCode(error);
      if (code === undefined) return generic;
      return inProgress(error, code)
        ? t("common:inProgress")
        : t(`errors:${code}`, { defaultValue: generic });
    },
    warningRule: (ruleId) => rules[ruleId],
  };
}

/** `createCourseTexts` for the reader's language (D16, D18 and the mobile course screens). */
export function useCourseTexts(): CourseTexts {
  const { t } = useTranslation(["enums", "errors", "common"]);
  return useMemo(() => createCourseTexts((key, options) => t(key, options ?? {})), [t]);
}
