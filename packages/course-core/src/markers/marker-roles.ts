/**
 * Canonical marker role descriptions, placement instructions, and
 * canonical-ring diagram coordinates — driven entirely by the marker
 * label letter (A..F) rather than the freeform `role` string stored
 * on `DBRingMarker.role`.
 *
 * The printable marker design system (prompt 15 + venue installation
 * guide) defines a fixed mapping:
 *
 *   A = Top-left marker
 *   B = Top-mid marker
 *   C = Top-right marker
 *   D = Bottom-left marker
 *   E = Bottom-mid marker
 *   F = Bottom-right marker
 *
 * As of Phase 9e1 (2026-05-18, D-A from anchoring-strategy-plan.md) all six
 * markers A..F are mandatory in every ring. The 4-marker fallback was
 * removed because multi-anchor calibration needs the redundancy of E/F to
 * stay well-conditioned at the centre of the ring. The `optional` field
 * on `MarkerRoleInfo` is preserved for backwards compatibility but is now
 * always `false`; new code should not branch on it.
 *
 * Venue admins see the canonical role/instructions on the printed pack
 * so the same pack works no matter what `DBRingMarker.role` happens to
 * contain (it's freeform for legacy reasons).
 */

export type MarkerRoleLabel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface MarkerRoleInfo {
  /** Short canonical role description, e.g. "Top-left marker". */
  readonly title: string;
  /** Two short uppercase lines suitable for the big role label on the page. */
  readonly titleLines: readonly [string, string];
  /** Two short sentences describing where the marker goes. */
  readonly placementLines: readonly string[];
  /**
   * Historically marked E/F as "recommended 6-pack only". As of Phase 9e1
   * all six markers are mandatory, so this is always `false`. Kept on the
   * interface for callers that still read it; do not branch on it in new
   * code.
   *
   * @deprecated Always `false`. Slated for removal once all consumers are
   * audited (see anchoring-strategy-plan.md §5.1).
   */
  readonly optional: boolean;
}

const ROLE_BY_LABEL: Record<MarkerRoleLabel, MarkerRoleInfo> = {
  A: {
    title: 'Top-left marker',
    titleLines: ['TOP-LEFT', 'MARKER'],
    placementLines: [
      'Mount on the top edge of the ring diagram,',
      'at the left corner.',
    ],
    optional: false,
  },
  B: {
    title: 'Top-mid marker',
    titleLines: ['TOP-MID', 'MARKER'],
    placementLines: ['Mount on the top edge of the ring diagram,', 'halfway between A and C.'],
    optional: false,
  },
  C: {
    title: 'Top-right marker',
    titleLines: ['TOP-RIGHT', 'MARKER'],
    placementLines: ['Mount on the top edge of the ring diagram,', 'at the right corner.'],
    optional: false,
  },
  D: {
    title: 'Bottom-left marker',
    titleLines: ['BOTTOM-LEFT', 'MARKER'],
    placementLines: ['Mount on the bottom edge of the ring diagram,', 'at the left corner.'],
    optional: false,
  },
  E: {
    title: 'Bottom-mid marker',
    titleLines: ['BOTTOM-MID', 'MARKER'],
    placementLines: ['Mount on the bottom edge of the ring diagram,', 'halfway between D and F.'],
    optional: false,
  },
  F: {
    title: 'Bottom-right marker',
    titleLines: ['BOTTOM-RIGHT', 'MARKER'],
    placementLines: ['Mount on the bottom edge of the ring diagram,', 'at the right corner.'],
    optional: false,
  },
};

/**
 * Normalises a label string into the canonical A..F letter, or null when
 * the label is not one of the recognised roles. Custom labels (e.g. "M7")
 * are treated as "no canonical role".
 */
export function normaliseMarkerRoleLabel(label: string): MarkerRoleLabel | null {
  const upper = label.trim().toUpperCase();
  if (
    upper === 'A' ||
    upper === 'B' ||
    upper === 'C' ||
    upper === 'D' ||
    upper === 'E' ||
    upper === 'F'
  ) {
    return upper;
  }
  return null;
}

/**
 * Canonical role description for the given label, or null when the label
 * is not in the standard A..F set.
 */
export function markerRoleInfo(label: string): MarkerRoleInfo | null {
  const canon = normaliseMarkerRoleLabel(label);
  if (!canon) return null;
  return ROLE_BY_LABEL[canon];
}

/**
 * Canonical position of a marker on the ring perimeter (in ring metres,
 * with bottom-left origin and X = length, Y = width). Used to highlight
 * the marker in the printable ring-diagram. Returns null for non-canonical labels.
 *
 * Labels are arranged in visual reading order:
 *   top edge:    A -- B -- C
 *   bottom edge: D -- E -- F
 */
export function canonicalMarkerPosition(
  label: string,
  ringLengthMeters: number,
  ringWidthMeters: number,
): { readonly xMeters: number; readonly yMeters: number } | null {
  const canon = normaliseMarkerRoleLabel(label);
  if (!canon) return null;
  const L = ringLengthMeters;
  const W = ringWidthMeters;
  switch (canon) {
    case 'A':
      return { xMeters: 0, yMeters: W };
    case 'B':
      return { xMeters: L / 2, yMeters: W };
    case 'C':
      return { xMeters: L, yMeters: W };
    case 'D':
      return { xMeters: 0, yMeters: 0 };
    case 'E':
      return { xMeters: L / 2, yMeters: 0 };
    case 'F':
      return { xMeters: L, yMeters: 0 };
  }
}

/**
 * The legacy first-four-label layout (A/B/C/D).
 *
 * @deprecated Phase 9e1 uses all six labels. Prefer `canonicalLayout6`.
 */
export function canonicalLayout4(
  ringLengthMeters: number,
  ringWidthMeters: number,
): ReadonlyArray<{
  readonly label: MarkerRoleLabel;
  readonly xMeters: number;
  readonly yMeters: number;
}> {
  return (['A', 'B', 'C', 'D'] as const).map((label) => {
    const pos = canonicalMarkerPosition(label, ringLengthMeters, ringWidthMeters)!;
    return { label, xMeters: pos.xMeters, yMeters: pos.yMeters };
  });
}

/**
 * The full canonical 6-marker layout (A..F). Useful for the recommended pack.
 */
export function canonicalLayout6(
  ringLengthMeters: number,
  ringWidthMeters: number,
): ReadonlyArray<{
  readonly label: MarkerRoleLabel;
  readonly xMeters: number;
  readonly yMeters: number;
}> {
  return (['A', 'B', 'C', 'D', 'E', 'F'] as const).map((label) => {
    const pos = canonicalMarkerPosition(label, ringLengthMeters, ringWidthMeters)!;
    return { label, xMeters: pos.xMeters, yMeters: pos.yMeters };
  });
}
