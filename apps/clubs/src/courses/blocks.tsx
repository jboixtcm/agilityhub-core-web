/**
 * S16 §2 «Integracions» (E9-W04): the course blocks of screens 08, 07, 10 and 23. A light module
 * (no course-core, no course-ui): it is part of the members' app start; the viewer it opens is the
 * lazy course chunk. Everything here exists only with COURSES (R-16-15) and shows what the api
 * returned, which already applies `courses.showSetupToMembers` for a MEMBER (R-16-09).
 */
import type { ApiClient, components } from "@agilityhub/api-client";
import { type DayGridColumnAction, Icon, useBranding } from "@agilityhub/ui";
import { type CSSProperties, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { navigateInApp, useLoader } from "../booking/shared";

import "./blocks.css";
import {
  coursePaths,
  levelNamesLabel,
  type MeRingSetupSummary,
  readMeRingSetup,
  type RingSetupSummary,
  setupLine,
} from "./shared";

type TrainingRing = components["schemas"]["TrainingRing"];
type DayGridColumn = components["schemas"]["DayGridColumn"];

function open(path: string) {
  return (event: { preventDefault: () => void }) => {
    event.preventDefault();
    navigateInApp(path);
  };
}

/**
 * Screen 08 (S09 R-09-15, S16 §2): under the ring chips, one line per ring with a course set up —
 * «Muntanya: Jumping · nivell C–D · muntat ahir» — that opens the viewer. The chip itself keeps
 * selecting the ring to book.
 */
export function TrainingSetupLines({ rings }: { rings: readonly TrainingRing[] }) {
  const { t } = useTranslation(["courses", "enums"]);
  const branding = useBranding();
  if (!branding.modules.includes("COURSES")) return null;
  const withSetup = rings.flatMap((ring) =>
    ring.setup === null || ring.setup === undefined ? [] : [{ ring, setup: ring.setup }],
  );
  if (withSetup.length === 0) return null;
  return (
    <ul aria-label={t("courses:blocks.trainingTitle")} className="course-blocks">
      {withSetup.map(({ ring, setup }: { ring: TrainingRing; setup: RingSetupSummary }) => (
        <li key={ring.id}>
          <a
            className="course-blocks__line"
            href={coursePaths.setup(setup.id)}
            onClick={open(coursePaths.setup(setup.id))}
          >
            <span
              aria-hidden="true"
              className="course-blocks__dot"
              style={{ "--course-ring-color": ring.color } as CSSProperties}
            />
            <Icon aria-hidden="true" className="course-blocks__icon" name="flag" />
            <span className="course-blocks__text">
              {t("courses:blocks.ringLine", {
                ring: ring.name,
                setup: setupLine(
                  t,
                  {
                    builtAt: setup.builtAt,
                    kind: setup.kind,
                    level: levelNamesLabel(setup.levelNames),
                  },
                  branding.timeZone,
                ),
              })}
            </span>
            <Icon aria-hidden="true" className="course-blocks__chev" name="chev" />
          </a>
        </li>
      ))}
    </ul>
  );
}

interface BookingCourses {
  planned: components["schemas"]["PlannedPlacement"] | null;
  setup: MeRingSetupSummary | null;
}

/**
 * Screen 07 (S16 §2, R-16-13): «A la pista hi ha muntat: …» when the class's ring has an active
 * setup (→ the viewer), and «Recorregut previst: …» when the class plans a placement (the member
 * view's `plannedPlacement`, only with `courses.showSetupToMembers`). Nothing while loading or if
 * the reads fail: the booking's own detail never waits for them.
 */
export function BookingCourseLines({
  classSessionId,
  client,
}: {
  classSessionId: string;
  client: ApiClient;
}) {
  const { t } = useTranslation(["courses", "enums"]);
  const branding = useBranding();
  const enabled = branding.modules.includes("COURSES");
  const load = useCallback(async (): Promise<BookingCourses> => {
    if (!enabled) return { planned: null, setup: null };
    const session = (
      await client.GET("/class-sessions/{id}", { params: { path: { id: classSessionId } } })
    ).data;
    const ringId = session?.ring?.id;
    const planned =
      session !== undefined && "plannedPlacement" in session
        ? (session.plannedPlacement ?? null)
        : null;
    const setup =
      ringId === undefined ? null : await readMeRingSetup(client, ringId).catch(() => null);
    return { planned, setup };
  }, [classSessionId, client, enabled]);
  const courses = useLoader(load);
  if (!enabled || courses.status !== "ready") return null;
  const { planned, setup } = courses.data;
  if (planned === null && setup === null) return null;
  return (
    <div className="course-blocks course-blocks--detail">
      {setup === null ? null : (
        <a
          className="course-blocks__line"
          href={coursePaths.setup(setup.id)}
          onClick={open(coursePaths.setup(setup.id))}
        >
          <Icon aria-hidden="true" className="course-blocks__icon" name="flag" />
          <span className="course-blocks__text">
            {t("courses:blocks.bookingSetup", {
              setup: setupLine(
                t,
                { builtAt: setup.builtAt, kind: setup.kind, level: setup.levelLabel },
                branding.timeZone,
              ),
            })}
          </span>
          <Icon aria-hidden="true" className="course-blocks__chev" name="chev" />
        </a>
      )}
      {planned === null ? null : (
        <p className="course-blocks__line course-blocks__line--plain">
          <Icon aria-hidden="true" className="course-blocks__icon" name="flag" />
          <span className="course-blocks__text">
            {t("courses:blocks.bookingPlanned", { course: planned.courseName })}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Screen 24 (S16 §13-3: the cone in the ring's header): «Registra què hi ha muntat» for the ring
 * the instructor is on, only with COURSES.
 */
export function RegisterSetupLink({ ringId, ringName }: { ringId: string; ringName: string }) {
  const { t } = useTranslation("courses");
  const branding = useBranding();
  if (!branding.modules.includes("COURSES")) return null;
  return (
    <a
      className="course-blocks__line course-blocks__line--register"
      href={coursePaths.register(ringId)}
      onClick={open(coursePaths.register(ringId))}
    >
      <Icon aria-hidden="true" className="course-blocks__icon" name="cone" />
      <span className="course-blocks__text">
        {t("courses:blocks.registerOn", { ring: ringName })}
      </span>
      <Icon aria-hidden="true" className="course-blocks__chev" name="chev" />
    </a>
  );
}

/**
 * Screens 10 and 23 (S06 §2, S16 §2): the course icon in the header of a ring's column → the
 * viewer of its active setup (`DayGridColumn.activeSetupId`, only with COURSES). On 23 every ring
 * column of an instructor also offers what S16 §13-3 assumes: the cone → «Registra què hi ha
 * muntat» when the ring has none.
 */
export function useSetupColumnAction(
  staff: boolean,
): ((column: DayGridColumn) => DayGridColumnAction | undefined) | undefined {
  const { t } = useTranslation("courses");
  const branding = useBranding();
  const enabled = branding.modules.includes("COURSES");
  return useMemo(() => {
    if (!enabled) return undefined;
    return (column: DayGridColumn) => {
      const ringId = column.ringId ?? null;
      if (ringId === null) return undefined;
      const setupId = column.activeSetupId ?? null;
      if (setupId !== null) {
        return {
          icon: "flag",
          label: t("courses:blocks.columnSetup", { ring: column.name }),
          onPress: () => {
            navigateInApp(coursePaths.setup(setupId));
          },
        };
      }
      if (!staff) return undefined;
      return {
        icon: "cone",
        label: t("courses:blocks.columnRegister", { ring: column.name }),
        onPress: () => {
          navigateInApp(coursePaths.register(ringId));
        },
      };
    };
  }, [enabled, staff, t]);
}
