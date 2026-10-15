/**
 * A dev-only page that mounts the recovered planner components the way D16/D18 will (E9-W03), so
 * Playwright can check them in a real browser (WebGL, the FBX models, Tailwind and the club tokens)
 * and capture them at 1280 px (E9-W02 round 2, review #14). Not part of the package build.
 *
 * The labels are fixtures for the harness; the shared texts (warning rules, api errors) come from
 * the real catalogs through `createCourseTexts`. `?theme=dark` renders the dark token set.
 */
import { parseSmarterTxt, type CourseData } from "@agilityhub/course-core";
import { createCourseTexts, createI18n, type CourseTexts } from "@agilityhub/i18n";
import { StrictMode, useMemo, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";

import smarterSource from "../../course-core/fixtures/smarter/jp-s-sw_993483_sadesign.txt?raw";
import {
  computeWarnings,
  INITIAL_STATE,
  PlacementControls,
  Planner3D,
  PlannerCanvas,
  plannerReducer,
  RingDoorEditor,
  RingMarkerDiagram,
  UnitsToggle,
  WarningsPanel,
  type PlannerRing,
  type PlannerRingMarker,
} from "../src/index";

import "./harness.css";

const course: CourseData = parseSmarterTxt(smarterSource, {
  sourceFileName: "jp-s-sw.txt",
}).courseData;

function marker(label: string, x: number, y: number): PlannerRingMarker {
  return {
    april_tag_id: null,
    id: `marker-${label}`,
    is_active: true,
    is_fixed: true,
    label,
    marker_uid: `marker-${label.toLowerCase()}`,
    notes: null,
    physical_height_m: 0.16,
    physical_width_m: 0.16,
    ring_id: "ring-1",
    role: "reference",
    rotation_y_deg: 0,
    x_m: x,
    y_m: y,
    z_m: 0,
  };
}

const LENGTH = Math.ceil(course.designLengthMeters) + 2;
const WIDTH = Math.ceil(course.designWidthMeters) + 2;

const ring: PlannerRing = {
  border_clearance_m: 1,
  created_at: "2026-10-15T09:00:00Z",
  default_units: "m",
  doors: [
    {
      clearance_m: 1.5,
      end_m: 5,
      flow: "in",
      id: "door-entrance",
      is_active: true,
      label: "Entrada",
      notes: null,
      polygon_points_m: [
        { x: 3, y: WIDTH },
        { x: 5, y: WIDTH },
        { x: 5, y: WIDTH - 0.1 },
        { x: 3, y: WIDTH - 0.1 },
      ],
      side: "north",
      start_m: 3,
    },
  ],
  geometry_version: 3,
  id: "ring-1",
  is_active: true,
  length_m: LENGTH,
  // The «legacy perimeter» A–F layout the recovered heuristic used to relocate.
  markers: [
    marker("A", 0, 0),
    marker("B", 0, WIDTH),
    marker("C", LENGTH, 0),
    marker("D", LENGTH, WIDTH),
    marker("E", LENGTH / 2, 0),
    marker("F", LENGTH / 2, WIDTH),
  ],
  name: "Pista central",
  no_go_zones: [
    {
      id: "pond",
      label: "Bassa",
      polygon_points_m: [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 4, y: 4 },
        { x: 1, y: 4 },
      ],
      warning_margin_m: 0.5,
    },
  ],
  notes: null,
  obstacle_inventory: [{ obstacle_type: "Jump", quantity: 8 }],
  surface: "GRASS",
  updated_at: "2026-10-15T09:00:00Z",
  venue_id: "club-1",
  width_m: WIDTH,
};

