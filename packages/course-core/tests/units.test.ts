import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLEARANCE_FT,
  DEFAULT_CLEARANCE_M,
  feetToMeters,
  formatFeet,
  formatLength,
  formatMeters,
  METERS_PER_FOOT,
  metersToFeet,
} from '../src/geometry/units.js';

describe('units', () => {
  it('METERS_PER_FOOT round-trips', () => {
    expect(metersToFeet(feetToMeters(7))).toBeCloseTo(7, 6);
  });

  it('default clearance 0.5 m matches the prompt-spelt 1.6 ft to within rounding', () => {
    expect(DEFAULT_CLEARANCE_M).toBe(0.5);
    expect(DEFAULT_CLEARANCE_FT).toBe(1.6);
    // 0.5 m converts to ≈ 1.640419947 ft. Rounding to 1 dp ⇒ 1.6 ft.
    expect(
      Number.parseFloat(formatFeet(metersToFeet(DEFAULT_CLEARANCE_M), { withUnit: false })),
    ).toBe(1.6);
  });

  it('formatMeters defaults to 2 decimals with unit', () => {
    expect(formatMeters(1.23456)).toBe('1.23 m');
    expect(formatMeters(1.23456, { precision: 1 })).toBe('1.2 m');
    expect(formatMeters(2, { withUnit: false })).toBe('2.00');
  });

  it('formatFeet defaults to 1 decimal with unit', () => {
    expect(formatFeet(1.234)).toBe('1.2 ft');
    expect(formatFeet(METERS_PER_FOOT * 10, { withUnit: false })).toBe(
      (METERS_PER_FOOT * 10).toFixed(1),
    );
  });

  it('formatLength switches on UnitSystem', () => {
    expect(formatLength(1, 'M')).toBe('1.00 m');
    expect(formatLength(1, 'FT')).toBe(`${metersToFeet(1).toFixed(1)} ft`);
  });

  it('R-16-17 formats lengths with the reader locale when one is given', () => {
    expect(formatLength(0.5, 'M', { locale: 'ca' })).toBe('0,50 m');
    expect(formatLength(0.5, 'M', { locale: 'es' })).toBe('0,50 m');
    expect(formatLength(0.5, 'M', { locale: 'en' })).toBe('0.50 m');
    expect(formatLength(1, 'FT', { locale: 'ca' })).toBe('3,3 ft');
    expect(formatMeters(40, { locale: 'ca', precision: 0 })).toBe('40 m');
  });
});
