import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { Button, Card, Chip, DayGrid, Drawer, Skeleton, useBranding } from "@agilityhub/ui";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import "./today.css";
import {
  DayGridError,
  DayGridLoading,
  DayScreen,
  DayScreenHeader,
  mapDayGrid,
  ringName,
  timeLabel,
  useDayLabel,
  useGridLabels,
} from "./shared";
import { type DayGridApiCell, useDayGrid } from "./useDayGrid";

type ClassSession = components["schemas"]["ClassSession"];
type ClassSessionMemberView = components["schemas"]["ClassSessionMemberView"];
type RingBlock = components["schemas"]["RingBlock"];
type RingBlockMemberView = components["schemas"]["RingBlockMemberView"];

/** The tapped cell and the name of its ring, kept while the grid refetches. */
interface Selection {
  cell: DayGridApiCell;
  id: string;
  kind: "BLOCK" | "CLASS";
  ring: string | undefined;
}

type Loaded<T> = { failed: true; value?: undefined } | { failed: false; value?: T };

function useResource<T>(load: () => Promise<T | undefined>, key: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T> & { key?: string }>({ failed: false });
  useEffect(() => {
    let active = true;
    load().then(
      (value) => {
        if (active)
          setState(value === undefined ? { failed: true, key } : { failed: false, key, value });
      },
      () => {
        if (active) setState({ failed: true, key });
      },
    );
    return () => {
      active = false;
    };
    // `load` is recreated on every render; the resource identity is `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { failed: false };
}

function isStaffSession(value: ClassSession | ClassSessionMemberView): value is ClassSession {
  return "counters" in value;
}

function isStaffBlock(value: RingBlock | RingBlockMemberView): value is RingBlock {
  return "createdByName" in value;
}

function ClassDrawerBody({
  cell,
  client,
  id,
  ring,
}: {
  cell: DayGridApiCell;
  client: ApiClient;
  id: string;
  ring: string | undefined;
}) {
  const branding = useBranding();
  const { t } = useTranslation(["instructor", "home", "enums"]);
  const dayLabel = useDayLabel();
  const session = useResource(
    () =>
      client
        .GET("/class-sessions/{id}", { params: { path: { id } } })
        .then(({ data }) => (data !== undefined && isStaffSession(data) ? data : undefined)),
    id,
  );
  if (session.failed) {
    return <p role="alert">{t("instructor:overview.class.loadError")}</p>;
  }
  if (session.value === undefined) {
    return <Skeleton height="8rem" label={t("instructor:overview.class.loading")} />;
  }
  const value = session.value;
  const waiting =
    branding.modules.includes("WAITLIST") && value.counters.waiting > 0
      ? ` +${String(value.counters.waiting)}`
      : "";
  return (
    <dl className="day-drawer">
      <dt>{t("instructor:overview.class.when")}</dt>
      <dd>
        {`${dayLabel(value.date)} · ${timeLabel(value.startTime)}–${timeLabel(value.endTime)}`}
      </dd>
      <dt>{t("instructor:overview.class.ring")}</dt>
      <dd>{ring ?? t("home:today.noRing")}</dd>
      {cell.instructorName === null || cell.instructorName === undefined ? null : (
        <>
          <dt>{t("instructor:overview.class.instructors")}</dt>
          <dd>{cell.instructorName}</dd>
        </>
      )}
      <dt>{t("instructor:overview.class.occupancy")}</dt>
      <dd>{`${String(value.counters.booked)}/${String(value.capacity)}${waiting}`}</dd>
      <dt>{t("instructor:overview.class.state")}</dt>
      <dd>
        <Chip tone={value.state === "CANCELLED" ? "danger" : "success"}>
          {t(`enums:classState.${value.state}`)}
        </Chip>
      </dd>
      {value.atRisk ? (
        <>
          <dt>{t("instructor:overview.class.risk")}</dt>
          <dd className="day-drawer__risk">{cell.riskText ?? t("home:today.atRisk")}</dd>
        </>
      ) : null}
    </dl>
  );
}

function BlockDrawerBody({
  client,
  id,
  onCancelled,
  onStale,
  ring,
}: {
  client: ApiClient;
  id: string;
  onCancelled: () => void;
  onStale: () => void;
  ring: string | undefined;
}) {
  const { t } = useTranslation(["instructor", "enums", "errors"]);
  const block = useResource(
    () =>
      client
        .GET("/ring-blocks/{id}", { params: { path: { id } } })
        .then(({ data }) => (data !== undefined && isStaffBlock(data) ? data : undefined)),
    id,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [managed, setManaged] = useState(false);
  if (block.failed) {
    return <p role="alert">{t("instructor:overview.blockDrawer.loadError")}</p>;
  }
  if (block.value === undefined) {
    return <Skeleton height="8rem" label={t("instructor:overview.blockDrawer.loading")} />;
  }
  const value = block.value;
  const canCancel = !managed && (value.activityId === null || value.activityId === undefined);

  const cancel = async () => {
    setPending(true);
    setError(undefined);
    try {
      await client.POST("/ring-blocks/{id}/cancellation", { body: {}, params: { path: { id } } });
      onCancelled();
    } catch (cancelError) {
      if (isApiError(cancelError, "RING_BLOCK_MANAGED_BY_ACTIVITY")) {
        setManaged(true);
        setError(t("errors:RING_BLOCK_MANAGED_BY_ACTIVITY"));
      } else if (isApiError(cancelError, "INVALID_STATE")) {
        setError(t("errors:INVALID_STATE"));
        onStale();
      } else {
        setError(
          isApiError(cancelError)
            ? t(`errors:${cancelError.code}`, { defaultValue: t("errors:INTERNAL_ERROR") })
            : t("errors:INTERNAL_ERROR"),
        );
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="day-drawer__block">
      <p className="day-drawer__lead">
        {[ring, `${timeLabel(value.fromLocal)}–${timeLabel(value.toLocal)}`]
          .filter((part) => part !== undefined)
          .join(" · ")}
      </p>
      <dl className="day-drawer">
        <dt>{t("instructor:overview.blockDrawer.reason")}</dt>
        <dd>{t(`enums:ringBlockReason.${value.reason}`)}</dd>
        {value.note === null || value.note === undefined || value.note === "" ? null : (
          <>
            <dt>{t("instructor:overview.blockDrawer.note")}</dt>
            <dd>{value.note}</dd>
          </>
        )}
        <dt>{t("instructor:overview.blockDrawer.createdBy")}</dt>
        <dd>{value.createdByName}</dd>
      </dl>
      {error === undefined ? null : <p role="alert">{error}</p>}
      {canCancel ? (
        <Button
          disabled={pending}
          loading={pending}
          loadingLabel={t("instructor:overview.blockDrawer.cancelling")}
          onClick={() => void cancel()}
          type="button"
          variant="secondary"
        >
          {t("instructor:overview.blockDrawer.cancel")}
        </Button>
      ) : null}
    </div>
  );
}

/** Screen 23 «Visió global» (`/instructor/avui`): instructor view of form D + detail drawers. */
export function OverviewPage({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const { t } = useTranslation(["instructor", "home", "enums"]);
  const labels = useGridLabels();
  const day = useDayGrid(client, "instructor");
  const [selection, setSelection] = useState<Selection>();
  const mapped = useMemo(
    () =>
      day.grid === undefined
        ? undefined
        : mapDayGrid(
            day.grid,
            t,
            (cell) =>
              (cell.kind === "CLASS" && cell.classId !== undefined) ||
              (cell.kind === "BLOCK" && cell.blockId !== undefined),
          ),
    [day.grid, t],
  );

  return (
    <DayScreen>
      <DayScreenHeader
        date={day.date}
        onDateChange={(date) => {
          setSelection(undefined);
          day.setDate(date);
        }}
        title={t("instructor:overview.title")}
      />
      {day.status === "error" ? <DayGridError onRetry={day.refetch} /> : null}
      {day.status === "loading" ? <DayGridLoading /> : null}
      {mapped === undefined ? null : (
        <>
          <Card className="day-screen__card">
            {mapped.rows.length === 0 ? (
              <p className="day-screen__empty">{t("home:today.empty")}</p>
            ) : (
              <DayGrid
                columns={mapped.columns}
                labels={labels}
                noRingLabel={t("home:today.noRing")}
                onCellPress={(cell) => {
                  const source = mapped.cellsById.get(cell.id);
                  const id = source?.kind === "CLASS" ? source.classId : source?.blockId;
                  if (source === undefined || id === undefined || day.grid === undefined) return;
                  setSelection({
                    cell: source,
                    id,
                    kind: source.kind === "CLASS" ? "CLASS" : "BLOCK",
                    ring: ringName(day.grid, source.ringId),
                  });
                }}
                rows={mapped.rows}
                selectedCellId={selection?.id}
                showWaiting={branding.modules.includes("WAITLIST")}
                view="instructor"
              />
            )}
          </Card>
          <p className="day-screen__footer day-screen__footer--outside">
            {t("instructor:overview.footer")}
          </p>
        </>
      )}
      <Drawer
        closeLabel={t("instructor:overview.close")}
        onClose={() => {
          setSelection(undefined);
        }}
        open={selection !== undefined}
        title={
          selection?.kind === "BLOCK"
            ? t("instructor:overview.blockDrawer.title")
            : (selection?.cell.description ?? "")
        }
      >
        {selection === undefined ? null : selection.kind === "CLASS" ? (
          <ClassDrawerBody
            cell={selection.cell}
            client={client}
            id={selection.id}
            ring={selection.ring}
          />
        ) : (
          <BlockDrawerBody
            client={client}
            id={selection.id}
            onCancelled={() => {
              setSelection(undefined);
              day.refetch();
            }}
            onStale={day.refetch}
            ring={selection.ring}
          />
        )}
      </Drawer>
    </DayScreen>
  );
}
