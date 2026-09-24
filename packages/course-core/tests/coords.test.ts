import { describe, expect, it } from 'vitest';
import {
  pxToMetersPoint,
  pxToMetersX,
  pxToMetersY,
  pxToRingMetersPoint,
  ringMetersToPxPoint,
  unitToMetersFactor,
} from '../src/parser/coords.js';

describe('coords', () => {
  const frame = {
    canvasWidth: 600,
    canvasHeight: 300,
    designLengthMeters: 30,
    designWidthMeters: 15,
  };

  it('converts canvas X to meters', () => {
    expect(pxToMetersX(0, frame)).toBe(0);
    expect(pxToMetersX(600, frame)).toBe(30);
    expect(pxToMetersX(300, frame)).toBe(15);
  });

  it('converts canvas Y to meters', () => {
    expect(pxToMetersY(0, frame)).toBe(0);
    expect(pxToMetersY(300, frame)).toBe(15);
    expect(pxToMetersY(150, frame)).toBe(7.5);
  });

  it('converts (x,y) together', () => {
    expect(pxToMetersPoint(60, 30, frame)).toEqual({ x: 3, y: 1.5 });
  });

  it('treats FT/F/FEET as a 0.3048 meters multiplier; M as 1', () => {
    expect(unitToMetersFactor('M')).toBe(1);
    expect(unitToMetersFactor('m')).toBe(1);
    expect(unitToMetersFactor(undefined)).toBe(1);
    expect(unitToMetersFactor('FT')).toBeCloseTo(0.3048, 6);
    expect(unitToMetersFactor('feet')).toBeCloseTo(0.3048, 6);
  });

  it('round-trips bottom-left ring meters through Smarter canvas pixels', () => {
    const ringPoint = { x: 7.25, y: 3.75 };
    const canvasPoint = ringMetersToPxPoint(ringPoint.x, ringPoint.y, frame);
    expect(canvasPoint).toEqual({ x: 145, y: 225 });
    expect(pxToRingMetersPoint(canvasPoint.x, canvasPoint.y, frame)).toEqual(ringPoint);
  });
});
