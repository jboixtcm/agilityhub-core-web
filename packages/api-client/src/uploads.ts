import { isApiError } from "./api-error";
import type { ApiClient } from "./client";
import type { components } from "./generated/schema";

export type UploadPurpose = components["schemas"]["UploadRequest"]["purpose"];

/** Where a signed upload goes: the storage's url and the headers it signed. */
export interface SignedUploadTarget {
  headers: Record<string, string>;
  uploadUrl: string;
}

/**
 * The `PUT` of a signed upload (CONVENCIONS_API §5, R-04-08): the file to `uploadUrl` with the
 * returned `headers` **unchanged** (the storage signed them: S3 answers 403 when one is dropped)
 * and no bearer — a plain `fetch`, never the api client, so no `Authorization` travels to the
 * storage.
 */
export async function putSignedFile(target: SignedUploadTarget, file: Blob): Promise<void> {
  const response = await fetch(target.uploadUrl, {
    body: file,
    headers: target.headers,
    method: "PUT",
  });
  if (!response.ok) throw new TypeError("The signed file upload failed");
}

/**
 * The signed-upload flow shared by every screen (CONVENCIONS_API §5): `POST
 * /attachments/upload-url {purpose, fileName, mimeType, sizeBytes}` → `PUT` the file to the signed
 * url → the opaque `fileKey` the caller registers (`POST /attachments`, `POST /tasks`, a dog's
 * documents or photo…). A file without a type travels as `application/octet-stream`, so the api
 * answers `FILE_TYPE_NOT_ALLOWED` instead of a validation error.
 */
export async function uploadSigned(
  client: ApiClient,
  file: File,
  purpose: UploadPurpose,
): Promise<string> {
  return (await uploadSignedGrant(client, file, purpose)).fileKey;
}

/** An uploaded file's `fileKey` and the end of its grant (`expiresAt`, five minutes, R-10-11). */
export interface UploadGrant {
  expiresAt: string;
  fileKey: string;
}

/** `uploadSigned`, with the grant's end: a caller that keeps the key knows until when it is good. */
export async function uploadSignedGrant(
  client: ApiClient,
  file: File,
  purpose: UploadPurpose,
): Promise<UploadGrant> {
  const signed = await client.POST("/attachments/upload-url", {
    body: {
      fileName: file.name,
      mimeType: file.type === "" ? "application/octet-stream" : file.type,
      purpose,
      sizeBytes: file.size,
    },
  });
  if (signed.data === undefined)
    throw new TypeError("The upload URL response did not contain data");
  await putSignedFile(signed.data, file);
  return { expiresAt: signed.data.expiresAt, fileKey: signed.data.fileKey };
}

/**
 * The club's file limits (R-10-11): `files.maxSizeMb`, `files.allowedTypes` and
 * `files.maxAttachmentsPerEntity`, never hard-coded. Each is `undefined` when this session cannot
 * read it (`/parameters` is ADMIN only, MATRIU_PERMISOS: an INSTRUCTOR gets 403): the api still
 * refuses the file (`FILE_TOO_LARGE`, `FILE_TYPE_NOT_ALLOWED`, `ATTACHMENT_LIMIT_REACHED`).
 */
export interface FileLimits {
  allowedTypes?: string[];
  maxPerEntity?: number;
  maxSizeMb?: number;
}

async function parameterValue(client: ApiClient, key: string): Promise<unknown> {
  try {
    return (await client.GET("/parameters/{key}", { params: { path: { key } } })).data?.value;
  } catch (error) {
    if (isApiError(error)) return undefined;
    throw error;
  }
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** A LIST parameter: an array of strings, or the catalog's comma-separated text. */
function typeList(value: unknown): string[] | undefined {
  const items = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? value.split(",")
      : undefined;
  const cleaned = items?.map((item) => item.trim()).filter((item) => item !== "");
  return cleaned === undefined || cleaned.length === 0 ? undefined : cleaned;
}

export async function loadFileLimits(client: ApiClient): Promise<FileLimits> {
  const [maxSizeMb, allowedTypes, maxPerEntity] = await Promise.all([
    parameterValue(client, "files.maxSizeMb"),
    parameterValue(client, "files.allowedTypes"),
    parameterValue(client, "files.maxAttachmentsPerEntity"),
  ]);
  const limits: FileLimits = {};
  const size = positive(maxSizeMb);
  const types = typeList(allowedTypes);
  const count = positive(maxPerEntity);
  if (size !== undefined) limits.maxSizeMb = size;
  if (types !== undefined) limits.allowedTypes = types;
  if (count !== undefined) limits.maxPerEntity = count;
  return limits;
}
