#!/usr/bin/env node
/**
 * `pnpm --filter @agilityhub/course-core run importer:summary <file> [<file>...]`
 *
 * Reads each Smarter `.txt` (or `.json` already-decoded outer payload — not
 * supported yet, future enhancement) and prints a compact summary as JSON.
 * Exit code is 0 only if every file parsed without throwing; a non-zero exit
 * code lists which files failed.
 *
 * If no file paths are given, defaults to every `.txt` under
 * `fixtures/smarter/`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSmarterTxt } from '../parser/parse-smarter-txt.js';
import { summarizeCourse, type CourseSummary } from '../parser/summarize-course.js';

interface CliResult {
  file: string;
  ok: boolean;
  warningsCount: number;
  warnings: string[];
  summary?: CourseSummary;
  error?: string;
}

function packageRoot(): string {
  // The CLI is at packages/course-core/src/cli/importer-summary.ts.
  // ../../ = package root (the fixtures moved from the source repo root into the package).
  const here = fileURLToPath(import.meta.url);
  return resolve(here, '..', '..', '..');
}

function defaultFixtures(): string[] {
  const dir = resolve(packageRoot(), 'fixtures', 'smarter');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((f) => resolve(dir, f));
}

function processFile(filePath: string): CliResult {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const { courseData, warnings } = parseSmarterTxt(raw, { sourceFileName: filePath });
    return {
      file: filePath,
      ok: true,
      warningsCount: warnings.length,
      warnings,
      summary: summarizeCourse(courseData),
    };
  } catch (err) {
    return {
      file: filePath,
      ok: false,
      warningsCount: 0,
      warnings: [],
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const files = args.length > 0 ? args.map((a) => resolve(process.cwd(), a)) : defaultFixtures();
  if (files.length === 0) {
    console.error(
      'No input files. Pass paths as arguments, or place Smarter .txt files under fixtures/smarter/.',
    );
    process.exit(2);
  }

  const results = files.map(processFile);
  // Single JSON document — easy to pipe to jq.
  process.stdout.write(JSON.stringify({ results }, null, 2));
  process.stdout.write('\n');

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} file(s) failed:`);
    for (const f of failed) console.error(`  - ${f.file}: ${f.error}`);
    process.exit(1);
  }
}

main();
