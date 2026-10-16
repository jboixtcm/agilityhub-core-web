import {
  ApiError,
  type ApiClient,
  isApiError,
  saveFile,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import { renderBuildSheetPdf, type PlannerPlacement } from "@agilityhub/course-ui";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, FormField, Input, Modal, Select, Textarea } from "@agilityhub/ui";
import { type SyntheticEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type Course,
  kindOf,
  pdfBlob,
  type Placement,
  type Ring,
  type RingSetup,
  SETUP_KINDS,
  type SetupKind,
  useCourseError,
  useCourseLabels,
  useCourseStore,
  useMetres,
  useSheetFileNames,
  useSheetLabels,
} from "./shared";

/** The club's «today» (`YYYY-MM-DD` in its zone): `expectedUntil` is today or later (R-16-07). */
function clubToday(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(new Date());
}

/**
 * «Registra-ho com a muntat» (S16 §2, R-16-07): what is set up on a ring — this placement, or the
 * course without one — with its kind (the discipline's by default), «Fins quan?» and a note; the
 * course's AgilityHub level and club levels go with it (R-16-09: what the students read). The
 * ring's active setup is read first and named («Substituirà el muntatge actual…»): REGISTRA
 * waits for it, since registering replaces it. One `Idempotency-Key` per payload; errors stay in
 * the dialog. An INSTRUCTOR refused by the api (`403`, `courses.allowInstructorPublish` off) is
 * told why, and the screen stops offering the action (`onRefused`).
 */
