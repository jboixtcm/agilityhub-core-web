import { type ApiClient, isApiError, saveFile } from "@agilityhub/api-client";
import {
  aprilTagIdFromMarkerUid,
  buildMarkerUid,
  canonicalLayout6,
  DEFAULT_MARKER_PHYSICAL_SIZE_M,
  pickAprilTagId,
} from "@agilityhub/course-core";
import {
  type PlannerRing,
  renderMarkerSheetPdf,
  RingDoorEditor,
  type RingDoorEditorLabels,
  RingInventoryEditor,
  type RingInventoryEditorLabels,
  RingMarkerDiagram,
} from "@agilityhub/course-ui";
import { useClubFormats } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Icon,
  Input,
  Select,
  Skeleton,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  apiCode,
  fileSlug,
  pdfBlob,
  type Placement,
  type Ring,
  type RingGeometry,
  type RingSetup,
  useCourseError,
  useCourseLabels,
  useCourseStore,
  useMetres,
  useSheetLabels,
} from "./shared";

type Surface = NonNullable<RingGeometry["surface"]>;
const SURFACES: readonly Surface[] = ["GRASS", "SAND", "ARTIFICIAL", "INDOOR", "OTHER"];

interface MarkerRow {
  aprilTagId: number | null;
  id: string;
  isActive: boolean;
  label: string;
  markerUid: string;
  x: string;
  y: string;
}

interface ZoneRow {
  depth: string;
  id: string;
  label: string;
  margin: string;
  width: string;
  x: string;
  y: string;
}

