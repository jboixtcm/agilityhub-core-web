/**
 * Marker UID generation + slug normalisation (D-029).
 *
 * A marker UID is `<venue-slug>-<ring-slug>-<label-lower>` (e.g.
 * `demo-venue-ring-1-a`). It's:
 *
 *   - Deterministic — re-running the venue admin's "print marker" button
 *     produces the same string, which matters because the printed PDF
 *     is what the venue installs in their hall.
 *   - Human-readable — venue admins and AgilityHub support can read it
 *     in logs and Jira tickets without copying UUIDs around.
 *   - Unique per ring (enforced both here and by the DB constraint on
 *     `(ring_id, marker_uid)` in `supabase/migrations/...ring_environment.sql`).
 *
 * The label is the human role letter (A / B / C / D / E / F by default).
 * Slug components use a strict character set so the UID is safe to use
 * inside filenames, URL paths and AR detector lookups.
 */

// Regex range for Unicode combining diacritical marks (U+0300..U+036F).
const COMBINING_MARKS_RE = new RegExp('[̀-ͯ]', 'g');

/**
 * Lower-cased, hyphen-separated, ASCII-only slug. Strips accents, collapses
 * whitespace, drops anything outside `[a-z0-9-]`.
 *
 * Examples:
 *   normaliseSlug("Demo Partner Venue")  → "demo-partner-venue"
 *   normaliseSlug("Ring 1")              → "ring-1"
 *   normaliseSlug("__hello??world!!")    → "hello-world"
 */
export function normaliseSlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

export interface BuildMarkerUidInput {
  /** Venue slug (raw — will be normalised). */
  readonly venueSlug: string;
  /** Ring name or slug (raw — will be normalised). */
  readonly ringSlug: string;
  /** Human label, typically a single letter A..F. */
  readonly label: string;
}

/**
 * Build a marker UID for a (venue, ring, label) triple. Throws if any
 * component is empty after normalisation.
 */
export function buildMarkerUid(input: BuildMarkerUidInput): string {
  const v = normaliseSlug(input.venueSlug);
  const r = normaliseSlug(input.ringSlug);
  const l = normaliseSlug(input.label);
  if (!v) throw new Error('Marker UID: venueSlug normalises to empty string.');
  if (!r) throw new Error('Marker UID: ringSlug normalises to empty string.');
  if (!l) throw new Error('Marker UID: label normalises to empty string.');
  return `${v}-${r}-${l}`;
}

const MARKER_UID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/** Strict format check (lowercase ASCII + hyphens, at least three segments). */
export function isValidMarkerUid(uid: string): boolean {
  if (!MARKER_UID_RE.test(uid)) return false;
  const parts = uid.split('-');
  return parts.length >= 3 && parts.every((p) => p.length > 0);
}

/**
 * Default per-ring labels.
 *
 * `DEFAULT_MARKER_LABELS_6` is the only pack we ship as of Phase 9e1
 * (D-A from anchoring-strategy-plan.md). `DEFAULT_MARKER_LABELS_4` is
 * kept as a `@deprecated` export for legacy callers (e.g. import lookups
 * in old planner exports) and will be removed once no consumer references
 * it. New code should use the 6-label pack unconditionally.
 */
export const DEFAULT_MARKER_LABELS_6 = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
/** @deprecated Phase 9e1 — every ring is 6 markers. Use `DEFAULT_MARKER_LABELS_6`. */
export const DEFAULT_MARKER_LABELS_4 = ['A', 'B', 'C', 'D'] as const;

/**
 * Soft warning thresholds for the planner UI. As of Phase 9e1 the
 * recommended (and exported-to-AR-app) marker count is exactly 6; the
 * "too-few" pill below this threshold tells venue admins to add the
 * missing markers before AR sessions will calibrate cleanly. The DB
 * doesn't enforce this — it's a product guideline and an export-time
 * gate (see §5.4 of anchoring-strategy-plan.md).
 */
export const MIN_RECOMMENDED_MARKERS = 6;
export const MAX_RECOMMENDED_MARKERS = 6;

export function markerCountStatus(count: number): 'too-few' | 'ok' | 'too-many' {
  if (count < MIN_RECOMMENDED_MARKERS) return 'too-few';
  if (count > MAX_RECOMMENDED_MARKERS) return 'too-many';
  return 'ok';
}
