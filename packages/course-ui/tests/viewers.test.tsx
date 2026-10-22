import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseSmarterTxt,
  placedObstacleHeadingDegrees,
  type CourseData,
  type CoursePlacement,
  type UnitSystem,
} from "@agilityhub/course-core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMemo, useReducer } from "react";
import type * as Three from "three";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  computeWarnings,
  INITIAL_STATE,
  PlacementControls,
  Planner3D,
  PlannerCanvas,
  plannerReducer,
  WarningsPanel,
  type PlannerRing,
} from "../src/index";

import { tokenHex } from "./helpers/tokens";

// ---------------------------------------------------------------------------
// jsdom has no WebGL, canvas 2D, ResizeObserver or CSS custom properties: the renderer is
// replaced by one that records the scene it is asked to draw, the FBX loader hands back an
// empty model, the canvas context records what is painted, and a `var(--token)` probe reads
// the token from packages/ui/src/tokens.css. Everything else is the real Planner3D.
// ---------------------------------------------------------------------------

const rendered = vi.hoisted((): { scene: unknown } => ({ scene: null }));
const painted = vi.hoisted(() => ({ fills: [] as { fillStyle: string; text: string | null }[] }));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class RecordingRenderer {
    readonly domElement = document.createElement("canvas");
    setPixelRatio() {
      /* no-op: nothing is drawn in jsdom */
    }
    setSize() {
      /* no-op */
    }
    setClearColor() {
      /* no-op */
    }
    render(scene: unknown) {
      rendered.scene = scene;
    }
    dispose() {
      /* no-op */
    }
  }
  return { ...actual, WebGLRenderer: RecordingRenderer };
});

vi.mock("three/examples/jsm/loaders/FBXLoader.js", async () => {
  const THREE = await import("three");
  return {
    FBXLoader: class {
      load(_url: string, onLoad: (group: Three.Group) => void) {
        onLoad(new THREE.Group());
      }
    },
  };
});

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {
      /* no-op: jsdom does no layout */
    }
    unobserve() {
      /* no-op */
    }
    disconnect() {
      /* no-op */
    }
  };
  globalThis.requestAnimationFrame = (callback) =>
    setTimeout(() => {
      callback(0);
    }, 0) as unknown as number;
  globalThis.cancelAnimationFrame = (handle) => {
    clearTimeout(handle);
  };
  HTMLCanvasElement.prototype.getContext = function getContext() {
    const context: Record<string, unknown> = { fillStyle: "" };
    return new Proxy(context, {
      get: (target, property) => {
        if (property === "fill") {
          return () => painted.fills.push({ fillStyle: String(target.fillStyle), text: null });
        }
        if (property === "fillText") {
          return (text: string) =>
            painted.fills.push({ fillStyle: String(target.fillStyle), text });
        }
        if (property in target) return target[property as string];
        return () => undefined;
      },
      set: (target, property, value) => {
        target[property as string] = value;
        return true;
      },
    });
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const token = /^var\((--[\w-]+)\)$/u.exec((element as HTMLElement).style.color)?.[1];
    return token === undefined
      ? original(element, pseudo)
      : ({ color: tokenHex(token) } as CSSStyleDeclaration);
  });
});

afterEach(() => {
  cleanup();
  rendered.scene = null;
  painted.fills = [];
});

function fixture(name: string): CourseData {
  const text = readFileSync(
    resolve(process.cwd(), "../course-core/fixtures/smarter", name),
    "utf8",
  );
  return parseSmarterTxt(text, { sourceFileName: name }).courseData;
}

const JUMPING = "jp-s-sw_993483_sadesign.txt";
const FIXTURES = [JUMPING, "ag-au-tryout-i-copy_998859_sadesign.txt"];

function ringFor(course: CourseData, overrides: Partial<PlannerRing> = {}): PlannerRing {
  return {
    border_clearance_m: 1,
    created_at: "2026-10-15T09:00:00Z",
    default_units: "m",
    doors: [
      {
        clearance_m: 1.5,
        end_m: 4,
        flow: "in",
        id: "door-entrance",
        is_active: true,
        label: "Entrada",
        notes: null,
        polygon_points_m: [
          { x: 2, y: Math.ceil(course.designWidthMeters) },
          { x: 4, y: Math.ceil(course.designWidthMeters) },
        ],
        side: "north",
        start_m: 2,
      },
    ],
    geometry_version: 3,
    id: "ring-1",
    is_active: true,
    length_m: Math.ceil(course.designLengthMeters),
    markers: [],
    name: "Pista central",
    no_go_zones: [],
    notes: null,
    obstacle_inventory: [],
    surface: "GRASS",
    updated_at: "2026-10-15T09:00:00Z",
    venue_id: "club-1",
    width_m: Math.ceil(course.designWidthMeters),
    ...overrides,
  };
}

