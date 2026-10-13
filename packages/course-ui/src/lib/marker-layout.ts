import type { PlannerRingMarker as DBRingMarker } from './storage/types.js';

type CanonicalLabel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

const CANONICAL_LABELS: readonly CanonicalLabel[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const EPSILON_M = 0.75;

/**
 * Phase 9e1 originally wrote the six labels in the old perimeter order:
 *
 *   top:    B F D
 *   bottom: A E C
 *
 * The product convention is reading order:
 *
 *   top:    A B C
 *   bottom: D E F
 *
 * Until every Supabase project has run the data migration, normalize that
 * exact legacy shape at read time so planner diagrams, marker downloads,
 * and AR exports agree with the printable instructions.
 */
export function normalizeLegacyMarkerReadingOrder(
  markers: readonly DBRingMarker[],
): DBRingMarker[] {
  const byLabel = activeCanonicalMarkersByLabel(markers);
  if (!byLabel || !looksLikeLegacyPerimeterOrder(byLabel)) {
    return [...markers];
  }

  const targetByLabel: Record<CanonicalLabel, DBRingMarker> = {
    A: byLabel.B,
    B: byLabel.F,
    C: byLabel.D,
    D: byLabel.A,
    E: byLabel.E,
    F: byLabel.C,
  };

  return markers.map((marker) => {
    const label = marker.label.trim().toUpperCase() as CanonicalLabel;
    if (!marker.is_active || !isCanonicalLabel(label)) return marker;
    const target = targetByLabel[label];
    return { ...marker, x_m: target.x_m, y_m: target.y_m };
  });
}

function activeCanonicalMarkersByLabel(
  markers: readonly DBRingMarker[],
): Record<CanonicalLabel, DBRingMarker> | null {
  const out = new Map<CanonicalLabel, DBRingMarker>();
  let activeCount = 0;
  for (const marker of markers) {
    if (!marker.is_active) continue;
    activeCount += 1;
    const label = marker.label.trim().toUpperCase();
    if (!isCanonicalLabel(label)) continue;
    if (out.has(label)) return null;
    out.set(label, marker);
  }

  if (activeCount !== CANONICAL_LABELS.length) return null;

  for (const label of CANONICAL_LABELS) {
    if (!out.has(label)) return null;
  }

  return Object.fromEntries(out) as Record<CanonicalLabel, DBRingMarker>;
}

function looksLikeLegacyPerimeterOrder(markers: Record<CanonicalLabel, DBRingMarker>): boolean {
  const { A, B, C, D, E, F } = markers;
  return (
    nearly(A.x_m, B.x_m) &&
    nearly(E.x_m, F.x_m) &&
    nearly(C.x_m, D.x_m) &&
    nearly(A.y_m, E.y_m) &&
    nearly(A.y_m, C.y_m) &&
    nearly(B.y_m, F.y_m) &&
    nearly(B.y_m, D.y_m) &&
    B.y_m > A.y_m + EPSILON_M &&
    E.x_m > A.x_m + EPSILON_M &&
    C.x_m > E.x_m + EPSILON_M
  );
}

function nearly(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON_M;
}

function isCanonicalLabel(label: string): label is CanonicalLabel {
  return (CANONICAL_LABELS as readonly string[]).includes(label);
}
