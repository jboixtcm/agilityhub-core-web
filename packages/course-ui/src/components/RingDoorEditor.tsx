'use client';

/**
 * Phase 12c — venue-admin door editor.
 *
 * Adds the missing piece called out in `lib/storage/types.ts`:
 *   - up to 4 doors per ring (the cap matches MAX_RING_DOORS — typical
 *     halls have 1 or 2, the largest configurations have 4),
 *   - each door has a label, a wall (north/south/east/west), a start
 *     and end position along the wall, a flow direction (in/out/both),
 *     an optional clearance override and an active/inactive toggle.
 *
 * Both the storage layer (mock + supabase) and the BuildSessionExport
 * already carry these fields; this editor produces inputs the store
 * accepts via `PlannerStore.updateRingDoors`.
 *
 * Visual preview: a tiny SVG showing the ring rectangle with each
 * configured door drawn on its wall plus a flow arrow. Sized for clarity
 * not polish — the live Planner3D view is the source of truth.
 */

import { inferDoorEdgeFromPolygon, normalizeDoorSide } from '@agilityhub/course-core';
import { useMemo, useState } from 'react';

import { getPlannerStore } from '../lib/storage/get-store.js';
import {
  MAX_RING_DOORS,
  type PlannerRing,
  type PlannerRingDoor,
  type SaveRingDoorInput,
} from '../lib/storage/types.js';

import { Button } from './ui/Button.js';
import { Card, CardTitle } from './ui/Card.js';
import { IconButton } from './ui/IconButton.js';
import { RemoveIcon } from './ui/icons.js';


type DoorSide = 'north' | 'south' | 'east' | 'west';
type DoorFlow = 'in' | 'out' | 'both';

/** Form-side door row. Numeric fields are kept as strings so the input is fully controlled. */
interface DraftDoor {
  /** Stable per-form id; persisted door id when present, else a synthetic one for React keys. */
  readonly key: string;
  /** DB id (undefined for newly-added doors). */
  readonly id: string | undefined;
  label: string;
  side: DoorSide;
  startMeters: string;
  endMeters: string;
  flow: DoorFlow;
  isActive: boolean;
  clearanceMeters: string;
  notes: string;
}

export interface RingDoorEditorLabels {
  readonly title: (ringName: string, count: number, maximum: number) => string;
  readonly description: string;
  readonly door: (index: number) => string;
  readonly previewAria: (ringName: string) => string;
  readonly side: Readonly<Record<DoorSide, { readonly label: string; readonly hint: string }>>;
  readonly flowOption: Readonly<Record<DoorFlow, string>>;
  readonly empty: (maximum: number) => string;
  readonly active: string;
  readonly remove: (index: number) => string;
  readonly wall: string;
  readonly wallFor: (index: number) => string;
  readonly start: string;
  readonly startFor: (index: number) => string;
  readonly end: string;
  readonly endFor: (index: number) => string;
  readonly flow: string;
  readonly flowFor: (index: number) => string;
  readonly clearance: string;
  readonly clearanceFor: (index: number) => string;
  readonly notes: string;
  readonly notesFor: (index: number) => string;
  readonly notesPlaceholder: string;
  readonly geometry: (sideHint: string, wallMeters: number, openingMeters: number | null) => string;
  readonly preview: string;
  readonly add: string;
  readonly maximumReached: (maximum: number) => string;
  readonly saving: string;
  readonly save: string;
  readonly revert: string;
  readonly saved: string;
  readonly saveError: string;
  readonly validation: {
    readonly maximum: (count: number, maximum: number) => string;
    readonly endpoints: (door: string) => string;
    readonly order: (door: string, startMeters: number, endMeters: number) => string;
    readonly wall: (door: string, endMeters: number, wallMeters: number) => string;
    readonly clearance: (door: string) => string;
  };
}

interface Props {
  ring: PlannerRing;
  labels: RingDoorEditorLabels;
  onSaved: (next: PlannerRing) => void;
}

const SIDES: readonly DoorSide[] = ['south', 'north', 'west', 'east'];
const FLOWS: readonly DoorFlow[] = ['both', 'in', 'out'];

function nextSyntheticKey(): string {
  // The form only needs a stable React key; the DB id (uuid) lands later.
  return `new-${Math.random().toString(36).slice(2, 10)}`;
}

