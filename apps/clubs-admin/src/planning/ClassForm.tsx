import { useClubFormats } from "@agilityhub/i18n";
import { Button, Card, FormField, Input, Select } from "@agilityhub/ui";
import {
  type CSSProperties,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { automaticDescription } from "./description";
import {
  errorCode,
  errorProp,
  fieldOfValidationError,
  type DayOfWeek,
  type Instructor,
  type Level,
  type Ring,
  type TemplateClass,
  type TimeBand,
  weekdayLabel,
} from "./shared";

export interface ClassFormValues {
  bandId: string;
  capacity: string;
  dayOfWeek: DayOfWeek;
  description: string;
  instructorIds: string[];
  levelIds: string[];
  ringId: string | null;
}

/** Only the changed fields, as the API `PATCH` expects them (`capacity: null` = back to AUTO). */
export interface ClassFormPatch {
  bandId?: string;
  capacity?: number | null;
  dayOfWeek?: DayOfWeek;
  description?: string | null;
  instructorIds?: string[];
  levelIds?: string[];
  ringId?: string | null;
}

export type ClassFormMode =
  | {
      kind: "create";
      bandId?: string | undefined;
      dayOfWeek?: DayOfWeek | undefined;
      fromEmptyCell: boolean;
    }
  | { kind: "edit"; item: TemplateClass };

type FieldKey =
  "bandId" | "capacity" | "dayOfWeek" | "description" | "instructorIds" | "levelIds" | "general";

const knownFields: ReadonlySet<string> = new Set<FieldKey>([
  "bandId",
  "capacity",
  "dayOfWeek",
  "description",
  "general",
  "instructorIds",
  "levelIds",
]);

const fieldByCode: Readonly<Record<string, FieldKey>> = {
  DESCRIPTION_REQUIRED: "description",
  LEVEL_REQUIRED: "levelIds",
  TOO_MANY_INSTRUCTORS: "instructorIds",
};

function colorStyle(color: string): CSSProperties {
  return { "--planning-chip-color": color } as CSSProperties;
}

function initialValues(
  mode: ClassFormMode,
  bands: readonly TimeBand[],
  days: readonly DayOfWeek[],
  instructors: readonly Instructor[],
  maxInstructors: number,
): ClassFormValues {
  if (mode.kind === "edit") {
    return {
      bandId: mode.item.bandId,
      capacity: mode.item.capacityMode === "MANUAL" ? String(mode.item.capacity) : "",
      dayOfWeek: mode.item.dayOfWeek,
      description: mode.item.description ?? "",
      instructorIds: [...mode.item.instructorIds],
      levelIds: [...mode.item.levelIds],
      ringId: mode.item.ringId ?? null,
    };
  }
  const firstInstructor = instructors.find((instructor) => instructor.active);
  return {
    bandId: mode.bandId ?? bands[0]?.id ?? "",
    capacity: "",
    dayOfWeek: mode.dayOfWeek ?? days[0] ?? "MONDAY",
    description: "",
    instructorIds:
      maxInstructors === 1 && firstInstructor !== undefined ? [firstInstructor.id] : [],
    levelIds: [],
    ringId: null,
  };
}

export interface ClassFormProps {
  bands: readonly TimeBand[];
  days: readonly DayOfWeek[];
  instructors: readonly Instructor[];
  levels: readonly Level[];
  levelsEnabled: boolean;
  maxInstructors: number;
  mode: ClassFormMode;
  onChange: (patch: ClassFormPatch) => Promise<void>;
  onClose: () => void;
  onCreate: (values: ClassFormValues) => Promise<void>;
  onRemove: () => Promise<void>;
  rings: readonly Ring[];
}

export const CLASS_CARD_ID = "planning-class-card";

/**
 * «Crear classe» card of D3 (reused by D4): Franja · Dia · Instructor · Pista · Nivells ·
 * Descripció (automatic preview as placeholder, manual override as value, R-06-03) · Límit
 * (empty = AUTO, R-06-04). In edit mode every change is saved at once (R-06-02). The parent
 * remounts it (`key`) whenever another class or an empty slot is chosen.
 */
export function ClassForm({
  bands,
  days,
  instructors,
  levels,
  levelsEnabled,
  maxInstructors,
  mode,
  onChange,
  onClose,
  onCreate,
  onRemove,
  rings,
}: ClassFormProps) {
  const { t } = useTranslation(["admin-scheduling", "errors"]);
  const { formatPlainDate } = useClubFormats();
  const [values, setValues] = useState<ClassFormValues>(() =>
    initialValues(mode, bands, days, instructors, maxInstructors),
  );
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [pending, setPending] = useState(false);
  /** The class as last saved by the API (the parent passes each PATCH result without remount). */
  const savedItem = useRef(mode.kind === "edit" ? mode.item : undefined);
  useEffect(() => {
    savedItem.current = mode.kind === "edit" ? mode.item : undefined;
  }, [mode]);

  const activeRings = rings.filter((ring) => ring.active);
  const activeLevels = levels.filter((level) => level.active);
  const activeInstructors = instructors.filter((instructor) => instructor.active);
  const automatic = useMemo(
    () => automaticDescription(levels, values.levelIds, t),
    [levels, t, values.levelIds],
  );
  const levelsUnchanged =
    mode.kind === "edit" &&
    mode.item.levelIds.length === values.levelIds.length &&
    mode.item.levelIds.every((id) => values.levelIds.includes(id));
  const descriptionPreview =
    mode.kind === "edit" && levelsUnchanged && (mode.item.description ?? "") === ""
      ? mode.item.displayDescription
      : automatic;
  const autoCapacity = useMemo(() => {
    const capacities = levels
      .filter((level) => values.levelIds.includes(level.id))
      .map((level) => level.capacity);
    return capacities.length === 0 ? undefined : Math.min(...capacities);
  }, [levels, values.levelIds]);
  const capacityPreview =
    mode.kind === "edit" && mode.item.capacityMode === "AUTO" && levelsUnchanged
      ? String(mode.item.capacity)
      : autoCapacity === undefined
        ? ""
        : String(autoCapacity);

  const showError = (error: unknown) => {
    const code = errorCode(error);
    const validationField = fieldOfValidationError(error);
    const field: FieldKey =
      (code === undefined ? undefined : fieldByCode[code]) ??
      (validationField !== undefined && knownFields.has(validationField)
        ? (validationField as FieldKey)
        : "general");
    const message =
      code === undefined
        ? t("admin-scheduling:common.error")
        : t(`errors:${code}`, { defaultValue: t("admin-scheduling:common.error") });
    setErrors({ [field]: message });
  };

  /** Edit mode: the change shows at once and is sent through the parent's PATCH queue; if it
   * fails, the form goes back to the last saved class (the chips never show an unsaved value). */
  const change = async (patch: ClassFormPatch, next: Partial<ClassFormValues>) => {
    setValues((current) => ({ ...current, ...next }));
    setErrors({});
    if (mode.kind !== "edit") return;
    try {
      await onChange(patch);
    } catch (error) {
      const saved = savedItem.current;
      if (saved !== undefined) {
        setValues(
          initialValues({ item: saved, kind: "edit" }, bands, days, instructors, maxInstructors),
        );
      }
      showError(error);
    }
  };

  const toggleLevel = (levelId: string) => {
    const levelIds = values.levelIds.includes(levelId)
      ? values.levelIds.filter((id) => id !== levelId)
      : levels
          .filter((level) => level.id === levelId || values.levelIds.includes(level.id))
          .map((level) => level.id);
    void change({ levelIds }, { levelIds });
  };

  const toggleInstructor = (instructorId: string) => {
    const instructorIds = values.instructorIds.includes(instructorId)
      ? values.instructorIds.filter((id) => id !== instructorId)
      : [...values.instructorIds, instructorId];
    void change({ instructorIds }, { instructorIds });
  };

  const commitDescription = () => {
    if (mode.kind !== "edit") return;
    const description = values.description.trim() === "" ? null : values.description.trim();
    if (description === (mode.item.description ?? null)) return;
    void change({ description }, {});
  };

  const commitCapacity = () => {
    if (mode.kind !== "edit") return;
    const capacity = values.capacity.trim() === "" ? null : Number(values.capacity);
    const current = mode.item.capacityMode === "MANUAL" ? mode.item.capacity : null;
    if (capacity === current) return;
    void change({ capacity }, {});
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode.kind === "edit") return;
    setPending(true);
    setErrors({});
    try {
      await onCreate(values);
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    setPending(true);
    try {
      await onRemove();
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  };

  const idPrefix = "planning-class";
  return (
    <Card
      aria-labelledby={`${idPrefix}-title`}
      className="planning-class-card"
      id={CLASS_CARD_ID}
      role="region"
      tabIndex={-1}
    >
      <h2 className="planning-card-title" id={`${idPrefix}-title`}>
        {mode.kind === "edit"
          ? t("admin-scheduling:classCard.editTitle")
          : t("admin-scheduling:classCard.title")}
      </h2>
      <form className="planning-class-form" noValidate onSubmit={(event) => void submit(event)}>
        <FormField
          {...errorProp(errors.bandId)}
          id={`${idPrefix}-band`}
          label={t("admin-scheduling:classCard.band")}
        >
          <Select
            className="planning-class-form__band"
            id={`${idPrefix}-band`}
            onChange={(event) => {
              const bandId = event.currentTarget.value;
              void change({ bandId }, { bandId });
            }}
            value={values.bandId}
          >
            {bands.map((band) => (
              <option key={band.id} value={band.id}>
                {t("admin-scheduling:templates.bandRange", {
                  end: band.endTime,
                  start: band.startTime,
                })}
              </option>
            ))}
          </Select>
        </FormField>

        <fieldset className="planning-class-form__row">
          <legend>{t("admin-scheduling:classCard.day")}</legend>
          <div className="planning-chips" role="radiogroup">
            {days.map((day) => (
              <button
                aria-checked={values.dayOfWeek === day}
                aria-label={weekdayLabel(day, formatPlainDate, "weekdayLong")}
                className="planning-chip"
                key={day}
                onClick={() => void change({ dayOfWeek: day }, { dayOfWeek: day })}
                role="radio"
                type="button"
              >
                {weekdayLabel(day, formatPlainDate, "weekdayShort")}
              </button>
            ))}
          </div>
        </fieldset>

        {maxInstructors <= 1 ? (
          <FormField
            {...errorProp(errors.instructorIds)}
            id={`${idPrefix}-instructor`}
            label={t("admin-scheduling:classCard.instructor")}
          >
            <Select
              className="planning-class-form__instructor"
              id={`${idPrefix}-instructor`}
              onChange={(event) => {
                const instructorIds = [event.currentTarget.value];
                void change({ instructorIds }, { instructorIds });
              }}
              value={values.instructorIds[0] ?? ""}
            >
              {activeInstructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.shortName}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <fieldset className="planning-class-form__row">
            <legend>{t("admin-scheduling:classCard.instructors", { max: maxInstructors })}</legend>
            <div className="planning-chips">
              {activeInstructors.map((instructor) => {
                const selected = values.instructorIds.includes(instructor.id);
                return (
                  <button
                    aria-pressed={selected}
                    className="planning-chip"
                    disabled={!selected && values.instructorIds.length >= maxInstructors}
                    key={instructor.id}
                    onClick={() => {
                      toggleInstructor(instructor.id);
                    }}
                    type="button"
                  >
                    {instructor.shortName}
                  </button>
                );
              })}
            </div>
            {errors.instructorIds === undefined ? null : (
              <p className="ah-form-field__error" role="alert">
                {errors.instructorIds}
              </p>
            )}
          </fieldset>
        )}

        <fieldset className="planning-class-form__row">
          <legend>{t("admin-scheduling:classCard.ring")}</legend>
          <div className="planning-chips" role="radiogroup">
            {activeRings.map((ring) => (
              <button
                aria-checked={values.ringId === ring.id}
                className="planning-chip planning-chip--dot"
                key={ring.id}
                onClick={() => void change({ ringId: ring.id }, { ringId: ring.id })}
                role="radio"
                style={colorStyle(ring.color)}
                type="button"
              >
                {ring.name}
              </button>
            ))}
            <button
              aria-checked={values.ringId === null}
              className="planning-chip"
              onClick={() => void change({ ringId: null }, { ringId: null })}
              role="radio"
              type="button"
            >
              {t("admin-scheduling:classCard.noRing")}
            </button>
          </div>
        </fieldset>

        {levelsEnabled ? (
          <fieldset className="planning-class-form__row">
            <legend>{t("admin-scheduling:classCard.levels")}</legend>
            <div className="planning-chips">
              {activeLevels.map((level) => (
                <button
                  aria-pressed={values.levelIds.includes(level.id)}
                  className="planning-chip"
                  key={level.id}
                  onClick={() => {
                    toggleLevel(level.id);
                  }}
                  type="button"
                >
                  {level.name}
                </button>
              ))}
            </div>
            {errors.levelIds === undefined ? null : (
              <p className="ah-form-field__error" role="alert">
                {errors.levelIds}
              </p>
            )}
          </fieldset>
        ) : null}

        <div className="planning-class-form__pair">
          <FormField
            {...errorProp(errors.description)}
            id={`${idPrefix}-description`}
            label={t("admin-scheduling:classCard.description")}
          >
            <Input
              id={`${idPrefix}-description`}
              maxLength={40}
              onBlur={commitDescription}
              onChange={(event) => {
                const description = event.currentTarget.value;
                setValues((current) => ({ ...current, description }));
              }}
              placeholder={descriptionPreview}
              value={values.description}
            />
          </FormField>
          <FormField
            {...errorProp(errors.capacity)}
            id={`${idPrefix}-capacity`}
            label={t("admin-scheduling:classCard.capacity")}
          >
            <Input
              className="planning-class-form__capacity"
              id={`${idPrefix}-capacity`}
              min={1}
              onBlur={commitCapacity}
              onChange={(event) => {
                const capacity = event.currentTarget.value;
                setValues((current) => ({ ...current, capacity }));
              }}
              placeholder={capacityPreview}
              type="number"
              value={values.capacity}
            />
          </FormField>
        </div>

        {errors.general === undefined ? null : (
          <p className="ah-form-field__error" role="alert">
            {errors.general}
          </p>
        )}

        <div className="planning-class-form__actions">
          {mode.kind === "edit" ? (
            <>
              <Button disabled={pending} onClick={() => void remove()} variant="ghost">
                {t("admin-scheduling:classCard.remove")}
              </Button>
              <Button onClick={onClose} variant="secondary">
                {t("admin-scheduling:classCard.close")}
              </Button>
            </>
          ) : (
            <Button
              loading={pending}
              loadingLabel={t("admin-scheduling:common.saving")}
              type="submit"
            >
              {t("admin-scheduling:classCard.submit")}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
