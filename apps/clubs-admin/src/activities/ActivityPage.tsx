import type { ApiClient } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  FormField,
  Icon,
  IconButton,
  Input,
  Modal,
  RichTextEditor,
  type RichTextEditorLabels,
  Select,
  Skeleton,
  Switch,
  Textarea,
  Toast,
  type Tone,
  useBranding,
} from "@agilityhub/ui";
import {
  type ChangeEvent,
  type CSSProperties,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { LocaleTabs } from "../catalogs/shared";
import {
  formatMaskedDate,
  loadOpeningHours,
  maskDate,
  type OpeningHours,
  openingOf,
  parseMaskedDate,
  timeOptions,
} from "../planning/calendar-shared";

import { CancelActivityModal } from "./CancelActivityModal";
import { type ConflictDialogMode, PublishConflictsDialog } from "./PublishConflictsDialog";
import {
  ACTIVITY_TYPES,
  type Activity,
  type ActivityPatch,
  type ActivitySettings,
  type ActivityType,
  type CancellationPreview,
  type ConflictOptions,
  displayUrl,
  errorCode,
  errorDetails,
  errorFields,
  type Level,
  loadActivitySettings,
  type Ring,
  type RingConflicts,
  sentenceCase,
  uploadFile,
  useActivityErrorMessage,
} from "./shared";

type Localized = Record<string, string>;

interface FormState {
  address: string;
  atClub: boolean;
  date: string;
  endTime: string;
  internalNotes: string;
  levelIds: string[];
  locationName: string;
  longDescription: Localized;
  maxPlaces: string;
  registrationFrom: string;
  registrationTo: string;
  ringIds: string[];
  shortDescription: Localized;
  slug: string;
  startTime: string;
  title: Localized;
  type: ActivityType;
  typeLabel: Localized;
  waitlistEnabled: boolean;
}

type FieldKey =
  | "date"
  | "endTime"
  | "general"
  | "locationName"
  | "maxPlaces"
  | "registrationFrom"
  | "registrationTo"
  | "ringIds"
  | "slug"
  | "startTime"
  | "title";

interface Feedback {
  message: string;
  tone: Tone;
}

interface ConflictDialog {
  initial: ConflictOptions & { notifyEmail?: boolean };
  mode: ConflictDialogMode;
  preview: RingConflicts;
}

const stateTone: Readonly<Record<Activity["state"], Tone>> = {
  CANCELLED: "danger",
  DRAFT: "neutral",
  FINISHED: "info",
  PUBLISHED: "success",
};

function formOf(activity: Activity): FormState {
  return {
    address: activity.location.address ?? "",
    atClub: activity.location.atClub,
    date:
      activity.date === null || activity.date === undefined ? "" : formatMaskedDate(activity.date),
    endTime: activity.endTime ?? "",
    internalNotes: activity.internalNotes ?? "",
    levelIds: [...activity.levelIds],
    locationName: activity.location.name ?? "",
    longDescription: { ...(activity.longDescriptionI18n ?? {}) },
    maxPlaces:
      activity.maxPlaces === null || activity.maxPlaces === undefined
        ? ""
        : String(activity.maxPlaces),
    registrationFrom:
      activity.registrationFrom === null || activity.registrationFrom === undefined
        ? ""
        : formatMaskedDate(activity.registrationFrom),
    registrationTo:
      activity.registrationTo === null || activity.registrationTo === undefined
        ? ""
        : formatMaskedDate(activity.registrationTo),
    ringIds: [...activity.ringIds],
    shortDescription: { ...(activity.shortDescriptionI18n ?? {}) },
    slug: activity.slug,
    startTime: activity.startTime ?? "",
    title: { ...activity.titleI18n },
    type: activity.type,
    typeLabel: { ...(activity.typeLabel ?? {}) },
    waitlistEnabled: activity.waitlistEnabled,
  };
}

function cleanLocalized(values: Localized): Localized {
  return Object.fromEntries(
    Object.entries(values)
      .map(([locale, value]) => [locale, value.trim()] as const)
      .filter(([, value]) => value !== ""),
  );
}

function sameLocalized(left: Localized, right: Localized): boolean {
  const a = cleanLocalized(left);
  const b = cleanLocalized(right);
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([key, value]) => b[key] === value)
  );
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function fieldKey(field: string): FieldKey {
  if (field === "location.name" || field === "location") return "locationName";
  if (field === "places" || field === "minPlaces") return "maxPlaces";
  const known: readonly FieldKey[] = [
    "date",
    "endTime",
    "maxPlaces",
    "registrationFrom",
    "registrationTo",
    "ringIds",
    "slug",
    "startTime",
    "title",
  ];
  return known.find((key) => key === field) ?? "general";
}

function time(value: string): string {
  return value.replace(/^0(?=\d:)/u, "");
}

