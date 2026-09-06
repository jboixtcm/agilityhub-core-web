import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authoritativeInput = resolve(packageRoot, "openapi/openapi.json");
const pendingInput = resolve(packageRoot, "openapi/pending.json");
const output = resolve(packageRoot, "src/generated/schema.d.ts");

function readDocument(inputPath) {
  return JSON.parse(readFileSync(inputPath, "utf8"));
}

function clientPath(path) {
  return path.replace(/^\/api\/v1(?=\/)/, "");
}

function assertNoPendingRedefinitions(authoritative, pending) {
  const authoritativePaths = new Set(Object.keys(authoritative.paths ?? {}).map(clientPath));
  const duplicatePaths = Object.keys(pending.paths ?? {})
    .map(clientPath)
    .filter((path) => authoritativePaths.has(path));
  const duplicateComponents = Object.entries(pending.components ?? {}).flatMap(
    ([section, pendingEntries]) => {
      const authoritativeEntries = new Set(
        Object.keys(authoritative.components?.[section] ?? {}),
      );
      return Object.keys(pendingEntries)
        .filter((name) => authoritativeEntries.has(name))
        .map((name) => `${section}.${name}`);
    },
  );

  if (duplicatePaths.length > 0 || duplicateComponents.length > 0) {
    const details = [
      duplicatePaths.length === 0 ? undefined : `paths: ${duplicatePaths.join(", ")}`,
      duplicateComponents.length === 0
        ? undefined
        : `components: ${duplicateComponents.join(", ")}`,
    ].filter(Boolean);
    throw new Error(
      `openapi/pending.json redefines authoritative contract entries (${details.join("; ")}). Remove the published entries from pending.json.`,
    );
  }
}

function mergedClientDocument(authoritative, pending) {
  assertNoPendingRedefinitions(authoritative, pending);

  const paths = Object.fromEntries(
    [...Object.entries(authoritative.paths ?? {}), ...Object.entries(pending.paths ?? {})].map(
      ([path, pathItem]) => [clientPath(path), pathItem],
    ),
  );
  const components = { ...(authoritative.components ?? {}) };
  for (const [section, pendingEntries] of Object.entries(pending.components ?? {})) {
    components[section] = {
      ...(components[section] ?? {}),
      ...pendingEntries,
    };
  }

  return {
    ...authoritative,
    paths,
    components,
  };
}

const authoritative = readDocument(authoritativeInput);
const pending = readDocument(pendingInput);
const ast = await openapiTS(mergedClientDocument(authoritative, pending));
const contents = `${astToString(ast)}\n`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, contents);
console.log(`Generated ${output} from ${authoritativeInput} merged with ${pendingInput}`);