function centred(ring: PlannerRing, overrides: Partial<CoursePlacement> = {}): CoursePlacement {
  return {
    flipX: false,
    flipY: false,
    offsetXMeters: ring.length_m / 2,
    offsetYMeters: ring.width_m / 2,
    placementMode: "centered",
    rotationDegrees: 0,
    ...overrides,
  };
}

const round = (value: number) => Number((Object.is(value, -0) ? 0 : value).toFixed(3));

/** The obstacles and numbers the 3D scene holds: where each sits and where it points. */
async function sceneSummary() {
  await waitFor(() => {
    expect(rendered.scene).not.toBeNull();
  });
  const scene = rendered.scene as Three.Scene;
  const content = scene.children.find((child) => child.type === "Group");
  if (content === undefined) throw new Error("CONTENT_GROUP_NOT_FOUND");
  const obstacles = content.children
    .filter((child) => typeof child.userData.obstacleSourceId === "string")
    .map((child) => ({
      id: child.userData.obstacleSourceId as string,
      kind: child.type,
      rotationY: round(child.rotation.y),
      x: round(child.position.x),
      z: round(child.position.z),
    }));
  const numbers = content.children
    .filter((child) => child.type === "Sprite" && child.position.y === 1.5)
    .map((child) => [round(child.position.x), round(child.position.z)]);
  return { numbers, obstacles };
}

/** A transform with its numbers to the millimetre / thousandth of a degree (stable snapshots). */
const rounded = (transform: string) =>
  transform.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gu, (value) => String(round(Number(value))));

/** The 2D canvas: each obstacle icon's transform and each number label's text and position. */
function canvasSummary(container: HTMLElement) {
  const svg = container.querySelector("svg");
  if (svg === null) throw new Error("SVG_NOT_FOUND");
  const icons = [...svg.querySelectorAll("g[transform*='rotate(']")].map((group) =>
    rounded(group.getAttribute("transform") ?? ""),
  );
  // Number labels are the 0.6 m texts (door labels are 0.5 m).
  const numbers = [
    ...svg.querySelectorAll("g[transform$='scale(1 -1)'] > text[font-size='0.6']"),
  ].map(
    (text) => `${text.textContent}@${rounded(text.parentElement?.getAttribute("transform") ?? "")}`,
  );
  return { icons, numbers };
}

function render3D(course: CourseData, ring: PlannerRing, placement: CoursePlacement) {
  return render(
    <Planner3D
      ariaLabel="Vista 3D"
      course={course}
      onSelectObstacle={vi.fn()}
      placement={placement}
      ring={ring}
      selectedObstacleId={null}
      warnings={[]}
    />,
  );
}

function render2D(course: CourseData, ring: PlannerRing, placement: CoursePlacement) {
  return render(
    <PlannerCanvas
      course={course}
      labels={{ ariaLabel: "Vista 2D", entry: "Entrada", exit: "Sortida" }}
      onSelectObstacle={vi.fn()}
      placement={placement}
      ring={ring}
      selectedObstacleId={null}
      warnings={[]}
    />,
  );
}