/** The geometry form (R-16-04): numbers as typed, markers and no-go rectangles as rows. */
interface GeometryValues {
  borderClearanceM: string;
  lengthM: string;
  markers: MarkerRow[];
  notes: string;
  orientationDeg: string;
  surface: Surface | "";
  widthM: string;
  zones: ZoneRow[];
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function text(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** A no-go zone the form edits as a rectangle (its bounding box). */
function zoneRow(zone: RingGeometry["noGoZones"][number]): ZoneRow {
  const xs = zone.polygonPointsM.map((point) => point.x);
  const ys = zone.polygonPointsM.map((point) => point.y);
  const left = Math.min(...xs);
  const bottom = Math.min(...ys);
  return {
    depth: text(Math.max(...ys) - bottom),
    id: zone.id,
    label: zone.label,
    margin: text(zone.warningMarginM),
    width: text(Math.max(...xs) - left),
    x: text(left),
    y: text(bottom),
  };
}

function valuesOf(geometry: RingGeometry): GeometryValues {
  return {
    borderClearanceM: text(geometry.borderClearanceM),
    lengthM: text(geometry.lengthM),
    markers: geometry.markers.map((marker) => ({
      aprilTagId: marker.aprilTagId ?? null,
      id: marker.id,
      isActive: marker.isActive,
      label: marker.label,
      markerUid: marker.markerUid,
      x: text(marker.xM),
      y: text(marker.yM),
    })),
    notes: geometry.notes ?? "",
    orientationDeg:
      geometry.orientationDeg === null || geometry.orientationDeg === undefined
        ? ""
        : text(geometry.orientationDeg),
    surface: geometry.surface ?? "",
    widthM: text(geometry.widthM),
    zones: geometry.noGoZones.map(zoneRow),
  };
}

/** A new geometry: 40 × 20 m and the six canonical markers A–F the AR export expects. */
function defaultValues(): GeometryValues {
  return {
    borderClearanceM: "1",
    lengthM: "40",
    markers: canonicalLayout6(40, 20).map((marker) => ({
      aprilTagId: null,
      id: newId("marker"),
      isActive: true,
      label: marker.label,
      markerUid: "",
      x: text(marker.xMeters),
      y: text(marker.yMeters),
    })),
    notes: "",
    orientationDeg: "",
    surface: "",
    widthM: "20",
    zones: [],
  };
}

function number(value: string): number {
  return Number(value.replace(",", "."));
}

/**
 * The `PUT /rings/{id}/geometry` body from the form: the doors stay as stored (their own editor),
 * each marker keeps its id, uid and AprilTag id, a new one gets the planner's uid and a free id.
 */
async function geometryRequest(
  values: GeometryValues,
  stored: RingGeometry | null,
  version: number,
  venueSlug: string,
  ringName: string,
) {
  const previous = new Map(stored?.markers.map((marker) => [marker.id, marker]));
  const taken = new Set(
    values.markers.flatMap((marker) => (marker.aprilTagId === null ? [] : [marker.aprilTagId])),
  );
  const markers = [];
  for (const row of values.markers) {
    const kept = previous.get(row.id);
    const markerUid =
      row.markerUid === ""
        ? buildMarkerUid({ label: row.label, ringSlug: ringName, venueSlug })
        : row.markerUid;
    let aprilTagId = row.aprilTagId;
    if (aprilTagId === null) {
      aprilTagId = pickAprilTagId(await aprilTagIdFromMarkerUid(markerUid), taken);
      taken.add(aprilTagId);
    }
    markers.push({
      aprilTagId,
      id: row.id,
      isActive: row.isActive,
      isFixed: kept?.isFixed ?? true,
      label: row.label.trim(),
      markerUid,
      notes: kept?.notes ?? null,
      physicalHeightM: kept?.physicalHeightM ?? DEFAULT_MARKER_PHYSICAL_SIZE_M,
      physicalWidthM: kept?.physicalWidthM ?? DEFAULT_MARKER_PHYSICAL_SIZE_M,
      role: kept?.role ?? "reference",
      rotationYDeg: kept?.rotationYDeg ?? 0,
      xM: number(row.x),
      yM: number(row.y),
      zM: kept?.zM ?? 0,
    });
  }
  return {
    borderClearanceM: number(values.borderClearanceM),
    doors: stored?.doors ?? [],
    lengthM: number(values.lengthM),
    markers,
    noGoZones: values.zones.map((zone) => {
      const x = number(zone.x);
      const y = number(zone.y);
      const width = number(zone.width);
      const depth = number(zone.depth);
      return {
        id: zone.id,
        label: zone.label.trim(),
        polygonPointsM: [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + depth },
          { x, y: y + depth },
        ],
        warningMarginM: number(zone.margin),
      };
    }),
    notes: values.notes.trim() === "" ? null : values.notes.trim(),
    orientationDeg: values.orientationDeg.trim() === "" ? null : number(values.orientationDeg),
    surface: values.surface === "" ? null : values.surface,
    version,
    widthM: number(values.widthM),
  };
}

/** The form drawn as a ring (the marker diagram previews what will be saved). */
function previewRing(values: GeometryValues, base: PlannerRing | null, ring: Ring): PlannerRing {
  const length = number(values.lengthM);
  const width = number(values.widthM);
  return {
    border_clearance_m: number(values.borderClearanceM),
    created_at: base?.created_at ?? "",
    default_units: "m",
    doors: base?.doors ?? [],
    geometry_version: base?.geometry_version ?? 0,
    id: ring.id,
    is_active: ring.active,
    length_m: Number.isFinite(length) && length > 0 ? length : 1,
    markers: values.markers.map((row) => ({
      april_tag_id: row.aprilTagId,
      id: row.id,
      is_active: row.isActive,
      is_fixed: true,
      label: row.label,
      marker_uid: row.markerUid,
      notes: null,
      physical_height_m: DEFAULT_MARKER_PHYSICAL_SIZE_M,
      physical_width_m: DEFAULT_MARKER_PHYSICAL_SIZE_M,
      ring_id: ring.id,
      role: "reference",
      rotation_y_deg: 0,
      x_m: number(row.x),
      y_m: number(row.y),
      z_m: 0,
    })),
    name: ring.name,
    no_go_zones: [],
    notes: null,
    obstacle_inventory: base?.obstacle_inventory ?? [],
    surface: values.surface === "" ? null : values.surface,
    updated_at: base?.updated_at ?? "",
    venue_id: base?.venue_id ?? "",
    width_m: Number.isFinite(width) && width > 0 ? width : 1,
  };
}

/** The fields of the form the user changed, to put back on a geometry read again. */
function ownEdits(values: GeometryValues, original: GeometryValues): Partial<GeometryValues> {
  return Object.fromEntries(
    (Object.keys(values) as (keyof GeometryValues)[])
      .filter((key) => JSON.stringify(values[key]) !== JSON.stringify(original[key]))
      .map((key) => [key, values[key]]),
  );
}

function GeometryCard({
  client,
  geometry,
  onSaved,
  ring,
  stored,
}: {
  client: ApiClient;
  geometry: RingGeometry | null;
  onSaved: () => void;
  ring: Ring;
  stored: PlannerRing | null;
}) {
  const { t } = useTranslation(["admin-courses", "enums", "errors"]);
  const branding = useBranding();
  const errorText = useCourseError();
  const { locale } = useClubFormats();
  const [base, setBase] = useState(geometry);
  const [values, setValues] = useState(() =>
    geometry === null ? defaultValues() : valuesOf(geometry),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ lines: string[]; tone: "error" | "info" | "ok" }>();
  const original = useMemo(() => (base === null ? defaultValues() : valuesOf(base)), [base]);
  // A newer geometry from the page (the door editor saved): adopted while rendering, with the
  // user's own edits kept on top (React's «adjusting state when a prop changes»).
  const [seen, setSeen] = useState(geometry?.version);
  if (geometry !== null && geometry.version !== seen) {
    setSeen(geometry.version);
    if (geometry.version !== base?.version) {
      const own = ownEdits(values, original);
      setBase(geometry);
      setValues({ ...valuesOf(geometry), ...own });
    }
  }

  const update = (patch: Partial<GeometryValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setMessage(undefined);
  };
  const updateMarker = (id: string, patch: Partial<MarkerRow>) => {
    update({ markers: values.markers.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  };
  const updateZone = (id: string, patch: Partial<ZoneRow>) => {
    update({ zones: values.zones.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  };

  const violationLine = (violation: { path: string; rule: string }) => {
    const index = /\[(\d+)\]/u.exec(violation.path)?.[1];
    const at = index === undefined ? undefined : Number(index);
    const field = violation.path.startsWith("markers")
      ? at === undefined
        ? t("admin-courses:geometry.markers")
        : t("admin-courses:geometry.markerNamed", { label: values.markers[at]?.label ?? "" })
      : violation.path.startsWith("noGoZones")
        ? t("admin-courses:geometry.zoneNamed", {
            label: at === undefined ? "" : (values.zones[at]?.label ?? ""),
          })
        : violation.path.startsWith("doors")
          ? t("admin-courses:geometry.doorNamed", {
              label: at === undefined ? "" : (base?.doors[at]?.label ?? ""),
            })
          : violation.path === "lengthM"
            ? t("admin-courses:geometry.length")
            : violation.path === "widthM"
              ? t("admin-courses:geometry.width")
              : violation.path === "borderClearanceM"
                ? t("admin-courses:geometry.borderClearance")
                : violation.path;
    return t("admin-courses:geometry.violation", {
      field,
      rule: t(`admin-courses:geometry.rule.${violation.rule}`, { defaultValue: violation.rule }),
    });
  };

  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      const body = await geometryRequest(
        values,
        base,
        base?.version ?? 0,
        branding.club.slug,
        ring.name,
      );
      const result = await client.PUT("/rings/{id}/geometry", {
        body,
        params: { path: { id: ring.id } },
      });
      if (result.data === undefined) throw new TypeError("Saved geometry without data");
      setBase(result.data);
      setValues(valuesOf(result.data));
      setMessage({ lines: [t("admin-courses:geometry.saved")], tone: "ok" });
      onSaved();
    } catch (cause) {
      if (isApiError(cause, "GEOMETRY_INVALID")) {
        const details = cause.details as
          { violations?: { path: string; rule: string }[] } | undefined;
        setMessage({
          lines: [errorText(cause), ...(details?.violations ?? []).map(violationLine)],
          tone: "error",
        });
      } else if (apiCode(cause) === "STALE_VERSION") {
        const fresh = await client
          .GET("/rings/{id}/geometry", { params: { path: { id: ring.id } } })
          .then((answer) => answer.data)
          .catch(() => undefined);
        if (fresh !== undefined) {
          const own = ownEdits(values, original);
          setBase(fresh);
          setValues({ ...valuesOf(fresh), ...own });
          onSaved();
        }
        setMessage({ lines: [t("admin-courses:geometry.stale")], tone: "info" });
      } else {
        setMessage({ lines: [errorText(cause)], tone: "error" });
      }
    } finally {
      setPending(false);
    }
  };

  const preview = previewRing(values, stored, ring);

  return (
    <Card aria-labelledby="geometry-title" className="courses-card" role="region">
      <h2 id="geometry-title">{t("admin-courses:geometry.title")}</h2>
      <div className="courses-geometry">
        <form className="courses-form" noValidate onSubmit={(event) => void save(event)}>
          <div className="courses-form__row">
            <FormField id="geometry-length" label={t("admin-courses:geometry.length")}>
              <Input
                id="geometry-length"
                inputMode="decimal"
                onChange={(event) => {
                  update({ lengthM: event.currentTarget.value });
                }}
                value={values.lengthM}
              />
            </FormField>
            <FormField id="geometry-width" label={t("admin-courses:geometry.width")}>
              <Input
                id="geometry-width"
                inputMode="decimal"
                onChange={(event) => {
                  update({ widthM: event.currentTarget.value });
                }}
                value={values.widthM}
              />
            </FormField>
            <FormField
              help={t("admin-courses:geometry.orientationHelp")}
              id="geometry-orientation"
              label={t("admin-courses:geometry.orientation")}
            >
              <Input
                id="geometry-orientation"
                inputMode="decimal"
                onChange={(event) => {
                  update({ orientationDeg: event.currentTarget.value });
                }}
                value={values.orientationDeg}
              />
            </FormField>
            <FormField id="geometry-border" label={t("admin-courses:geometry.borderClearance")}>
              <Input
                id="geometry-border"
                inputMode="decimal"
                onChange={(event) => {
                  update({ borderClearanceM: event.currentTarget.value });
                }}
                value={values.borderClearanceM}
              />
            </FormField>
            <FormField id="geometry-surface" label={t("admin-courses:geometry.surface")}>
              <Select
                id="geometry-surface"
                onChange={(event) => {
                  update({ surface: event.currentTarget.value as Surface | "" });
                }}
                value={values.surface}
              >
                <option value="">{t("admin-courses:common.none")}</option>
                {SURFACES.map((value) => (
                  <option key={value} value={value}>
                    {t(`enums:ringSurface.${value}`)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <fieldset className="courses-rows">
            <legend>{t("admin-courses:geometry.markers")}</legend>
            <p className="courses-muted">{t("admin-courses:geometry.markersHelp")}</p>
            {values.markers.map((row, index) => (
              <div className="courses-rows__row" key={row.id}>
                <Input
                  aria-label={t("admin-courses:geometry.markerLabel", { index: index + 1 })}
                  className="courses-input--short"
                  maxLength={8}
                  onChange={(event) => {
                    updateMarker(row.id, { label: event.currentTarget.value });
                  }}
                  value={row.label}
                />
                <Input
                  aria-label={t("admin-courses:geometry.markerX", { label: row.label })}
                  inputMode="decimal"
                  onChange={(event) => {
                    updateMarker(row.id, { x: event.currentTarget.value });
                  }}
                  value={row.x}
                />
                <Input
                  aria-label={t("admin-courses:geometry.markerY", { label: row.label })}
                  inputMode="decimal"
                  onChange={(event) => {
                    updateMarker(row.id, { y: event.currentTarget.value });
                  }}
                  value={row.y}
                />
                <label className="courses-rows__check">
                  <input
                    checked={row.isActive}
                    onChange={(event) => {
                      updateMarker(row.id, { isActive: event.currentTarget.checked });
                    }}
                    type="checkbox"
                  />
                  {t("admin-courses:geometry.active")}
                </label>
                <Button
                  aria-label={t("admin-courses:geometry.removeMarker", { label: row.label })}
                  onClick={() => {
                    update({ markers: values.markers.filter((item) => item.id !== row.id) });
                  }}
                  variant="ghost"
                >
                  <Icon aria-hidden="true" name="x" />
                </Button>
              </div>
            ))}
            <Button
              onClick={() => {
                update({
                  markers: [
                    ...values.markers,
                    {
                      aprilTagId: null,
                      id: newId("marker"),
                      isActive: true,
                      label: String.fromCharCode(65 + values.markers.length),
                      markerUid: "",
                      x: "0",
                      y: "0",
                    },
                  ],
                });
              }}
              variant="secondary"
            >
              <Icon aria-hidden="true" name="plus" />
              {t("admin-courses:geometry.addMarker")}
            </Button>
          </fieldset>
          <fieldset className="courses-rows">
            <legend>{t("admin-courses:geometry.zones")}</legend>
            <p className="courses-muted">{t("admin-courses:geometry.zonesHelp")}</p>
            {values.zones.map((row) => (
              <div className="courses-rows__row" key={row.id}>
                <Input
                  aria-label={t("admin-courses:geometry.zoneLabel")}
                  onChange={(event) => {
                    updateZone(row.id, { label: event.currentTarget.value });
                  }}
                  value={row.label}
                />
                {(["x", "y", "width", "depth", "margin"] as const).map((key) => (
                  <Input
                    aria-label={t(`admin-courses:geometry.zone.${key}`, { label: row.label })}
                    inputMode="decimal"
                    key={key}
                    onChange={(event) => {
                      updateZone(row.id, { [key]: event.currentTarget.value });
                    }}
                    value={row[key]}
                  />
                ))}
                <Button
                  aria-label={t("admin-courses:geometry.removeZone", { label: row.label })}
                  onClick={() => {
                    update({ zones: values.zones.filter((item) => item.id !== row.id) });
                  }}
                  variant="ghost"
                >
                  <Icon aria-hidden="true" name="x" />
                </Button>
              </div>
            ))}
            <Button
              onClick={() => {
                update({
                  zones: [
                    ...values.zones,
                    {
                      depth: "2",
                      id: newId("zone"),
                      label: t("admin-courses:geometry.newZone"),
                      margin: "0.5",
                      width: "2",
                      x: "1",
                      y: "1",
                    },
                  ],
                });
              }}
              variant="secondary"
            >
              <Icon aria-hidden="true" name="plus" />
              {t("admin-courses:geometry.addZone")}
            </Button>
          </fieldset>
          <FormField id="geometry-notes" label={t("admin-courses:geometry.notes")}>
            <Textarea
              id="geometry-notes"
              maxLength={2000}
              onChange={(event) => {
                update({ notes: event.currentTarget.value });
              }}
              value={values.notes}
            />
          </FormField>
          {message === undefined ? null : (
            <div
              className={message.tone === "error" ? "ah-form-field__error" : "courses-notice"}
              role={message.tone === "error" ? "alert" : "status"}
            >
              {message.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
          <div className="courses-form__actions">
            <Button loading={pending} loadingLabel={t("admin-courses:common.saving")} type="submit">
              {t("admin-courses:geometry.save")}
            </Button>
          </div>
        </form>
        <div className="courses-geometry__preview">
          <RingMarkerDiagram
            ariaLabel={t("admin-courses:geometry.diagram", { ring: ring.name })}
            locale={locale}
            ring={preview}
          />
        </div>
      </div>
    </Card>
  );
}

function editorPath(placement: Placement): string {
  return `/recorreguts/${encodeURIComponent(placement.courseId)}/col-locacio?colocacio=${encodeURIComponent(placement.id)}`;
}

/** The ring's setups, newest first (R-16-08), with R-16-06's warning on an active one. */
function SetupsCard({
  onNavigate,
  placements,
  setups,
}: {
  onNavigate: (path: string) => void;
  placements: readonly Placement[];
  setups: readonly RingSetup[] | undefined;
}) {
  const { t } = useTranslation("admin-courses");
  const { formatDate } = useClubFormats();
  const labels = useCourseLabels();
  return (
    <Card aria-labelledby="setups-title" className="courses-card" role="region">
      <h2 id="setups-title">{t("admin-courses:setups.title")}</h2>
      {setups === undefined ? (
        <Skeleton height="3rem" label={t("admin-courses:common.loading")} />
      ) : setups.length === 0 ? (
        <p className="courses-muted">{t("admin-courses:setups.empty")}</p>
      ) : (
        <ul className="courses-setups">
          {setups.map((setup) => {
            const placement = placements.find((item) => item.id === setup.placementId);
            // R-16-06 (ruling E117): the client joins the setup's placement with the placements.
            const stalePlacement =
              setup.status === "ACTIVE" && placement?.stale === true ? placement : undefined;
            // The api keeps no reason for DISMANTLED: a setup dismantled the instant the next one
            // was built was replaced by it (R-16-07, one transaction).
            const replaced =
              setup.status === "DISMANTLED" &&
              setups.some((other) => other.id !== setup.id && other.builtAt === setup.dismantledAt);
            return (
              <li key={setup.id}>
                <div>
                  <strong>{labels.setupKind(setup.kind)}</strong>
                  <Badge tone={setup.status === "ACTIVE" ? "success" : "neutral"}>
                    {replaced
                      ? t("admin-courses:setups.replaced")
                      : labels.setupStatus(setup.status)}
                  </Badge>
                </div>
                <span className="courses-muted">
                  {setup.status === "ACTIVE"
                    ? t("admin-courses:setups.activeLine", {
                        built: formatDate(setup.builtAt, "dayMonth"),
                        until: formatDate(setup.expiresAt, "dayMonth"),
                      })
                    : t("admin-courses:setups.pastLine", {
                        built: formatDate(setup.builtAt, "dayMonth"),
                        ended: formatDate(setup.dismantledAt ?? setup.expiresAt, "dayMonth"),
                      })}
                </span>
                {stalePlacement === undefined ? null : (
                  <p className="courses-warning">
                    {t("admin-courses:stale")}{" "}
                    <a
                      href={editorPath(stalePlacement)}
                      onClick={(event) => {
                        event.preventDefault();
                        onNavigate(editorPath(stalePlacement));
                      }}
                    >
                      {t("admin-courses:setups.review")}
                    </a>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/**
 * D16 «Geometria» (`/pistes/:id/geometria`, S16 §2, ADMIN): the ring's geometry (size,
 * orientation, margin, surface, markers, no-go zones, notes; `PUT /rings/{id}/geometry` at its
 * version), its doors and inventory (course-ui's editors), the marker sheet PDF made here from the
 * stored markers (A8b) and the setups history.
 */
export function RingGeometryPage({
  client,
  onNavigate,
  ringId,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
  ringId: string;
}) {
  const { t } = useTranslation(["admin-courses", "enums", "errors"]);
  const store = useCourseStore(client);
  const errorText = useCourseError();
  const metres = useMetres();
  const sheet = useSheetLabels();
  const labels = useInventoryLabels();
  const [ring, setRing] = useState<Ring>();
  const [geometry, setGeometry] = useState<RingGeometry | null>();
  const [planner, setPlanner] = useState<PlannerRing | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [setups, setSetups] = useState<RingSetup[]>();
  const [loadError, setLoadError] = useState<unknown>();
  const [creating, setCreating] = useState(false);
  const [sheetError, setSheetError] = useState<string>();
  const [reload, setReload] = useState(0);

  const refresh = useCallback(() => {
    setReload((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [ringAnswer, geometryAnswer, plannerRing, placementsAnswer, setupsAnswer] =
        await Promise.all([
          client.GET("/rings/{id}", { params: { path: { id: ringId } } }),
          client
            .GET("/rings/{id}/geometry", { params: { path: { id: ringId } } })
            .then((answer) => answer.data ?? null)
            .catch((cause: unknown) => {
              if (isApiError(cause) && cause.status === 404) return null;
              throw cause;
            }),
          store.getRing(ringId),
          client.GET("/placements", { params: { query: { ringId } } }),
          client.GET("/rings/{id}/setups", {
            params: { path: { id: ringId }, query: { page: 0, size: 20 } },
          }),
        ]);
      if (!active) return;
      setRing(ringAnswer.data);
      setGeometry(geometryAnswer);
      setPlanner(plannerRing);
      setPlacements(placementsAnswer.data ?? []);
      setSetups(setupsAnswer.data?.items ?? []);
    };
    load().catch((cause: unknown) => {
      if (active) setLoadError(cause);
    });
    return () => {
      active = false;
    };
  }, [client, reload, ringId, store]);

  const markerSheet = async () => {
    if (planner === null || ring === undefined) return;
    setSheetError(undefined);
    try {
      const tagIds = new Map<string, number>();
      for (const marker of planner.markers) {
        tagIds.set(
          marker.id,
          marker.april_tag_id ?? (await aprilTagIdFromMarkerUid(marker.marker_uid)),
        );
      }
      const bytes = renderMarkerSheetPdf({
        labels: sheet.markers(ring.name),
        markers: planner.markers,
        tagIds,
      });
      saveFile(pdfBlob(bytes), `marcadors-${fileSlug(ring.name)}.pdf`);
    } catch (cause) {
      setSheetError(errorText(cause));
    }
  };

  if (loadError !== undefined) {
    return (
      <EmptyState
        action={<Button onClick={refresh}>{t("admin-courses:common.retry")}</Button>}
        description={errorText(loadError)}
        title={t("admin-courses:geometry.loadError")}
      />
    );
  }
  if (ring === undefined || geometry === undefined) {
    return <Skeleton height="20rem" label={t("admin-courses:common.loading")} />;
  }

  const doorLabels: RingDoorEditorLabels = {
    active: t("admin-courses:doors.active"),
    add: t("admin-courses:doors.add"),
    clearance: t("admin-courses:doors.clearance"),
    clearanceFor: (index) => t("admin-courses:doors.clearanceFor", { index }),
    description: t("admin-courses:doors.description"),
    door: (index) => t("admin-courses:doors.door", { index }),
    empty: (maximum) => t("admin-courses:doors.empty", { maximum }),
    end: t("admin-courses:doors.end"),
    endFor: (index) => t("admin-courses:doors.endFor", { index }),
    error: errorText,
    flow: t("admin-courses:doors.flow"),
    flowFor: (index) => t("admin-courses:doors.flowFor", { index }),
    flowOption: {
      both: t("enums:doorFlow.BOTH"),
      in: t("enums:doorFlow.IN"),
      out: t("enums:doorFlow.OUT"),
    },
    geometry: (hint, wall, opening) =>
      opening === null
        ? t("admin-courses:doors.geometryWall", { hint, wall: metres(wall) })
        : t("admin-courses:doors.geometry", { hint, opening: metres(opening), wall: metres(wall) }),
    maximumReached: (maximum) => t("admin-courses:doors.maximumReached", { maximum }),
    notes: t("admin-courses:doors.notes"),
    notesFor: (index) => t("admin-courses:doors.notesFor", { index }),
    notesPlaceholder: t("admin-courses:doors.notesPlaceholder"),
    preview: t("admin-courses:doors.preview"),
    previewAria: (name) => t("admin-courses:doors.previewAria", { name }),
    remove: (index) => t("admin-courses:doors.remove", { index }),
    revert: t("admin-courses:doors.revert"),
    save: t("admin-courses:doors.save"),
    saved: t("admin-courses:doors.saved"),
    saving: t("admin-courses:common.saving"),
    side: {
      east: { hint: t("admin-courses:doors.sideHint.east"), label: t("enums:doorSide.EAST") },
      north: { hint: t("admin-courses:doors.sideHint.north"), label: t("enums:doorSide.NORTH") },
      south: { hint: t("admin-courses:doors.sideHint.south"), label: t("enums:doorSide.SOUTH") },
      west: { hint: t("admin-courses:doors.sideHint.west"), label: t("enums:doorSide.WEST") },
    },
    start: t("admin-courses:doors.start"),
    startFor: (index) => t("admin-courses:doors.startFor", { index }),
    title: (name, count, maximum) => t("admin-courses:doors.title", { count, maximum, name }),
    validation: {
      clearance: (door) => t("admin-courses:doors.validation.clearance", { door }),
      endpoints: (door) => t("admin-courses:doors.validation.endpoints", { door }),
      maximum: (count, maximum) => t("admin-courses:doors.validation.maximum", { count, maximum }),
      order: (door, start, end) =>
        t("admin-courses:doors.validation.order", { door, end: metres(end), start: metres(start) }),
      wall: (door, end, wall) =>
        t("admin-courses:doors.validation.wall", { door, end: metres(end), wall: metres(wall) }),
    },
    wall: t("admin-courses:doors.wall"),
    wallFor: (index) => t("admin-courses:doors.wallFor", { index }),
  };

  return (
    <div className="courses-page courses-geometry-page">
      <header className="courses-page__header">
        <div>
          <a
            className="courses-back"
            href="/pistes"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("/pistes");
            }}
          >
            {t("admin-courses:geometry.back")}
          </a>
          <h1>{t("admin-courses:geometry.heading", { ring: ring.name })}</h1>
        </div>
        {geometry === null ? null : (
          <Button onClick={() => void markerSheet()} variant="secondary">
            <Icon aria-hidden="true" name="doc" />
            {t("admin-courses:geometry.markerSheet")}
          </Button>
        )}
      </header>
      {sheetError === undefined ? null : (
        <p className="ah-form-field__error" role="alert">
          {sheetError}
        </p>
      )}
      {geometry === null && !creating ? (
        <Card className="courses-card">
          <p>{t("admin-courses:geometry.none")}</p>
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Icon aria-hidden="true" name="plus" />
            {t("admin-courses:geometry.create")}
          </Button>
        </Card>
      ) : (
        <GeometryCard
          client={client}
          geometry={geometry}
          onSaved={refresh}
          ring={ring}
          stored={planner}
        />
      )}
      {planner === null ? null : (
        <div className="courses-geometry-page__editors">
          <RingDoorEditor labels={doorLabels} onSaved={refresh} ring={planner} />
          <RingInventoryEditor labels={labels} onSaved={refresh} ring={planner} />
        </div>
      )}
      <SetupsCard onNavigate={onNavigate} placements={placements} setups={setups} />
    </div>
  );
}

function useInventoryLabels(): RingInventoryEditorLabels {
  const { t } = useTranslation(["admin-courses", "enums"]);
  const errorText = useCourseError();
  const course = useCourseLabels();
  return {
    decrease: (name) => t("admin-courses:inventory.decrease", { name }),
    description: t("admin-courses:inventory.description"),
    error: errorText,
    increase: (name) => t("admin-courses:inventory.increase", { name }),
    obstacle: (type) => ({ name: course.obstacle(type) }),
    quantity: (name) => t("admin-courses:inventory.quantity", { name }),
    revert: t("admin-courses:inventory.revert"),
    save: t("admin-courses:inventory.save"),
    saved: t("admin-courses:inventory.saved"),
    saving: t("admin-courses:common.saving"),
    title: (name, total, types) => t("admin-courses:inventory.title", { name, total, types }),
  };
}
