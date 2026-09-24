import { describe, expect, it } from 'vitest';
import {
  buildMarkerUid,
  DEFAULT_MARKER_LABELS_4,
  DEFAULT_MARKER_LABELS_6,
  isValidMarkerUid,
  markerCountStatus,
  MAX_RECOMMENDED_MARKERS,
  MIN_RECOMMENDED_MARKERS,
  normaliseSlug,
} from '../src/markers/marker-id.js';

describe('normaliseSlug', () => {
  it('lower-cases, hyphenates spaces, strips punctuation', () => {
    expect(normaliseSlug('Demo Partner Venue')).toBe('demo-partner-venue');
    expect(normaliseSlug('Ring 1')).toBe('ring-1');
    expect(normaliseSlug('__hello??world!!')).toBe('hello-world');
  });

  it('strips accents', () => {
    expect(normaliseSlug('Sant Cugat')).toBe('sant-cugat');
    expect(normaliseSlug('Aïoli & garlic')).toBe('aioli-garlic');
  });

  it('drops leading / trailing hyphens', () => {
    expect(normaliseSlug('   hello   ')).toBe('hello');
    expect(normaliseSlug('---a---b---')).toBe('a-b');
  });

  it('returns empty string for empty / punctuation-only input', () => {
    expect(normaliseSlug('')).toBe('');
    expect(normaliseSlug('---')).toBe('');
    expect(normaliseSlug('!!!')).toBe('');
  });
});

describe('buildMarkerUid', () => {
  it('joins normalised parts with hyphens', () => {
    expect(buildMarkerUid({ venueSlug: 'Demo Venue', ringSlug: 'Ring 1', label: 'A' })).toBe(
      'demo-venue-ring-1-a',
    );
  });

  it('produces stable strings for stable inputs (deterministic)', () => {
    const a = buildMarkerUid({ venueSlug: 'v', ringSlug: 'r', label: 'B' });
    const b = buildMarkerUid({ venueSlug: 'v', ringSlug: 'r', label: 'B' });
    expect(a).toBe(b);
  });

  it('throws on any empty component (post-normalisation)', () => {
    expect(() => buildMarkerUid({ venueSlug: '', ringSlug: 'r', label: 'A' })).toThrow();
    expect(() => buildMarkerUid({ venueSlug: 'v', ringSlug: '---', label: 'A' })).toThrow();
    expect(() => buildMarkerUid({ venueSlug: 'v', ringSlug: 'r', label: '!' })).toThrow();
  });
});

describe('isValidMarkerUid', () => {
  it('accepts well-formed UIDs', () => {
    expect(isValidMarkerUid('demo-venue-ring-1-a')).toBe(true);
    expect(isValidMarkerUid('v-r-a')).toBe(true);
  });
  it('rejects malformed UIDs', () => {
    expect(isValidMarkerUid('')).toBe(false);
    expect(isValidMarkerUid('v-r')).toBe(false); // 2 segments only
    expect(isValidMarkerUid('-v-r-a')).toBe(false);
    expect(isValidMarkerUid('Venue-r-a')).toBe(false); // uppercase
    expect(isValidMarkerUid('v r a')).toBe(false); // spaces
  });
});

describe('markerCountStatus', () => {
  // Phase 9e1: the recommended count collapsed to exactly 6 — see
  // anchoring-strategy-plan.md §5.1 (D-A: always 6 markers per ring).
  it('flags any count below 6 as too-few and any above 6 as too-many', () => {
    expect(MIN_RECOMMENDED_MARKERS).toBe(6);
    expect(MAX_RECOMMENDED_MARKERS).toBe(6);
    expect(markerCountStatus(0)).toBe('too-few');
    expect(markerCountStatus(2)).toBe('too-few');
    expect(markerCountStatus(4)).toBe('too-few');
    expect(markerCountStatus(5)).toBe('too-few');
    expect(markerCountStatus(6)).toBe('ok');
    expect(markerCountStatus(7)).toBe('too-many');
  });

  it('default label tables span the right ranges', () => {
    // DEFAULT_MARKER_LABELS_4 is @deprecated but kept for legacy callers
    // until they're all migrated to the 6-pack — see marker-id.ts.
    expect(DEFAULT_MARKER_LABELS_4).toEqual(['A', 'B', 'C', 'D']);
    expect(DEFAULT_MARKER_LABELS_6).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});