function Harness({ texts }: { texts: CourseTexts }) {
  const [state, dispatch] = useReducer(plannerReducer, INITIAL_STATE, (initial) =>
    plannerReducer(
      plannerReducer(initial, {
        course,
        courseDbId: "course-1",
        filename: "jp-s-sw.txt",
        type: "SET_COURSE",
      }),
      { ring, type: "SET_RING" },
    ),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const warnings = useMemo(() => computeWarnings(state), [state]);
  const units = state.displayUnits;

  return (
    <main className="grid grid-cols-[minmax(0,1fr)_340px] gap-4 p-4" style={{ width: 1280 }}>
      <section className="space-y-4" aria-label="Vistes del recorregut">
        <Planner3D
          ariaLabel="Recorregut en 3D"
          course={course}
          onSelectObstacle={setSelected}
          placement={state.placement}
          ring={ring}
          selectedObstacleId={selected}
          warnings={warnings}
        />
        <div className="grid grid-cols-2 gap-4">
          <PlannerCanvas
            course={course}
            labels={{ ariaLabel: "Recorregut en 2D", entry: "Entrada", exit: "Sortida" }}
            onSelectObstacle={setSelected}
            placement={state.placement}
            ring={ring}
            selectedObstacleId={selected}
            warnings={warnings}
          />
          <RingMarkerDiagram ariaLabel="Marcadors de la pista" locale="ca" ring={ring} />
        </div>
        <RingDoorEditor
          labels={{
            active: "Activa",
            add: "Afegeix una porta",
            clearance: "Marge (m)",
            clearanceFor: (index) => `Marge de la porta ${String(index)}`,
            description: "Fins a quatre portes per pista.",
            door: (index) => `Porta ${String(index)}`,
            empty: () => "Cap porta",
            end: "Fi (m)",
            endFor: (index) => `Fi de la porta ${String(index)}`,
            error: (error) => texts.errorText(error),
            flow: "Sentit",
            flowFor: (index) => `Sentit de la porta ${String(index)}`,
            flowOption: { both: "Entrada i sortida", in: "Entrada", out: "Sortida" },
            geometry: (hint) => hint,
            maximumReached: () => "Màxim de portes",
            notes: "Notes",
            notesFor: (index) => `Notes de la porta ${String(index)}`,
            notesPlaceholder: "",
            preview: "Vista prèvia",
            previewAria: (name) => `Portes de ${name}`,
            remove: (index) => `Treu la porta ${String(index)}`,
            revert: "Desfés",
            save: "Desa les portes",
            saved: "Portes desades",
            saving: "Desant…",
            side: {
              east: { hint: "paret est", label: "Est" },
              north: { hint: "paret nord", label: "Nord" },
              south: { hint: "paret sud", label: "Sud" },
              west: { hint: "paret oest", label: "Oest" },
            },
            start: "Inici (m)",
            startFor: (index) => `Inici de la porta ${String(index)}`,
            title: (name, count, maximum) => `Portes de ${name} (${String(count)}/${String(maximum)})`,
            validation: {
              clearance: (door) => `${door}: marge`,
              endpoints: (door) => `${door}: extrems`,
              maximum: () => "Massa portes",
              order: (door) => `${door}: ordre`,
              wall: (door) => `${door}: paret`,
            },
            wall: "Paret",
            wallFor: (index) => `Paret de la porta ${String(index)}`,
          }}
          onSaved={() => undefined}
          ring={ring}
        />
      </section>
      <aside className="space-y-4" aria-label="Col·locació">
        <UnitsToggle
          labels={{ feet: "peus", group: "Unitats", meters: "metres" }}
          onChange={(next) => {
            dispatch({ type: "SET_DISPLAY_UNITS", units: next });
          }}
          units={units}
        />
        <PlacementControls
          flipX={state.placement.flipX}
          flipY={state.placement.flipY}
          labels={{
            center: "Centra",
            flipHorizontal: "Mirall horitzontal",
            flipVertical: "Mirall vertical",
            nudgeDown: "Mou avall",
            nudgeLeft: "Mou a l'esquerra",
            nudgeRight: "Mou a la dreta",
            nudgeUp: "Mou amunt",
            reset: "Restableix",
            rotateFineLeft: "−1°",
            rotateFineRight: "+1°",
            rotateLeft: "−90°",
            rotateRight: "+90°",
            stepSize: "Pas",
            title: "Col·locació",
          }}
          locale="ca"
          onCenter={() => {
            dispatch({ type: "CENTER" });
          }}
          onFlipX={() => {
            dispatch({ type: "FLIP_X" });
          }}
          onFlipY={() => {
            dispatch({ type: "FLIP_Y" });
          }}
          onNudge={(dxMeters, dyMeters) => {
            dispatch({ dxMeters, dyMeters, type: "NUDGE" });
          }}
          onReset={() => {
            dispatch({ type: "RESET_PLACEMENT" });
          }}
          onRotate={(deltaDegrees) => {
            dispatch({ deltaDegrees, type: "ROTATE" });
          }}
          units={units}
        />
        <WarningsPanel
          labels={{
            empty: "Cap avís",
            rule: (ruleId) => texts.warningRule(ruleId),
            severity: { critical: "crític", info: "info", warning: "avís" },
            title: (count) => `Avisos (${String(count)})`,
            warning: (warning) => warning.message,
          }}
          locale="ca"
          onSelectObstacle={setSelected}
          selectedObstacleId={selected}
          units={units}
          warnings={warnings}
        />
      </aside>
    </main>
  );
}

async function start() {
  const root = document.getElementById("root");
  if (root === null) throw new Error("ROOT_NOT_FOUND");
  if (new URLSearchParams(window.location.search).get("theme") === "dark") {
    document.documentElement.dataset.theme = "auto";
  }
  const i18n = await createI18n({
    branding: { defaultLocale: "ca", locales: ["ca", "es", "en"] },
    browserLanguages: ["ca"],
    initialNamespaces: ["common", "enums", "errors"],
    storage: undefined,
  });
  const t = i18n.getFixedT("ca");
  const texts = createCourseTexts((key, options) => t(key, options ?? {}));
  createRoot(root).render(
    <StrictMode>
      <Harness texts={texts} />
    </StrictMode>,
  );
}

void start();
