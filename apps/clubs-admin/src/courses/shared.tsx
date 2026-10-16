import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { CoreApiStore } from "@agilityhub/api-client/core-api-store";
import {
  centerCourseInRing,
  type CourseData,
  type CoursePlacement,
  type ObstacleType,
  placeObstacleInRing,
  type Warning,
} from "@agilityhub/course-core";
import {
  type BuildSheetLabels,
  configurePlannerStore,
  type MarkerSheetLabels,
  type PlannerRing,
  type PlannerRingDoor,
  ringToCore,
} from "@agilityhub/course-ui";
import { useClubFormats, useCourseTexts } from "@agilityhub/i18n";
import { useBranding } from "@agilityhub/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export type Course = components["schemas"]["Course"];
export type CourseListItem = components["schemas"]["CourseListItem"];
export type Placement = components["schemas"]["Placement"];
export type RingSetup = components["schemas"]["RingSetup"];
export type RingGeometry = components["schemas"]["RingGeometry"];
export type Ring = components["schemas"]["Ring"];
export type Discipline = Course["discipline"];
export type SetupKind = RingSetup["kind"];
export type AgilityhubLevel = NonNullable<Course["agilityhubLevel"]>;

export const DISCIPLINES: readonly Discipline[] = ["AGILITY", "JUMPING", "OTHER"];
export const AGILITYHUB_LEVELS: readonly AgilityhubLevel[] = ["EASY", "MEDIUM", "HARD"];
export const SETUP_KINDS: readonly SetupKind[] = [
  "AGILITY",
  "JUMPING",
  "FUN",
  "OBSTACLE_DRILL",
  "EMPTY",
];
export const COURSE_SOURCES: readonly Course["source"][] = [
  "SMARTER",
  "EDITOR",
  "IMAGE",
  "AGILITYHUB_COPY",
];

/** The kind a setup of a course takes by default: its discipline (R-16-11 does the same). */
export function kindOf(discipline: Discipline): SetupKind {
  return discipline === "AGILITY" ? "AGILITY" : discipline === "JUMPING" ? "JUMPING" : "FUN";
}

/**
 * The production `PlannerStore` for the course-ui components of D16/D18: the club is the only
 * venue (S16 §14.2), named after the branding (its `slug` is the venue id the store matches).
 */
export function useCourseStore(client: ApiClient): CoreApiStore {
  const branding = useBranding();
  const { city, name, slug } = branding.club;
  const store = useMemo(
    () =>
      new CoreApiStore({
        client,
        venue: { city: city ?? null, id: slug, locale: branding.defaultLocale, name, slug },
      }),
    [branding.defaultLocale, city, client, name, slug],
  );
  // The course-ui editors (doors, inventory, upload) read the store through `getPlannerStore`.
  configurePlannerStore(store);
  return store;
}

/** An api failure in the reader's language, by its code (the shared course mapper). */
export function useCourseError(): (error: unknown) => string {
  return useCourseTexts().errorText;
}

export function apiCode(error: unknown): string | undefined {
  return isApiError(error) ? error.code : undefined;
}

/** A ring as course-ui draws a course on its own: the course's design size, nothing else. */
export function courseFrameRing(course: CourseData): PlannerRing {
  return {
    border_clearance_m: 0,
    created_at: "",
    default_units: "m",
    doors: [],
    geometry_version: 0,
    id: `course-frame-${course.id}`,
    is_active: true,
    length_m: course.designLengthMeters,
    markers: [],
    name: course.title,
    no_go_zones: [],
    notes: null,
    obstacle_inventory: [],
    surface: null,
    updated_at: "",
    venue_id: "",
    width_m: course.designWidthMeters,
  };
}

/** The course centred in its own frame (the viewer's placement). */
export function framePlacement(course: CourseData, ring: PlannerRing): CoursePlacement {
  return centerCourseInRing(course, ringToCore(ring));
}

export function isCourseData(value: unknown): value is CourseData {
  return typeof value === "object" && value !== null && "obstacles" in value && "numbers" in value;
}

