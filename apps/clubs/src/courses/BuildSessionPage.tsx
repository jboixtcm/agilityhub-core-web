import {
  type ApiClient,
  ApiError,
  type components,
  saveFile,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import {
  nearestMarkers,
  type PlannerBuildObstacleStatus,
  type PlannerBuildSession,
  type PlannerRing,
} from "@agilityhub/course-ui";
import { useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Skeleton,
  type Tone,
} from "@agilityhub/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import "../booking/booking.css";
import { errorText, navigateInApp, useLoader } from "../booking/shared";

import "./courses.css";
import { coursePaths, isNotFound } from "./shared";
import { useCourseStore } from "./store";

type ObstacleStatus = PlannerBuildObstacleStatus["status"];
type ResolvedObstacle = components["schemas"]["ResolvedObstacle"];

/**
 * S16 §2 «toc = següent estat»: pending → placed → to check → pending. The contract's statuses
 * have no «verificat» (S16 §2); `NEEDS_CHECK` («per revisar») is the third tap. `CURRENT` and
 * `SKIPPED` (written by the AR app) go to placed.
 */
export function nextStatus(status: ObstacleStatus): ObstacleStatus {
  switch (status) {
    case "NOT_PLACED":
      return "PLACED";
    case "PLACED":
      return "NEEDS_CHECK";
    case "NEEDS_CHECK":
      return "NOT_PLACED";
    default:
      return "PLACED";
  }
}

const STATUS_TONES: Readonly<Record<ObstacleStatus, Tone>> = {
  CURRENT: "info",
  NEEDS_CHECK: "warning",
  NOT_PLACED: "neutral",
  PLACED: "success",
  SKIPPED: "neutral",
};

/** `at` of a state; a state without one (never written) is the oldest. */
function instant(state: PlannerBuildObstacleStatus | undefined): number {
  return state?.at == null ? Number.NEGATIVE_INFINITY : Date.parse(state.at);
}

/**
 * One obstacle's state as the phone shows it: a state older than the one shown never replaces it
 * (a late answer of a tap, or an event that crossed another phone's newer tap, R-16-11's
 * last-write-wins).
 */
function newer(
  current: PlannerBuildObstacleStatus | undefined,
  next: PlannerBuildObstacleStatus,
): boolean {
  return instant(next) >= instant(current);
}

function obstacleOrder(left: ResolvedObstacle, right: ResolvedObstacle): number {
  const first = (item: ResolvedObstacle) =>
    item.numbers.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...item.numbers);
  return first(left) - first(right) || left.obstacleId.localeCompare(right.obstacleId);
}

interface SessionContext {
  courseName: string;
  obstacles: ResolvedObstacle[];
  placement: components["schemas"]["Placement"];
  ring: PlannerRing | null;
  session: PlannerBuildSession;
}

/**
 * «Sessió de muntatge» (S16 §2, `/instructor/muntatge/:sessionId`, INSTRUCTOR · ADMIN; R-16-11):
 * the numbered obstacles of the placement with their status and where they go (metres from the
 * ring's origin, the heading, and the two nearest markers — what a builder measures with a tape);
 * a tap moves an obstacle to its next status (`PATCH`, last write wins); in live mode the other
 * phones' taps arrive through the store (the SSE stream, or its polling of `GET
 * /build-sessions/{id}`); the six-character code lets another phone join; [FINALITZA] closes it
 * and registers or refreshes the ring's setup (`POST …/finish`, one key per finish).
 */