describe("T-16-04 the course viewers render the fixture courses", () => {
  it.each(FIXTURES)("Planner2D (PlannerCanvas) on %s", (name) => {
    const course = fixture(name);
    const ring = ringFor(course);
    const { container } = render2D(course, ring, centred(ring));
    const summary = canvasSummary(container);
    expect(summary.icons.length).toBeGreaterThan(0);
    expect(summary.numbers.length).toBe(course.numbers.length);
    expect(summary).toMatchSnapshot();
  });

  it.each(FIXTURES)("Planner3D on %s", async (name) => {
    const course = fixture(name);
    const ring = ringFor(course);
    render3D(course, ring, centred(ring));
    const summary = await sceneSummary();
    expect(summary.obstacles.length).toBe(course.obstacles.length);
    expect(summary.numbers.length).toBe(course.numbers.length);
    expect(summary).toMatchSnapshot();
  });

  it("T-16-04 the 3D number badge paints the number on the contrasting badge pair (E9-W02 round 2 #8)", async () => {
    const course = fixture(JUMPING);
    const ring = ringFor(course);
    render3D(course, ring, centred(ring));
    await sceneSummary();
    const label = course.numbers[0]?.text ?? "";
    const index = painted.fills.findIndex((fill) => fill.text === label);
    expect(index).toBeGreaterThan(0);
    expect(painted.fills[index - 1]?.fillStyle).toBe(tokenHex("--ah-color-course-number-bg"));
    expect(painted.fills[index]?.fillStyle).toBe(tokenHex("--ah-color-course-number-fg"));
    expect(tokenHex("--ah-color-course-number-bg")).not.toBe(
      tokenHex("--ah-color-course-number-fg"),
    );
  });
});

describe("T-16-02 R-16-01/05 one heading convention: what the planners render is what is persisted (E9-W02 round 2 #2)", () => {
  const course = fixture(JUMPING);
  const plain = course.obstacles.find(
    (obstacle) => obstacle.controlPointsMeters === null && obstacle.obstacleType === "Jump",
  );
  if (plain === undefined) throw new Error("FIXTURE_WITHOUT_A_JUMP");
  const tilted: CourseData = {
    ...course,
    numbers: [],
    obstacles: [{ ...plain, obstacleType: "AFrame", rotationDegrees: 30 }],
  };
  const ring = ringFor(course);

  it.each([
    // [flipX, flipY, placement rotation, ring heading of a Smarter 30° obstacle]
    [false, false, 0, -30],
    [true, false, 0, -150],
    [false, true, 0, 30],
    [true, true, 0, 150],
    [false, false, 90, 60],
    [true, false, 90, -60],
    [false, true, 90, 120],
    [true, true, 90, -120],
  ])(
    "flipX=%s flipY=%s rotation %d° → 3D and 2D both head %d° (the adapter's rotationDeg)",
    async (flipX, flipY, rotationDegrees, expected) => {
      const placement = centred(ring, { flipX, flipY, rotationDegrees });
      expect(placedObstacleHeadingDegrees(30, placement)).toBeCloseTo(expected, 9);

      render3D(tilted, ring, placement);
      const { obstacles } = await sceneSummary();
      // AFrame has no FBX heading offset: the group's Y rotation is the ring heading itself.
      expect((obstacles[0]?.rotationY ?? Number.NaN) * (180 / Math.PI)).toBeCloseTo(expected, 1);
      cleanup();

      const { container } = render2D(tilted, ring, placement);
      const transform = canvasSummary(container).icons[0] ?? "";
      const svgRotation = Number(/rotate\((-?[\d.e-]+)\)/u.exec(transform)?.[1]);
      // The outer scale(1 -1) mirrors SVG rotations: the icon turns by −heading.
      expect(-svgRotation).toBeCloseTo(expected, 2);
    },
  );
});