/** The labels the course texts share: obstacle types, disciplines, levels, kinds… */
export function useCourseLabels() {
  const { t } = useTranslation(["admin-courses", "enums"]);
  return useMemo(
    () => ({
      discipline: (value: Discipline) => t(`enums:courseDiscipline.${value}`),
      level: (value: string | null | undefined) =>
        value === null || value === undefined
          ? t("admin-courses:common.none")
          : (AGILITYHUB_LEVELS as readonly string[]).includes(value)
            ? t(`enums:agilityhubLevel.${value}`)
            : value,
      obstacle: (type: ObstacleType) => t(`enums:obstacleType.${type}`),
      setupKind: (kind: string) => t(`enums:setupKind.${kind}`, { defaultValue: kind }),
      setupStatus: (status: RingSetup["status"]) => t(`enums:setupStatus.${status}`),
      source: (source: Course["source"]) => t(`enums:courseSource.${source}`),
    }),
    [t],
  );
}

/**
 * A warning of course-core's engine in the reader's language (R-16-17): what it is about (the
 * obstacle by its number and type, the door, the zone) and what is wrong. course-core's own
 * `message` is English and never shown.
 */
export function useWarningText(course: CourseData | null, ring: PlannerRing | null) {
  const { t } = useTranslation(["admin-courses", "enums"]);
  const labels = useCourseLabels();
  return (warning: Warning): string => {
    const obstacle = course?.obstacles.find((item) => item.sourceId === warning.obstacleSourceId);
    const numbers = course?.numbers
      .filter((number) => number.linkedObstacleSourceId === warning.obstacleSourceId)
      .map((number) => number.text)
      .join("/");
    const named =
      obstacle === undefined
        ? t("admin-courses:warnings.anObstacle")
        : numbers === undefined || numbers === ""
          ? t("admin-courses:warnings.obstacleUnnumbered", {
              type: labels.obstacle(obstacle.obstacleType),
            })
          : t("admin-courses:warnings.obstacle", {
              numbers,
              type: labels.obstacle(obstacle.obstacleType),
            });
    const door = ring?.doors.find((item) => item.id === warning.doorId)?.label ?? "";
    const zone = ring?.no_go_zones.find((item) => item.id === warning.ringNoGoZoneId)?.label ?? "";
    const count = Math.round(warning.distanceMeters ?? 0);
    switch (warning.ruleId) {
      case "outside-ring":
        return t("admin-courses:warnings.outsideRing", { obstacle: named });
      case "border-clearance":
        return t("admin-courses:warnings.borderClearance", { obstacle: named });
      case "course-no-go":
        return t("admin-courses:warnings.courseNoGo", { obstacle: named });
      case "ring-no-go":
        return t("admin-courses:warnings.ringNoGo", { obstacle: named, zone });
      case "door-clearance":
        return warning.id.startsWith("door-clearance-inside")
          ? t("admin-courses:warnings.doorBlocked", { door, obstacle: named })
          : t("admin-courses:warnings.doorClearance", { door, obstacle: named });
      case "course-larger-than-ring":
        return t("admin-courses:warnings.courseLarger");
      case "obstacle-inventory": {
        if (warning.id === "obstacle-inventory:not-configured") {
          return t("admin-courses:warnings.inventoryNotConfigured");
        }
        if (warning.id === "obstacle-inventory:unknown-types") {
          return t("admin-courses:warnings.inventoryUnknown", { count });
        }
        const type = warning.id.split(":")[1] as ObstacleType | undefined;
        return t("admin-courses:warnings.inventoryShort", {
          count,
          type: type === undefined ? "" : labels.obstacle(type),
        });
      }
    }
  };
}

/** Lengths in metres with the club locale's decimals (R-16-17: always metres, through Intl). */
export function useMetres() {
  const { locale } = useClubFormats();
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
    return (value: number) => format.format(value);
  }, [locale]);
}

