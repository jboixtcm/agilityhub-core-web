/**
 * Unit display helpers.
 *
 * Internal storage is meters (D-006). These helpers exist for UI display
 * and for spelling thresholds with their imperial equivalent in user-facing
 * warnings.
 *
 * The numeric value of the imperial threshold matches the master prompt
 * and Phase 2 detailed prompt: 0.5 m ≈ 1.6 ft.
 */
import type { UnitSystem } from '../schema/primitives.js';

export const METERS_PER_FOOT = 0.3048;
export const FEET_PER_METER = 1 / METERS_PER_FOOT;

/** Default border / clearance threshold (meters). User can override per-ring. */
export const DEFAULT_CLEARANCE_M = 0.5;

/** Same threshold expressed in feet, pre-rounded to the value the prompt uses. */
export const DEFAULT_CLEARANCE_FT = 1.6;

export const metersToFeet = (m: number): number => m * FEET_PER_METER;
export const feetToMeters = (ft: number): number => ft * METERS_PER_FOOT;

export interface FormatLengthOptions {
  /** Decimal places. Default: 2 for meters, 1 for feet. */
  readonly precision?: number;
  /** If true, include the unit suffix (" m" / " ft"). Default: true. */
  readonly withUnit?: boolean;
  /**
   * BCP 47 locale of the reader (the club's locale in the apps, R-16-17): «0,50 m» in `ca`/`es`,
   * «0.50 m» in `en`. Without it the recovered `toFixed` output is kept (files, logs, exports).
   */
  readonly locale?: string;
}

function formatNumber(value: number, precision: number, locale: string | undefined): string {
  const rounded = roundTo(value, precision);
  return locale === undefined
    ? rounded.toFixed(precision)
    : new Intl.NumberFormat(locale, {
        maximumFractionDigits: precision,
        minimumFractionDigits: precision,
      }).format(rounded);
}

export function formatMeters(m: number, opts: FormatLengthOptions = {}): string {
  const precision = opts.precision ?? 2;
  const withUnit = opts.withUnit ?? true;
  const v = formatNumber(m, precision, opts.locale);
  return withUnit ? `${v} m` : v;
}

export function formatFeet(ft: number, opts: FormatLengthOptions = {}): string {
  const precision = opts.precision ?? 1;
  const withUnit = opts.withUnit ?? true;
  const v = formatNumber(ft, precision, opts.locale);
  return withUnit ? `${v} ft` : v;
}

/**
 * Format a length value (stored in meters) using the user's preferred
 * display system. Convenient for UI strings that switch on a single setting.
 */
export function formatLength(
  meters: number,
  system: UnitSystem,
  opts: FormatLengthOptions = {},
): string {
  return system === 'FT' ? formatFeet(metersToFeet(meters), opts) : formatMeters(meters, opts);
}

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
