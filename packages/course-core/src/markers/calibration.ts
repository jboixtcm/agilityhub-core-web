/**
 * Calibration grading for the manual "Test markers" flow (D-028).
 *
 * Per `docs/prompts/16_precision_testing_and_calibration_validation_prompt.md`:
 *
 *   green  : 0–10 cm
 *   yellow : 10–20 cm
 *   red    : > 20 cm
 *   aborted: the venue admin gave up (e.g. a marker can't be detected at all)
 *
 * The overall grade is the **worst** per-marker grade — one bad marker
 * drops the whole test. Rationale: a single misplaced marker can fool
 * the AR pose into the wrong corner, so averaging would hide that.
 * We also surface the average for debugging.
 *
 * Phase 6 ships this as a pure function so the planner UI, the future
 * AR app and any admin dashboard share a single grading rule.
 */

import { z } from 'zod';

export const CALIBRATION_GREEN_MAX_CM = 10;
export const CALIBRATION_YELLOW_MAX_CM = 20;

export const calibrationOutcomeSchema = z.enum(['green', 'yellow', 'red', 'aborted']);
export type CalibrationOutcome = z.infer<typeof calibrationOutcomeSchema>;

export const calibrationMeasurementSchema = z.object({
  /** Human label (A / B / C / …). Free-form so custom labels are OK. */
  markerLabel: z.string().min(1),
  /** Optional marker uid for traceability into calibration_logs.notes. */
  markerUid: z.string().nullable().default(null),
  /**
   * Measured offset between where the AR app *said* the point would be
   * and where the venue actually measured it (cm, ≥ 0).
   *
   * If this measurement was aborted (the marker simply could not be
   * scanned), set `aborted: true` and leave `errorCm` at 0.
   */
  errorCm: z.number().nonnegative(),
  aborted: z.boolean().default(false),
  notes: z.string().nullable().default(null),
});
export type CalibrationMeasurement = z.infer<typeof calibrationMeasurementSchema>;

export const calibrationResultSchema = z.object({
  outcome: calibrationOutcomeSchema,
  /** Mean of all non-aborted error values, in cm. NaN-safe (0 when empty). */
  averageErrorCm: z.number().nonnegative(),
  /** Max of all non-aborted error values, in cm. */
  maxErrorCm: z.number().nonnegative(),
  /** Per-marker grades — same order as the input. */
  perMarker: z.array(
    z.object({
      markerLabel: z.string(),
      markerUid: z.string().nullable(),
      grade: calibrationOutcomeSchema,
      errorCm: z.number().nonnegative(),
      aborted: z.boolean(),
    }),
  ),
  /** Plain-English reasons the result landed in this band. */
  reasons: z.array(z.string()),
});
export type CalibrationResult = z.infer<typeof calibrationResultSchema>;

/** Grade a single per-marker error. */
export function gradeMeasurement(errorCm: number): CalibrationOutcome {
  if (!Number.isFinite(errorCm) || errorCm < 0) {
    return 'red';
  }
  if (errorCm <= CALIBRATION_GREEN_MAX_CM) return 'green';
  if (errorCm <= CALIBRATION_YELLOW_MAX_CM) return 'yellow';
  return 'red';
}

const SEVERITY: Record<CalibrationOutcome, number> = {
  green: 0,
  yellow: 1,
  red: 2,
  aborted: 3, // worst — treat as "not usable"
};

/** Worst-of-N outcome reducer. */
function worst(a: CalibrationOutcome, b: CalibrationOutcome): CalibrationOutcome {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

export interface GradeCalibrationInput {
  readonly measurements: ReadonlyArray<CalibrationMeasurement>;
}

/**
 * Grade a full calibration test.
 *
 *   - Empty input → `aborted` with a single explanatory reason.
 *   - Any `aborted` measurement → `aborted` overall.
 *   - Otherwise → worst per-marker grade.
 */
export function gradeCalibration(input: GradeCalibrationInput): CalibrationResult {
  const measurements = input.measurements;
  if (measurements.length === 0) {
    return {
      outcome: 'aborted',
      averageErrorCm: 0,
      maxErrorCm: 0,
      perMarker: [],
      reasons: ['No marker measurements were provided.'],
    };
  }

  const perMarker = measurements.map((m) => ({
    markerLabel: m.markerLabel,
    markerUid: m.markerUid ?? null,
    grade: m.aborted ? ('aborted' as const) : gradeMeasurement(m.errorCm),
    errorCm: m.aborted ? 0 : m.errorCm,
    aborted: m.aborted,
  }));

  let outcome: CalibrationOutcome = 'green';
  for (const row of perMarker) outcome = worst(outcome, row.grade);

  const nonAborted = perMarker.filter((m) => !m.aborted);
  const maxErrorCm = nonAborted.reduce((acc, m) => Math.max(acc, m.errorCm), 0);
  const averageErrorCm =
    nonAborted.length === 0
      ? 0
      : nonAborted.reduce((acc, m) => acc + m.errorCm, 0) / nonAborted.length;

  const reasons: string[] = [];
  const reds = perMarker.filter((m) => m.grade === 'red');
  const yellows = perMarker.filter((m) => m.grade === 'yellow');
  const aborts = perMarker.filter((m) => m.aborted);
  if (aborts.length > 0) {
    reasons.push(
      `Marker${aborts.length === 1 ? '' : 's'} ${aborts.map((m) => m.markerLabel).join(', ')} could not be tested.`,
    );
  }
  if (reds.length > 0) {
    reasons.push(
      `Marker${reds.length === 1 ? '' : 's'} ${reds.map((m) => m.markerLabel).join(', ')} measured > ${CALIBRATION_YELLOW_MAX_CM} cm off.`,
    );
  }
  if (yellows.length > 0 && reds.length === 0 && aborts.length === 0) {
    reasons.push(
      `Marker${yellows.length === 1 ? '' : 's'} ${yellows.map((m) => m.markerLabel).join(', ')} measured ${CALIBRATION_GREEN_MAX_CM}–${CALIBRATION_YELLOW_MAX_CM} cm off — usable, but consider re-checking the install.`,
    );
  }
  if (reasons.length === 0) {
    reasons.push('All markers measured within ' + CALIBRATION_GREEN_MAX_CM + ' cm.');
  }

  return {
    outcome,
    averageErrorCm: round2(averageErrorCm),
    maxErrorCm: round2(maxErrorCm),
    perMarker,
    reasons,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
