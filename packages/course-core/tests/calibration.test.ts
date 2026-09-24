import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_GREEN_MAX_CM,
  CALIBRATION_YELLOW_MAX_CM,
  gradeCalibration,
  gradeMeasurement,
} from '../src/markers/calibration.js';

describe('gradeMeasurement (per-marker)', () => {
  it('respects the green / yellow / red thresholds', () => {
    expect(CALIBRATION_GREEN_MAX_CM).toBe(10);
    expect(CALIBRATION_YELLOW_MAX_CM).toBe(20);
    expect(gradeMeasurement(0)).toBe('green');
    expect(gradeMeasurement(9.9)).toBe('green');
    expect(gradeMeasurement(10)).toBe('green');
    expect(gradeMeasurement(10.01)).toBe('yellow');
    expect(gradeMeasurement(20)).toBe('yellow');
    expect(gradeMeasurement(20.01)).toBe('red');
    expect(gradeMeasurement(1000)).toBe('red');
  });

  it('treats NaN / negative as red', () => {
    expect(gradeMeasurement(Number.NaN)).toBe('red');
    expect(gradeMeasurement(-1)).toBe('red');
  });
});

describe('gradeCalibration (overall outcome — worst-of-N)', () => {
  it('aborted when no measurements provided', () => {
    const r = gradeCalibration({ measurements: [] });
    expect(r.outcome).toBe('aborted');
    expect(r.averageErrorCm).toBe(0);
    expect(r.maxErrorCm).toBe(0);
    expect(r.reasons[0]).toMatch(/no marker measurements/i);
  });

  it('green when all measurements ≤ 10 cm', () => {
    const r = gradeCalibration({
      measurements: [
        { markerLabel: 'A', markerUid: null, errorCm: 1.2, aborted: false, notes: null },
        { markerLabel: 'B', markerUid: null, errorCm: 5, aborted: false, notes: null },
        { markerLabel: 'C', markerUid: null, errorCm: 9.9, aborted: false, notes: null },
      ],
    });
    expect(r.outcome).toBe('green');
    expect(r.maxErrorCm).toBeCloseTo(9.9, 6);
    expect(r.averageErrorCm).toBeCloseTo((1.2 + 5 + 9.9) / 3, 1);
    expect(r.perMarker.map((p) => p.grade)).toEqual(['green', 'green', 'green']);
  });

  it('yellow when worst is 10–20 cm and none are red', () => {
    const r = gradeCalibration({
      measurements: [
        { markerLabel: 'A', markerUid: null, errorCm: 5, aborted: false, notes: null },
        { markerLabel: 'B', markerUid: null, errorCm: 12, aborted: false, notes: null },
        { markerLabel: 'C', markerUid: null, errorCm: 18, aborted: false, notes: null },
      ],
    });
    expect(r.outcome).toBe('yellow');
    expect(r.maxErrorCm).toBeCloseTo(18, 6);
    expect(r.perMarker.find((p) => p.markerLabel === 'B')!.grade).toBe('yellow');
    expect(r.reasons[0]).toMatch(/usable/i);
  });

  it('red when any single marker is > 20 cm — one bad marker drops the whole test', () => {
    const r = gradeCalibration({
      measurements: [
        { markerLabel: 'A', markerUid: null, errorCm: 2, aborted: false, notes: null },
        { markerLabel: 'B', markerUid: null, errorCm: 3, aborted: false, notes: null },
        { markerLabel: 'C', markerUid: null, errorCm: 4, aborted: false, notes: null },
        { markerLabel: 'D', markerUid: null, errorCm: 35, aborted: false, notes: null },
      ],
    });
    expect(r.outcome).toBe('red');
    expect(r.maxErrorCm).toBe(35);
    // Average excludes aborts; with no aborts, average over all four.
    expect(r.averageErrorCm).toBeCloseTo((2 + 3 + 4 + 35) / 4, 1);
    expect(r.reasons.some((s) => /D measured > 20 cm/i.test(s))).toBe(true);
  });

  it('aborted when any single marker is aborted', () => {
    const r = gradeCalibration({
      measurements: [
        { markerLabel: 'A', markerUid: null, errorCm: 0, aborted: false, notes: null },
        { markerLabel: 'B', markerUid: null, errorCm: 0, aborted: true, notes: null },
      ],
    });
    expect(r.outcome).toBe('aborted');
    expect(r.perMarker[1]!.grade).toBe('aborted');
    expect(r.reasons[0]).toMatch(/could not be tested/i);
  });

  it('average and max ignore aborted measurements', () => {
    const r = gradeCalibration({
      measurements: [
        { markerLabel: 'A', markerUid: null, errorCm: 6, aborted: false, notes: null },
        { markerLabel: 'B', markerUid: null, errorCm: 0, aborted: true, notes: null },
        { markerLabel: 'C', markerUid: null, errorCm: 8, aborted: false, notes: null },
      ],
    });
    // outcome is aborted (B), but the numbers should still reflect A + C only.
    expect(r.outcome).toBe('aborted');
    expect(r.averageErrorCm).toBeCloseTo(7, 6);
    expect(r.maxErrorCm).toBe(8);
  });

  it('preserves marker UID for traceability', () => {
    const r = gradeCalibration({
      measurements: [
        {
          markerLabel: 'A',
          markerUid: 'demo-venue-ring-1-a',
          errorCm: 4,
          aborted: false,
          notes: null,
        },
      ],
    });
    expect(r.perMarker[0]!.markerUid).toBe('demo-venue-ring-1-a');
  });
});
