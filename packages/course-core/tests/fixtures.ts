import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Path to the package root, derived from this test file's location. In the
 * source monorepo the fixtures lived at the repo root (`fixtures/`); here they
 * live inside the package (`packages/course-core/fixtures/`).
 */
const HERE = fileURLToPath(import.meta.url);
export const PACKAGE_ROOT = resolve(HERE, '..', '..');

export const SMARTER_FIXTURES_DIR = resolve(PACKAGE_ROOT, 'fixtures', 'smarter');
export const COLORS_FIXTURES_DIR = resolve(PACKAGE_ROOT, 'fixtures', 'colors');
/** The 4 Smarter route-validation files of the web-planner (S16 §14.3, T-16-01). */
export const ROUTE_VALIDATION_FIXTURES_DIR = resolve(PACKAGE_ROOT, 'fixtures', 'route-validation');

export interface SmarterFixture {
  /** Absolute path. */
  readonly path: string;
  /** Basename, e.g. "jp-s-sw_993483_sadesign.txt". */
  readonly name: string;
  /** File contents (utf-8). */
  readonly raw: string;
}

export function listSmarterFixtures(): SmarterFixture[] {
  const stats = statSync(SMARTER_FIXTURES_DIR);
  if (!stats.isDirectory()) {
    throw new Error(`SMARTER_FIXTURES_DIR is not a directory: ${SMARTER_FIXTURES_DIR}`);
  }
  return readdirSync(SMARTER_FIXTURES_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((name) => ({
      path: resolve(SMARTER_FIXTURES_DIR, name),
      name,
      raw: readFileSync(resolve(SMARTER_FIXTURES_DIR, name), 'utf-8'),
    }));
}

export function readColorsFixture(): { name: string; raw: string } {
  const files = readdirSync(COLORS_FIXTURES_DIR).filter((f) => f.endsWith('.txt'));
  if (files.length === 0) throw new Error(`No color fixture in ${COLORS_FIXTURES_DIR}`);
  const name = files[0]!;
  return { name, raw: readFileSync(resolve(COLORS_FIXTURES_DIR, name), 'utf-8') };
}

/**
 * Fixtures known to carry logos and/or a no-go (AT) zone. Used by targeted
 * assertions so we don't conflate "all fixtures" with "fixtures that include
 * this feature".
 */
export const FIXTURES_WITH_LOGOS = ['ag-au-tryout-i-copy-with-logo_998859_sadesign.txt'];
export const FIXTURES_WITH_NO_GO_ZONES = [
  'ag-au-tryout-i-copy_998859_sadesign.txt',
  'ag-au-tryout-i-copy-with-logo_998859_sadesign.txt',
];
