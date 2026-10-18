import {
  type ApiClient,
  isApiError,
  useActiveRings,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { plannerPlacement } from "@agilityhub/api-client/core-api-store";
import { useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Skeleton,
  useBranding,
} from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import "../booking/booking.css";
import { errorText, navigateInApp, noticeText, pageNotice, useLoader } from "../booking/shared";

import { CourseViewer } from "./CourseViewer";
import "./courses.css";
import {
  agilityhubLevelLabel,
  builtAgoText,
  coursePaths,
  isNotFound,
  isStaffSetup,
  kindLabel,
  type MeRingSetupSummary,
  readMeRingSetup,
  useActiveSetup,
  useStaffRoles,
  useStartBuildSession,
  type ViewedRingSetup,
} from "./shared";
import { useCourseStore } from "./store";
import { frameScene, isCourseData, memberPlacementScene, type ViewerScene } from "./viewer-model";

function goBack() {
  if (window.history.length > 1) window.history.back();
  else navigateInApp("/avui");
}

function ViewerBar({ title }: { title: string }) {
  const { t } = useTranslation("courses");
  return (
    <AppBar
      className="booking-screen__bar"
      start={
        <button
          aria-label={t("courses:back")}
          className="booking-screen__back course-back"
          onClick={goBack}
          type="button"
        >
          <span aria-hidden="true">{t("courses:backGlyph")}</span>
        </button>
      }
      title={<h1>{title}</h1>}
    />
  );
}

interface ViewerData {
  setup: ViewedRingSetup;
  /** `GET /me/ring-setups` for the setup's ring (level label, thumbnail); `null` when unreadable. */
  summary: MeRingSetupSummary | null;
}

/**
 * What the viewer draws, by what the reader may read (R-16-16): a MEMBER reads the setup and its
 * course (`GET /courses/{id}`), with E9-T07's projected placement; staff read the full placement
 * and ring geometry. `stale` = R-16-06 (staff only).
 */
interface ViewerContent {
  courseName: string | null;
  scene: ViewerScene | null;
  stale: boolean;
}

/**
 * The «visor mòbil» (S16 §2: `/recorreguts/:setupId` · `/recorreguts/muntat/:ringId`, MEMBER ·
 * INSTRUCTOR): from 08, 10/23, 07 or D12 — the setup's kind and level, «muntat fa …», «previst
 * fins …», the photo or the course's plan (2D with zoom and a quarter turn, 3D on demand), and, to
 * staff, [Marca com a desmuntat], [Sessió de muntatge], joining a session by its code and
 * «Registra què hi ha muntat». A ring without a setup reads «Sense recorregut registrat».
 */
export function SetupViewerPage({
  client,
  ringId,
  setupId,
}: {
  client: ApiClient;
  ringId?: string | undefined;
  setupId?: string | undefined;
}) {
  const { t } = useTranslation(["courses", "enums", "errors", "common"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const rings = useActiveRings(client);
  const [refresh, setRefresh] = useState(0);
  // `/recorreguts/muntat/:ringId`: the ring's ACTIVE setup first (R-16-09; an ADMIN session
  // without INSTRUCTOR reads it from the ring's history).
  const ringSummary = useActiveSetup(client, setupId === undefined ? (ringId ?? "") : "", refresh);
  const resolvedSetupId =
    setupId ??
    (ringSummary.status === "ready" && ringSummary.data !== null ? ringSummary.data.id : "");

  const loadSetup = useCallback(async (): Promise<ViewerData | null> => {
    if (resolvedSetupId === "") return null;
    const result = await client.GET("/ring-setups/{id}", {
      params: { path: { id: resolvedSetupId } },
    });
    if (result.data === undefined) throw new TypeError("The setup response did not contain data");
    const setup = result.data;
    // The summary carries what the setup does not: its level label and thumbnail (R-16-09).
    const summary = await readMeRingSetup(client, setup.ringId).then(
      (item) => (item?.id === setup.id ? item : null),
      () => null,
    );
    return { setup, summary };
  }, [client, resolvedSetupId]);
  const viewed = useLoader(loadSetup, refresh);
  const [notice, setNotice] = useState(() => pageNotice());

  const ringOf = (id: string) => rings.data?.find((ring) => ring.id === id)?.name ?? "";
  const ringIdShown =
    viewed.status === "ready" && viewed.data !== null ? viewed.data.setup.ringId : ringId;
  const title =
    ringIdShown === undefined
      ? t("courses:viewer.title")
      : ringOf(ringIdShown) || t("courses:viewer.title");

  if (setupId === undefined && ringSummary.status === "loading") {
    return (
      <section className="booking-screen course-screen">
        <ViewerBar title={title} />
        <Skeleton height="12rem" label={t("courses:viewer.loading")} />
      </section>
    );
  }
  if (setupId === undefined && ringSummary.status === "error") {
    return (
      <section className="booking-screen course-screen">
        <ViewerBar title={title} />
        <LoadFailure
          error={ringSummary.error}
          onRetry={() => {
            ringSummary.refetch();
          }}
        />
      </section>
    );
  }
  if (setupId === undefined && ringSummary.status === "ready" && ringSummary.data === null) {
    return (
      <section className="booking-screen course-screen">
        <ViewerBar title={title} />
        <EmptyState
          description={t("courses:viewer.noneHelp")}
          icon="flag"
          title={t("courses:viewer.none")}
        />
        {ringId === undefined ? null : <StaffRegisterLink ringId={ringId} />}
        <StaffJoin client={client} />
      </section>
    );
  }
  if (viewed.status === "error") {
    return (
      <section className="booking-screen course-screen">
        <ViewerBar title={title} />
        <LoadFailure
          error={viewed.error}
          onRetry={() => {
            viewed.refetch();
          }}
        />
      </section>
    );
  }
  const loaded = viewed.status === "ready" ? viewed.data : null;
  if (loaded === null) {
    return (
      <section className="booking-screen course-screen">
        <ViewerBar title={title} />
        <Skeleton height="12rem" label={t("courses:viewer.loading")} />
      </section>
    );
  }

  const { setup, summary } = loaded;
  const staff = isStaffSetup(setup);
  // The api's label is the club levels' codes, else the AgilityHub level's code: the latter reads
  // in the reader's language, never as «MEDIUM» (E9-W05 round 2 #7).
  const levelCode = summary?.levelLabel ?? setup.agilityhubLevel ?? null;
  const level = levelCode === null ? null : agilityhubLevelLabel(t, levelCode);
  const heading = [
    kindLabel(t, setup.kind),
    ...(level === null || level === "" ? [] : [t("courses:level", { level })]),
  ].join(t("courses:separator"));

  return (
    <section className="booking-screen course-screen">
      <ViewerBar title={title} />
      {notice === undefined ? null : (
        <p
          className={`booking-note booking-note--${notice.tone}`}
          role={notice.tone === "danger" ? "alert" : "status"}
        >
          {noticeText(t, notice)}
        </p>
      )}
      <Card className="course-card">
        <p className="course-card__heading">
          <strong>{heading}</strong>
          {setup.status === "ACTIVE" ? null : (
            <Badge tone="neutral">{t(`enums:setupStatus.${setup.status}`)}</Badge>
          )}
        </p>
        <p className="course-card__line">
          {staff && setup.builtByName != null && setup.builtByName !== ""
            ? t("courses:builtBy", {
                instructor: setup.builtByName,
                when: builtAgoText(t, setup.builtAt, branding.timeZone),
              })
            : builtAgoText(t, setup.builtAt, branding.timeZone)}
        </p>
        {setup.expectedUntil === null || setup.expectedUntil === undefined ? null : (
          <p className="course-card__line">
            {t("courses:viewer.until", {
              date: formats.formatPlainDate(setup.expectedUntil, "weekday"),
            })}
          </p>
        )}
      </Card>
      {setup.kind === "EMPTY" ? (
        <p className="course-muted">{t("courses:viewer.empty")}</p>
      ) : (
        <SetupContent client={client} setup={setup} summary={summary} />
      )}
      {staff && setup.status === "ACTIVE" ? (
        <StaffActions
          client={client}
          onChanged={(message) => {
            setNotice({ messageKey: message, tone: "success" });
            setRefresh((value) => value + 1);
          }}
          ringName={ringOf(setup.ringId)}
          setup={setup}
        />
      ) : null}
      {staff ? (
        <StaffRegisterLink ringId={setup.ringId} replacing={setup.status === "ACTIVE"} />
      ) : null}
    </section>
  );
}

function LoadFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation(["courses", "common"]);
  return isNotFound(error) ? (
    <EmptyState description={t("courses:viewer.notFound")} title={t("common:unavailable.title")} />
  ) : (
    <Card className="booking-error" role="alert">
      <p>{t("courses:viewer.error")}</p>
      <Button onClick={onRetry} variant="secondary">
        {t("courses:retry")}
      </Button>
    </Card>
  );
}

/** The photo, the course's plan, or the thumbnail the api signs (R-16-09), in that order. */
function SetupContent({
  client,
  setup,
  summary,
}: {
  client: ApiClient;
  setup: ViewedRingSetup;
  summary: MeRingSetupSummary | null;
}) {
  const { t } = useTranslation("courses");
  const store = useCourseStore(client);
  const load = useCallback(async (): Promise<ViewerContent> => {
    const none: ViewerContent = { courseName: null, scene: null, stale: false };
    let courseId = setup.courseId ?? null;
    let placed: Pick<ViewerScene, "placement" | "ring"> | null = null;
    let stale = false;
    // Staff read the placement (R-16-16): its course, where it stands, and whether it is stale.
    if (isStaffSetup(setup) && setup.placementId != null) {
      const placement = (
        await client.GET("/placements/{id}", { params: { path: { id: setup.placementId } } })
      ).data;
      if (placement !== undefined) {
        courseId = placement.courseId;
        stale = placement.stale;
        const ring = await store.getRing(placement.ringId).catch(() => null);
        if (ring !== null) placed = { placement: plannerPlacement(placement).placement, ring };
      }
    }
    if (courseId === null) return none;
    const course = (await client.GET("/courses/{id}", { params: { path: { id: courseId } } })).data;
    if (course === undefined) return none;
    const model = course.normalizedJson;
    if (!isCourseData(model)) return { courseName: course.name, scene: null, stale };
    const memberScene =
      !isStaffSetup(setup) && setup.placement != null
        ? memberPlacementScene(model, setup.placement)
        : null;
    return {
      courseName: course.name,
      scene:
        placed === null
          ? (memberScene ?? frameScene(model))
          : { course: model, placed: true, ...placed },
      stale,
    };
  }, [client, setup, store]);
  const content = useLoader(load);
  const imageUrl = setup.imageUrl ?? null;

  if (imageUrl !== null) {
    return (
      <figure className="course-figure">
        <img alt={t("courses:viewer.photo")} className="course-figure__image" src={imageUrl} />
      </figure>
    );
  }
  if (content.status === "loading") {
    return <Skeleton height="16rem" label={t("courses:viewer.loading")} />;
  }
  const data = content.status === "ready" ? content.data : null;
  return (
    <>
      {data?.courseName == null ? null : (
        <p className="course-card__course">
          {t("courses:viewer.course", { name: data.courseName })}
        </p>
      )}
      {data?.stale === true ? (
        <p className="booking-note booking-note--warning" role="status">
          {t("courses:viewer.stale")}
        </p>
      ) : null}
      {data?.scene != null ? (
        <CourseViewer name={data.courseName ?? ""} scene={data.scene} />
      ) : summary?.thumbnailUrl != null ? (
        <figure className="course-figure">
          <img
            alt={t("courses:viewer.photo")}
            className="course-figure__image"
            src={summary.thumbnailUrl}
          />
        </figure>
      ) : (
        <p className="course-muted">{t("courses:viewer.noPlan")}</p>
      )}
    </>
  );
}

/** «Registra què hi ha muntat» (instructors, S16 §2; replaces the active setup, R-16-07). */
function StaffRegisterLink({ ringId, replacing = false }: { ringId: string; replacing?: boolean }) {
  const { t } = useTranslation("courses");
  const branding = useBranding();
  const roles = useStaffRoles();
  if (!roles || !branding.modules.includes("COURSES")) return null;
  return (
    <Button
      className="course-action"
      onClick={() => {
        navigateInApp(coursePaths.register(ringId));
      }}
      variant={replacing ? "secondary" : "primary"}
    >
      {t("courses:viewer.register")}
    </Button>
  );
}

/**
 * A ring with no setup (R-16-11): staff can still join a session another phone started on it —
 * a course being built is not registered as set up until its session finishes.
 */
function StaffJoin({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const roles = useStaffRoles();
  if (!roles || !branding.modules.includes("COURSES")) return null;
  return (
    <div className="course-actions">
      <JoinSessionForm client={client} />
    </div>
  );
}

/**
 * Joining a build session another phone started (R-16-11): its six-character code (or the QR's
 * token), `POST /build-sessions/join` (no key), then the session's page. `disabled` = another
 * action of the screen is being sent; `onPendingChange` tells the screen while this one is.
 */
function JoinSessionForm({
  client,
  disabled = false,
  onPendingChange,
}: {
  client: ApiClient;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { t } = useTranslation(["courses", "errors", "common"]);
  const store = useCourseStore(client);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const busy = (value: boolean) => {
    setPending(value);
    onPendingChange?.(value);
  };

  const join = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code.trim();
    if (value === "") {
      setError(t("courses:viewer.join.required"));
      return;
    }
    busy(true);
    setError(undefined);
    try {
      const session = await store.joinBuildSession({ code: value });
      navigateInApp(coursePaths.session(session.id));
    } catch (cause) {
      setError(
        isApiError(cause, "NOT_FOUND") ? t("courses:viewer.join.notFound") : errorText(t, cause),
      );
      busy(false);
    }
  };

  return (
    <form className="course-join" noValidate onSubmit={(event) => void join(event)}>
      <label className="course-join__label" htmlFor="course-join-code">
        {t("courses:viewer.join.label")}
      </label>
      <div className="course-join__row">
        <Input
          aria-describedby={error === undefined ? undefined : "course-join-error"}
          autoCapitalize="characters"
          autoComplete="off"
          disabled={disabled || pending}
          id="course-join-code"
          maxLength={64}
          onChange={(event) => {
            setCode(event.currentTarget.value);
            setError(undefined);
          }}
          value={code}
        />
        <Button
          disabled={disabled}
          loading={pending}
          loadingLabel={t("courses:sending")}
          type="submit"
          variant="secondary"
        >
          {t("courses:viewer.join.submit")}
        </Button>
      </div>
      {error === undefined ? null : (
        <p className="booking-note booking-note--danger" id="course-join-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * Staff actions on an ACTIVE setup: [Sessió de muntatge] when it shows a placement (R-16-11:
 * `POST /build-sessions {placementId, live}`), joining a session another phone started (its
 * six-character code, `POST /build-sessions/join`), and [Marca com a desmuntat] (R-16-08,
 * `POST /ring-setups/{id}/dismantle`). Each write has its pending state, one `Idempotency-Key`
 * per payload, and its error where it was asked.
 */
function StaffActions({
  client,
  onChanged,
  ringName,
  setup,
}: {
  client: ApiClient;
  onChanged: (messageKey: "courses:viewer.dismantled") => void;
  ringName: string;
  setup: ViewedRingSetup;
}) {
  const { t } = useTranslation(["courses", "errors", "common"]);
  const keys = useSubmissionKeys();
  const session = useStartBuildSession(client);
  const [pending, setPending] = useState<"dismantle" | "join">();
  const [error, setError] = useState<{ at: "dismantle"; message: string }>();
  const [confirm, setConfirm] = useState(false);
  const busy = pending !== undefined || session.pending;

  const dismantle = async () => {
    setPending("dismantle");
    setError(undefined);
    try {
      await keys.send(`dismantle:${setup.id}`, (key) =>
        client.POST("/ring-setups/{id}/dismantle", {
          headers: { "Idempotency-Key": key },
          params: { path: { id: setup.id } },
        }),
      );
      setConfirm(false);
      onChanged("courses:viewer.dismantled");
    } catch (cause) {
      setError({ at: "dismantle", message: errorText(t, cause) });
    } finally {
      setPending(undefined);
    }
  };

  return (
    <div className="course-actions">
      {setup.placementId == null ? null : (
        <>
          <Button
            disabled={pending !== undefined}
            loading={session.pending}
            loadingLabel={t("courses:sending")}
            onClick={() => {
              if (setup.placementId != null) void session.start(setup.placementId);
            }}
          >
            {t("courses:viewer.buildSession")}
          </Button>
          {session.error === undefined ? null : (
            <p className="booking-note booking-note--danger" role="alert">
              {session.error}
            </p>
          )}
        </>
      )}
      <JoinSessionForm
        client={client}
        disabled={pending === "dismantle" || session.pending}
        onPendingChange={(joining) => {
          setPending(joining ? "join" : undefined);
        }}
      />
      {confirm ? (
        <Card className="course-confirm">
          <p>{t("courses:viewer.dismantleConfirm", { ring: ringName })}</p>
          {error?.at === "dismantle" ? (
            <p className="booking-note booking-note--danger" role="alert">
              {error.message}
            </p>
          ) : null}
          <div className="booking-dialog">
            <Button
              disabled={pending === "dismantle"}
              onClick={() => {
                setConfirm(false);
                setError((current) => (current?.at === "dismantle" ? undefined : current));
              }}
              variant="ghost"
            >
              {t("courses:cancel")}
            </Button>
            <Button
              loading={pending === "dismantle"}
              loadingLabel={t("courses:sending")}
              onClick={() => void dismantle()}
              variant="danger"
            >
              {t("courses:viewer.dismantle")}
            </Button>
          </div>
        </Card>
      ) : (
        <Button
          disabled={busy}
          onClick={() => {
            setConfirm(true);
          }}
          variant="secondary"
        >
          {t("courses:viewer.dismantle")}
        </Button>
      )}
    </div>
  );
}
