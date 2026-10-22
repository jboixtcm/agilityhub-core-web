import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Button, FormField, Icon, Input, Modal, Switch, useBranding } from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { dayLabel, timeLabel } from "../planning/calendar-shared";
import { clubToday } from "../planning/shared";

import {
  CatalogFeedback,
  CatalogPageHeader,
  CatalogTable,
  ColorValue,
  LoadFailure,
  moveBefore,
  useCatalogData,
  useCatalogError,
  YesNoBadge,
} from "./shared";

type Ring = components["schemas"]["Ring"];
type RingCreate = components["schemas"]["RingCreate"];
type RingPatch = components["schemas"]["RingPatch"];

/**
 * A `422 RING_HAS_BOOKINGS {bookings[]}` (R-05-07/R-05-08): the live training bookings of the
 * change it answered, which [confirm] sends again with `cancelBookings: true`.
 */
interface RingBookingsConflict {
  /** Deactivating the ring, or only turning «Reservable per entrenaments» off. */
  action: "deactivate" | "unreservable";
  body: RingPatch;
  bookings: readonly unknown[];
  ringId: string;
}

function ringBookingsOf(cause: unknown): readonly unknown[] | undefined {
  if (!isApiError(cause) || cause.code !== "RING_HAS_BOOKINGS") return undefined;
  const bookings = (cause.details as { bookings?: unknown } | undefined)?.bookings;
  return Array.isArray(bookings) ? (bookings as unknown[]) : [];
}

/** «{memberName} + {dogName} · {day} {time}» of each `RingBooking`, in the club's zone. */
function RingBookingLines({ bookings }: { bookings: readonly unknown[] }) {
  const { t } = useTranslation("admin-catalogs");
  const branding = useBranding();
  const { formatPlainDate, formatTime } = useClubFormats();
  const lines = bookings.map((booking, index) => {
    const record =
      typeof booking === "object" && booking !== null ? (booking as Record<string, unknown>) : {};
    const from = typeof record.from === "string" ? new Date(record.from) : undefined;
    const when =
      from === undefined || Number.isNaN(from.getTime())
        ? "none"
        : `${dayLabel(clubToday(branding.timeZone, from), formatPlainDate)} ${timeLabel(formatTime(from))}`;
    const id = typeof record.bookingId === "string" ? record.bookingId : record.id;
    return {
      key: typeof id === "string" ? id : String(index),
      text: t("admin-catalogs:rings.ringBookings.item", {
        dog: typeof record.dogName === "string" ? record.dogName : "",
        member: typeof record.memberName === "string" ? record.memberName : "",
        when,
      }),
    };
  });
  return lines.length === 0 ? null : (
    <ul className="calendar-list">
      {lines.map((line) => (
        <li key={line.key}>{line.text}</li>
      ))}
    </ul>
  );
}

/**
 * D16's confirmation of `RING_HAS_BOOKINGS` (as D4's, R-06-09/R-06-11): the bookings the club
 * would cancel, [Torna enrere] and the action that resends the same change with
 * `cancelBookings: true`. Its own failure is shown inside it.
 */