/** What the form changes against the loaded activity: the `PATCH` body and the invalid fields. */
function changes(
  form: FormState,
  baseline: FormState,
  activity: Activity,
  closed: boolean,
  defaultLocale: string,
): { body: ActivityPatch; invalid: FieldKey[] } {
  const invalid: FieldKey[] = [];
  const body: ActivityPatch = { version: activity.version };
  if (form.internalNotes !== baseline.internalNotes) {
    body.internalNotes = form.internalNotes.trim() === "" ? null : form.internalNotes.trim();
  }
  if (closed) return { body, invalid };
  if (!sameLocalized(form.title, baseline.title)) {
    const title = cleanLocalized(form.title);
    if ((title[defaultLocale] ?? "") === "") invalid.push("title");
    body.title = title;
  }
  const optional = (key: "longDescription" | "shortDescription" | "typeLabel") => {
    if (sameLocalized(form[key], baseline[key])) return;
    const value = cleanLocalized(form[key]);
    body[key] = Object.keys(value).length === 0 ? null : value;
  };
  optional("typeLabel");
  optional("shortDescription");
  optional("longDescription");
  if (form.type !== baseline.type) body.type = form.type;
  if (form.date !== baseline.date) {
    const date = parseMaskedDate(form.date);
    if (date === undefined) invalid.push("date");
    else body.date = date;
  }
  if (form.startTime !== baseline.startTime) {
    body.startTime = form.startTime === "" ? null : form.startTime;
  }
  if (form.endTime !== baseline.endTime) body.endTime = form.endTime === "" ? null : form.endTime;
  for (const key of ["registrationFrom", "registrationTo"] as const) {
    if (form[key] === baseline[key]) continue;
    const value = parseMaskedDate(form[key]);
    if (value === undefined) invalid.push(key);
    else body[key] = value;
  }
  if (form.maxPlaces !== baseline.maxPlaces) {
    const places = Number(form.maxPlaces);
    if (form.maxPlaces.trim() === "") body.maxPlaces = null;
    else if (!Number.isInteger(places) || places < 1) invalid.push("maxPlaces");
    else body.maxPlaces = places;
  }
  if (!sameList(form.levelIds, baseline.levelIds)) body.levelIds = form.levelIds;
  if (form.waitlistEnabled !== baseline.waitlistEnabled)
    body.waitlistEnabled = form.waitlistEnabled;
  if (!sameList(form.ringIds, baseline.ringIds)) body.ringIds = form.ringIds;
  if (
    form.atClub !== baseline.atClub ||
    form.locationName !== baseline.locationName ||
    form.address !== baseline.address
  ) {
    body.location = {
      address: form.atClub || form.address.trim() === "" ? null : form.address.trim(),
      atClub: form.atClub,
      name: form.atClub || form.locationName.trim() === "" ? null : form.locationName.trim(),
    };
  }
  if (form.slug !== baseline.slug) body.slug = form.slug.trim();
  return { body, invalid };
}

/**
 * D7 maintenance (`/activitats/:id`, S07 §2): card «Manteniment de l'activitat» (per-locale
 * texts, type, restricted rich text, image and documents by signed upload) and card «Dates,
 * places i pistes» (date and hours, registration period, places, levels, waitlist, linked
 * rings, location, state + public URL), with [DESA] and the S07 §2 assumed actions.
 */
