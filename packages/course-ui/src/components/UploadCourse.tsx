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
  readonly uploadError: string;
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
type ErrorKind = "parse" | "upload" | null;

export function UploadCourse({ labels, onUploaded }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [course, setCourse] = useState<CourseData | null>(null);
  const [savedDbId, setSavedDbId] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setPhase("parsing");
    setErrorKind(null);
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
      setErrorKind("parse");
      setPhase("error");
    }
  }

  async function handleContinue() {
    if (course === null || bytes === null || filename === null || phase === "uploading") return;
    setPhase("uploading");
    setErrorKind(null);
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
    } catch {
      setErrorKind("upload");
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
          className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-agh file:border-0 file:bg-primary file:text-text file:font-semibold hover:file:opacity-90"
        />
      </label>

      {phase === "parsing" && filename !== null ? (
        <p className="mt-3 text-sm text-muted">{labels.parsing(filename)}</p>
      ) : null}

      {errorKind !== null ? (
        <div
          className="mt-3 p-3 border border-danger bg-danger/10 text-danger rounded"
          role="alert"
        >
          {errorKind === "parse" ? labels.parseError : labels.uploadError}
        </div>
      ) : null}

      {(phase === "preview" || phase === "uploading" || errorKind === "upload") &&
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
