'use client';

/**
 * Admin-only editor for a ring's obstacle inventory. Renders one tile
 * per obstacle type (excluding `Unknown`, which can't be physical
 * equipment), saves the whole map atomically through
 * `PlannerStore.updateRingInventory`.
 *
 * Each tile shows the same top-down silhouette the planner canvas uses
 * (see `ObstacleIcon`), so the inventory page is recognisably the same
 * shapes the judge sees on a course. Tunnels — which are procedural on
 * the canvas — get a matching teal polyline preview sized to their
 * nominal length, so 3 m vs 6 m tunnels are visually distinguishable.
 *
 * The numeric stepper (`−` / number / `+`) replaces a bare number input
 * to make the page mobile-friendly and to declutter what was previously
 * a wall of 13 indistinguishable text inputs.
 *
 * Used by `/admin/venues/[venueId]` and `/venues/[venueId]` (one editor
 * per ring on the venue). Lives in its own file because it owns local
 * form state and we don't want that bleeding into the venue page.
 */

import type { ObstacleType } from '@agilityhub/course-core';
import { useMemo, useState } from 'react';

import { getPlannerStore } from '../lib/storage/get-store.js';
import type { PlannerRing } from '../lib/storage/types.js';

import { ObstacleIcon } from './ObstacleIcon.js';
import { Button } from './ui/Button.js';
import { Card, CardTitle } from './ui/Card.js';


interface ObstacleSpec {
  readonly id: ObstacleType;
  /** Set on tunnel rows so we can draw a length-correct polyline preview. */
  readonly tunnelLengthM?: number;
}

/**
 * The 13 user-facing obstacle types. `Unknown` is omitted on purpose —
 * a venue can't own "an Unknown obstacle".
 *
 * Tunnels are split by nominal metric length; the imperial label is shown
 * underneath so US judges (who use 10/15/20 ft equipment) recognise their
 * stock. The metric values are the storage units — display only.
 */
const OBSTACLE_TYPES: readonly ObstacleSpec[] = [
  { id: 'Jump' },
  { id: 'DoubleJump' },
  { id: 'Tunnel3m', tunnelLengthM: 3 },
  { id: 'Tunnel4m', tunnelLengthM: 4 },
  { id: 'Tunnel5m', tunnelLengthM: 5 },
  { id: 'Tunnel6m', tunnelLengthM: 6 },
  { id: 'DogWalk' },
  { id: 'AFrame' },
  { id: 'Seesaw' },
  { id: 'Weave' },
  { id: 'LongJump' },
  { id: 'Wall' },
  { id: 'Tire' },
];

/**
 * Shared viewBox used by every preview so the icons render at consistent
 * scale across tiles. Sized to comfortably fit the widest obstacle (the
 * 6.6 m weave) — smaller obstacles look proportionally smaller, which
 * matches their real-world footprint.
 */
const VIEW_W_M = 7.5;
const VIEW_H_M = 2.4;

export interface RingInventoryEditorLabels {
  readonly title: (ringName: string, totalUnits: number, stockedTypes: number) => string;
  readonly description: string;
  readonly obstacle: (type: ObstacleType) => { readonly name: string; readonly detail?: string };
  readonly decrease: (name: string) => string;
  readonly quantity: (name: string) => string;
  readonly increase: (name: string) => string;
  readonly saveError: string;
  readonly saved: string;
  readonly saving: string;
  readonly save: string;
  readonly revert: string;
}

interface Props {
  ring: PlannerRing;
  labels: RingInventoryEditorLabels;
  onSaved: (next: PlannerRing) => void;
}

