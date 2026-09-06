import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const siblingSnapshot = resolve(repositoryRoot, "../agilityhub-core-api/docs/openapi/openapi.json");
const fallbackStub = resolve(packageRoot, "openapi/stub.json");
const output = resolve(packageRoot, "src/generated/schema.d.ts");
const requiredPaths = ["/branding", "/me", "/oauth2/token", "/health"];

function resolveConfiguredSpec(value) {
  return isAbsolute(value) ? value : resolve(repositoryRoot, value);
}

function snapshotIsComplete(snapshotPath) {
  if (!existsSync(snapshotPath)) {
    return false;
  }

  const document = JSON.parse(readFileSync(snapshotPath, "utf8"));
  return requiredPaths.every(
    (path) =>
      document.paths?.[path] !== undefined || document.paths?.[`/api/v1${path}`] !== undefined,
  );
}

function clientDocument(inputPath) {
  const document = JSON.parse(readFileSync(inputPath, "utf8"));
  document.paths = Object.fromEntries(
    Object.entries(document.paths ?? {}).map(([path, pathItem]) => [
      path.replace(/^\/api\/v1(?=\/)/, ""),
      pathItem,
    ]),
  );
  return document;
}

const configuredSpec = process.env.API_SPEC;
let input;

if (configuredSpec !== undefined && configuredSpec !== "") {
  const configuredInput = resolveConfiguredSpec(configuredSpec);
  if (!existsSync(configuredInput)) {
    throw new Error(`API_SPEC does not exist: ${configuredInput}`);
  }
  input = snapshotIsComplete(configuredInput) ? configuredInput : fallbackStub;
  if (input === fallbackStub) {
    console.warn(`Using ${fallbackStub}: ${configuredInput} is missing bootstrap operations.`);
  }
} else if (snapshotIsComplete(siblingSnapshot)) {
  input = siblingSnapshot;
} else {
  input = fallbackStub;
  console.warn(
    `Using ${input}: the sibling OpenAPI snapshot is missing one or more bootstrap operations.`,
  );
}

const ast = await openapiTS(clientDocument(input));
const contents = `${astToString(ast)}\n`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, contents);
console.log(`Generated ${output} from ${input}`);
