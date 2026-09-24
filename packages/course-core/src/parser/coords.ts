/**
 * Canvas-pixel → meters conversion.
 *
 * Smarter exports use:
 *   length     = horizontal design dimension (meters or feet, per `units`)
 *   width      = vertical design dimension
 *   canvasWidth/canvasHeight = horizontal/vertical pixel dimensions
 *
 * **Smarter's pixel-per-meter convention is a fixed 20 px/m**, NOT
 * `canvasWidth/length`. The canvas is wider/taller than `length*20 ×
 * width*20` to leave room for grid-label chrome — verified across 8 fixtures
 * (ring sizes 27×29, 29×27, 40×20, 41×23, 45×28): every file has
 * `canvasWidth - length*20 = 46 px` and `canvasHeight - width*20 = 73 px`,
 * regardless of ring size or `spacing` setting. The ring drawing area
 * starts at canvas (0, 0); the 46/73 margins are RIGHT/BOTTOM chrome.
 *
 * Using `canvasWidth/length` (the old, naive convention) gave a per-axis
 * scale of 21–24 px/m and shifted every obstacle inward by ~2 m on each
 * axis — the bug Jordi spotted comparing planner renders against Smarter
 * exports.
 *
 * Internal storage is METERS regardless of source `units`. UI converts to
 * feet for display when needed (Phase 2 helper).
 *
 * Origin handling: most Smarter exports use `LT` (left/top); we don't flip
 * Y by default, leaving downstream tools to remap when rendering. The
 * origin string is preserved on `CourseData.origin`.
 */
export interface CanvasFrame {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly designLengthMeters: number;
  readonly designWidthMeters: number;
}

/**
 * Smarter's fixed canvas scale. See file header — confirmed across 8
 * production fixtures spanning multiple ring sizes.
 */
export const SMARTER_PX_PER_METER = 20;

/** One meter == this many source canvas units (uniform across axes). */
export function pxPerMeter(_frame: CanvasFrame): { x: number; y: number } {
  return { x: SMARTER_PX_PER_METER, y: SMARTER_PX_PER_METER };
}

export function pxToMetersX(pxX: number, _frame: CanvasFrame): number {
  return pxX / SMARTER_PX_PER_METER;
}

export function pxToMetersY(pxY: number, _frame: CanvasFrame): number {
  return pxY / SMARTER_PX_PER_METER;
}

export function pxToMetersPoint(
  pxX: number,
  pxY: number,
  frame: CanvasFrame,
): { x: number; y: number } {
  return { x: pxToMetersX(pxX, frame), y: pxToMetersY(pxY, frame) };
}

/**
 * Smarter exports use `LT` (left/top) pixel origin → Y grows DOWN on the
 * canvas. The rest of the codebase (CourseData, CoursePlacement,
 * Ring/door/marker geometry, the AR scene) works in **ring frame**: a
 * bottom-left origin where +Y grows UP (D-011). To keep one frame
 * throughout the system we flip Y at parse time:
 *
 *   ringY = designWidthMeters - pxToMetersY(pxY, frame)
 *
 * Use these helpers for any meter-frame coordinate emitted into
 * CourseData (obstacle anchors, control points, no-go polygon points,
 * number labels). Do NOT use them inside `rawMetadata._canvas` — those
 * fields preserve the original pixel coords for debugging.
 */
export function pxToRingMetersY(pxY: number, frame: CanvasFrame): number {
  return frame.designWidthMeters - pxToMetersY(pxY, frame);
}

export function pxToRingMetersPoint(
  pxX: number,
  pxY: number,
  frame: CanvasFrame,
): { x: number; y: number } {
  return { x: pxToMetersX(pxX, frame), y: pxToRingMetersY(pxY, frame) };
}

/** Inverse of `pxToMetersX`: ring-frame meters → Smarter canvas X. */
export function ringMetersToPxX(metersX: number, _frame: CanvasFrame): number {
  return metersX * SMARTER_PX_PER_METER;
}

/**
 * Inverse of `pxToRingMetersY`: bottom-left, Y-up ring meters → Smarter's
 * top-left, Y-down canvas coordinate.
 */
export function ringMetersToPxY(metersY: number, frame: CanvasFrame): number {
  return (frame.designWidthMeters - metersY) * SMARTER_PX_PER_METER;
}

/** Inverse of `pxToRingMetersPoint`. */
export function ringMetersToPxPoint(
  metersX: number,
  metersY: number,
  frame: CanvasFrame,
): { x: number; y: number } {
  return {
    x: ringMetersToPxX(metersX, frame),
    y: ringMetersToPxY(metersY, frame),
  };
}

/**
 * Convert source `units` (`"M"` or `"FT"`) into a meters multiplier. We
 * always store meters internally, so this is the factor that turns the
 * source's `length` / `width` numeric values into meters.
 */
export function unitToMetersFactor(units: string | null | undefined): number {
  const u = (units ?? 'M').toUpperCase();
  if (u === 'FT' || u === 'F' || u === 'FEET') return 0.3048;
  return 1; // M, metres, anything else
}