function ringDoorToDraft(d: PlannerRingDoor, ring: PlannerRing, index: number): DraftDoor {
  const inferred =
    d.start_m == null || d.end_m == null
      ? inferDoorEdgeFromPolygon(d.polygon_points_m, ring.length_m, ring.width_m)
      : null;
  const side = normalizeDoorSide(d.side) ?? inferred?.side ?? 'south';
  const start = d.start_m ?? inferred?.startMeters;
  const end = d.end_m ?? inferred?.endMeters;
  return {
    key: d.id ?? `new-${index}`,
    id: d.id,
    label: d.label,
    side,
    startMeters: start != null ? String(start) : '',
    endMeters: end != null ? String(end) : '',
    flow: (d.flow as DoorFlow | undefined) ?? 'both',
    isActive: d.is_active ?? true,
    clearanceMeters: String(d.clearance_m ?? 0.5),
    notes: d.notes ?? '',
  };
}

function wallLengthFor(ring: PlannerRing, side: DoorSide): number {
  return side === 'north' || side === 'south' ? ring.length_m : ring.width_m;
}

/** Parse a positive numeric string; returns null when blank / NaN / negative. */
function toFiniteNonNegative(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

interface DraftValidation {
  readonly errors: readonly string[];
  readonly inputs: readonly SaveRingDoorInput[];
}

function validateDrafts(
  drafts: readonly DraftDoor[],
  ring: PlannerRing,
  labels: RingDoorEditorLabels,
): DraftValidation {
  const errors: string[] = [];
  if (drafts.length > MAX_RING_DOORS) {
    errors.push(labels.validation.maximum(drafts.length, MAX_RING_DOORS));
  }
  const inputs: SaveRingDoorInput[] = [];
  drafts.forEach((d, i) => {
    const label = d.label.trim() || labels.door(i + 1);
    const start = toFiniteNonNegative(d.startMeters);
    const end = toFiniteNonNegative(d.endMeters);
    const clearance = toFiniteNonNegative(d.clearanceMeters);
    const wall = wallLengthFor(ring, d.side);
    if (start == null || end == null) {
      errors.push(labels.validation.endpoints(label));
      return;
    }
    if (start >= end) {
      errors.push(labels.validation.order(label, start, end));
      return;
    }
    if (end > wall + 1e-6) {
      errors.push(labels.validation.wall(label, end, wall));
      return;
    }
    if (clearance == null) {
      errors.push(labels.validation.clearance(label));
      return;
    }
    inputs.push({
      ...(d.id === undefined ? {} : { id: d.id }),
      label,
      side: d.side,
      startMeters: start,
      endMeters: end,
      flow: d.flow,
      isActive: d.isActive,
      clearanceMeters: clearance,
      notes: d.notes.trim() || null,
    });
  });
  return { errors, inputs };
}

// ---------------------------------------------------------------------------
// Tiny SVG preview. Pure presentation — no interaction.
// ---------------------------------------------------------------------------

const PREVIEW_PADDING = 12;
const PREVIEW_MAX = 220;

function DoorPreview({
  ring,
  drafts,
  labels,
}: {
  ring: PlannerRing;
  drafts: readonly DraftDoor[];
  labels: RingDoorEditorLabels;
}) {
  // Fit the ring rectangle into a 220×220 box preserving aspect ratio.
  const aspect = ring.length_m / ring.width_m;
  const innerMax = PREVIEW_MAX - PREVIEW_PADDING * 2;
  const drawW = aspect >= 1 ? innerMax : innerMax * aspect;
  const drawH = aspect >= 1 ? innerMax / aspect : innerMax;
  const ox = (PREVIEW_MAX - drawW) / 2;
  const oy = (PREVIEW_MAX - drawH) / 2;
  // Ring frame: X along length (drawW), Y along width (drawH), with the
  // *south* wall at the bottom of the SVG (so it matches the planner view).
  const ringToSvg = (x: number, y: number): { x: number; y: number } => ({
    x: ox + (x / ring.length_m) * drawW,
    y: oy + drawH - (y / ring.width_m) * drawH,
  });
  return (
    <svg
      role="img"
      aria-label={labels.previewAria(ring.name)}
      width={PREVIEW_MAX}
      height={PREVIEW_MAX}
      viewBox={`0 0 ${PREVIEW_MAX} ${PREVIEW_MAX}`}
      className="border border-border rounded bg-surface-2"
    >
      <rect
        x={ox}
        y={oy}
        width={drawW}
        height={drawH}
        fill="none"
        stroke="var(--ah-color-course-ring)"
        strokeWidth={1}
      />
      {drafts.map((d, i) => {
        const start = Number(d.startMeters);
        const end = Number(d.endMeters);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
        let a: { x: number; y: number };
        let b: { x: number; y: number };
        let inwardDx = 0;
        let inwardDy = 0;
        switch (d.side) {
          case 'south':
            a = ringToSvg(start, 0);
            b = ringToSvg(end, 0);
            inwardDy = -18;
            break;
          case 'north':
            a = ringToSvg(start, ring.width_m);
            b = ringToSvg(end, ring.width_m);
            inwardDy = 18;
            break;
          case 'west':
            a = ringToSvg(0, start);
            b = ringToSvg(0, end);
            inwardDx = 18;
            break;
          case 'east':
            a = ringToSvg(ring.length_m, start);
            b = ringToSvg(ring.length_m, end);
            inwardDx = -18;
            break;
        }
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        // Two markers describing the flow: tail (in) → tip (out). For 'in'
        // we draw arrow pointing inward; 'out' outward; 'both' a small
        // double-headed indicator.
        const color = d.isActive
          ? 'var(--ah-color-course-obstacle)'
          : 'var(--ah-color-course-marker-muted)';
        const inwardTip = { x: mx + inwardDx, y: my + inwardDy };
        const outwardTip = { x: mx - inwardDx, y: my - inwardDy };
        return (
          <g key={d.key} opacity={d.isActive ? 1 : 0.45}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--ah-color-course-door)"
              strokeWidth={4}
              strokeLinecap="round"
            />
            {d.flow !== 'out' && (
              <line
                x1={mx}
                y1={my}
                x2={inwardTip.x}
                y2={inwardTip.y}
                stroke={color}
                strokeWidth={2}
                markerEnd="url(#door-arrow)"
              />
            )}
            {d.flow !== 'in' && (
              <line
                x1={mx}
                y1={my}
                x2={outwardTip.x}
                y2={outwardTip.y}
                stroke={color}
                strokeWidth={2}
                markerEnd="url(#door-arrow)"
              />
            )}
            <text x={mx + 6} y={my - 6} fontSize={9} fill="var(--ah-color-course-text)">
              {(d.label || labels.door(i + 1)).slice(0, 18)}
            </text>
          </g>
        );
      })}
      <defs>
        <marker
          id="door-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function RingDoorEditor({ ring, labels, onSaved }: Props) {
  const initial = useMemo(
    () => ring.doors.map((d, i) => ringDoorToDraft(d, ring, i)),
    [ring],
  );
  const [drafts, setDrafts] = useState<readonly DraftDoor[]>(initial);
  const [saving, setSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const validation = useMemo(() => validateDrafts(drafts, ring, labels), [drafts, labels, ring]);
  const dirty = useMemo(() => {
    if (drafts.length !== initial.length) return true;
    for (let i = 0; i < drafts.length; i += 1) {
      const a = drafts[i]!;
      const b = initial[i]!;
      if (
        a.id !== b.id ||
        a.label !== b.label ||
        a.side !== b.side ||
        a.startMeters !== b.startMeters ||
        a.endMeters !== b.endMeters ||
        a.flow !== b.flow ||
        a.isActive !== b.isActive ||
        a.clearanceMeters !== b.clearanceMeters ||
        a.notes !== b.notes
      ) {
        return true;
      }
    }
    return false;
  }, [drafts, initial]);

  function patchDraft(key: string, patch: Partial<DraftDoor>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    setSavedAt(null);
  }

  function addDoor() {
    if (drafts.length >= MAX_RING_DOORS) return;
    const wall = ring.length_m;
    setDrafts((prev) => [
      ...prev,
      {
        key: nextSyntheticKey(),
        id: undefined,
        label: labels.door(prev.length + 1),
        side: 'south',
        // Default to a 1 m opening centered on the wall — venue admins
        // can drag the numbers; the goal is a usable starting point.
        startMeters: Math.max(0, wall / 2 - 0.5).toFixed(2),
        endMeters: Math.min(wall, wall / 2 + 0.5).toFixed(2),
        flow: 'both',
        isActive: true,
        clearanceMeters: '0.5',
        notes: '',
      },
    ]);
    setSavedAt(null);
  }

  function removeDoor(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    setSavedAt(null);
  }

  function handleReset() {
    setDrafts(initial);
    setHasError(false);
    setSavedAt(null);
  }

  async function handleSave() {
    if (validation.errors.length > 0) return;
    setSaving(true);
    setHasError(false);
    try {
      const store = getPlannerStore();
      const updated = await store.updateRingDoors(ring.id, validation.inputs);
      onSaved(updated);
      setSavedAt(Date.now());
    } catch {
      setHasError(true);
    } finally {
      setSaving(false);
    }
  }

  const canAdd = drafts.length < MAX_RING_DOORS;

  return (
    <Card>
      <CardTitle>{labels.title(ring.name, drafts.length, MAX_RING_DOORS)}</CardTitle>
      <p className="text-xs text-muted mb-3">{labels.description}</p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-3">
        <div className="space-y-3">
          {drafts.length === 0 && (
            <p className="text-xs text-muted italic">
              {labels.empty(MAX_RING_DOORS)}
            </p>
          )}
          {drafts.map((d, i) => {
            const wall = wallLengthFor(ring, d.side);
            return (
              <div
                key={d.key}
                className="border border-border rounded-md p-3 bg-surface/40 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={d.label}
                    disabled={saving}
                    onChange={(e) => { patchDraft(d.key, { label: e.currentTarget.value }); }}
                    aria-label={labels.door(i + 1)}
                    placeholder={labels.door(i + 1)}
                    className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-warning"
                  />
                  <label className="text-xs text-muted flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={d.isActive}
                      disabled={saving}
                      onChange={(e) => { patchDraft(d.key, { isActive: e.currentTarget.checked }); }
                      }
                    />
                    {labels.active}
                  </label>
                  <IconButton
                    aria-label={labels.remove(i + 1)}
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => { removeDoor(d.key); }}
                  >
                    <RemoveIcon />
                  </IconButton>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <label className="flex flex-col gap-1">
                    <span className="text-muted">{labels.wall}</span>
                    <select
                      value={d.side}
                      disabled={saving}
                      onChange={(e) => { patchDraft(d.key, { side: e.currentTarget.value as DoorSide }); }
                      }
                      aria-label={labels.wallFor(i + 1)}
                      className="bg-surface-2 border border-border rounded px-2 py-1"
                    >
                      {SIDES.map((side) => (
                        <option key={side} value={side}>
                          {labels.side[side].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-muted">{labels.start}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.05"
                      min={0}
                      max={wall}
                      value={d.startMeters}
                      disabled={saving}
                      onChange={(e) => { patchDraft(d.key, { startMeters: e.currentTarget.value }); }
                      }
                      aria-label={labels.startFor(i + 1)}
                      className="bg-surface-2 border border-border rounded px-2 py-1 font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-muted">{labels.end}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.05"
                      min={0}
                      max={wall}
                      value={d.endMeters}
                      disabled={saving}
                      onChange={(e) => { patchDraft(d.key, { endMeters: e.currentTarget.value }); }}
                      aria-label={labels.endFor(i + 1)}
                      className="bg-surface-2 border border-border rounded px-2 py-1 font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-muted">{labels.flow}</span>
                    <select
                      value={d.flow}
                      disabled={saving}
                      onChange={(e) => { patchDraft(d.key, { flow: e.currentTarget.value as DoorFlow }); }
                      }
                      aria-label={labels.flowFor(i + 1)}
                      className="bg-surface-2 border border-border rounded px-2 py-1"
                    >
                      {FLOWS.map((flow) => (
                        <option key={flow} value={flow}>
                          {labels.flowOption[flow]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex flex-col gap-1">
                    <span className="text-muted">{labels.clearance}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.05"
                      min={0}
                      value={d.clearanceMeters}
                      disabled={saving}
                      onChange={(e) => { patchDraft(d.key, { clearanceMeters: e.currentTarget.value }); }
                      }
                      aria-label={labels.clearanceFor(i + 1)}
                      className="bg-surface-2 border border-border rounded px-2 py-1 font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-muted">{labels.notes}</span>
                    <input
                      type="text"
                      value={d.notes}
                      disabled={saving}
                      onChange={(e) => { patchDraft(d.key, { notes: e.currentTarget.value }); }}
                      aria-label={labels.notesFor(i + 1)}
                      placeholder={labels.notesPlaceholder}
                      className="bg-surface-2 border border-border rounded px-2 py-1"
                    />
                  </label>
                </div>

                <p className="text-[10px] text-muted">
                  {labels.geometry(labels.side[d.side].hint, wall, (() => {
                    const start = Number(d.startMeters);
                    const end = Number(d.endMeters);
                    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
                      return null;
                    return end - start;
                  })())}
                </p>
              </div>
            );
          })}
        </div>

        <div className="lg:sticky lg:top-4 self-start">
          <p className="text-xs text-muted mb-1">{labels.preview}</p>
          <DoorPreview ring={ring} drafts={drafts} labels={labels} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 items-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addDoor}
          disabled={!canAdd}
        >
          {canAdd ? labels.add : labels.maximumReached(MAX_RING_DOORS)}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!dirty || saving || validation.errors.length > 0}
        >
          {saving ? labels.saving : labels.save}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={!dirty || saving}
        >
          {labels.revert}
        </Button>
      </div>

      {validation.errors.length > 0 && (
        <ul className="mt-2 text-xs text-warning list-disc pl-5 space-y-0.5" role="alert">
          {validation.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {hasError && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {labels.saveError}
        </p>
      )}
      {savedAt && !dirty && !hasError && (
        <p className="mt-2 text-xs text-success">{labels.saved}</p>
      )}
    </Card>
  );
}
