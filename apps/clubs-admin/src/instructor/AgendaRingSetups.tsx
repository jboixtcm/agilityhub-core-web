import {
  type ApiClient,
  type components,
  isApiError,
  readRingSetups,
} from "@agilityhub/api-client";
import { clubDaysSince, useClubFormats } from "@agilityhub/i18n";
import { Button, Icon, Modal, Skeleton, useBranding } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type MeRingSetup = components["schemas"]["MeRingSetup"];
type MeRingSetupSummary = components["schemas"]["MeRingSetupSummary"];
type RingSetup = components["schemas"]["RingSetup"];
type Translate = ReturnType<typeof useTranslation>["t"];

interface AgendaRing {
  id: string;
  name: string;
}

function setupText(t: Translate, setup: MeRingSetupSummary, timeZone: string): string {
  const level =
    setup.levelLabel == null || setup.levelLabel === ""
      ? null
      : ["EASY", "MEDIUM", "HARD"].includes(setup.levelLabel)
        ? t(`enums:agilityhubLevel.${setup.levelLabel}`)
        : setup.levelLabel;
  return [
    t(`enums:setupKind.${setup.kind}`, { defaultValue: setup.kind }),
    ...(level === null ? [] : [t("courses:level", { level })]),
    t("courses:builtAgo", { days: clubDaysSince(setup.builtAt, timeZone) }),
  ].join(t("courses:separator"));
}

/**
 * D12 (S16 §2 «icona a la capçalera de pista»): D12's columns are days, so the ring «headers»
 * are a strip above the grid — one course icon per ring with an ACTIVE setup (`GET
 * /me/ring-setups`, only the filtered ring when «Pista» is set), opening the setup: its kind,
 * level, how long ago it was built, until when, the photo or thumbnail, and the course in D18.
 * Only with COURSES. An ADMIN session without INSTRUCTOR is refused by `/me/ring-setups` (403) and
 * reads each ring's history instead (`GET /rings/{id}/setups`, `readRingSetups`); the history has
 * no level label, so the orientative AgilityHub level stands in (`ringSetupSummary`).
 */
export function AgendaRingSetups({
  client,
  onNavigate,
  ringId,
  rings,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
  ringId: string | undefined;
  rings: readonly AgendaRing[];
}) {
  const { t } = useTranslation(["courses", "enums"]);
  const branding = useBranding();
  const enabled = branding.modules.includes("COURSES");
  const [items, setItems] = useState<readonly MeRingSetup[]>([]);
  const [open, setOpen] = useState<{ ring: AgendaRing; setup: MeRingSetupSummary }>();
  // The rings' ids as one key: the week's answer arrives (or changes week) with the same rings.
  const ringIds = rings.map((ring) => ring.id).join(",");

  useEffect(() => {
    // No ring known yet (the week is loading): nothing to show, nothing to read.
    if (!enabled || ringIds === "") return undefined;
    let current = true;
    readRingSetups(client, { historyRingIds: ringIds.split(",") }).then(
      (result) => {
        if (current) setItems(result);
      },
      () => {
        if (current) setItems([]);
      },
    );
    return () => {
      current = false;
    };
  }, [client, enabled, ringIds]);

  if (!enabled) return null;
  const shown = items.flatMap((item) => {
    if (item.setup == null || (ringId !== undefined && item.ringId !== ringId)) return [];
    const ring = rings.find((candidate) => candidate.id === item.ringId);
    return ring === undefined ? [] : [{ ring, setup: item.setup }];
  });
  if (shown.length === 0) return null;
  return (
    <>
      <ul aria-label={t("courses:blocks.agendaTitle")} className="week-agenda__setups">
        {shown.map(({ ring, setup }) => (
          <li key={ring.id}>
            <button
              className="week-agenda__setup"
              onClick={() => {
                setOpen({ ring, setup });
              }}
              type="button"
            >
              <Icon aria-hidden="true" name="flag" />
              <span>
                {t("courses:blocks.ringLine", {
                  ring: ring.name,
                  setup: setupText(t, setup, branding.timeZone),
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open === undefined ? null : (
        <SetupModal
          client={client}
          onClose={() => {
            setOpen(undefined);
          }}
          onNavigate={onNavigate}
          ring={open.ring}
          summary={open.setup}
        />
      )}
    </>
  );
}

function SetupModal({
  client,
  onClose,
  onNavigate,
  ring,
  summary,
}: {
  client: ApiClient;
  onClose: () => void;
  onNavigate: (path: string) => void;
  ring: AgendaRing;
  summary: MeRingSetupSummary;
}) {
  const { t } = useTranslation(["courses", "enums", "errors"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const [detail, setDetail] = useState<{ courseId: string | null; setup: RingSetup }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    const load = async () => {
      const setup = (
        await client.GET("/ring-setups/{id}", { params: { path: { id: summary.id } } })
      ).data;
      if (setup?.view !== "STAFF") throw new TypeError("Unexpected setup view");
      let courseId = setup.courseId ?? null;
      if (courseId === null && setup.placementId != null) {
        const placement = (
          await client.GET("/placements/{id}", { params: { path: { id: setup.placementId } } })
        ).data;
        courseId = placement?.courseId ?? null;
      }
      return { courseId, setup };
    };
    load().then(
      (value) => {
        if (current) setDetail(value);
      },
      (cause: unknown) => {
        if (current) {
          setError(
            isApiError(cause)
              ? t(`errors:${cause.code}`, { defaultValue: t("courses:viewer.error") })
              : t("courses:viewer.error"),
          );
        }
      },
    );
    return () => {
      current = false;
    };
  }, [client, summary.id, t]);

  const image = detail?.setup.imageUrl ?? summary.thumbnailUrl ?? null;
  return (
    <Modal closeLabel={t("courses:close")} onClose={onClose} open title={ring.name}>
      <div className="week-agenda__setup-detail">
        <p>
          <strong>{setupText(t, summary, branding.timeZone)}</strong>
        </p>
        {summary.expectedUntil == null ? null : (
          <p>
            {t("courses:viewer.until", {
              date: formats.formatPlainDate(summary.expectedUntil, "weekday"),
            })}
          </p>
        )}
        {image === null ? null : (
          <img alt={t("courses:viewer.photo")} className="week-agenda__setup-image" src={image} />
        )}
        {error === undefined ? null : (
          <p className="ah-form-field__error" role="alert">
            {error}
          </p>
        )}
        {detail === undefined && error === undefined ? (
          <Skeleton height="2rem" label={t("courses:viewer.loading")} />
        ) : null}
        {detail?.courseId == null ? null : (
          <Button
            onClick={() => {
              if (detail.courseId != null)
                onNavigate(`/recorreguts/${encodeURIComponent(detail.courseId)}`);
            }}
            variant="secondary"
          >
            {t("courses:blocks.openCourse")}
          </Button>
        )}
      </div>
    </Modal>
  );
}
