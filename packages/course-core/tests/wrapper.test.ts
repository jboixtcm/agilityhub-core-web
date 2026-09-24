import { describe, expect, it } from 'vitest';
import {
  decodeSmarterPayload,
  encodeSmarterPayload,
  extractSmarterPayload,
  SmarterWrapperError,
  wrapSmarterPayload,
} from '../src/parser/wrapper.js';

describe('wrapper', () => {
  it('extracts the payload between +++++++SAD ... SAD+++++++', () => {
    const file = 'prefix\n+++++++SADaGVsbG8=SAD+++++++\nsuffix';
    expect(extractSmarterPayload(file)).toBe('aGVsbG8=');
  });

  it('trims whitespace inside the wrapper', () => {
    const file = '+++++++SAD  aGVsbG8=  SAD+++++++';
    expect(extractSmarterPayload(file)).toBe('aGVsbG8=');
  });

  it('throws SmarterWrapperError when the wrapper is missing', () => {
    expect(() => extractSmarterPayload('no markers here')).toThrowError(SmarterWrapperError);
  });

  it('decodes a base64 payload to UTF-8', () => {
    expect(decodeSmarterPayload('aGVsbG8gd29ybGQ=')).toBe('hello world');
  });

  it('encodes UTF-8 and wraps it for a Smarter import', () => {
    const decoded = JSON.stringify({ title: 'Jordi Boix Baró 🐕' });
    const base64 = encodeSmarterPayload(decoded);
    expect(decodeSmarterPayload(base64)).toBe(decoded);
    expect(decodeSmarterPayload(extractSmarterPayload(wrapSmarterPayload(decoded)))).toBe(decoded);
  });
});
