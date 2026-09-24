import { describe, expect, it } from 'vitest';
import {
  doorSchema,
  ringCenter,
  ringNoGoZoneSchema,
  ringObstructionsBounds,
  ringRect,
  ringSchema,
} from '../src/geometry/ring.js';

describe('ring schema', () => {
  it('applies defaults', () => {
    const r = ringSchema.parse({
      id: 'r1',
      lengthMeters: 30,
      widthMeters: 20,
    });
    expect(r.label).toBe('Ring');
    expect(r.doors).toEqual([]);
    expect(r.noGoZones).toEqual([]);
    expect(r.borderClearanceMeters).toBe(0.5);
  });

  it('rejects zero / negative dimensions', () => {
    expect(() => ringSchema.parse({ id: 'r1', lengthMeters: 0, widthMeters: 20 })).toThrow();
    expect(() => ringSchema.parse({ id: 'r1', lengthMeters: 20, widthMeters: -1 })).toThrow();
  });
});

describe('door / ringNoGoZone schemas', () => {
  const tri = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];

  it('door has clearance default 0.5 and requires ≥ 3 points', () => {
    const d = doorSchema.parse({ id: 'd', polygonPointsMeters: tri });
    expect(d.clearanceMeters).toBe(0.5);
    expect(d.label).toBe('Door');
    expect(() =>
      doorSchema.parse({
        id: 'd2',
        polygonPointsMeters: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      }),
    ).toThrow();
  });

  it('ring no-go zone is tagged "ring"', () => {
    const z = ringNoGoZoneSchema.parse({ id: 'z', sourceType: 'ring', polygonPointsMeters: tri });
    expect(z.sourceType).toBe('ring');
    expect(z.warningMarginMeters).toBe(0.5);
  });
});

describe('ring helpers', () => {
  it('ringRect and ringCenter are aligned with the dimensions', () => {
    const r = ringSchema.parse({ id: 'r', lengthMeters: 30, widthMeters: 20 });
    expect(ringRect(r)).toEqual({ min: { x: 0, y: 0 }, max: { x: 30, y: 20 } });
    expect(ringCenter(r)).toEqual({ x: 15, y: 10 });
  });

  it('ringObstructionsBounds is null when no doors / zones', () => {
    const r = ringSchema.parse({ id: 'r', lengthMeters: 30, widthMeters: 20 });
    expect(ringObstructionsBounds(r)).toBeNull();
  });

  it('ringObstructionsBounds wraps every polygon point', () => {
    const r = ringSchema.parse({
      id: 'r',
      lengthMeters: 30,
      widthMeters: 20,
      doors: [
        {
          id: 'd',
          polygonPointsMeters: [
            { x: 1, y: 1 },
            { x: 3, y: 1 },
            { x: 3, y: 3 },
            { x: 1, y: 3 },
          ],
        },
      ],
      noGoZones: [
        {
          id: 'z',
          sourceType: 'ring',
          polygonPointsMeters: [
            { x: 20, y: 10 },
            { x: 25, y: 10 },
            { x: 25, y: 12 },
            { x: 20, y: 12 },
          ],
        },
      ],
    });
    const b = ringObstructionsBounds(r)!;
    expect(b.min).toEqual({ x: 1, y: 1 });
    expect(b.max).toEqual({ x: 25, y: 12 });
  });
});
