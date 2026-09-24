import { describe, expect, it } from 'vitest';
import {
  parseSmarterColorsTxt,
  SmarterColorsParseError,
} from '../src/parser/parse-smarter-colors-txt.js';
import { readColorsFixture } from './fixtures.js';

describe('parseSmarterColorsTxt', () => {
  const colors = readColorsFixture();
  const result = parseSmarterColorsTxt(colors.raw);

  it('finds at least one theme', () => {
    expect(result.themes.length).toBeGreaterThan(0);
  });

  it('includes the agilityhub palette (default theme id)', () => {
    expect(result.byId.has('agilityhub')).toBe(true);
  });

  it('every theme has obstacle colors for the most common keys (j, dj, dw, af, ss, t3, t4, at)', () => {
    for (const theme of result.themes) {
      for (const key of ['j', 'dj', 'dw', 'af', 'ss', 'at']) {
        expect(theme.obstacleColors).toHaveProperty(key);
      }
    }
  });

  it('fill / stroke fields are hex-ish strings when present', () => {
    const theme = result.byId.get('agilityhub')!;
    const j = theme.obstacleColors['j']!;
    if (j.fill != null) expect(j.fill).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    if (j.stroke != null) expect(j.stroke).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  it('throws SmarterColorsParseError on invalid JSON', () => {
    expect(() => parseSmarterColorsTxt('not json')).toThrowError(SmarterColorsParseError);
  });

  it('throws when obstacleCustomColors is absent', () => {
    expect(() => parseSmarterColorsTxt('{"other":"thing"}')).toThrowError(SmarterColorsParseError);
  });
});
