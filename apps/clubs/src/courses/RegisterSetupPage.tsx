import {
  type ApiClient,
  type components,
  isApiError,
  putSignedFile,
  useActiveRings,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  AppBar,
  Button,
  Card,
  Icon,
  IconButton,
  Input,
  Skeleton,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import {
  type CSSProperties,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import "../booking/booking.css";
import { errorText, navigateInApp, useLoader } from "../booking/shared";
import "../training/training.css";
import { clubToday } from "../training/shared";

import "./courses.css";
import { coursePaths, kindLabel, SETUP_KINDS, type SetupKind, useActiveSetup } from "./shared";

type CourseListItem = components["schemas"]["CourseListItem"];
type AgilityhubLevel = "EASY" | "HARD" | "MEDIUM";
type Source = "course" | "photo";

const AGILITYHUB_LEVELS: readonly AgilityhubLevel[] = ["EASY", "MEDIUM", "HARD"];
const NOTE_MAX_LENGTH = 500;

/** The fields an error belongs to: the api's answer lands next to what it is about. */
type Field = "course" | "form" | "levels" | "photo" | "until";

function fieldOf(error: unknown): Field {
  if (!isApiError(error)) return "form";
  switch (error.code) {
    case "FILE_TOO_LARGE":
    case "FILE_TYPE_NOT_ALLOWED":
      return "photo";
    case "COURSE_NOT_VISIBLE":
      return "course";
    case "LEVELS_DISABLED":
      return "levels";
    default:
      return "form";
  }
}

/**
 * «Registra què hi ha muntat» (S16 §2, `/instructor/pistes/:ringId/muntat`, INSTRUCTOR · ADMIN):
 * the 30-second form — the ring (preselected), «Què hi ha muntat?» (the setup kind), where it comes
 * from (a photo or plan taken with the camera, or a course of the library), the orientative level,
 * «Fins quan?» and a note; [REGISTRA] → `POST /ring-setups` (R-16-07) under one `Idempotency-Key`
 * per payload, the photo uploaded once per file (`COURSE_IMAGE`). The ring's active setup is read
 * first and named, since registering replaces it; REGISTRA waits for it. T-16-16: preselected ring
 * → kind → photo → REGISTRA.
 */
export function RegisterSetupPage({
  client,
  ringId: routeRingId,
}: {
  client: ApiClient;
  ringId: string;
}) {
  const { t } = useTranslation(["courses", "enums", "errors", "common"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const rings = useActiveRings(client);
  const keys = useSubmissionKeys();
  const [ringId, setRingId] = useState(routeRingId);
  const ring = rings.data?.find((item) => item.id === ringId);
  const active = useActiveSetup(client, ringId);
  const [kind, setKind] = useState<SetupKind>("AGILITY");
  const [source, setSource] = useState<Source>("photo");
  const [file, setFile] = useState<File>();
  /** The stored photo of this file: a retry never uploads it again (CONVENCIONS_API §7). */
  const [uploaded, setUploaded] = useState<{ file: File; fileKey: string }>();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState<CourseListItem>();
  const [levelIds, setLevelIds] = useState<string[]>([]);
  const [agilityhubLevel, setAgilityhubLevel] = useState<AgilityhubLevel | "">("");
  const [expectedUntil, setExpectedUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field: Field; message: string }>();
  const today = clubToday(branding.timeZone);

  const levels = useLoader(
    useCallback(async () => (await client.GET("/levels", {})).data?.items ?? [], [client]),
  );
  const courses = useLoader(
    useCallback(async () => {
      if (source !== "course") return [];
      const result = await client.GET("/courses", {
        params: {
          query: { size: 20, sort: ["updatedAt,desc"], ...(search === "" ? {} : { q: search }) },
        },
      });
      return result.data?.items ?? [];
    }, [client, search, source]),
  );

  // The chosen photo's preview: one object URL per file, released when it changes or unmounts.
  const preview = useMemo(
    () => (file === undefined ? undefined : URL.createObjectURL(file)),
    [file],
  );
  useEffect(
    () => () => {
      if (preview !== undefined) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const close = () => {
    if (window.history.length > 1) window.history.back();
    else navigateInApp(coursePaths.ring(ringId));
  };
  const change = () => {
    setError(undefined);
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (kind !== "EMPTY" && source === "photo" && file === undefined) {
      setError({ field: "photo", message: t("courses:register.photoRequired") });
      return;
    }
    if (kind !== "EMPTY" && source === "course" && course === undefined) {
      setError({ field: "course", message: t("courses:register.courseRequired") });
      return;
    }
    if (expectedUntil !== "" && expectedUntil < today) {
      setError({ field: "until", message: t("courses:register.untilPast") });
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      let imageFileKey: string | undefined;
      if (kind !== "EMPTY" && source === "photo" && file !== undefined) {
        imageFileKey = uploaded?.file === file ? uploaded.fileKey : undefined;
        if (imageFileKey === undefined) {
          const grant = await client.POST("/courses/upload-urls", {
            body: { contentType: file.type, purpose: "COURSE_IMAGE", size: file.size },
          });
          if (grant.data === undefined) throw new TypeError("Upload grant without data");
          await putSignedFile(
            { headers: { "Content-Type": file.type }, uploadUrl: grant.data.uploadUrl },
            file,
          );
          imageFileKey = grant.data.fileKey;
          setUploaded({ file, fileKey: imageFileKey });
        }
      }
      const body = {
        kind,
        levelIds: kind === "EMPTY" ? [] : levelIds,
        ringId,
        ...(kind === "EMPTY" || agilityhubLevel === "" ? {} : { agilityhubLevel }),
        ...(kind === "EMPTY" || source !== "course" || course === undefined
          ? {}
          : { courseId: course.id }),
        ...(imageFileKey === undefined ? {} : { imageFileKey }),
        ...(expectedUntil === "" ? {} : { expectedUntil }),
        ...(notes.trim() === "" ? {} : { notes: notes.trim() }),
      };
      const created = await keys.send(JSON.stringify(body), (key) =>
        client.POST("/ring-setups", { body, headers: { "Idempotency-Key": key } }),
      );
      if (created.data === undefined) throw new TypeError("Created setup without data");
      navigateInApp(
        coursePaths.setup(created.data.setup.id),
        {
          notice: {
            messageKey:
              created.data.replacedSetupId == null
                ? "courses:register.saved"
                : "courses:register.savedReplacing",
            tone: "success",
          },
        },
        true,
      );
    } catch (cause) {
      setError({
        field: fieldOf(cause),
        message: isApiError(cause, "FORBIDDEN")
          ? t("courses:register.instructorRefused")
          : errorText(t, cause),
      });
      setPending(false);
    }
  };

  const fieldError = (field: Field) =>
    error?.field === field ? (
      <p className="booking-note booking-note--danger" id={`setup-${field}-error`} role="alert">
        {error.message}
      </p>
    ) : null;

  return (
    <section className="booking-screen course-screen course-register">
      <AppBar
        className="booking-screen__bar"
        end={
          <IconButton
            className="booking-screen__close"
            icon="x"
            label={t("courses:close")}
            onClick={close}
          />
        }
        title={<h1>{t("courses:register.title")}</h1>}
      />
      <form className="course-form" noValidate onSubmit={(event) => void submit(event)}>
        <fieldset className="course-form__fieldset" disabled={pending}>
          <legend className="booking-section__title">{t("courses:register.ring")}</legend>
          {rings.status === "loading" ? (
            <Skeleton height="1.75rem" label={t("courses:loading")} />
          ) : null}
          {rings.status === "error" ? (
            <Card className="booking-error" role="alert">
              <p>{t("courses:register.ringsError")}</p>
              <Button onClick={rings.refetch} variant="secondary">
                {t("courses:retry")}
              </Button>
            </Card>
          ) : null}
          <div className="training-chips">
            {(rings.data ?? []).map((item) => (
              <button
                aria-pressed={item.id === ringId}
                className={`ah-chip training-chip${item.id === ringId ? " training-chip--selected" : ""}`}
                key={item.id}
                onClick={() => {
                  setRingId(item.id);
                  change();
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="training-ring-dot"
                  style={{ "--ah-ring-color": item.color } as CSSProperties}
                />
                {item.name}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="course-form__fieldset" disabled={pending}>
          <legend className="booking-section__title">{t("courses:register.kind")}</legend>
          <div className="training-chips">
            {SETUP_KINDS.map((value) => (
              <button
                aria-pressed={value === kind}
                className={`ah-chip training-chip${value === kind ? " training-chip--selected" : ""}`}
                key={value}
                onClick={() => {
                  setKind(value);
                  change();
                }}
                type="button"
              >
                {kindLabel(t, value)}
              </button>
            ))}
          </div>
        </fieldset>
        {kind === "EMPTY" ? (
          <p className="course-muted">{t("courses:register.emptyHelp")}</p>
        ) : (
          <>
            <fieldset className="course-form__fieldset" disabled={pending}>
              <legend className="booking-section__title">{t("courses:register.source")}</legend>
              <div className="training-chips">
                {(["photo", "course"] as const).map((value) => (
                  <button
                    aria-pressed={value === source}
                    className={`ah-chip training-chip${value === source ? " training-chip--selected" : ""}`}
                    key={value}
                    onClick={() => {
                      setSource(value);
                      change();
                    }}
                    type="button"
                  >
                    {value === "photo"
                      ? t("courses:register.sourcePhoto")
                      : t("courses:register.sourceCourse")}
                  </button>
                ))}
              </div>
              {source === "photo" ? (
                <div className="course-photo">
                  <label className="ah-button ah-button--secondary course-photo__pick">
                    <Icon aria-hidden="true" name="cam" />
                    <span>
                      {file === undefined
                        ? t("courses:register.takePhoto")
                        : t("courses:register.changePhoto")}
                    </span>
                    <input
                      accept="image/*"
                      aria-describedby={error?.field === "photo" ? "setup-photo-error" : undefined}
                      capture="environment"
                      className="ah-sr-only"
                      onChange={(event) => {
                        const chosen = event.currentTarget.files?.[0];
                        if (chosen !== undefined) setFile(chosen);
                        change();
                      }}
                      type="file"
                    />
                  </label>
                  {preview === undefined ? null : (
                    <img
                      alt={t("courses:register.photoPreview")}
                      className="course-photo__preview"
                      src={preview}
                    />
                  )}
                  {fieldError("photo")}
                </div>
              ) : (
                <div className="course-library">
                  <div className="course-join__row">
                    <Input
                      aria-label={t("courses:register.search")}
                      onChange={(event) => {
                        setQuery(event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          setSearch(query.trim());
                        }
                      }}
                      placeholder={t("courses:register.searchPlaceholder")}
                      type="search"
                      value={query}
                    />
                    <Button
                      onClick={() => {
                        setSearch(query.trim());
                      }}
                      variant="secondary"
                    >
                      {t("courses:register.searchSubmit")}
                    </Button>
                  </div>
                  {courses.status === "loading" ? (
                    <Skeleton height="4rem" label={t("courses:loading")} />
                  ) : courses.status === "error" ? (
                    <p className="booking-note booking-note--danger" role="alert">
                      {errorText(t, courses.error)}
                    </p>
                  ) : courses.data.length === 0 ? (
                    <p className="course-muted">{t("courses:register.noCourses")}</p>
                  ) : (
                    <div
                      className="course-library__list"
                      role="radiogroup"
                      aria-label={t("courses:register.sourceCourse")}
                    >
                      {courses.data.map((item) => (
                        <label className="course-library__item" key={item.id}>
                          <input
                            checked={course?.id === item.id}
                            name="setup-course"
                            onChange={() => {
                              setCourse(item);
                              change();
                            }}
                            type="radio"
                          />
                          <strong>{item.name}</strong>
                          <span className="course-muted course-library__meta">
                            {[
                              ...(item.discipline === undefined
                                ? []
                                : [t(`enums:courseDiscipline.${item.discipline}`)]),
                              ...(item.level == null
                                ? []
                                : [t("courses:level", { level: item.level })]),
                            ].join(t("courses:separator"))}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {fieldError("course")}
                </div>
              )}
            </fieldset>
            <fieldset className="course-form__fieldset" disabled={pending}>
              <legend className="booking-section__title">{t("courses:register.level")}</legend>
              {levels.status === "ready" && levels.data.length > 0 ? (
                <div
                  className="training-chips"
                  role="group"
                  aria-label={t("courses:register.clubLevels")}
                >
                  {levels.data
                    .filter((level) => level.active)
                    .map((level) => {
                      const pressed = levelIds.includes(level.id);
                      return (
                        <button
                          aria-pressed={pressed}
                          className={`ah-chip training-chip${pressed ? " training-chip--selected" : ""}`}
                          key={level.id}
                          onClick={() => {
                            setLevelIds((current) =>
                              pressed
                                ? current.filter((id) => id !== level.id)
                                : [...current, level.id],
                            );
                            change();
                          }}
                          type="button"
                        >
                          {level.code}
                        </button>
                      );
                    })}
                </div>
              ) : null}
              <label className="course-form__label" htmlFor="setup-agilityhub-level">
                {t("courses:register.agilityhubLevel")}
              </label>
              <select
                className="ah-select"
                id="setup-agilityhub-level"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setAgilityhubLevel(AGILITYHUB_LEVELS.find((level) => level === value) ?? "");
                  change();
                }}
                value={agilityhubLevel}
              >
                <option value="">{t("courses:register.noLevel")}</option>
                {AGILITYHUB_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t(`enums:agilityhubLevel.${level}`)}
                  </option>
                ))}
              </select>
              {fieldError("levels")}
            </fieldset>
          </>
        )}
        <fieldset className="course-form__fieldset" disabled={pending}>
          <label className="course-form__label" htmlFor="setup-until">
            {t("courses:register.until")}
          </label>
          <Input
            aria-describedby={
              error?.field === "until" ? "setup-until-error setup-until-help" : "setup-until-help"
            }
            id="setup-until"
            min={today}
            onChange={(event) => {
              setExpectedUntil(event.currentTarget.value);
              change();
            }}
            type="date"
            value={expectedUntil}
          />
          <p className="course-muted" id="setup-until-help">
            {t("courses:register.untilHelp")}
          </p>
          {fieldError("until")}
          <label className="course-form__label" htmlFor="setup-notes">
            {t("courses:register.notes")}
          </label>
          <Textarea
            id="setup-notes"
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => {
              setNotes(event.currentTarget.value);
            }}
            value={notes}
          />
        </fieldset>
        {active.status === "ready" && active.data !== null ? (
          <p className="booking-note booking-note--warning" role="status">
            {t("courses:register.replaces", {
              day: formats.formatDate(active.data.builtAt, "dayMonth"),
              kind: kindLabel(t, active.data.kind),
            })}
          </p>
        ) : null}
        {active.status === "error" ? (
          <div className="booking-note booking-note--danger" role="alert">
            <p>{t("courses:register.activeError")}</p>
            <Button
              onClick={() => {
                active.refetch();
              }}
              variant="secondary"
            >
              {t("courses:retry")}
            </Button>
          </div>
        ) : null}
        {fieldError("form")}
        <Button
          className="course-submit"
          // Until the ring's active setup is known, the instructor cannot see what is replaced.
          disabled={active.status !== "ready" || ring === undefined}
          loading={pending}
          loadingLabel={t("courses:sending")}
          type="submit"
        >
          {t("courses:register.submit")}
        </Button>
      </form>
    </section>
  );
}