export function BuildSessionPage({ client, sessionId }: { client: ApiClient; sessionId: string }) {
  const { t } = useTranslation(["courses", "enums", "errors", "common"]);
  const store = useCourseStore(client);
  const formats = useClubFormats();
  const keys = useSubmissionKeys();
  const load = useCallback(async (): Promise<SessionContext> => {
    const session = await store.getBuildSession(sessionId);
    // The store answers `null` for the api's 404 (another club's or an unknown session).
    if (session === null) {
      throw new ApiError({ code: "NOT_FOUND", message: "Build session not found", status: 404 });
    }
    const placement = (
      await client.GET("/placements/{id}", { params: { path: { id: session.placementId } } })
    ).data;
    if (placement === undefined) throw new TypeError("The placement response did not contain data");
    const [course, ring] = await Promise.all([
      client.GET("/courses/{id}", { params: { path: { id: placement.courseId } } }).then(
        (result) => result.data?.name ?? "",
        () => "",
      ),
      store.getRing(session.ringId).catch(() => null),
    ]);
    return {
      courseName: course,
      obstacles: [...placement.resolvedObstacles].sort(obstacleOrder),
      placement,
      ring,
      session,
    };
  }, [client, sessionId, store]);
  const context = useLoader(load);
  /** What changed since the session was read: taps' answers and the other phones' events. */
  const [live, setLive] = useState<ReadonlyMap<string, PlannerBuildObstacleStatus>>(new Map());
  /** The session read again (a poll, a reconnection, a finish of this phone or another). */
  const [session, setSession] = useState<PlannerBuildSession>();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string>();
  const [finishedMessage, setFinishedMessage] = useState<"finished" | "finishedNoSetup">();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const apply = useCallback((next: PlannerBuildObstacleStatus) => {
    setLive((current) => {
      if (!newer(current.get(next.obstacleId), next)) return current;
      const copy = new Map(current);
      copy.set(next.obstacleId, next);
      return copy;
    });
  }, []);

  const loaded = context.status === "ready" ? context.data.session : undefined;
  // Each obstacle shows its newest state: as read, or as changed since (never an older one).
  const states = useMemo(() => {
    const merged = new Map<string, PlannerBuildObstacleStatus>();
    for (const item of loaded?.obstacles ?? []) merged.set(item.obstacleId, item);
    for (const item of live.values()) {
      if (newer(merged.get(item.obstacleId), item)) merged.set(item.obstacleId, item);
    }
    return merged;
  }, [live, loaded]);
  const shownSession = session ?? loaded;
  const open =
    shownSession !== undefined &&
    shownSession.status !== "COMPLETED" &&
    shownSession.status !== "ABANDONED";
  useEffect(() => {
    if (loaded === undefined || !open) return undefined;
    // The other phones' taps (live mode): the store's transport, SSE or polling (INC-60).
    return store.subscribeBuildObstacleStatuses(loaded.id, apply, {
      onSession: (next) => {
        if (!mounted.current) return;
        setSession(next);
        for (const item of next.obstacles) apply(item);
      },
    });
  }, [apply, loaded, open, store]);

  if (context.status === "loading") {
    return (
      <section className="booking-screen course-screen">
        <SessionBar />
        <Skeleton height="16rem" label={t("courses:loading")} />
      </section>
    );
  }
  if (context.status === "error") {
    return (
      <section className="booking-screen course-screen">
        <SessionBar />
        {isNotFound(context.error) ? (
          <EmptyState
            description={t("courses:session.notFound")}
            title={t("common:unavailable.title")}
          />
        ) : (
          <Card className="booking-error" role="alert">
            <p>{errorText(t, context.error)}</p>
            <Button
              onClick={() => {
                context.refetch();
              }}
              variant="secondary"
            >
              {t("courses:retry")}
            </Button>
          </Card>
        )}
      </section>
    );
  }

  const { courseName, obstacles, placement, ring } = context.data;
  const current = shownSession ?? context.data.session;
  // R-16-11: the api makes a session IN_PROGRESS at its first change; the stream sends the
  // obstacles, not the session, so the page says so as soon as a change arrives.
  const shownStatus =
    current.status === "NOT_STARTED" && live.size > 0 ? "IN_PROGRESS" : current.status;
  const placedCount = obstacles.filter(
    (item) => states.get(item.obstacleId)?.status === "PLACED",
  ).length;
  // R-16-17: metres and degrees with the club locale's decimals.
  const metres = new Intl.NumberFormat(formats.locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  const degrees = new Intl.NumberFormat(formats.locale, { maximumFractionDigits: 0 });

  const tap = async (obstacleId: string) => {
    const state = states.get(obstacleId);
    const status = nextStatus(state?.status ?? "NOT_PLACED");
    setPending((items) => new Set(items).add(obstacleId));
    setError(undefined);
    try {
      apply(
        await store.upsertBuildObstacleStatus({
          buildSessionId: current.id,
          obstacleId,
          status,
          version: current.version,
        }),
      );
    } catch (cause) {
      if (!mounted.current) return;
      setError(errorText(t, cause));
      // A closed session (`BUILD_SESSION_FINISHED`): read it again, so the page shows it closed.
      void store.getBuildSession(current.id).then(
        (next) => {
          if (next !== null && mounted.current) setSession(next);
        },
        () => undefined,
      );
    } finally {
      if (mounted.current) {
        setPending((items) => {
          const copy = new Set(items);
          copy.delete(obstacleId);
          return copy;
        });
      }
    }
  };

  const finish = async () => {
    setFinishing(true);
    setError(undefined);
    try {
      const closed = await keys.send(`finish:${current.id}`, (key) =>
        store.finishBuildSession({ buildSessionId: current.id, submissionKey: key }),
      );
      if (closed.setupId != null) {
        navigateInApp(coursePaths.setup(closed.setupId), {
          notice: { messageKey: "courses:session.finished", tone: "success" },
        });
        return;
      }
      // An INSTRUCTOR with `courses.allowInstructorPublish` off: no setup registered (R-16-11).
      setSession(closed);
      setFinishedMessage("finishedNoSetup");
    } catch (cause) {
      setError(errorText(t, cause));
    } finally {
      if (mounted.current) setFinishing(false);
    }
  };

  const sheet = async () => {
    setError(undefined);
    try {
      saveFile(await store.getBuildSheet(placement.id), t("courses:session.sheetFile"));
    } catch (cause) {
      setError(errorText(t, cause));
    }
  };

  return (
    <section className="booking-screen course-screen course-session">
      <SessionBar />
      <Card className="course-card">
        <p className="course-card__heading">
          <strong>{courseName === "" ? t("courses:session.title") : courseName}</strong>
          <Badge tone={open ? "info" : "neutral"}>
            {t(`enums:buildSessionStatus.${shownStatus}`)}
          </Badge>
        </p>
        {ring === null ? null : <p className="course-card__line">{ring.name}</p>}
        {open ? (
          <p className="course-card__line course-session__code">
            {t("courses:session.code")}{" "}
            <strong className="course-session__code-value">{current.joinCode}</strong>
          </p>
        ) : null}
        <p className="course-card__line" role="status">
          {t("courses:session.progress", { placed: placedCount, total: obstacles.length })}
        </p>
      </Card>
      {finishedMessage === undefined && open ? null : (
        <p className="booking-note booking-note--success" role="status">
          {finishedMessage === "finishedNoSetup"
            ? t("courses:session.finishedNoSetup")
            : t("courses:session.closed")}
          {finishedMessage === undefined && current.setupId != null ? (
            <>
              {" "}
              <a
                href={coursePaths.setup(current.setupId)}
                onClick={(event) => {
                  event.preventDefault();
                  if (current.setupId != null) navigateInApp(coursePaths.setup(current.setupId));
                }}
              >
                {t("courses:session.openSetup")}
              </a>
            </>
          ) : null}
        </p>
      )}
      {error === undefined ? null : (
        <p className="booking-note booking-note--danger" role="alert">
          {error}
        </p>
      )}
      <ol aria-label={t("courses:session.obstacles")} className="course-obstacles">
        {obstacles.map((obstacle) => {
          const state = states.get(obstacle.obstacleId);
          const status = state?.status ?? "NOT_PLACED";
          const markers = ring === null ? [] : nearestMarkers(ring, obstacle.x, obstacle.y);
          const number =
            obstacle.numbers.length === 0
              ? t("courses:session.unnumbered")
              : obstacle.numbers.join(t("courses:session.numberSeparator"));
          const where = [
            t("courses:session.position", {
              x: metres.format(obstacle.x),
              y: metres.format(obstacle.y),
            }),
            t("courses:session.heading", { degrees: degrees.format(obstacle.rotationDeg) }),
            ...markers.map((marker) =>
              t("courses:session.marker", {
                label: marker.label,
                metres: metres.format(marker.distance),
              }),
            ),
          ].join(t("courses:separator"));
          return (
            <li className="course-obstacle" key={obstacle.obstacleId}>
              <button
                aria-label={t("courses:session.tap", {
                  next: t(`enums:buildObstacleStatus.${nextStatus(status)}`),
                  number,
                  status: t(`enums:buildObstacleStatus.${status}`),
                  type: t(`enums:obstacleType.${obstacle.type}`),
                })}
                aria-busy={pending.has(obstacle.obstacleId) || undefined}
                className="course-obstacle__button"
                disabled={!open || pending.has(obstacle.obstacleId) || finishing}
                onClick={() => void tap(obstacle.obstacleId)}
                type="button"
              >
                <span className="course-obstacle__number">{number}</span>
                <span className="course-obstacle__body">
                  <span className="course-obstacle__type">
                    {t(`enums:obstacleType.${obstacle.type}`)}
                  </span>
                  <span className="course-obstacle__where">{where}</span>
                </span>
                <Badge tone={STATUS_TONES[status]}>
                  {t(`enums:buildObstacleStatus.${status}`)}
                </Badge>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="course-actions">
        {open ? (
          <Button
            disabled={pending.size > 0}
            loading={finishing}
            loadingLabel={t("courses:sending")}
            onClick={() => void finish()}
          >
            {t("courses:session.finish")}
          </Button>
        ) : null}
        {placement.buildSheetFileKey == null ? null : (
          <Button onClick={() => void sheet()} variant="secondary">
            {t("courses:session.sheet")}
          </Button>
        )}
      </div>
    </section>
  );
}

function SessionBar() {
  const { t } = useTranslation("courses");
  return (
    <AppBar
      className="booking-screen__bar"
      end={
        <IconButton
          className="booking-screen__close"
          icon="x"
          label={t("courses:close")}
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else navigateInApp("/instructor/avui");
          }}
        />
      }
      title={<h1>{t("courses:session.title")}</h1>}
    />
  );
}
