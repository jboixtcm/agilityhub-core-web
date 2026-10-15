"use client";

import { parseSmarterTxt, summarizeCourse, type CourseData } from "@agilityhub/course-core";
import { useState, type ChangeEvent } from "react";

import { getPlannerStore } from "../lib/storage/get-store.js";

import { NeutralBadge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Card, CardTitle } from "./ui/Card.js";

export interface UploadCourseLabels {
  readonly title: string;
  readonly file: string;
  readonly parsing: (filename: string) => string;
  readonly parseError: string;
  /** An api failure in the reader's language, by its code (the shared catalog mapper). */
  readonly error: (error: unknown) => string;
  readonly uploading: string;
  readonly savedContinue: string;
  readonly continue: string;
  readonly units: (value: string) => string;
  readonly dimensions: (lengthMeters: number, widthMeters: number) => string;
  readonly obstacles: (count: number) => string;
  readonly numbers: (count: number) => string;
  readonly noGoZones: (count: number) => string;
  readonly ignoredLogos: (count: number) => string;
}

interface Props {
  readonly labels: UploadCourseLabels;
  readonly onUploaded: (course: CourseData, courseDbId: string, filename: string) => void;
}

type Phase = "idle" | "parsing" | "preview" | "uploading" | "error";

/**
 * CONVENCIONS_API §7 (E85): a 4xx with the api's body is the submission's answer and retires its
 * `Idempotency-Key`; a network failure, a 5xx or `409 IDEMPOTENCY_KEY_REUSED {IN_PROGRESS}` are
 * not, so the retry keeps the key — and, in the store, the same uploaded file and body.
 */
function retiresKey(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, details, status } = error as { code?: unknown; details?: unknown; status?: unknown };
  if (typeof code !== "string" || typeof status !== "number" || status < 400 || status >= 500) {
    return false;
  }
  const reason =
    typeof details === "object" && details !== null
      ? (details as { reason?: unknown }).reason
      : undefined;
  return !(code === "IDEMPOTENCY_KEY_REUSED" && reason === "IN_PROGRESS");
}
type UploadError = { readonly kind: "parse" } | { readonly kind: "upload"; readonly error: unknown };

export function UploadCourse({ labels, onUploaded }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<UploadError | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [course, setCourse] = useState<CourseData | null>(null);
  const [savedDbId, setSavedDbId] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setPhase("parsing");
    setFailure(null);
    setFilename(file.name);
    setSavedDbId(null);
    setSubmissionKey(crypto.randomUUID());
    try {
      const nextBytes = new Uint8Array(await file.arrayBuffer());
      const text = new TextDecoder("utf-8").decode(nextBytes);
      const { courseData } = parseSmarterTxt(text, { sourceFileName: file.name });
      setBytes(nextBytes);
      setCourse(courseData);
      setPhase("preview");
    } catch {
      setFailure({ kind: "parse" });
      setPhase("error");
    }
  }

  async function handleContinue() {
    if (course === null || bytes === null || filename === null || phase === "uploading") return;
    setPhase("uploading");
    setFailure(null);
    try {
      const { course: savedCourse } = await getPlannerStore().uploadSmarterFile({
        submissionKey,
        filename,
        bytes,
        courseData: course,
      });
      setSavedDbId(savedCourse.id);
      setPhase("preview");
      onUploaded(course, savedCourse.id, filename);
    } catch (error) {
      if (retiresKey(error)) setSubmissionKey(crypto.randomUUID());
      setFailure({ kind: "upload", error });
      setPhase("error");
    }
  }

  const busy = phase === "parsing" || phase === "uploading";

  return (
    <Card>
      <CardTitle>{labels.title}</CardTitle>

      <label className="block">
        <span className="block text-sm text-muted mb-2">{labels.file}</span>
        <input
          type="file"
          accept=".txt,text/plain"
          onChange={handleFile}
          disabled={busy}
          className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-agh file:border-0 file:bg-primary file:text-primary-fg file:font-semibold hover:file:opacity-90"
        />
      </label>

      {phase === "parsing" && filename !== null ? (
        <p className="mt-3 text-sm text-muted">{labels.parsing(filename)}</p>
      ) : null}

      {failure !== null ? (
        <div
          className="mt-3 p-3 border border-danger bg-danger/10 text-danger rounded"
          role="alert"
        >
          {failure.kind === "parse" ? labels.parseError : labels.error(failure.error)}
        </div>
      ) : null}

      {(phase === "preview" || phase === "uploading" || failure?.kind === "upload") &&
      course !== null ? (
        <div className="mt-4 space-y-3">
          <UploadPreview course={course} labels={labels} />
          <Button onClick={handleContinue} disabled={savedDbId !== null || phase === "uploading"}>
            {phase === "uploading"
              ? labels.uploading
              : savedDbId !== null
                ? labels.savedContinue
                : labels.continue}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function UploadPreview({ course, labels }: { course: CourseData; labels: UploadCourseLabels }) {
  const summary = summarizeCourse(course);
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-text">{summary.title}</span>
        <NeutralBadge>{labels.units(summary.units)}</NeutralBadge>
        <NeutralBadge>
          {labels.dimensions(summary.dimensionsMeters.length, summary.dimensionsMeters.width)}
        </NeutralBadge>
      </div>
      <ul className="text-xs text-muted space-y-1">
        <li>{labels.obstacles(summary.counts.obstacles)}</li>
        <li>{labels.numbers(summary.counts.numbers)}</li>
        <li>{labels.noGoZones(summary.counts.noGoZones)}</li>
        <li>{labels.ignoredLogos(summary.counts.ignoredLogos)}</li>
      </ul>
    </div>
  );
}
