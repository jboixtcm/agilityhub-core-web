/**
 * Decodes the Smarter `.txt` wrapper:
 *
 *   <prelude text...>
 *   +++++++SAD<base64 payload>SAD+++++++
 *   <trailing text...>
 *
 * The payload base64-decodes to a UTF-8 JSON string whose `settings` field
 * is itself a JSON string. We don't parse `settings` here — see
 * `parseSmarterTxt` for the full pipeline.
 */

const WRAPPER_RE = /\+\+\+\+\+\+\+SAD([\s\S]*?)SAD\+\+\+\+\+\+\+/;

export const SMARTER_WRAPPER_PRELUDE =
  'Copy the text below and paste it in the Smarter Agility import form';

/**
 * Root error class for anything the Smarter pipeline throws. Specific
 * failures (wrapper missing, base64 bad, etc.) extend this so callers can
 * `catch (e) { if (e instanceof SmarterParseError) ... }` and not have to
 * worry about which step failed.
 *
 * Defined here (not in parse-smarter-txt.ts) so wrapper.ts has no upward
 * dependency. The parser re-exports the same class for ergonomics.
 */
export class SmarterParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmarterParseError';
  }
}

export class SmarterWrapperError extends SmarterParseError {
  constructor(message: string) {
    super(message);
    this.name = 'SmarterWrapperError';
  }
}

/** Returns the base64 payload (still encoded), trimmed. */
export function extractSmarterPayload(rawFile: string): string {
  const match = rawFile.match(WRAPPER_RE);
  if (!match || !match[1]) {
    throw new SmarterWrapperError(
      'Could not find a "+++++++SAD ... SAD+++++++" wrapper in the input file.',
    );
  }
  return match[1].trim();
}

/**
 * Decodes the base64 payload and returns the decoded JSON string.
 *
 * Uses `atob` + `TextDecoder` so this works identically in browsers, Node
 * ≥ 16 (where both are globals), and Workers. We deliberately avoid
 * `Buffer` so the parser stays usable inside the planner's client bundle.
 */
export function decodeSmarterPayload(base64Payload: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = (globalThis as { atob?: (s: string) => string }).atob;
    if (typeof a !== 'function') {
      throw new Error('atob is not available in this runtime');
    }
    const binary = a(base64Payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch (err) {
    throw new SmarterWrapperError(`Base64 decode failed: ${(err as Error).message}`);
  }
}

/**
 * UTF-8 JSON/text → base64, implemented with browser-compatible globals.
 * This mirrors `decodeSmarterPayload` without introducing a Node `Buffer`
 * dependency into the client bundle.
 */
export function encodeSmarterPayload(decodedPayload: string): string {
  try {
    const b = (globalThis as { btoa?: (s: string) => string }).btoa;
    if (typeof b !== 'function') {
      throw new Error('btoa is not available in this runtime');
    }

    const bytes = new TextEncoder().encode(decodedPayload);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return b(binary);
  } catch (err) {
    throw new SmarterWrapperError(`Base64 encode failed: ${(err as Error).message}`);
  }
}

/** Wraps a decoded outer JSON payload as a complete Smarter import text file. */
export function wrapSmarterPayload(
  decodedPayload: string,
  prelude = SMARTER_WRAPPER_PRELUDE,
): string {
  return `${prelude}\n+++++++SAD${encodeSmarterPayload(decodedPayload)}SAD+++++++`;
}