function RingBookingsDialog({
  conflict,
  error,
  onBack,
  onConfirm,
  pending,
}: {
  conflict: RingBookingsConflict | undefined;
  error: string | undefined;
  onBack: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation("admin-catalogs");
  return (
    <Modal
      closeLabel={t("admin-catalogs:common.close")}
      onClose={onBack}
      open={conflict !== undefined}
      title={t("admin-catalogs:rings.ringBookings.title")}
    >
      <p>{t("admin-catalogs:rings.ringBookings.text")}</p>
      <RingBookingLines bookings={conflict?.bookings ?? []} />
      {error === undefined ? null : <p role="alert">{error}</p>}
      <div className="catalog-form__actions">
        <Button disabled={pending} onClick={onBack} variant="ghost">
          {t("admin-catalogs:rings.ringBookings.back")}
        </Button>
        <Button
          loading={pending}
          loadingLabel={t("admin-catalogs:common.saving")}
          onClick={onConfirm}
          variant="danger"
        >
          {conflict?.action === "deactivate"
            ? t("admin-catalogs:rings.ringBookings.deactivate")
            : t("admin-catalogs:rings.ringBookings.unreservable")}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * The confirmation's state: the conflict, its resend in flight and the resend's failure. Each
 * open/drop starts a new operation: a resend that answers after its confirmation was closed only
 * reloads the list (the change happened), never touches the confirmation shown now.
 */
function useRingBookings(
  client: ApiClient,
  onSaved: () => void,
  messageForError: (error: unknown) => string,
) {
  const [conflict, setConflict] = useState<RingBookingsConflict>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const operation = useRef(0);
  const drop = useCallback(() => {
    operation.current += 1;
    setConflict(undefined);
    setError(undefined);
    setPending(false);
  }, []);
  const open = useCallback((next: RingBookingsConflict) => {
    operation.current += 1;
    setConflict(next);
    setError(undefined);
    setPending(false);
  }, []);
  const confirm = async () => {
    if (conflict === undefined || pending) return;
    const current = operation.current;
    setPending(true);
    setError(undefined);
    try {
      await client.PATCH("/rings/{id}", {
        body: { ...conflict.body, cancelBookings: true },
        params: { path: { id: conflict.ringId } },
      });
      if (operation.current === current) setConflict(undefined);
      onSaved();
    } catch (cause) {
      if (operation.current === current) setError(messageForError(cause));
    } finally {
      if (operation.current === current) setPending(false);
    }
  };
  return { conflict, confirm, drop, error, open, pending };
}

/** The values a `RING_HAS_BOOKINGS` answer is about: a later edit makes it someone else's. */
function patchKey(body: RingPatch): string {
  return JSON.stringify([
    body.active,
    body.allowsFreeTraining,
    body.color,
    body.name,
    body.shortName,
    body.trainingCapacity,
    body.version,
  ]);
}

function RingForm({
  client,
  item,
  onClose,
  onSaved,
}: {
  client: ApiClient;
  item?: Ring | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const branding = useBranding();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const [name, setName] = useState(item?.name ?? "");
  const [shortName, setShortName] = useState(item?.shortName ?? "");
  const [color, setColor] = useState(item?.color ?? branding.theme.ringPalette?.[0] ?? "");
  const [allowsFreeTraining, setAllowsFreeTraining] = useState(item?.allowsFreeTraining ?? false);
  const [trainingCapacity, setTrainingCapacity] = useState(
    item?.trainingCapacity === undefined ? "" : String(item.trainingCapacity),
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const ringBookings = useRingBookings(
    client,
    () => {
      onSaved();
      onClose();
    },
    messageForError,
  );
  const capacity = trainingCapacity === "" ? undefined : Number(trainingCapacity);
  const patch: RingPatch | undefined =
    item === undefined
      ? undefined
      : {
          active,
          allowsFreeTraining,
          color,
          name,
          shortName: shortName.toLocaleUpperCase(),
          ...(capacity === undefined ? {} : { trainingCapacity: capacity }),
          version: item.version,
        };
  /** What the fields show now: an answer that arrives late is checked against it (R-06-11). */
  const shown = useRef(patch === undefined ? "" : patchKey(patch));
  useEffect(() => {
    shown.current = patch === undefined ? "" : patchKey(patch);
  });

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    ringBookings.drop();
    try {
      if (item === undefined || patch === undefined) {
        const body: RingCreate = {
          active,
          allowsFreeTraining,
          color,
          name,
          shortName: shortName.toLocaleUpperCase(),
          ...(capacity === undefined ? {} : { trainingCapacity: capacity }),
        };
        await client.POST("/rings", { body });
      } else {
        const sent = patch;
        try {
          await client.PATCH("/rings/{id}", { body: sent, params: { path: { id: item.id } } });
        } catch (cause) {
          const bookings = ringBookingsOf(cause);
          if (bookings === undefined) throw cause;
          // Only while the fields still show the change it answered: else it is dropped.
          if (shown.current === patchKey(sent)) {
            ringBookings.open({
              action: item.active && sent.active === false ? "deactivate" : "unreservable",
              body: sent,
              bookings,
              ringId: item.id,
            });
          }
          return;
        }
      }
      onSaved();
      onClose();
    } catch (reason) {
      setError(messageForError(reason));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="catalog-form" onSubmit={(event) => void submit(event)}>
      <div className="catalog-form__grid">
        <FormField id="ring-name" label={t("admin-catalogs:rings.fields.name")}>
          <Input
            id="ring-name"
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            required
            value={name}
          />
        </FormField>
        <FormField id="ring-short-name" label={t("admin-catalogs:rings.fields.shortName")}>
          <Input
            id="ring-short-name"
            maxLength={4}
            minLength={2}
            onChange={(event) => {
              setShortName(event.currentTarget.value);
            }}
            required
            value={shortName}
          />
        </FormField>
      </div>
      <FormField id="ring-color" label={t("admin-catalogs:rings.fields.color")}>
        <div className="catalog-color-picker">
          {(branding.theme.ringPalette ?? []).map((candidate) => (
            <button
              aria-label={candidate}
              aria-pressed={candidate.toLocaleLowerCase() === color.toLocaleLowerCase()}
              key={candidate}
              onClick={() => {
                setColor(candidate);
              }}
              style={{ "--catalog-color": candidate } as React.CSSProperties}
              type="button"
            />
          ))}
          <Input
            id="ring-color"
            onChange={(event) => {
              setColor(event.currentTarget.value);
            }}
            pattern="#[0-9A-Fa-f]{6}"
            required
            value={color}
          />
        </div>
      </FormField>
      <FormField
        help={t("admin-catalogs:rings.fields.capacityHelp")}
        id="ring-capacity"
        label={t("admin-catalogs:rings.fields.capacity")}
      >
        <Input
          id="ring-capacity"
          max={20}
          min={1}
          onChange={(event) => {
            setTrainingCapacity(event.currentTarget.value);
          }}
          placeholder={String(item?.effectiveTrainingCapacity ?? 1)}
          type="number"
          value={trainingCapacity}
        />
      </FormField>
      {branding.modules.includes("FREE_TRAINING") ? (
        <label className="catalog-switch-row">
          <span>{t("admin-catalogs:rings.fields.freeTraining")}</span>
          <Switch
            checked={allowsFreeTraining}
            label={t("admin-catalogs:rings.fields.freeTraining")}
            onCheckedChange={setAllowsFreeTraining}
          />
        </label>
      ) : null}
      <label className="catalog-switch-row">
        <span>{t("admin-catalogs:common.active")}</span>
        <Switch
          checked={active}
          label={t("admin-catalogs:common.active")}
          onCheckedChange={setActive}
        />
      </label>
      {item !== undefined && branding.modules.includes("COURSES") ? (
        <a className="catalog-form__link" href={`/pistes/${item.id}/geometria`}>
          <Icon aria-hidden="true" name="grid" />
          {t("admin-catalogs:rings.geometry")}
        </a>
      ) : null}
      {error === undefined ? null : <p role="alert">{error}</p>}
      <div className="catalog-form__actions">
        <Button onClick={onClose} variant="ghost">
          {t("admin-catalogs:common.cancel")}
        </Button>
        <Button loading={pending} loadingLabel={t("admin-catalogs:common.saving")} type="submit">
          {t("admin-catalogs:common.save")}
        </Button>
      </div>
      {/* Its buttons are `type="button"`: nothing in it submits the form below. */}
      <RingBookingsDialog
        conflict={ringBookings.conflict}
        error={ringBookings.error}
        onBack={ringBookings.drop}
        onConfirm={() => void ringBookings.confirm()}
        pending={ringBookings.pending}
      />
    </form>
  );
}

export function RingsPage({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const load = useCallback(async () => {
    const result = await client.GET("/rings", { params: { query: { includeInactive: true } } });
    if (result.data === undefined) {
      throw new TypeError("Ring response did not contain data");
    }
    return result.data.items;
  }, [client]);
  const data = useCatalogData(load, client);
  const [editing, setEditing] = useState<{ item?: Ring }>();
  const [removing, setRemoving] = useState<Ring>();
  const [removeBlocked, setRemoveBlocked] = useState(false);
  const [removePending, setRemovePending] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const showFreeTraining = branding.modules.includes("FREE_TRAINING");
  const ringBookings = useRingBookings(client, data.reload, messageForError);
  /**
   * The removal shown now (the R-06-11 pattern): dismissing it or selecting another ring starts a
   * new one, and an answer for an older one (a late `RING_IN_USE` or `RING_HAS_BOOKINGS`) is dropped.
   */
  const removal = useRef(0);
  const selectRemoving = (ring: Ring | undefined) => {
    removal.current += 1;
    setRemoving(ring);
    setRemoveBlocked(false);
    setRemovePending(false);
  };

  const reorder = async (sourceId: string, targetId: string) => {
    const ordered = moveBefore(data.items, sourceId, targetId);
    data.setItems(ordered);
    try {
      await client.PUT("/rings/order", { body: { ringIds: ordered.map((item) => item.id) } });
    } catch (error) {
      setFeedback(messageForError(error));
      data.reload();
    }
  };

  const remove = async () => {
    if (removing === undefined || removePending) {
      return;
    }
    const current = removal.current;
    setRemovePending(true);
    try {
      await client.DELETE("/rings/{id}", { params: { path: { id: removing.id } } });
      data.reload();
      if (removal.current === current) selectRemoving(undefined);
    } catch (error) {
      if (removal.current !== current) return;
      if (error instanceof Error && "code" in error && error.code === "RING_IN_USE") {
        setRemoveBlocked(true);
      } else {
        setFeedback(messageForError(error));
        selectRemoving(undefined);
      }
    } finally {
      if (removal.current === current) setRemovePending(false);
    }
  };

  const deactivate = async () => {
    if (removing === undefined || removePending) {
      return;
    }
    const ring = removing;
    const body: RingPatch = { active: false, version: ring.version };
    const current = removal.current;
    setRemovePending(true);
    try {
      await client.PATCH("/rings/{id}", { body, params: { path: { id: ring.id } } });
      data.reload();
      if (removal.current === current) selectRemoving(undefined);
    } catch (error) {
      // Dismissed, or another ring selected, while it was on its way: no longer this screen's.
      if (removal.current !== current) return;
      const bookings = ringBookingsOf(error);
      if (bookings === undefined) {
        setFeedback(messageForError(error));
      } else {
        // R-05-07: the live trainings first; the confirmation belongs to this ring.
        selectRemoving(undefined);
        ringBookings.open({ action: "deactivate", body, bookings, ringId: ring.id });
      }
    } finally {
      if (removal.current === current) setRemovePending(false);
    }
  };

  if (data.error !== undefined) {
    return <LoadFailure onRetry={data.reload} />;
  }

  return (
    <section className="catalog-page">
      <CatalogPageHeader
        action={
          <Button
            onClick={() => {
              setEditing({});
            }}
          >
            <Icon aria-hidden="true" name="plus" />
            {t("admin-catalogs:rings.new")}
          </Button>
        }
        title={t("admin-catalogs:rings.title")}
      />
      <CatalogFeedback
        message={feedback}
        onDismiss={() => {
          setFeedback(undefined);
        }}
      />
      <CatalogTable
        caption={t("admin-catalogs:rings.caption")}
        columns={[
          {
            header: t("admin-catalogs:rings.columns.name"),
            key: "name",
            render: (ring) => <strong>{ring.name}</strong>,
          },
          {
            header: t("admin-catalogs:rings.columns.shortName"),
            key: "shortName",
            render: (ring) => ring.shortName,
          },
          {
            header: t("admin-catalogs:rings.columns.color"),
            key: "color",
            render: (ring) => <ColorValue color={ring.color} />,
          },
          ...(showFreeTraining
            ? [
                {
                  header: t("admin-catalogs:rings.columns.freeTraining"),
                  key: "freeTraining",
                  render: (ring: Ring) => <YesNoBadge value={ring.allowsFreeTraining} />,
                },
              ]
            : []),
        ]}
        empty={t("admin-catalogs:rings.empty")}
        loading={data.loading}
        onEdit={(ring) => {
          setEditing({ item: ring });
        }}
        onRemove={(ring) => {
          selectRemoving(ring);
        }}
        onReorder={(source, target) => void reorder(source, target)}
        rowName={(ring) => ring.name}
        rows={data.items}
      />
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          setEditing(undefined);
        }}
        open={editing !== undefined}
        title={
          editing?.item === undefined
            ? t("admin-catalogs:rings.createTitle")
            : t("admin-catalogs:rings.editTitle", { name: editing.item.name })
        }
      >
        {editing === undefined ? null : (
          <RingForm
            client={client}
            item={editing.item}
            onClose={() => {
              setEditing(undefined);
            }}
            onSaved={data.reload}
          />
        )}
      </Modal>
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          selectRemoving(undefined);
        }}
        open={removing !== undefined}
        title={t("admin-catalogs:rings.removeTitle")}
      >
        <p>
          {removeBlocked
            ? t("admin-catalogs:rings.inUse")
            : t("admin-catalogs:rings.removeQuestion", { name: removing?.name })}
        </p>
        <div className="catalog-form__actions">
          <Button
            onClick={() => {
              selectRemoving(undefined);
            }}
            variant="ghost"
          >
            {t("admin-catalogs:common.cancel")}
          </Button>
          <Button
            disabled={removePending}
            onClick={() => void (removeBlocked ? deactivate() : remove())}
            variant="danger"
          >
            {removeBlocked
              ? t("admin-catalogs:common.deactivate")
              : t("admin-catalogs:common.remove")}
          </Button>
        </div>
      </Modal>
      <RingBookingsDialog
        conflict={ringBookings.conflict}
        error={ringBookings.error}
        onBack={ringBookings.drop}
        onConfirm={() => void ringBookings.confirm()}
        pending={ringBookings.pending}
      />
    </section>
  );
}