export function RegisterSetupModal({
  client,
  course,
  onClose,
  onRefused,
  onRegistered,
  placement,
  rings,
  timeZone,
}: {
  client: ApiClient;
  course: Pick<Course, "agilityhubLevel" | "discipline" | "id" | "levelIds">;
  onClose: () => void;
  onRefused: () => void;
  onRegistered: (message: string) => void;
  /** With a placement the ring is the placement's; without one the user picks it. */
  placement?: Pick<Placement, "id" | "ringId"> | undefined;
  rings: readonly Ring[];
  timeZone: string;
}) {
  const { t } = useTranslation(["admin-courses", "enums", "errors"]);
  const labels = useCourseLabels();
  const errorText = useCourseError();
  const { formatDate } = useClubFormats();
  const keys = useSubmissionKeys();
  const activeRings = rings.filter((ring) => ring.active);
  const [ringId, setRingId] = useState(placement?.ringId ?? activeRings[0]?.id ?? "");
  const [kind, setKind] = useState<SetupKind>(kindOf(course.discipline));
  const [expectedUntil, setExpectedUntil] = useState("");
  const [notes, setNotes] = useState("");
  /** The active setup of the ring it was read for (`null` = none): another ring reads again. */
  const [active, setActive] = useState<{ ringId: string; setup: RingSetup | null }>();
  const current = active?.ringId === ringId ? active.setup : undefined;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const today = clubToday(timeZone);
  const ring = rings.find((candidate) => candidate.id === ringId);

  // The ring's active setup, if any: the one this registration will replace.
  useEffect(() => {
    if (ringId === "") return undefined;
    let mounted = true;
    client
      .GET("/rings/{id}/setups", { params: { path: { id: ringId }, query: { page: 0, size: 20 } } })
      .then(
        (result) => {
          if (!mounted) return;
          setActive({
            ringId,
            setup: result.data?.items.find((item) => item.status === "ACTIVE") ?? null,
          });
        },
        () => {
          if (mounted) setActive({ ringId, setup: null });
        },
      );
    return () => {
      mounted = false;
    };
  }, [client, ringId]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (expectedUntil !== "" && expectedUntil < today) {
      setError(t("admin-courses:setup.untilPast"));
      return;
    }
    setPending(true);
    setError(undefined);
    const body = {
      ...(course.agilityhubLevel == null ? {} : { agilityhubLevel: course.agilityhubLevel }),
      kind,
      levelIds: [...course.levelIds],
      ringId,
      ...(placement === undefined ? { courseId: course.id } : { placementId: placement.id }),
      ...(expectedUntil === "" ? {} : { expectedUntil }),
      ...(notes.trim() === "" ? {} : { notes: notes.trim() }),
    };
    try {
      const result = await keys.send(JSON.stringify(body), (key) =>
        client.POST("/ring-setups", { body, headers: { "Idempotency-Key": key } }),
      );
      const ringName = ring?.name ?? "";
      onRegistered(
        result.data?.replacedSetupId == null
          ? t("admin-courses:setup.registered", { ring: ringName })
          : t("admin-courses:setup.registeredReplacing", { ring: ringName }),
      );
    } catch (cause) {
      if (isApiError(cause, "FORBIDDEN")) {
        setError(t("admin-courses:setup.instructorRefused"));
        onRefused();
      } else {
        setError(errorText(cause));
      }
      setPending(false);
    }
  };

  return (
    <Modal
      closeLabel={t("admin-courses:common.close")}
      onClose={onClose}
      open
      title={t("admin-courses:setup.title")}
    >
      <form className="courses-form" noValidate onSubmit={(event) => void submit(event)}>
        {placement === undefined ? (
          <FormField id="setup-ring" label={t("admin-courses:setup.ring")}>
            <Select
              id="setup-ring"
              onChange={(event) => {
                setRingId(event.currentTarget.value);
              }}
              value={ringId}
            >
              {activeRings.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <p>{t("admin-courses:setup.onRing", { ring: ring?.name ?? "" })}</p>
        )}
        <FormField id="setup-kind" label={t("admin-courses:setup.kind")}>
          <Select
            id="setup-kind"
            onChange={(event) => {
              setKind(event.currentTarget.value as SetupKind);
            }}
            value={kind}
          >
            {SETUP_KINDS.filter((value) => value !== "EMPTY").map((value) => (
              <option key={value} value={value}>
                {labels.setupKind(value)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          help={t("admin-courses:setup.untilHelp")}
          id="setup-until"
          label={t("admin-courses:setup.until")}
        >
          <Input
            id="setup-until"
            min={today}
            onChange={(event) => {
              setExpectedUntil(event.currentTarget.value);
            }}
            type="date"
            value={expectedUntil}
          />
        </FormField>
        <FormField id="setup-notes" label={t("admin-courses:setup.notes")}>
          <Textarea
            id="setup-notes"
            maxLength={500}
            onChange={(event) => {
              setNotes(event.currentTarget.value);
            }}
            value={notes}
          />
        </FormField>
        {current === null || current === undefined ? null : (
          <p className="courses-warning" role="status">
            {t("admin-courses:setup.replaces", {
              day: formatDate(current.builtAt, "dayMonth"),
              kind: labels.setupKind(current.kind),
            })}
          </p>
        )}
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
            // Until the ring's active setup is known, the user cannot see what will be replaced.
            disabled={ringId === "" || current === undefined}
            loading={pending}
            loadingLabel={t("admin-courses:common.saving")}
            type="submit"
          >
            {t("admin-courses:setup.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The browser made and downloaded the sheet, but the api did not store it. */
class BuildSheetNotStored extends Error {
  constructor(readonly reason: unknown) {
    super("BUILD_SHEET_NOT_STORED");
  }
}

/** A build-sheet failure in the reader's language. */
export function useBuildSheetError(): (error: unknown) => string {
  const { t } = useTranslation("admin-courses");
  const errorText = useCourseError();
  return (error) =>
    error instanceof BuildSheetNotStored
      ? t("admin-courses:sheet.notStored", { reason: errorText(error.reason) })
      : errorText(error);
}

/**
 * R-16-10 «Full de muntatge»: generated in the browser from the stored placement (its
 * `resolvedObstacles`, A8c) and the ring's current geometry, downloaded, then stored for the
 * placement (`BUILD_SHEET` upload + `POST /placements/{id}/build-sheet`, E9-T05). A stale
 * placement (R-16-06) mixes old obstacles with the new geometry: the screens disable the action
 * and point to «Revisa» instead. Answers the placement with its `buildSheetFileKey`.
 */
export function useBuildSheet(client: ApiClient) {
  const store = useCourseStore(client);
  const sheet = useSheetLabels();
  const metres = useMetres();
  const names = useSheetFileNames();
  const { t } = useTranslation(["admin-courses", "errors"]);
  return async ({
    courseName,
    notes,
    placement,
  }: {
    courseName: string;
    notes: string | null | undefined;
    placement: Pick<Placement, "id" | "name" | "resolvedObstacles" | "ringId">;
  }): Promise<PlannerPlacement> => {
    const ring = await store.getRing(placement.ringId);
    if (ring === null) {
      throw new ApiError({
        code: "RING_WITHOUT_GEOMETRY",
        message: t("errors:RING_WITHOUT_GEOMETRY"),
        status: 422,
      });
    }
    const subheading = [
      t("admin-courses:sheet.ring", {
        length: metres(ring.length_m),
        ring: ring.name,
        width: metres(ring.width_m),
      }),
      ...(placement.name == null || placement.name === "" ? [] : [placement.name]),
    ].join(t("admin-courses:sheet.listSeparator"));
    const bytes = renderBuildSheetPdf({
      labels: sheet.build(courseName, subheading),
      notes: notes ?? null,
      obstacles: placement.resolvedObstacles,
      ring,
    });
    saveFile(pdfBlob(bytes), names.build(courseName, ring.name));
    try {
      return await store.attachBuildSheet(placement.id, bytes);
    } catch (cause) {
      throw new BuildSheetNotStored(cause);
    }
  };
}

/** R-16-10: the build sheet the placement stores (`GET /placements/{id}/build-sheet`). */
export function useStoredBuildSheet(client: ApiClient) {
  const store = useCourseStore(client);
  const names = useSheetFileNames();
  return async ({
    courseName,
    placementId,
    ringName,
  }: {
    courseName: string;
    placementId: string;
    ringName: string;
  }) => {
    saveFile(await store.getBuildSheet(placementId), names.build(courseName, ringName));
  };
}