export function RingInventoryEditor({ ring, labels, onSaved }: Props) {
  const initial = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of ring.obstacle_inventory) {
      map[row.obstacle_type] = row.quantity;
    }
    return map;
  }, [ring.obstacle_inventory]);

  const [values, setValues] = useState<Record<string, number>>(initial);
  const [saving, setSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(values), ...Object.keys(initial)]);
    for (const k of keys) {
      const a = values[k] ?? 0;
      const b = initial[k] ?? 0;
      if (a !== b) return true;
    }
    return false;
  }, [values, initial]);

  function setQty(type: ObstacleType, n: number) {
    setValues((prev) => ({
      ...prev,
      [type]: Number.isFinite(n) && n >= 0 ? n : 0,
    }));
  }

  function step(type: ObstacleType, delta: number) {
    setQty(type, Math.max(0, (values[type] ?? 0) + delta));
  }

  async function handleSave() {
    setSaving(true);
    setHasError(false);
    try {
      const rows = OBSTACLE_TYPES.flatMap(({ id: obstacle_type }) => {
        const quantity = values[obstacle_type] ?? 0;
        return quantity > 0 ? [{ obstacle_type, quantity }] : [];
      });
      const store = getPlannerStore();
      const updated = await store.updateRingInventory(ring.id, rows);
      onSaved(updated);
      setSavedAt(Date.now());
    } catch {
      setHasError(true);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setValues(initial);
    setHasError(false);
  }

  const totalUnits = Object.values(values).reduce((acc, q) => acc + (q ?? 0), 0);
  const stockedTypes = Object.values(values).filter((q) => q > 0).length;

  return (
    <Card>
      <CardTitle>{labels.title(ring.name, totalUnits, stockedTypes)}</CardTitle>
      <p className="text-xs text-muted mb-3">{labels.description}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-3">
        {OBSTACLE_TYPES.map((spec) => (
          <InventoryTile
            key={spec.id}
            spec={spec}
            labels={labels}
            disabled={saving}
            quantity={values[spec.id] ?? 0}
            onChange={(n) => { setQty(spec.id, n); }}
            onStep={(d) => { step(spec.id, d); }}
          />
        ))}
      </div>

      {hasError && (
        <div className="mb-3 p-2 border border-danger bg-danger/10 text-danger rounded text-xs">
          {labels.saveError}
        </div>
      )}
      {savedAt && !dirty && !hasError && (
        <div className="mb-3 p-2 border border-success bg-success/10 text-success rounded text-xs">
          {labels.saved}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={!dirty || saving} size="sm">
          {saving ? labels.saving : labels.save}
        </Button>
        <Button onClick={handleReset} disabled={!dirty || saving} size="sm" variant="outline">
          {labels.revert}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tile + preview
// ---------------------------------------------------------------------------

interface TileProps {
  spec: ObstacleSpec;
  labels: RingInventoryEditorLabels;
  disabled: boolean;
  quantity: number;
  onChange: (n: number) => void;
  onStep: (delta: number) => void;
}

function InventoryTile({ spec, labels, disabled, quantity, onChange, onStep }: TileProps) {
  const stocked = quantity > 0;
  const copy = labels.obstacle(spec.id);
  return (
    <div
      className={[
        'flex flex-col rounded-lg border transition-colors',
        stocked
          ? 'border-warning/50 bg-warning/[0.06]'
          : 'border-border bg-surface-2/60',
      ].join(' ')}
    >
      <div
        className={[
          'h-16 px-2 pt-2 flex items-center justify-center',
          stocked ? 'opacity-100' : 'opacity-60',
        ].join(' ')}
        aria-hidden="true"
      >
        <ObstaclePreview spec={spec} />
      </div>

      <div className="px-2 pt-1">
        <div className="text-xs text-text leading-tight">{copy.name}</div>
        {copy.detail !== undefined && (
          <div className="text-[10px] text-muted leading-tight">{copy.detail}</div>
        )}
      </div>

      <div className="flex items-stretch mt-1 p-1 gap-1">
        <button
          type="button"
          aria-label={labels.decrease(copy.name)}
          onClick={() => { onStep(-1); }}
          disabled={disabled || quantity <= 0}
          className="flex-shrink-0 w-9 h-9 rounded bg-surface text-text border border-border hover:border-warning disabled:opacity-30 disabled:hover:border-border text-lg leading-none font-bold"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={quantity}
          disabled={disabled}
          onChange={(e) => { onChange(Number.parseInt(e.currentTarget.value, 10)); }}
          aria-label={labels.quantity(copy.name)}
          className={[
            'flex-1 min-w-0 bg-transparent text-center font-mono text-base',
            'focus:outline-none focus:bg-surface rounded px-1',
            stocked ? 'text-text font-semibold' : 'text-muted',
          ].join(' ')}
        />
        <button
          type="button"
          aria-label={labels.increase(copy.name)}
          disabled={disabled}
          onClick={() => { onStep(1); }}
          className="flex-shrink-0 w-9 h-9 rounded bg-surface text-text border border-border hover:border-warning text-lg leading-none font-bold"
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Renders the same silhouette the planner canvas uses, centered in a
 * shared viewBox so cross-type size comparisons read correctly.
 *
 * The outer `scale(1 -1)` mirrors the canvas convention (math Y-up); the
 * existing obstacle icons are symmetric in Y so this is purely cosmetic
 * for them, but it keeps the tunnel preview's curve direction matching
 * what the user sees on the canvas.
 */
function ObstaclePreview({ spec }: { spec: ObstacleSpec }) {
  return (
    <svg
      viewBox={`${-VIEW_W_M / 2} ${-VIEW_H_M / 2} ${VIEW_W_M} ${VIEW_H_M}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform="scale(1 -1)">
        {spec.tunnelLengthM != null ? (
          <TunnelPreview lengthM={spec.tunnelLengthM} />
        ) : (
          <ObstacleIcon type={spec.id} />
        )}
      </g>
    </svg>
  );
}

/**
 * Stylised top-down tunnel — a thick teal polyline curving into a soft
 * arch. Matches the colour and stroke profile used by
 * `PlannerCanvas` so a 6 m tunnel here looks like a 6 m tunnel there.
 */
function TunnelPreview({ lengthM }: { lengthM: number }) {
  const radius = 0.6;
  const amplitude = Math.min(0.45, lengthM * 0.1);
  const steps = 24;
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = -lengthM / 2 + lengthM * t;
    const y = amplitude * Math.sin(t * Math.PI);
    points.push(`${x},${y}`);
  }
  return (
    <polyline
      points={points.join(' ')}
      fill="none"
      stroke="var(--ah-color-course-door)"
      strokeWidth={radius * 2}
      strokeLinecap="round"
      strokeOpacity={0.85}
    />
  );
}