describe('E11-W03 round 2 (kit review #4): frame="content" holds every icon\'s footprint', () => {
  const course = fixture(JUMPING);
  const plain = course.obstacles.find(
    (obstacle) => obstacle.controlPointsMeters === null && obstacle.obstacleType === "Jump",
  );
  if (plain === undefined) throw new Error("FIXTURE_WITHOUT_A_JUMP");
  // A 40 × 25 m design on a 40 × 25 m ring, centred: course and ring coordinates are the same.
  // A Weave's icon is 6.6 m long; each one stands 2–3 m past one edge of the ring.
  const weave = (id: string, x: number, y: number, rotationDegrees: number) => ({
    ...plain,
    id,
    obstacleType: "Weave" as const,
    rotationDegrees,
    sourceId: id,
    xMeters: x,
    yMeters: y,
  });
  const edges: CourseData = {
    ...course,
    designLengthMeters: 40,
    designWidthMeters: 25,
    noGoZones: [],
    numbers: [],
    obstacles: [
      weave("east", 43, 12.5, 0),
      weave("west", -3, 12.5, 0),
      weave("north", 20, 27, 90),
      weave("south", 20, -2, 90),
    ],
  };
  const ring = ringFor(edges);

  it("a long obstacle near each boundary is inside the viewBox, with the 1.5 m margin", () => {
    expect([ring.length_m, ring.width_m]).toEqual([40, 25]);
    const { container } = render(
      <PlannerCanvas
        course={edges}
        frame="content"
        labels={{ ariaLabel: "Vista 2D", entry: "Entrada", exit: "Sortida" }}
        onSelectObstacle={vi.fn()}
        placement={centred(ring)}
        ring={ring}
        selectedObstacleId={null}
        warnings={[]}
      />,
    );
    const [minX = 0, minY = 0, width = 0, height = 0] = (
      container.querySelector("svg")?.getAttribute("viewBox") ?? ""
    )
      .split(" ")
      .map(Number);
    // Ring x runs as is; SVG y is `25 - y`. East reaches 43 + 3.3, west −3 − 3.3, north
    // 27 + 3.3 (SVG −5.3), south −2 − 3.3 (SVG 30.3).
    expect(minX + width).toBeGreaterThanOrEqual(46.3 + 1.5 - 1e-9);
    expect(minX).toBeLessThanOrEqual(-6.3 - 1.5 + 1e-9);
    expect(minY).toBeLessThanOrEqual(25 - 30.3 - 1.5 + 1e-9);
    expect(minY + height).toBeGreaterThanOrEqual(25 + 5.3 + 1.5 - 1e-9);
  });
});

function Harness({
  course,
  ring,
  units = "M",
}: {
  course: CourseData;
  ring: PlannerRing;
  units?: UnitSystem;
}) {
  const [state, dispatch] = useReducer(plannerReducer, INITIAL_STATE, (initial) =>
    plannerReducer(
      plannerReducer(initial, {
        course,
        courseDbId: "course-1",
        filename: "c.txt",
        type: "SET_COURSE",
      }),
      { ring, type: "SET_RING" },
    ),
  );
  const warnings = useMemo(() => computeWarnings(state), [state]);
  return (
    <>
      <PlannerCanvas
        course={course}
        labels={{ ariaLabel: "Vista 2D", entry: "Entrada", exit: "Sortida" }}
        onSelectObstacle={vi.fn()}
        placement={state.placement}
        ring={ring}
        selectedObstacleId={null}
        warnings={warnings}
      />
      <PlacementControls
        labels={{
          center: "Centra",
          flipHorizontal: "Mirall horitzontal",
          flipVertical: "Mirall vertical",
          nudgeDown: "Avall",
          nudgeLeft: "Esquerra",
          nudgeRight: "Dreta",
          nudgeUp: "Amunt",
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
          rule: (ruleId) => `regla ${ruleId}`,
          severity: { critical: "crític", info: "info", warning: "avís" },
          title: (count) => `Avisos (${String(count)})`,
          warning: (warning) => warning.message,
        }}
        locale="ca"
        onSelectObstacle={vi.fn()}
        selectedObstacleId={null}
        units={units}
        warnings={warnings}
      />
    </>
  );
}

describe("T-16-04 the placement editor emits geometry and warnings on interaction", () => {
  it("R-16-05 nudging the course 3 m east moves every obstacle 3 m and adds the border warnings", () => {
    const course = fixture(JUMPING);
    const ring = ringFor(course, {
      length_m: Math.ceil(course.designLengthMeters) + 2,
      width_m: Math.ceil(course.designWidthMeters) + 2,
    });
    const { container } = render(<Harness course={course} ring={ring} />);
    const before = canvasSummary(container).icons;
    const titleBefore = screen.getByText(/^Avisos \(/u).textContent;

    fireEvent.change(screen.getByLabelText("Pas"), { target: { value: "1" } });
    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Dreta" }));
    }

    const after = canvasSummary(container).icons;
    const x = (transform: string | null) =>
      Number(/translate\((-?[\d.e-]+)/u.exec(transform ?? "")?.[1]);
    expect(after.map(x)).toEqual(
      before.map((transform) => expect.closeTo(x(transform) + 3, 2) as unknown),
    );
    const titleAfter = screen.getByText(/^Avisos \(/u).textContent;
    expect(titleAfter).not.toBe(titleBefore);
    const list = screen.getByRole("list");
    expect(within(list).getAllByText("regla border-clearance").length).toBeGreaterThan(0);
  });
});