export function ActivityPage({
  activityId,
  client,
  onChanged,
  onNavigate,
  readOnly,
}: {
  activityId: string;
  client: ApiClient;
  onChanged: () => void;
  onNavigate: (path: string) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation(["admin-activities", "enums", "errors"]);
  const branding = useBranding();
  const formats = useClubFormats();
  const errorMessage = useActivityErrorMessage();
  const [activity, setActivity] = useState<Activity>();
  const [form, setForm] = useState<FormState>();
  const [loadError, setLoadError] = useState<unknown>();
  const [reload, setReload] = useState(0);
  const [rings, setRings] = useState<Ring[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [settings, setSettings] = useState<ActivitySettings>({
    holidays: [],
    levelsEnabled: true,
    maxSizeMb: 25,
    slotMinutes: 10,
  });
  const [opening, setOpening] = useState<OpeningHours>({});
  const [locale, setLocale] = useState(branding.defaultLocale);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [feedback, setFeedback] = useState<Feedback>();
  const [pending, setPending] = useState<
    "cancel" | "delete" | "publish" | "save" | "unpublish" | "upload"
  >();
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [conflictDialog, setConflictDialog] = useState<ConflictDialog>();
  const [cancelPreview, setCancelPreview] = useState<CancellationPreview>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [documentName, setDocumentName] = useState("");
  const [documentFile, setDocumentFile] = useState<File>();

  useEffect(() => {
    let current = true;
    void client.GET("/activities/{id}", { params: { path: { id: activityId } } }).then(
      (result) => {
        if (!current || result.data === undefined) return;
        setActivity(result.data);
        setForm(formOf(result.data));
        setLoadError(undefined);
      },
      (error: unknown) => {
        if (current) setLoadError(error);
      },
    );
    return () => {
      current = false;
    };
  }, [activityId, client, reload]);

  useEffect(() => {
    let current = true;
    void loadActivitySettings(client).then((value) => {
      if (current) setSettings(value);
    });
    void loadOpeningHours(client).then((value) => {
      if (current) setOpening(value);
    });
    void client.GET("/rings").then(
      (result) => {
        if (current) setRings((result.data?.items ?? []).filter((ring) => ring.active));
      },
      () => undefined,
    );
    void client.GET("/levels").then(
      (result) => {
        if (current) setLevels((result.data?.items ?? []).filter((level) => level.active));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [client]);

  const ringName = useCallback(
    (ringId: string) =>
      rings.find((ring) => ring.id === ringId)?.name ??
      activity?.rings.find((ring) => ring.id === ringId)?.name ??
      ringId,
    [activity, rings],
  );

  const baseline = useMemo(
    () => (activity === undefined ? undefined : formOf(activity)),
    [activity],
  );

  if (loadError !== undefined) {
    return (
      <Card className="activity-card" role="alert">
        <p>{errorMessage(loadError)}</p>
        <Button
          onClick={() => {
            setReload((value) => value + 1);
          }}
          variant="secondary"
        >
          {t("admin-activities:common.retry")}
        </Button>
      </Card>
    );
  }
  if (activity === undefined || form === undefined || baseline === undefined) {
    return (
      <div className="activity-grid">
        <Skeleton height="16rem" label={t("admin-activities:common.loading")} />
        <Skeleton height="16rem" label={t("admin-activities:common.loading")} />
      </div>
    );
  }

  const admin = !readOnly;
  const closed = activity.state === "FINISHED" || activity.state === "CANCELLED";
  const editable = admin && !closed;
  const update = (patch: Partial<FormState>) => {
    setForm((current) => (current === undefined ? current : { ...current, ...patch }));
  };
  const updateLocalized = (
    key: "longDescription" | "shortDescription" | "title" | "typeLabel",
    value: string,
  ) => {
    setForm((current) =>
      current === undefined ? current : { ...current, [key]: { ...current[key], [locale]: value } },
    );
  };

  const pendingChanges = changes(form, baseline, activity, closed, branding.defaultLocale);
  const dirty = pendingChanges.invalid.length > 0 || Object.keys(pendingChanges.body).length > 1;

  /** `PATCH` body: only what changed, with the `version` (R-07-04); marks invalid fields. */
  const diff = (): ActivityPatch | undefined => {
    const { body, invalid } = pendingChanges;
    if (invalid.length > 0) {
      setErrors(
        Object.fromEntries(
          invalid.map((key) => [
            key,
            key === "title"
              ? t("admin-activities:create.titleRequired", {
                  locale: branding.defaultLocale.toLocaleUpperCase(),
                })
              : key === "maxPlaces"
                ? t("admin-activities:form.placesInvalid")
                : t("admin-activities:form.invalidDate"),
          ]),
        ),
      );
      return undefined;
    }
    return body;
  };

  const applySaved = (saved: Activity, message: string) => {
    setActivity(saved);
    setForm(formOf(saved));
    setErrors({});
    setFeedback({ message, tone: "success" });
    onChanged();
  };

  const failSave = (cause: unknown, options?: ConflictOptions) => {
    const code = errorCode(cause);
    const details = errorDetails(cause);
    if (code === "RING_BLOCK_CONFLICT" || code === "RING_HAS_BOOKINGS") {
      setConflictDialog((current) => ({
        initial: options ?? {},
        mode: "save",
        preview: {
          conflicts: Array.isArray(details.conflicts)
            ? (details.conflicts as RingConflicts["conflicts"])
            : (current?.preview.conflicts ?? []),
          trainingBookings: Array.isArray(details.bookings)
            ? (details.bookings as RingConflicts["trainingBookings"])
            : (current?.preview.trainingBookings ?? []),
        },
      }));
      return;
    }
    if (code === "STALE_VERSION") {
      setFeedback({ message: t("admin-activities:form.stale"), tone: "danger" });
      setReload((value) => value + 1);
      return;
    }
    const fields = errorFields(cause).map(fieldKey);
    const target: FieldKey | undefined =
      code === "SLUG_LOCKED" || code === "DUPLICATE_SLUG"
        ? "slug"
        : code === "CAPACITY_BELOW_REGISTRATIONS"
          ? "maxPlaces"
          : code === "INVALID_TIME_RANGE" ||
              code === "INVALID_SLOT_GRANULARITY" ||
              code === "OUTSIDE_OPENING_HOURS"
            ? (fields[0] ?? "endTime")
            : fields[0];
    if (target !== undefined && target !== "general") {
      setErrors({ [target]: errorMessage(cause) });
    } else {
      setFeedback({ message: errorMessage(cause), tone: "danger" });
    }
  };

  const save = async (options?: ConflictOptions): Promise<boolean> => {
    const body = diff();
    if (body === undefined) return false;
    setPending("save");
    setErrors({});
    try {
      const result = await client.PATCH("/activities/{id}", {
        body: { ...body, ...(options ?? {}) },
        params: { path: { id: activity.id } },
      });
      if (result.data === undefined) throw new TypeError("Missing saved activity");
      applySaved(result.data, t("admin-activities:form.saved"));
      setConflictDialog(undefined);
      return true;
    } catch (cause) {
      if (options !== undefined && errorCode(cause) === "ADMIN_TEXT_REQUIRED") throw cause;
      failSave(cause, options);
      return false;
    } finally {
      setPending(undefined);
    }
  };

  const publishWith = async (options: ConflictOptions & { notifyEmail: boolean }) => {
    try {
      // A key per attempt: a retry with other options must not replay the first answer.
      const result = await client.POST("/activities/{id}/publication", {
        body: options,
        params: {
          header: { "Idempotency-Key": crypto.randomUUID() },
          path: { id: activity.id },
        },
      });
      if (result.data === undefined) throw new TypeError("Missing published activity");
      setConfirmPublish(false);
      setConflictDialog(undefined);
      applySaved(result.data, t("admin-activities:form.published"));
    } catch (cause) {
      const code = errorCode(cause);
      const details = errorDetails(cause);
      if (code === "RING_BLOCK_CONFLICT" || code === "RING_HAS_BOOKINGS") {
        setConfirmPublish(false);
        setConflictDialog((current) => ({
          initial: options,
          mode: "publish",
          preview: {
            conflicts: Array.isArray(details.conflicts)
              ? (details.conflicts as RingConflicts["conflicts"])
              : (current?.preview.conflicts ?? []),
            trainingBookings: Array.isArray(details.bookings)
              ? (details.bookings as RingConflicts["trainingBookings"])
              : (current?.preview.trainingBookings ?? []),
          },
        }));
        return;
      }
      if (code === "ACTIVITY_INCOMPLETE") {
        setConfirmPublish(false);
        setConflictDialog(undefined);
        const fields = errorFields(cause).map(fieldKey);
        setErrors(
          Object.fromEntries(
            fields.map((key) => [key, t("admin-activities:form.requiredToPublish")]),
          ),
        );
        setFeedback({ message: t("admin-activities:publishDialog.incomplete"), tone: "danger" });
        return;
      }
      if (code === "ADMIN_TEXT_REQUIRED") throw cause;
      setConfirmPublish(false);
      setConflictDialog(undefined);
      setFeedback({ message: errorMessage(cause), tone: "danger" });
    }
  };

  const startPublish = async () => {
    if (dirty && !(await save())) return;
    setPending("publish");
    try {
      const result = await client.GET("/activities/{id}/ring-conflicts", {
        params: { path: { id: activity.id } },
      });
      const preview = result.data ?? { conflicts: [], trainingBookings: [] };
      if (preview.conflicts.length === 0 && preview.trainingBookings.length === 0) {
        setNotifyEmail(false);
        setConfirmPublish(true);
      } else {
        setConflictDialog({ initial: {}, mode: "publish", preview });
      }
    } catch (cause) {
      setFeedback({ message: errorMessage(cause), tone: "danger" });
    } finally {
      setPending(undefined);
    }
  };

  const unpublish = async () => {
    setPending("unpublish");
    try {
      const result = await client.DELETE("/activities/{id}/publication", {
        params: { path: { id: activity.id } },
      });
      if (result.data !== undefined)
        applySaved(result.data, t("admin-activities:form.unpublished"));
    } catch (cause) {
      setFeedback({ message: errorMessage(cause), tone: "danger" });
    } finally {
      setPending(undefined);
    }
  };

  const startCancel = async () => {
    setPending("cancel");
    try {
      const result = await client.GET("/activities/{id}/cancellation-preview", {
        params: { path: { id: activity.id } },
      });
      if (result.data !== undefined) setCancelPreview(result.data);
    } catch (cause) {
      setFeedback({ message: errorMessage(cause), tone: "danger" });
    } finally {
      setPending(undefined);
    }
  };

  const cancelActivity = async (reason: "CLUB_MANUAL" | "DELETED", adminText?: string) => {
    const result = await client.POST("/activities/{id}/cancellation", {
      body: { reason, ...(adminText === undefined ? {} : { adminText }) },
      params: {
        header: { "Idempotency-Key": crypto.randomUUID() },
        path: { id: activity.id },
      },
    });
    if (result.data === undefined) throw new TypeError("Missing cancelled activity");
    setCancelPreview(undefined);
    setConfirmDelete(false);
    if (reason === "DELETED") {
      onChanged();
      onNavigate("/activitats");
      return;
    }
    applySaved(result.data, t("admin-activities:form.cancelled"));
  };

  /** Image and documents change the activity's version: refetch it and keep the form edits. */
  const refreshVersion = async () => {
    const result = await client.GET("/activities/{id}", { params: { path: { id: activity.id } } });
    if (result.data !== undefined) setActivity(result.data);
  };

  const tooLarge = (file: File) => file.size > settings.maxSizeMb * 1024 * 1024;

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file === undefined) return;
    if (tooLarge(file)) {
      setFeedback({
        message: t("admin-activities:form.fileTooLarge", { max: settings.maxSizeMb }),
        tone: "danger",
      });
      return;
    }
    setPending("upload");
    try {
      const fileKey = await uploadFile(client, file, "ACTIVITY_IMAGE");
      await client.PUT("/activities/{id}/image", {
        body: { fileKey, name: file.name },
        params: { path: { id: activity.id } },
      });
      await refreshVersion();
      setFeedback({ message: t("admin-activities:form.imageUploaded"), tone: "success" });
    } catch (cause) {
      setFeedback({ message: errorMessage(cause), tone: "danger" });
    } finally {
      setPending(undefined);
    }
  };

  const removeImage = async () => {
    setPending("upload");
    try {
      await client.DELETE("/activities/{id}/image", { params: { path: { id: activity.id } } });
      await refreshVersion();
    } catch (cause) {
      setFeedback({ message: errorMessage(cause), tone: "danger" });
    } finally {
      setPending(undefined);
    }
  };

  const addDocument = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (documentFile === undefined) return;
    if (tooLarge(documentFile)) {
      setFeedback({
        message: t("admin-activities:form.fileTooLarge", { max: settings.maxSizeMb }),
        tone: "danger",
      });
      return;
    }
    setPending("upload");
    try {
      const fileKey = await uploadFile(client, documentFile, "ACTIVITY_DOCUMENT");
      await client.POST("/activities/{id}/documents", {
        body: {
          fileKey,
          name: documentName.trim() === "" ? documentFile.name : documentName.trim(),
        },
        params: { path: { id: activity.id } },
      });
      await refreshVersion();
      setDocumentFile(undefined);
      setDocumentName("");
      setFeedback({ message: t("admin-activities:form.documentUploaded"), tone: "success" });
    } catch (cause) {
      setFeedback({ message: errorMessage(cause), tone: "danger" });
    } finally {
      setPending(undefined);
    }
  };

  const removeDocument = async (docId: string) => {
    setPending("upload");
    try {
      await client.DELETE("/activities/{id}/documents/{docId}", {
        params: { path: { docId, id: activity.id } },
      });
      await refreshVersion();
    } catch (cause) {
      setFeedback({ message: errorMessage(cause), tone: "danger" });
    } finally {
      setPending(undefined);
    }
  };

  const isoDate = parseMaskedDate(form.date);
  const openingWindow =
    isoDate === undefined ? { close: "22:00", open: "07:00" } : openingOf(opening, isoDate);
  const options = timeOptions(openingWindow.open, openingWindow.close, settings.slotMinutes);
  const withValue = (value: string) =>
    value === "" || options.includes(value) ? options : [...options, value].sort();
  const holiday = isoDate !== undefined && settings.holidays.includes(isoDate);
  const waitlistModule = branding.modules.includes("WAITLIST");
  const title = activity.title;
  const editorLabels: RichTextEditorLabels = {
    linkApply: t("admin-activities:form.editor.linkApply"),
    linkCancel: t("admin-activities:form.editor.linkCancel"),
    linkInvalid: t("admin-activities:form.editor.linkInvalid"),
    linkUrl: t("admin-activities:form.editor.linkUrl"),
    toolbar: t("admin-activities:form.editor.toolbar"),
    tools: {
      blockquote: {
        glyph: t("admin-activities:form.editor.glyph.blockquote"),
        label: t("admin-activities:form.editor.blockquote"),
      },
      bold: {
        glyph: t("admin-activities:form.editor.glyph.bold"),
        label: t("admin-activities:form.editor.bold"),
      },
      h3: {
        glyph: t("admin-activities:form.editor.glyph.h3"),
        label: t("admin-activities:form.editor.h3"),
      },
      h4: {
        glyph: t("admin-activities:form.editor.glyph.h4"),
        label: t("admin-activities:form.editor.h4"),
      },
      italic: {
        glyph: t("admin-activities:form.editor.glyph.italic"),
        label: t("admin-activities:form.editor.italic"),
      },
      link: { glyph: "", label: t("admin-activities:form.editor.link") },
      orderedList: {
        glyph: t("admin-activities:form.editor.glyph.orderedList"),
        label: t("admin-activities:form.editor.orderedList"),
      },
      strike: {
        glyph: t("admin-activities:form.editor.glyph.strike"),
        label: t("admin-activities:form.editor.strike"),
      },
      underline: {
        glyph: t("admin-activities:form.editor.glyph.underline"),
        label: t("admin-activities:form.editor.underline"),
      },
      unorderedList: {
        glyph: t("admin-activities:form.editor.glyph.unorderedList"),
        label: t("admin-activities:form.editor.unorderedList"),
      },
    },
  };
  const levelSummary =
    form.levelIds.length === 0
      ? t("admin-activities:form.levelsAll")
      : levels
          .filter((level) => form.levelIds.includes(level.id))
          .map((level) => level.name)
          .join(", ");
  const fieldError = (key: FieldKey) => (errors[key] === undefined ? {} : { error: errors[key] });
  const busy = pending !== undefined;

  return (
    <section
      aria-label={t("admin-activities:form.maintenanceTitle", { title })}
      className="activity-maintenance"
    >
      {feedback === undefined ? null : (
        <Toast
          dismissLabel={t("admin-activities:common.close")}
          onDismiss={() => {
            setFeedback(undefined);
          }}
          tone={feedback.tone}
        >
          {feedback.message}
        </Toast>
      )}
      <div className="activity-grid">
        <Card className="activity-card">
          <h2 className="activity-card__title">
            {t("admin-activities:form.maintenanceTitle", { title })}
          </h2>
          {branding.locales.length > 1 ? (
            <LocaleTabs locale={locale} locales={branding.locales} onChange={setLocale} />
          ) : null}
          <fieldset className="activity-fieldset" disabled={!editable || busy}>
            <div className="activity-row">
              <FormField
                {...fieldError("title")}
                id="activity-title"
                label={t("admin-activities:form.title")}
              >
                <Input
                  id="activity-title"
                  maxLength={80}
                  onChange={(event) => {
                    updateLocalized("title", event.currentTarget.value);
                  }}
                  value={form.title[locale] ?? ""}
                />
              </FormField>
              <label className="activity-chip-select">
                <span className="ah-sr-only">{t("admin-activities:form.type")}</span>
                <select
                  aria-label={t("admin-activities:form.type")}
                  onChange={(event) => {
                    update({ type: event.currentTarget.value as ActivityType });
                  }}
                  value={form.type}
                >
                  {ACTIVITY_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {sentenceCase(t(`enums:activityType.${value}`))}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <FormField id="activity-type-label" label={t("admin-activities:form.typeLabel")}>
              <Input
                id="activity-type-label"
                maxLength={30}
                onChange={(event) => {
                  updateLocalized("typeLabel", event.currentTarget.value);
                }}
                placeholder={t(`enums:activityType.${form.type}`)}
                value={form.typeLabel[locale] ?? ""}
              />
            </FormField>
            <FormField id="activity-short" label={t("admin-activities:form.shortDescription")}>
              <Input
                id="activity-short"
                maxLength={160}
                onChange={(event) => {
                  updateLocalized("shortDescription", event.currentTarget.value);
                }}
                value={form.shortDescription[locale] ?? ""}
              />
            </FormField>
            <div className="ah-form-field">
              <span className="ah-form-field__label" id="activity-long-label">
                {t("admin-activities:form.longDescription")}
              </span>
              <RichTextEditor
                describedBy="activity-long-label"
                id={`activity-long-${locale}`}
                key={locale}
                label={t("admin-activities:form.longDescription")}
                labels={editorLabels}
                onChange={(html) => {
                  updateLocalized("longDescription", html);
                }}
                placeholder={t("admin-activities:form.longDescriptionPlaceholder")}
                readOnly={!editable}
                value={form.longDescription[locale] ?? ""}
              />
            </div>
          </fieldset>
          <div className="activity-files">
            <div className="activity-file">
              {activity.image === null || activity.image === undefined ? (
                editable ? (
                  <label className="activity-file__pick">
                    <Icon aria-hidden="true" name="cam" />
                    <span>{t("admin-activities:form.addImage")}</span>
                    <input
                      accept="image/*"
                      className="ah-sr-only"
                      disabled={busy}
                      onChange={(event) => void uploadImage(event)}
                      type="file"
                    />
                  </label>
                ) : (
                  <span className="activity-file__name activity-file__name--empty">
                    <Icon aria-hidden="true" name="cam" />
                    {t("admin-activities:form.noImage")}
                  </span>
                )
              ) : (
                <>
                  {editable ? (
                    <label className="activity-file__pick">
                      <Icon aria-hidden="true" name="cam" />
                      <span>{activity.image.name}</span>
                      <span className="ah-sr-only">{t("admin-activities:form.replaceImage")}</span>
                      <input
                        accept="image/*"
                        className="ah-sr-only"
                        disabled={busy}
                        onChange={(event) => void uploadImage(event)}
                        type="file"
                      />
                    </label>
                  ) : (
                    <span className="activity-file__name">
                      <Icon aria-hidden="true" name="cam" />
                      {activity.image.name}
                    </span>
                  )}
                  {editable ? (
                    <IconButton
                      disabled={busy}
                      icon="x"
                      label={t("admin-activities:form.removeImage")}
                      onClick={() => void removeImage()}
                    />
                  ) : null}
                </>
              )}
            </div>
            {activity.documents.map((document) => (
              <div className="activity-file" key={document.id}>
                <a
                  className="activity-file__name"
                  href={document.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon aria-hidden="true" name="doc" />
                  {document.name}
                </a>
                {editable ? (
                  <IconButton
                    disabled={busy}
                    icon="x"
                    label={t("admin-activities:form.removeDocument", { name: document.name })}
                    onClick={() => void removeDocument(document.id)}
                  />
                ) : null}
              </div>
            ))}
          </div>
          {editable ? (
            <form className="activity-document-form" onSubmit={(event) => void addDocument(event)}>
              <FormField
                id="activity-document-name"
                label={t("admin-activities:form.documentName")}
              >
                <Input
                  id="activity-document-name"
                  maxLength={80}
                  onChange={(event) => {
                    setDocumentName(event.currentTarget.value);
                  }}
                  value={documentName}
                />
              </FormField>
              <label className="activity-file__pick">
                <Icon aria-hidden="true" name="doc" />
                <span>{documentFile?.name ?? t("admin-activities:form.chooseDocument")}</span>
                <input
                  className="ah-sr-only"
                  disabled={busy}
                  onChange={(event) => {
                    setDocumentFile(event.currentTarget.files?.[0]);
                  }}
                  type="file"
                />
              </label>
              <Button
                disabled={documentFile === undefined || busy}
                type="submit"
                variant="secondary"
              >
                {t("admin-activities:form.addDocument")}
              </Button>
            </form>
          ) : null}
        </Card>

        <Card className="activity-card">
          <h2 className="activity-card__title">{t("admin-activities:form.datesTitle")}</h2>
          <fieldset className="activity-fieldset" disabled={!editable || busy}>
            <div className="activity-row activity-row--dates">
              <FormField
                {...fieldError("date")}
                {...(isoDate === undefined
                  ? {}
                  : {
                      help: formats.formatActivityDate(
                        isoDate,
                        form.startTime === "" ? null : form.startTime,
                        form.endTime === "" ? null : form.endTime,
                        "long",
                      ),
                    })}
                id="activity-date"
                label={t("admin-activities:form.date")}
              >
                <Input
                  autoComplete="off"
                  id="activity-date"
                  inputMode="numeric"
                  onChange={(event) => {
                    update({ date: maskDate(event.currentTarget.value) });
                  }}
                  placeholder={t("admin-activities:form.datePlaceholder")}
                  value={form.date}
                />
              </FormField>
              <FormField
                {...fieldError("startTime")}
                id="activity-start"
                label={t("admin-activities:form.startTime")}
              >
                <Select
                  id="activity-start"
                  onChange={(event) => {
                    update({ startTime: event.currentTarget.value });
                  }}
                  value={form.startTime}
                >
                  <option value="">{t("admin-activities:form.noTime")}</option>
                  {withValue(form.startTime).map((value) => (
                    <option key={value} value={value}>
                      {time(value)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                {...fieldError("endTime")}
                id="activity-end"
                label={t("admin-activities:form.endTime")}
              >
                <Select
                  id="activity-end"
                  onChange={(event) => {
                    update({ endTime: event.currentTarget.value });
                  }}
                  value={form.endTime}
                >
                  <option value="">{t("admin-activities:form.noTime")}</option>
                  {withValue(form.endTime).map((value) => (
                    <option key={value} value={value}>
                      {time(value)}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            {holiday ? (
              <p className="activity-note activity-note--warning" role="note">
                <Icon aria-hidden="true" name="warn" />
                {t("admin-activities:form.holiday")}
              </p>
            ) : null}
            <div className="activity-row">
              <FormField
                {...fieldError("registrationFrom")}
                id="activity-registration-from"
                label={t("admin-activities:form.registrationFrom")}
              >
                <Input
                  autoComplete="off"
                  id="activity-registration-from"
                  inputMode="numeric"
                  onChange={(event) => {
                    update({ registrationFrom: maskDate(event.currentTarget.value) });
                  }}
                  placeholder={t("admin-activities:form.datePlaceholder")}
                  value={form.registrationFrom}
                />
              </FormField>
              <FormField
                {...fieldError("registrationTo")}
                id="activity-registration-to"
                label={t("admin-activities:form.registrationTo")}
              >
                <Input
                  autoComplete="off"
                  id="activity-registration-to"
                  inputMode="numeric"
                  onChange={(event) => {
                    update({ registrationTo: maskDate(event.currentTarget.value) });
                  }}
                  placeholder={t("admin-activities:form.datePlaceholder")}
                  value={form.registrationTo}
                />
              </FormField>
            </div>
            <div className="activity-row activity-row--chips">
              <FormField
                {...fieldError("maxPlaces")}
                help={t("admin-activities:form.placesHelp")}
                id="activity-places"
                label={t("admin-activities:form.places")}
              >
                <Input
                  id="activity-places"
                  inputMode="numeric"
                  min={1}
                  onChange={(event) => {
                    update({ maxPlaces: event.currentTarget.value.replace(/\D/gu, "") });
                  }}
                  value={form.maxPlaces}
                />
              </FormField>
              {settings.levelsEnabled ? (
                <details className="activity-chip-menu">
                  <summary className="activity-chip">
                    {t("admin-activities:form.levels", { levels: levelSummary })}
                  </summary>
                  <div
                    className="activity-chip-menu__panel"
                    role="group"
                    aria-label={t("admin-activities:form.levelsLabel")}
                  >
                    {levels.map((level) => (
                      <label className="activity-check" key={level.id}>
                        <Checkbox
                          checked={form.levelIds.includes(level.id)}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            update({
                              levelIds: checked
                                ? [...form.levelIds, level.id]
                                : form.levelIds.filter((id) => id !== level.id),
                            });
                          }}
                        />
                        <span>{level.name}</span>
                      </label>
                    ))}
                  </div>
                </details>
              ) : null}
              {waitlistModule ? (
                <button
                  aria-pressed={form.waitlistEnabled}
                  className="activity-chip"
                  onClick={() => {
                    update({ waitlistEnabled: !form.waitlistEnabled });
                  }}
                  type="button"
                >
                  {t("admin-activities:form.waitlist", {
                    value: form.waitlistEnabled
                      ? t("admin-activities:form.yes")
                      : t("admin-activities:form.no"),
                  })}
                </button>
              ) : null}
            </div>
            <div className="activity-rings" role="group" aria-labelledby="activity-rings-label">
              <span className="activity-rings__label" id="activity-rings-label">
                {t("admin-activities:form.rings")}
              </span>
              {rings.map((ring) => (
                <button
                  aria-pressed={form.ringIds.includes(ring.id)}
                  className="activity-chip activity-chip--ring"
                  disabled={!form.atClub}
                  key={ring.id}
                  onClick={() => {
                    update({
                      ringIds: form.ringIds.includes(ring.id)
                        ? form.ringIds.filter((id) => id !== ring.id)
                        : rings
                            .map((item) => item.id)
                            .filter((id) => id === ring.id || form.ringIds.includes(id)),
                    });
                  }}
                  style={{ "--activity-ring-color": ring.color } as CSSProperties}
                  title={form.atClub ? undefined : t("admin-activities:form.ringsOffSite")}
                  type="button"
                >
                  {ring.name}
                </button>
              ))}
              {form.atClub ? null : (
                <span className="activity-rings__note">{t("admin-activities:list.offSite")}</span>
              )}
            </div>
            {errors.ringIds === undefined ? null : (
              <p className="ah-form-field__error" role="alert">
                {errors.ringIds}
              </p>
            )}
            <div className="activity-switch">
              <Switch
                checked={form.atClub}
                label={t("admin-activities:form.atClub")}
                onCheckedChange={(checked) => {
                  update(checked ? { atClub: true } : { atClub: false, ringIds: [] });
                }}
              />
              <span aria-hidden="true">{t("admin-activities:form.atClub")}</span>
            </div>
            {form.atClub ? null : (
              <div className="activity-row">
                <FormField
                  {...fieldError("locationName")}
                  id="activity-location-name"
                  label={t("admin-activities:form.place")}
                >
                  <Input
                    id="activity-location-name"
                    maxLength={80}
                    onChange={(event) => {
                      update({ locationName: event.currentTarget.value });
                    }}
                    required
                    value={form.locationName}
                  />
                </FormField>
                <FormField
                  id="activity-location-address"
                  label={t("admin-activities:form.address")}
                >
                  <Input
                    id="activity-location-address"
                    maxLength={200}
                    onChange={(event) => {
                      update({ address: event.currentTarget.value });
                    }}
                    value={form.address}
                  />
                </FormField>
              </div>
            )}
            {activity.state === "DRAFT" &&
            (activity.publishedAt === null || activity.publishedAt === undefined) ? (
              <FormField
                {...fieldError("slug")}
                id="activity-slug"
                label={t("admin-activities:form.slug")}
              >
                <Input
                  id="activity-slug"
                  maxLength={80}
                  onChange={(event) => {
                    update({ slug: event.currentTarget.value.toLocaleLowerCase() });
                  }}
                  value={form.slug}
                />
              </FormField>
            ) : null}
          </fieldset>
          {admin ? (
            <FormField id="activity-notes" label={t("admin-activities:form.internalNotes")}>
              <Textarea
                disabled={busy}
                id="activity-notes"
                maxLength={1000}
                onChange={(event) => {
                  update({ internalNotes: event.currentTarget.value });
                }}
                rows={2}
                value={form.internalNotes}
              />
            </FormField>
          ) : null}
          <div className="activity-status">
            <Badge tone={stateTone[activity.state]}>
              {t(`enums:activityState.${activity.state}`)}
            </Badge>
            <span className="activity-status__url">
              {t("admin-activities:form.publicUrl", { url: displayUrl(activity.publicUrl) })}
            </span>
            {admin ? (
              <Button
                disabled={!dirty || busy}
                loading={pending === "save"}
                loadingLabel={t("admin-activities:common.saving")}
                onClick={() => void save()}
              >
                {t("admin-activities:form.save")}
              </Button>
            ) : null}
          </div>
          <div className="activity-actions">
            {admin && activity.state === "DRAFT" ? (
              <Button
                disabled={busy}
                loading={pending === "publish"}
                onClick={() => void startPublish()}
                variant="secondary"
              >
                {t("admin-activities:form.publish")}
              </Button>
            ) : null}
            {admin && activity.state === "PUBLISHED" ? (
              <Button
                disabled={busy}
                loading={pending === "unpublish"}
                onClick={() => void unpublish()}
                variant="ghost"
              >
                {t("admin-activities:form.unpublish")}
              </Button>
            ) : null}
            {admin && activity.state === "PUBLISHED" ? (
              <Button
                disabled={busy}
                loading={pending === "cancel"}
                onClick={() => void startCancel()}
                variant="danger"
              >
                {t("admin-activities:form.cancelActivity")}
              </Button>
            ) : null}
            {admin && activity.state === "DRAFT" ? (
              <Button
                disabled={busy}
                onClick={() => {
                  setConfirmDelete(true);
                }}
                variant="danger"
              >
                {t("admin-activities:form.delete")}
              </Button>
            ) : null}
            <a
              className="activity-actions__registrants"
              href={`/activitats/${activity.id}/inscrits`}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(`/activitats/${activity.id}/inscrits`);
              }}
            >
              {t("admin-activities:form.registrants", {
                count: activity.counters.active,
              })}
            </a>
          </div>
        </Card>
      </div>

      {confirmPublish ? (
        <Modal
          closeLabel={t("admin-activities:common.close")}
          onClose={() => {
            setConfirmPublish(false);
          }}
          open
          title={t("admin-activities:publishDialog.confirmTitle")}
        >
          <p>{t("admin-activities:publishDialog.confirmText")}</p>
          <div className="activity-switch">
            <Switch
              checked={notifyEmail}
              label={t("admin-activities:publishDialog.notifyEmail")}
              onCheckedChange={setNotifyEmail}
            />
            <span aria-hidden="true">{t("admin-activities:publishDialog.notifyEmail")}</span>
          </div>
          <div className="activity-modal__actions">
            <Button
              onClick={() => {
                setConfirmPublish(false);
              }}
              variant="ghost"
            >
              {t("admin-activities:common.back")}
            </Button>
            <Button onClick={() => void publishWith({ notifyEmail })}>
              {t("admin-activities:publishDialog.confirm")}
            </Button>
          </div>
        </Modal>
      ) : null}
      {conflictDialog === undefined ? null : (
        <PublishConflictsDialog
          initial={conflictDialog.initial}
          key={JSON.stringify(conflictDialog.preview)}
          mode={conflictDialog.mode}
          onClose={() => {
            setConflictDialog(undefined);
          }}
          onConfirm={async (options) => {
            if (conflictDialog.mode === "publish") {
              await publishWith(options);
            } else {
              await save({
                ...(options.adminText === undefined ? {} : { adminText: options.adminText }),
                ...(options.cancelBookings === undefined
                  ? {}
                  : { cancelBookings: options.cancelBookings }),
                ...(options.cancelClasses === undefined
                  ? {}
                  : { cancelClasses: options.cancelClasses }),
              });
            }
          }}
          preview={conflictDialog.preview}
          ringName={ringName}
        />
      )}
      {cancelPreview === undefined ? null : (
        <CancelActivityModal
          onClose={() => {
            setCancelPreview(undefined);
          }}
          onConfirm={(adminText) => cancelActivity("CLUB_MANUAL", adminText)}
          preview={cancelPreview}
          title={title}
        />
      )}
      {confirmDelete ? (
        <CancelActivityModal
          onClose={() => {
            setConfirmDelete(false);
          }}
          onConfirm={() => cancelActivity("DELETED")}
          preview={{ activeCount: 0, registrations: [], waitingCount: 0 }}
          reason="DELETED"
          title={title}
        />
      ) : null}
    </section>
  );
}