/** The build sheet's and the marker sheet's texts (R-16-10, A8b), in the reader's language. */
export function useSheetLabels() {
  const { t } = useTranslation(["admin-courses", "enums"]);
  const labels = useCourseLabels();
  const metres = useMetres();
  const { locale } = useClubFormats();
  return useMemo(() => {
    const degrees = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const door = (item: PlannerRingDoor) =>
      t("admin-courses:sheet.door", {
        end: metres(item.end_m ?? 0),
        flow: t(`enums:doorFlow.${(item.flow ?? "both").toUpperCase()}`),
        label: item.label,
        side: t(`enums:doorSide.${(item.side ?? "north").toUpperCase()}`),
        start: metres(item.start_m ?? 0),
      });
    const page = (current: number, total: number) =>
      t("admin-courses:sheet.page", { page: current, total });
    return {
      build: (heading: string, subheading: string): BuildSheetLabels => ({
        columns: {
          heading: t("admin-courses:sheet.columns.heading"),
          markers: t("admin-courses:sheet.columns.markers"),
          number: t("admin-courses:sheet.columns.number"),
          obstacle: t("admin-courses:sheet.columns.obstacle"),
          x: t("admin-courses:sheet.columns.x"),
          y: t("admin-courses:sheet.columns.y"),
        },
        degrees: (value) => t("admin-courses:sheet.degrees", { value: degrees.format(value) }),
        documentTitle: t("admin-courses:sheet.buildTitle"),
        door,
        doorsTitle: t("admin-courses:sheet.doors"),
        heading,
        inventoryRow: (type, count) => t("admin-courses:sheet.inventoryRow", { count, type }),
        inventoryTitle: t("admin-courses:sheet.inventory"),
        markerDistance: (label, value) =>
          t("admin-courses:sheet.markerDistance", { label, metres: value }),
        metres,
        none: t("admin-courses:sheet.none"),
        notesTitle: t("admin-courses:sheet.notes"),
        obstacle: labels.obstacle,
        obstaclesTitle: t("admin-courses:sheet.obstacles"),
        page,
        plan: t("admin-courses:sheet.plan"),
        producer: "AgilityHub",
        subheading,
      }),
      markers: (ringName: string): MarkerSheetLabels => ({
        documentTitle: t("admin-courses:markerSheet.title", { ring: ringName }),
        identifiers: (uid, tag) => t("admin-courses:markerSheet.identifiers", { tag, uid }),
        instructions: t("admin-courses:markerSheet.instructions"),
        marker: (label) => t("admin-courses:markerSheet.marker", { label }),
        page,
        position: (marker) =>
          t("admin-courses:markerSheet.position", { x: metres(marker.x_m), y: metres(marker.y_m) }),
        producer: "AgilityHub",
        size: (mm) => t("admin-courses:markerSheet.size", { mm }),
      }),
    };
  }, [labels.obstacle, locale, metres, t]);
}

/** A PDF made in the browser, saved under `fileName` (object URL, hidden link). */
export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/** A file name from a course or ring name: lower case, ASCII, dashes. */
export function fileSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
  return slug === "" ? "recorregut" : slug;
}

/**
 * The list's thumbnail of a course (S16 §3: generated on the client when it is saved): its plan
 * on the club's course-floor colour, as a PNG. `null` where no `OffscreenCanvas` exists (tests,
 * old browsers); the course is saved all the same and the list shows its placeholder.
 */
export async function courseThumbnail(course: CourseData): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "function") return null;
  const width = 320;
  const scale = width / (course.designLengthMeters + 2);
  const height = Math.round((course.designWidthMeters + 2) * scale);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (context === null) return null;
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();
  context.fillStyle = token("--ah-color-course-floor");
  context.fillRect(0, 0, width, height);
  context.strokeStyle = token("--ah-color-course-ring");
  context.lineWidth = 2;
  context.strokeRect(
    scale,
    scale,
    course.designLengthMeters * scale,
    course.designWidthMeters * scale,
  );
  const frame = courseFrameRing(course);
  const placement = framePlacement(course, frame);
  context.fillStyle = token("--ah-color-course-obstacle");
  for (const obstacle of course.obstacles) {
    const point = placeObstacleInRing(obstacle, placement, course);
    if (point === null) continue;
    context.beginPath();
    context.arc((point.x + 1) * scale, height - (point.y + 1) * scale, 0.6 * scale, 0, Math.PI * 2);
    context.fill();
  }
  return canvas.convertToBlob({ type: "image/png" });
}
