'use client';

/**
 * Three.js orthographic top-down planner. Replaces the SVG-based
 * PlannerCanvas with a real 3D scene rendered from above so the obstacles
 * are the actual FBX models the AR app ships, instead of hand-drawn icons.
 *
 * Coordinate convention
 * ---------------------
 * Three.js world is yUp (matches the obstacle FBX exports). Ring frame
 * coordinates are 2D (x, y) in meters. The mapping is:
 *
 *   ring.x → world.x
 *   ring.y → world.z (negated, so +Y in ring frame = "screen up")
 *   world.y is the vertical / gravity axis — obstacles stand on world.y = 0.
 *
 * The camera sits high above the floor with `up = (0, 0, -1)`, which means
 * the rendered image has +X to the right and ring's +Y towards the top of
 * the image — same convention the SVG planner used.
 *
 * Flip + heading math
 * -------------------
 * The same direction-vector chain we use in PlannerCanvas (flip → implicit
 * Smarter Y-down → user rotation φ) is reused here. The resulting heading
 * angle, converted with atan2, becomes the obstacle's world-Y rotation.
 */
import {
  normalizeDoorSide,
  placeControlPointsInRing,
  placeCoursePoint,
  placeObstacleInRing,
  type CourseData,
  type CoursePlacement,
  type ObstacleType,
  type Warning,
  type WarningSeverity,
} from '@agilityhub/course-core';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

import type { PlannerRing } from '../lib/planner-state.js';

interface Props {
  ring: PlannerRing;
  course: CourseData;
  placement: CoursePlacement;
  warnings: readonly Warning[];
  selectedObstacleId: string | null;
  ariaLabel: string;
  /** Public URL containing the packaged FBX files. Defaults to `/obstacle-models`. */
  assetBaseUrl?: string;
  onSelectObstacle: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Asset table: obstacle type → FBX URL (relative to /public)
// ---------------------------------------------------------------------------

const OBSTACLE_FBX: Partial<Record<ObstacleType, string>> = {
  Jump: 'jump_single.fbx',
  DoubleJump: 'jump_double.fbx',
  DogWalk: 'dogwalk.fbx',
  AFrame: 'aframe.fbx',
  Seesaw: 'seesaw.fbx',
  Weave: 'weave_12_poles.fbx',
  LongJump: 'long_jump.fbx',
  Wall: 'wall.fbx',
  Tire: 'tire.fbx',
};

/**
 * Per-obstacle FBX heading-axis offset, in degrees, applied as an EXTRA
 * Y-rotation on top of the obstacle's stored heading.
 *
 * The generic-fci FBX pack uses two different "forward" conventions:
 *   * Ramp-style obstacles (DogWalk, AFrame, Seesaw, Weave): the dog runs
 *     ALONG the model's long axis (FBX local +X). Smarter's `angle` is
 *     the running direction, so heading maps directly to local +X. No
 *     offset.
 *   * Jump-style obstacles (Jump, DoubleJump, LongJump, Wall, Tire): the
 *     BAR/WALL/HOOP runs along local +X, and the dog runs PERPENDICULAR
 *     (local +Z). Smarter's `angle` is still the running direction, so we
 *     have to add +90° around Y to align the bar perpendicular to the
 *     heading. (Sign: three.js Y-rotation +90° takes local +X to world -Z,
 *     so adding +90° to the heading-derived rotation rotates the bar a
 *     quarter-turn CCW relative to the running direction — exactly what
 *     a top-down view of a real jump looks like.)
 */
const OBSTACLE_HEADING_OFFSET_DEG: Partial<Record<ObstacleType, number>> = {
  Jump: 90,
  DoubleJump: 90,
  Wall: 90,
  Tire: 90,
  // NOTE: LongJump is NOT in this list. Probed the FBX (Part_1..Part_4):
  // each bar is 120 cm long along +Z and the 4 bars are stacked along +X,
  // so the dog's running direction is +X. Same convention as the ramp-style
  // obstacles (DogWalk, AFrame, Seesaw, Weave) → no extra rotation.
};

function themeColor(property: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${property})`;
  probe.hidden = true;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  if (value === '') throw new Error(`MISSING_COURSE_COLOR_TOKEN:${property}`);
  return value;
}

const BRAND = {
  get orange() { return themeColor('--ah-color-course-obstacle'); },
  get yellow() { return themeColor('--ah-color-course-marker'); },
  get teal() { return themeColor('--ah-color-course-door'); },
  get offWhite() { return themeColor('--ah-color-course-text'); },
  get charcoal() { return themeColor('--ah-color-course-obstacle-dark'); },
  get bg() { return themeColor('--ah-color-course-floor'); },
};

const COLORS = {
  get ring() { return themeColor('--ah-color-course-ring'); },
  // Match the platform's deep charcoal page bg so the planner reads as
  // part of AgilityHub, not a separate aesthetic. (Rolled back from a
  // light-grey floor that hid white obstacles — user feedback: "this is
  // not possible to see correctly".)
  get floor() { return BRAND.bg; },
  get marker() { return BRAND.yellow; },
  // Door slab uses a warm tan/wood colour so judges don't confuse it with
  // a tunnel mouth. Arrows stay orange for contrast.
  get doorSlab() { return themeColor('--ah-color-course-door'); },
  get doorArrow() { return BRAND.orange; },
  get noGo() { return themeColor('--ah-color-course-no-go'); },
  get selected() { return BRAND.yellow; },
  get warning() { return themeColor('--ah-color-course-warning'); },
  get number() { return BRAND.offWhite; },
};

/**
 * Per-tunnel-size colour. Uses four theme tokens so sizes remain distinct.
 */
const TUNNEL_COLOR_BY_TYPE: Partial<Record<ObstacleType, string>> = {
  get Tunnel3m() { return BRAND.yellow; },
  get Tunnel4m() { return BRAND.teal; },
  get Tunnel5m() { return BRAND.orange; },
  get Tunnel6m() { return themeColor('--ah-color-course-warning'); },
};

const TUNNEL_LABEL_BY_TYPE: Partial<Record<ObstacleType, string>> = {
  Tunnel3m: '3',
  Tunnel4m: '4',
  Tunnel5m: '5',
  Tunnel6m: '6',
};

/**
 * Smarter-style tint per obstacle type, applied by CLONING each FBX
 * material and only changing its `.color`. That preserves the FBX's
 * shading/normals/materials structure so the geometry detail (bar bases,
 * upright posts, contact-zone borders) still reads from a distance —
 * unlike the earlier whole-material-replacement attempt which flattened
 * every model.
 *
 *   * Jumps / walls / tires → the theme's dark obstacle tone.
 *   * Contact obstacles (DogWalk, AFrame, Seesaw, LongJump) → brand
 *     marker tone, matching Smarter's contact-zone convention even
 *     though we're applying it across the whole obstacle (full two-tone
 *     yellow-zone-plus-black-plank would need per-mesh classification we
 *     don't have yet).
 *   * Tunnels → handled separately via TUNNEL_COLOR_BY_TYPE.
 *   * Weave → procedural, has its own colours.
 */
const SMARTER_TINT: Partial<Record<ObstacleType, string>> = {
  get Jump() { return BRAND.charcoal; },
  get DoubleJump() { return BRAND.charcoal; },
  get Wall() { return BRAND.charcoal; },
  get Tire() { return BRAND.charcoal; },
  get LongJump() { return BRAND.yellow; },
  get DogWalk() { return BRAND.yellow; },
  get AFrame() { return BRAND.yellow; },
  get Seesaw() { return BRAND.yellow; },
};

/**
 * Render-order ladder. Lower draws first.
 *   0  floor + markers + selection rings (default)
 *   1  tunnels — opaque colour, but `depthWrite: false` so they DON'T
 *      occupy the depth buffer.
 *   2  obstacle FBX meshes — drawn after tunnels, depth-test against the
 *      floor only (since tunnels skipped depth write) so a dog-walk / a-frame
 *      / seesaw ALWAYS renders on top of a tunnel it passes over, regardless
 *      of where the model's plank actually sits in Y. User feedback: this
 *      needs to be unconditional, not depth-buffer luck. */
const RENDER_ORDER_TUNNEL = 1;
const RENDER_ORDER_OBSTACLE = 2;

/** Ring → world mapping. y=0 is floor; we offset slightly for layered decals to avoid z-fighting. */
function ringToWorld(x: number, y: number, height = 0): THREE.Vector3 {
  return new THREE.Vector3(x, height, -y);
}

// (Historical note: this file used to define `flipCourseY` to compensate
// for course-frame points being stored in Smarter Y-down. As of the
// parse-time Y-flip in `packages/course-core/src/parser/coords.ts`
// (`pxToRingMetersPoint` / `pxToRingMetersY`), every meter-frame value in
// CourseData is already in ring Y-up. The renderer therefore feeds raw Y
// directly into `ringToWorld`, which does the single -y → +Z negation
// needed by the orthographic top-down camera. Don't reintroduce a course-
// vs-ring Y compensation here — that's what caused the door-clearance
// rule to mis-localise warnings.)

/**
 * Top-down stylized overlay for the weave / slalom — same option-(b)
 * pattern as dog walk, A-frame, and seesaw. Replaces the 3D-cylinder
 * version (which rendered as a row of small circles from above) with
 * flat rectangle "stripes" matching Smarter's authoring view, where each
 * pole reads as a short line perpendicular to the running direction.
 *
 * FCI weave: 12 poles at 60 cm centre-to-centre → 6.6 m total length.
 * Each pole is 1.2 m tall, 5 cm diameter; we exaggerate to 12 cm × 36 cm
 * stripes in top-down view so the row reads clearly at planner zoom.
 * Alternating red/white matches FCI competition colours.
 *
 * Orange notch on +X marks the entry side (slalom is run pole-by-pole
 * alternating sides, starting from the entry end).
 *
 * No FBX is loaded for this obstacle — the shipped weave_12_poles.fbx
 * is a 90 cm base with 30 cm pole nubs that disappear into antialiasing
 * at planner zoom.
 *
 * Local +X is the running direction (DogWalk / AFrame / Seesaw / Weave
 * share this convention — see OBSTACLE_HEADING_OFFSET_DEG header).
 */
function buildWeaveOverlay(): THREE.Group {
  const N_POLES = 12;
  const SPACING_M = 0.6;
  const TOTAL_LEN = (N_POLES - 1) * SPACING_M; // 6.6 m
  const BASE_LEN = TOTAL_LEN + 0.6; // 7.2 m with a little overhang
  const BASE_WIDTH = 0.45; // m — slightly narrower than before so the round poles "sit" cleanly on it
  const POLE_RADIUS = 0.18; // m — exaggerated from real 2.5 cm radius for planner-zoom readability
  const SLAB_THICK = 0.04;
  // 0.5 m — keeps the obstacle silhouette firmly on the floor (no FBX
  // to clear here; this matches the seesaw's overlay height so multiple
  // obstacles in a row read at a consistent visual altitude).
  const OVERLAY_Y = 0.5;

  const matBase = new THREE.MeshBasicMaterial({ color: BRAND.charcoal });
  const matPoleRed = new THREE.MeshBasicMaterial({ color: COLORS.warning });
  const matPoleWhite = new THREE.MeshBasicMaterial({ color: BRAND.offWhite });

  const group = new THREE.Group();

  // Base mat — thin charcoal strip the full length of the run.
  const base = new THREE.Mesh(new THREE.BoxGeometry(BASE_LEN, SLAB_THICK, BASE_WIDTH), matBase);
  base.position.set(0, OVERLAY_Y, 0);
  group.add(base);

  // 12 poles as flat alternating red/white CIRCLES (matching Smarter's
  // authoring view, where each pole reads as a small dot from above
  // since a real pole is a 5 cm cylinder). CircleGeometry is rotated to
  // lie flat on the XZ plane.
  for (let i = 0; i < N_POLES; i += 1) {
    const x = -TOTAL_LEN / 2 + i * SPACING_M;
    const pole = new THREE.Mesh(
      new THREE.CircleGeometry(POLE_RADIUS, 24),
      i % 2 === 0 ? matPoleRed : matPoleWhite,
    );
    pole.rotation.x = -Math.PI / 2;
    // Sit just above the base mat (Y + SLAB_THICK/2 + tiny epsilon to
    // avoid z-fighting with the base's top surface).
    pole.position.set(x, OVERLAY_Y + SLAB_THICK / 2 + 0.002, 0);
    group.add(pole);
  }

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if ((mesh as { isMesh?: boolean }).isMesh) {
      mesh.renderOrder = RENDER_ORDER_OBSTACLE;
    }
  });

  return group;
}

/**
 * Top-down stylized overlay for the dog walk — option (b) test.
 *
 * The FBX shipped with generic-fci renders the dog walk as a thin plank
 * with edge details; from the planner's orthographic top-down camera at
 * planner zoom this projects to a row of pixel-thin dots and disappears
 * into antialiasing. The user can't tell it's a dog walk.
 *
 * We keep the FBX loading underneath (so any future tilted-camera mode
 * still shows a real model), and draw a flat 2D-style overlay at
 * Y = 1.5 m — above the obstacle's natural height (~1.2 m), so under the
 * orthographic top-down camera the overlay fully occludes the FBX. The
 * shape matches Smarter's stylized representation: a long charcoal slab
 * with yellow contact caps at each end.
 *
 * FCI dog walk: 3 planks × 3.66 m × 0.30 m, ramps tilted ~30–40°. The
 * full obstacle projects horizontally to ~9 m end-to-end (consistent with
 * what the FBX renders at). Contact zones are the bottom 0.90 m of each
 * ramp (projects to ~0.85 m). We use slightly fatter width than the real
 * 0.30 m so the silhouette reads clearly at planner zoom (~10 px wide vs
 * ~10 px in the real FCI spec — see weave for the same trick).
 *
 * Local frame: +X is the dog's running direction (matches the FBX
 * convention, see OBSTACLE_HEADING_OFFSET_DEG header — DogWalk is not
 * in that list, so its "forward" is the model's local +X).
 */
function buildDogWalkOverlay(): THREE.Group {
  // Dimensions tuned to fully cover the FBX projection at planner zoom.
  // Earlier 9 m × 0.45 m left the FBX's plank tips peeking past the
  // yellow caps; this is sized generously so the overlay reads as a
  // single continuous Smarter-style silhouette and the FBX is invisible
  // under it from the top-down ortho camera.
  const TOTAL_LEN = 11.0; // m — horizontal projection of the full obstacle (3 planks at ~30° ramps)
  const WIDTH = 0.4; // m — wider than the real 0.30 m so it reads, but not chunky
  const CONTACT_LEN = 1.5; // m — yellow caps sized to match Smarter's stylized proportion (~14% each)
  const SLAB_THICK = 0.04; // m — thin so it reads as a flat decal
  const OVERLAY_Y = 1.5; // m — above the FBX's ~1.2 m apex

  const matContact = new THREE.MeshBasicMaterial({ color: BRAND.yellow });
  const matBody = new THREE.MeshBasicMaterial({ color: BRAND.charcoal });

  const group = new THREE.Group();

  // Center plank (charcoal) — covers the middle of the run.
  const centerLen = TOTAL_LEN - 2 * CONTACT_LEN;
  const center = new THREE.Mesh(new THREE.BoxGeometry(centerLen, SLAB_THICK, WIDTH), matBody);
  center.position.set(0, OVERLAY_Y, 0);
  group.add(center);

  // Yellow contact caps at each end.
  const capOffset = (TOTAL_LEN - CONTACT_LEN) / 2;
  const leftCap = new THREE.Mesh(new THREE.BoxGeometry(CONTACT_LEN, SLAB_THICK, WIDTH), matContact);
  leftCap.position.set(-capOffset, OVERLAY_Y, 0);
  group.add(leftCap);

  const rightCap = new THREE.Mesh(
    new THREE.BoxGeometry(CONTACT_LEN, SLAB_THICK, WIDTH),
    matContact,
  );
  rightCap.position.set(capOffset, OVERLAY_Y, 0);
  group.add(rightCap);

  // Force the overlay to draw after the FBX so there's no depth-buffer
  // tie at exactly Y=1.5. (The FBX usually tops out below 1.5 m, but a
  // ramp model's apex can graze it.)
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if ((mesh as { isMesh?: boolean }).isMesh) {
      mesh.renderOrder = RENDER_ORDER_OBSTACLE;
    }
  });

  return group;
}

/**
 * Top-down stylized overlay for the A-frame — same option-(b) pattern as
 * the dog walk. The shipped FBX renders as a thin central plank when
 * viewed from straight above; Smarter shows the full chevron silhouette
 * (both ramps splayed out). We keep the FBX loading underneath and draw
 * a flat slab at Y = 1.9 m, above the A-frame's 1.7 m apex, so the
 * orthographic top-down camera sees the slab and the FBX's thin plank
 * is occluded.
 *
 * FCI A-frame geometry:
 *   - 2 panels at ~2.65 m each, joined at the apex (1.7 m tall)
 *   - Each ramp tilts ~52° from horizontal → horizontal projection per ramp ≈ 2.09 m
 *   - Full chevron horizontal projection ≈ 4.18 m end-to-end
 *   - Panel width (perpendicular to running direction) = 0.9 m
 *   - Contact zone = lower 1.06 m of each ramp surface → projects to ~0.84 m
 *
 * Local +X is the running direction (DogWalk / AFrame / Seesaw / Weave
 * share this convention — see OBSTACLE_HEADING_OFFSET_DEG header).
 */
function buildAFrameOverlay(): THREE.Group {
  const TOTAL_LEN = 4.2; // m — full chevron horizontal projection
  const WIDTH = 0.9; // m — FCI panel width
  const CONTACT_LEN = 0.85; // m — lower contact zone projected length
  const SLAB_THICK = 0.04;
  const OVERLAY_Y = 1.9; // m — above the A-frame's 1.7 m apex

  const matContact = new THREE.MeshBasicMaterial({ color: BRAND.yellow });
  const matBody = new THREE.MeshBasicMaterial({ color: BRAND.charcoal });

  const group = new THREE.Group();

  const centerLen = TOTAL_LEN - 2 * CONTACT_LEN;
  const center = new THREE.Mesh(new THREE.BoxGeometry(centerLen, SLAB_THICK, WIDTH), matBody);
  center.position.set(0, OVERLAY_Y, 0);
  group.add(center);

  const capOffset = (TOTAL_LEN - CONTACT_LEN) / 2;
  const leftCap = new THREE.Mesh(new THREE.BoxGeometry(CONTACT_LEN, SLAB_THICK, WIDTH), matContact);
  leftCap.position.set(-capOffset, OVERLAY_Y, 0);
  group.add(leftCap);

  const rightCap = new THREE.Mesh(
    new THREE.BoxGeometry(CONTACT_LEN, SLAB_THICK, WIDTH),
    matContact,
  );
  rightCap.position.set(capOffset, OVERLAY_Y, 0);
  group.add(rightCap);

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if ((mesh as { isMesh?: boolean }).isMesh) {
      mesh.renderOrder = RENDER_ORDER_OBSTACLE;
    }
  });

  return group;
}

/**
 * Top-down stylized overlay for the seesaw — same option-(b) pattern as
 * the dog walk and A-frame. Used with the FBX loaded underneath so the
 * pivot stand's feet bleed past the 0.40 m overlay perpendicular to the
 * plank, giving the seesaw the same "feet" detail as the dog walk.
 *
 * FCI seesaw geometry:
 *   - Single plank, 3.65 m × 0.30 m, pivoting in the middle
 *   - Contact zones at each end (lower 0.90 m of the plank surface)
 *   - Pivot height ~0.30 m (much lower than dog walk's 1.20 m)
 *
 * Visually identical to the dog walk's overlay (charcoal middle + yellow
 * contact caps at each end), just shorter. The FBX pivot-stand feet
 * visible past the overlay edges are what distinguish it from a very
 * short dog walk.
 *
 * Local +X is the running direction (DogWalk / AFrame / Seesaw / Weave
 * share this convention — see OBSTACLE_HEADING_OFFSET_DEG header).
 */
function buildSeesawOverlay(): THREE.Group {
  const TOTAL_LEN = 3.7; // m — FCI plank length
  const WIDTH = 0.4; // m — slightly wider than the real 0.30 m for readability (same trick as dog walk)
  const CONTACT_LEN = 0.85; // m — bottom-of-ramp contact zone projection
  const SLAB_THICK = 0.04;
  // 1.3 m — high enough to clear the FBX plank's tilted rest pose. The
  // seesaw pivots at ~0.3 m but the FBX in this pack has a steeper tilt
  // than expected: 0.5 m and even 0.8 m overlays both let the up-end of
  // the plank peek through, showing the FBX's cream/white top surface
  // where my yellow contact cap should be. 1.3 m clears any reasonable
  // seesaw pose with comfortable margin while still leaving the obstacle
  // number sprite (Y = 1.5 m) on top.
  const OVERLAY_Y = 1.3;

  const matContact = new THREE.MeshBasicMaterial({ color: BRAND.yellow });
  const matBody = new THREE.MeshBasicMaterial({ color: BRAND.charcoal });

  const group = new THREE.Group();

  // Centre plank (charcoal).
  const centerLen = TOTAL_LEN - 2 * CONTACT_LEN;
  const center = new THREE.Mesh(new THREE.BoxGeometry(centerLen, SLAB_THICK, WIDTH), matBody);
  center.position.set(0, OVERLAY_Y, 0);
  group.add(center);

  // Yellow contact caps at each end.
  const capOffset = (TOTAL_LEN - CONTACT_LEN) / 2;
  const leftCap = new THREE.Mesh(new THREE.BoxGeometry(CONTACT_LEN, SLAB_THICK, WIDTH), matContact);
  leftCap.position.set(-capOffset, OVERLAY_Y, 0);
  group.add(leftCap);

  const rightCap = new THREE.Mesh(
    new THREE.BoxGeometry(CONTACT_LEN, SLAB_THICK, WIDTH),
    matContact,
  );
  rightCap.position.set(capOffset, OVERLAY_Y, 0);
  group.add(rightCap);

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if ((mesh as { isMesh?: boolean }).isMesh) {
      mesh.renderOrder = RENDER_ORDER_OBSTACLE;
    }
  });

  return group;
}

/**
 * Top-down stylized overlay for the long jump — same option-(b) pattern
 * as the contact obstacles. Replaces the FBX (which renders as 4 thin
 * white stripes plus 16 floor-decal corner pads that we filter out at
 * load time) with a clean Smarter-style charcoal base + yellow bars +
 * white corner marker poles.
 *
 * FCI long jump geometry (per generic-fci manifest: 1.5 m × 1.5 m):
 *   - 4 jump bars (progressive heights 0.20–0.50 m) spaced along the
 *     running direction
 *   - 4 vertical corner marker poles (~0.7–1.2 m) at the 4 corners of
 *     the jump zone — these are the "standards" the user asked for; FCI
 *     rules require them so judges can tell the jump zone limits
 *
 * Local +X is the running direction (LongJump is NOT in
 * OBSTACLE_HEADING_OFFSET_DEG → its "forward" is the model's local +X,
 * same as the contact obstacles).
 */
function buildLongJumpOverlay(): THREE.Group {
  const TOTAL_LEN = 1.5; // m — along running direction (FCI manifest)
  const WIDTH = 1.5; // m — perpendicular (FCI manifest)
  const N_BARS = 4;
  const BAR_LEN_ALONG = 0.08; // m — bar visible thickness along running direction
  const BAR_LEN_PERP = 1.2; // m — bar visible length perpendicular (leaves room for corner poles)
  const BAR_THICK = 0.04;
  const SLAB_THICK = 0.04;
  const POLE_SIZE = 0.18; // m — corner pole visible footprint (exaggerated from real ~5 cm so it reads at planner zoom)
  const POLE_THICK = 0.06;
  const OVERLAY_Y = 0.5; // m — above the LJ bars (~0.5 m max in FBX); matches the seesaw/weave overlay height

  const matBase = new THREE.MeshBasicMaterial({ color: BRAND.charcoal });
  const matBar = new THREE.MeshBasicMaterial({ color: BRAND.yellow });
  const matPole = new THREE.MeshBasicMaterial({ color: BRAND.offWhite });

  const group = new THREE.Group();

  // Base mat — small charcoal square the size of the jump zone.
  const base = new THREE.Mesh(new THREE.BoxGeometry(TOTAL_LEN, SLAB_THICK, WIDTH), matBase);
  base.position.set(0, OVERLAY_Y, 0);
  group.add(base);

  // 4 jump bars, evenly spaced along the running direction. Each bar is
  // perpendicular to +X (extends along the WIDTH axis). Slightly proud
  // of the base so they read on top.
  const barSpacing = TOTAL_LEN / N_BARS;
  for (let i = 0; i < N_BARS; i += 1) {
    const x = -TOTAL_LEN / 2 + (i + 0.5) * barSpacing;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(BAR_LEN_ALONG, BAR_THICK, BAR_LEN_PERP),
      matBar,
    );
    bar.position.set(x, OVERLAY_Y + SLAB_THICK / 2 + BAR_THICK / 2, 0);
    group.add(bar);
  }

  // 4 corner marker poles at the 4 corners of the base. FCI requires
  // these as visible "standards" so judges can see the jump zone limits;
  // also helps the user tell the long jump apart from a wide jump or
  // wall at a glance, since the corner posts are the obvious tell.
  const poleX = TOTAL_LEN / 2;
  const poleZ = WIDTH / 2;
  const corners: [number, number][] = [
    [-poleX, -poleZ],
    [poleX, -poleZ],
    [-poleX, poleZ],
    [poleX, poleZ],
  ];
  for (const [px, pz] of corners) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(POLE_SIZE, POLE_THICK, POLE_SIZE), matPole);
    pole.position.set(px, OVERLAY_Y + SLAB_THICK / 2 + POLE_THICK / 2, pz);
    group.add(pole);
  }

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if ((mesh as { isMesh?: boolean }).isMesh) {
      mesh.renderOrder = RENDER_ORDER_OBSTACLE;
    }
  });

  return group;
}

/**
 * Top-down stylized overlay for a single-bar jump. Replaces the FBX
 * (which renders as a thin cross-mark from above) with a clean
 * yellow-bar-on-charcoal + two white marker poles silhouette.
 *
 * FCI single jump:
 *   - One horizontal bar at the dog's jump height
 *   - Two vertical standards on either side holding the bar
 *   - Bar width 1.2 m (FCI standard); standards 5 cm diameter
 *
 * Coordinate convention: jump-style obstacles have the BAR along local
 * +X with the dog running along local +Z (see OBSTACLE_HEADING_OFFSET_DEG
 * header — Jump gets +90° rotation correction on the heading because of
 * this). So our overlay puts a wide bar on +X with thin depth in +Z and
 * two standards at the +X extremes.
 */
function buildJumpOverlay(): THREE.Group {
  // Real FCI dimensions, flat I-beam silhouette (no base mat, no
  // stacking — matches Smarter's authoring view).
  const BAR_WIDTH = 1.2; // m — bar length (along local +X), real FCI
  const BAR_DEPTH = 0.06; // m — bar perpendicular thickness
  const BAR_THICK = 0.04; // m — Y thickness (same for bar and wings — flat)
  const WING_LEN = 0.55; // m — real wing-panel width along running direction
  const WING_THICK_PERP = 0.1; // m — wing perpendicular thickness
  const OVERLAY_Y = 0.5; // m — matches the seesaw/weave/long-jump overlay heights

  const matJump = new THREE.MeshBasicMaterial({ color: BRAND.offWhite });

  const group = new THREE.Group();

  // The bar — perpendicular to the running direction.
  const bar = new THREE.Mesh(new THREE.BoxGeometry(BAR_WIDTH, BAR_THICK, BAR_DEPTH), matJump);
  bar.position.set(0, OVERLAY_Y, 0);
  group.add(bar);

  // Wing caps — same Y as the bar (flat, not stacked). Tiny epsilon
  // offset prevents z-fighting at the bar-end overlap region.
  const wingX = BAR_WIDTH / 2;
  for (const px of [-wingX, wingX]) {
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(WING_THICK_PERP, BAR_THICK, WING_LEN),
      matJump,
    );
    wing.position.set(px, OVERLAY_Y + 0.005, 0);
    group.add(wing);
  }

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if ((mesh as { isMesh?: boolean }).isMesh) {
      mesh.renderOrder = RENDER_ORDER_OBSTACLE;
    }
  });

  return group;
}

/**
 * Top-down stylized overlay for a double-bar jump (oxer / spread jump).
 * Same as the single jump but with two parallel bars spaced 0.30 m apart
 * along the running direction. The FCI double jump has front + back bars
 * at progressive heights — for the top-down planner the heights don't
 * matter, so we draw both bars identically.
 */
function buildDoubleJumpOverlay(): THREE.Group {
  const BAR_WIDTH = 1.2; // m — bar length (along local +X), real FCI
  const BAR_DEPTH = 0.06; // m — each bar's perpendicular thickness
  const BAR_THICK = 0.04; // m — Y thickness (same for bars and wings — flat)
  const BAR_SPACING = 0.3; // m — front-to-back distance between the two bars
  const WING_LEN = 0.65; // m — slightly longer than single-jump wings so they span both bars
  const WING_THICK_PERP = 0.1;
  const OVERLAY_Y = 0.5;

  const matJump = new THREE.MeshBasicMaterial({ color: BRAND.offWhite });

  const group = new THREE.Group();

  // Two parallel bars at z = ±BAR_SPACING/2.
  for (const pz of [-BAR_SPACING / 2, BAR_SPACING / 2]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(BAR_WIDTH, BAR_THICK, BAR_DEPTH), matJump);
    bar.position.set(0, OVERLAY_Y, pz);
    group.add(bar);
  }

  // Wing caps at the same Y as the bars (flat, not stacked).
  const wingX = BAR_WIDTH / 2;
  for (const px of [-wingX, wingX]) {
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(WING_THICK_PERP, BAR_THICK, WING_LEN),
      matJump,
    );
    wing.position.set(px, OVERLAY_Y + 0.005, 0);
    group.add(wing);
  }

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if ((mesh as { isMesh?: boolean }).isMesh) {
      mesh.renderOrder = RENDER_ORDER_OBSTACLE;
    }
  });

  return group;
}

/** Compute the visual heading (Y-axis rotation, radians) for an obstacle, including flip + placement rotation. */
function obstacleHeadingY(obstacleRotDeg: number | null, placement: CoursePlacement): number {
  const θ = ((obstacleRotDeg ?? 0) * Math.PI) / 180;
  const sx = placement.flipX ? -1 : 1;
  const sy = placement.flipY ? -1 : 1;
  // Heading vector in design frame after flip.
  const dx = sx * Math.cos(θ);
  let dy = sy * Math.sin(θ);
  // Positions in CourseData are now ring Y-up (parser flips at ingest),
  // but ANGLES (`obstacle.rotationDegrees`) are still authored in Smarter's
  // Y-down convention — the parser doesn't touch them. So we still need
  // this one flip on the heading vector's Y component to convert the
  // angle convention. Don't remove unless `rotationDegrees` is also flipped
  // at parse time (and the Unity reader's heading math is updated in
  // lockstep).
  dy = -dy;
  // Apply user rotation φ in ring frame.
  const φ = ((placement.rotationDegrees ?? 0) * Math.PI) / 180;
  const cφ = Math.cos(φ);
  const sφ = Math.sin(φ);
  const rx = dx * cφ - dy * sφ;
  const ry = dx * sφ + dy * cφ;
  // (rx, ry) is the heading direction in ring frame. We need the
  // three.js Y-rotation α that makes the model's local +X (its "forward")
  // point in this direction in world space.
  //
  // Three.js rotates around +Y by α as: (1, 0, 0) → (cos α, 0, −sin α).
  // Ring +X maps to world +X; ring +Y maps to world −Z. So a ring-frame
  // heading (rx, ry) corresponds to world direction (rx, 0, −ry). Match
  // components against the rotated +X above:
  //   cos α = rx,  −sin α = −ry  →  sin α = ry
  //   α = atan2(ry, rx)
  return Math.atan2(ry, rx);
}

/**
 * Singleton FBX cache. Each entry is pre-normalised so callers can just
 * .clone() it and drop it on the floor — see the post-processing comment
 * inside the loader callback.
 */
const fbxCache = new Map<string, Promise<THREE.Group>>();

/** Blender's "FBX export" defaults to centimeter scale even when the source
 * .blend is authored in meters; the AgilityHub pack ships at 100× too large
 * (verified: jump_single.fbx is ~160 units long, tire.fbx is ~100 units
 * across). Unity's importer special-cases this; three.js does not. We
 * post-process every loaded model: scale 0.01, center on origin in X/Z,
 * rest the lowest point at Y = 0 so the model "sits" on the ring floor. */
const FBX_TO_METERS = 0.01;

function loadFbx(url: string): Promise<THREE.Group> {
  if (!fbxCache.has(url)) {
    const loader = new FBXLoader();
    fbxCache.set(
      url,
      new Promise<THREE.Group>((resolve, reject) => {
        loader.load(
          url,
          (group) => {
            // 1) cm → m
            group.scale.setScalar(FBX_TO_METERS);
            group.updateMatrixWorld(true);
            // 2) recenter on (0, floor, 0) in METERS now that scale is applied.
            const box = new THREE.Box3().setFromObject(group);
            const center = new THREE.Vector3();
            box.getCenter(center);
            // Subtract scaled center from local position; subtract minY so
            // the bottom of the model sits on the floor (y=0).
            group.position.x -= center.x;
            group.position.z -= center.z;
            group.position.y -= box.min.y;
            group.updateMatrixWorld(true);
            resolve(group);
          },
          undefined,
          (err) => { reject(err); },
        );
      }),
    );
  }
  return fbxCache.get(url)!;
}

/** Clone an FBX group cleanly so each obstacle instance has its own transforms.
 * The source group is already scaled + centred (see `loadFbx`), so the clone
 * inherits that pose for free. */
function cloneFbx(group: THREE.Group): THREE.Group {
  return group.clone(true);
}

export function Planner3D(props: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    /** Group we replace on every data change. */
    contentGroup: THREE.Group;
    /** Map from obstacle.sourceId → its three.js group, for hit-test → selection. */
    obstacleGroups: Map<string, THREE.Group>;
    /** Currently in-flight render frame, if any. */
    raf: number | null;
  } | null>(null);

  // Stable refs so the click handler can read latest data without
  // tearing down the scene.
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  // ----- Initial mount: build renderer + camera + listeners. -------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(COLORS.floor, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Brighter ambient + directionals so the obstacle materials (some FBX
    // packs ship with low-reflectivity mid-tones) read clearly against the
    // dark floor. User feedback: "the colors used are not clear with the
    // dark background, adjust it to make it more visual."
    scene.add(new THREE.AmbientLight(BRAND.offWhite, 0.85));
    const key = new THREE.DirectionalLight(BRAND.offWhite, 1.1);
    key.position.set(20, 40, 10);
    scene.add(key);
    const fill = new THREE.DirectionalLight(BRAND.teal, 0.45);
    fill.position.set(-15, 30, -10);
    scene.add(fill);

    // Camera bounds depend on the current ring — set placeholder for now,
    // the data effect resizes it on the first run.
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    camera.up.set(0, 0, -1);

    const contentGroup = new THREE.Group();
    scene.add(contentGroup);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    sceneRef.current = {
      renderer,
      scene,
      camera,
      raycaster,
      pointer,
      contentGroup,
      obstacleGroups: new Map(),
      raf: null,
    };

    // Click → raycast → select obstacle
    function handleClick(ev: MouseEvent) {
      const s = sceneRef.current;
      if (!s) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, s.camera);
      const intersects = raycaster.intersectObjects(Array.from(s.obstacleGroups.values()), true);
      if (intersects.length === 0) {
        propsRef.current.onSelectObstacle(null);
        return;
      }
      // Walk up the parents to find which obstacle group this hit belongs to.
      let obj: THREE.Object3D | null = intersects[0]!.object;
      while (obj && !obj.userData.obstacleSourceId) obj = obj.parent;
      if (obj?.userData.obstacleSourceId) {
        const id = obj.userData.obstacleSourceId as string;
        const current = propsRef.current.selectedObstacleId;
        propsRef.current.onSelectObstacle(current === id ? null : id);
      }
    }
    renderer.domElement.addEventListener('click', handleClick);

    // Resize observer keeps the renderer + camera aspect in sync with the container.
    const ro = new ResizeObserver(() => {
      const s = sceneRef.current;
      if (!s) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      s.renderer.setSize(w, h);
      // Update camera aspect — the data effect already set frustum dims to
      // fit the ring; here we just keep them proportional.
      const camW = s.camera.right - s.camera.left;
      const camH = s.camera.top - s.camera.bottom;
      const targetAspect = w / h;
      const currentAspect = camW / camH;
      if (targetAspect > currentAspect) {
        // Container is wider → widen the frustum horizontally.
        const newCamW = camH * targetAspect;
        const cx = (s.camera.left + s.camera.right) / 2;
        s.camera.left = cx - newCamW / 2;
        s.camera.right = cx + newCamW / 2;
      } else {
        const newCamH = camW / targetAspect;
        const cy = (s.camera.top + s.camera.bottom) / 2;
        s.camera.top = cy + newCamH / 2;
        s.camera.bottom = cy - newCamH / 2;
      }
      s.camera.updateProjectionMatrix();
      requestRender();
    });
    ro.observe(container);

    function requestRender() {
      const s = sceneRef.current;
      if (!s) return;
      if (s.raf != null) return;
      s.raf = requestAnimationFrame(() => {
        s.raf = null;
        s.renderer.render(s.scene, s.camera);
      });
    }
    // Expose so the data-effect can trigger a render.
    (sceneRef.current as { requestRender?: () => void }).requestRender = requestRender;

    // First paint
    requestRender();

    return () => {
      ro.disconnect();
      renderer.domElement.removeEventListener('click', handleClick);
      if (sceneRef.current?.raf != null) cancelAnimationFrame(sceneRef.current.raf);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Data effect: rebuild contentGroup whenever inputs change. -------
  // Map obstacle.sourceId → highest severity warning that mentions it. We
  // colour the on-floor halo to match the badge severity in WarningsPanel
  // (red = critical, yellow = warning, sky = info), so the user can scan the
  // ring and see at a glance which obstacles are flagged + how badly.
  const warningsBySource = useMemo(() => {
    const map = new Map<string, WarningSeverity>();
    for (const w of props.warnings) {
      if (!w.obstacleSourceId) continue;
      const prev = map.get(w.obstacleSourceId);
      if (!prev || severityRank(w.severity) > severityRank(prev)) {
        map.set(w.obstacleSourceId, w.severity);
      }
    }
    return map;
  }, [props.warnings]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const { contentGroup, camera, obstacleGroups } = s;
    const { ring, course, placement, selectedObstacleId } = props;

    // Wipe previous content.
    while (contentGroup.children.length > 0) {
      const c = contentGroup.children[0]!;
      contentGroup.remove(c);
      disposeObject(c);
    }
    obstacleGroups.clear();

    // Resize the orthographic camera so the ring + a small margin fits the
    // container as tightly as possible. The frustum bounds are in
    // CAMERA-LOCAL units and symmetric around the camera's optical axis;
    // the camera itself sits over the ring centroid in world space
    // (cx, _, −cy), so a symmetric frustum already centres the ring.
    //
    // We set the frustum to the ring's actual rect + a small margin and
    // let the resize-observer (mount effect, above) widen it to match the
    // container's aspect on first paint and on subsequent layout changes.
    // That way a 29×27 ring no longer gets a 32×32 "square" viewport with
    // multi-metre dead bands on the sides.
    // Margin 0: the camera frustum exactly matches the 29 × 27 m ring, and
    // because the container's aspect ratio (set inline below) ALSO matches
    // 29:27, the ring fills the canvas with no horizontal/vertical dead band.
    // User feedback: "there is more space from the a-frame to the fence"
    // was the prev 0.3 m breathing-room margin showing up on screen.
    const margin = 0;
    const viewW = ring.length_m + 2 * margin;
    const viewH = ring.width_m + 2 * margin;
    const cx = ring.length_m / 2;
    const cy = ring.width_m / 2;
    camera.left = -viewW / 2;
    camera.right = viewW / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.near = 0.1;
    camera.far = 200;
    camera.position.set(cx, 60, -cy);
    camera.lookAt(cx, 0, -cy);
    camera.updateProjectionMatrix();

    // Trigger one resize-driven adjustment now so the initial paint
    // already accounts for the container aspect, instead of waiting for
    // the next ResizeObserver tick.
    {
      const container = containerRef.current;
      if (container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
          const targetAspect = w / h;
          const currentAspect = viewW / viewH;
          if (targetAspect > currentAspect) {
            // Container is wider than the ring — widen the frustum so the
            // ring's HEIGHT fills the viewport (some horizontal margin).
            const newCamW = viewH * targetAspect;
            camera.left = -newCamW / 2;
            camera.right = newCamW / 2;
          } else {
            // Container is taller than the ring — heighten the frustum so
            // the ring's WIDTH fills the viewport (some vertical margin).
            const newCamH = viewW / targetAspect;
            camera.top = newCamH / 2;
            camera.bottom = -newCamH / 2;
          }
          camera.updateProjectionMatrix();
        }
      }
    }

    // ----- Ring floor + outline ------------------------------------------
    // Opaque floor: avoids dragging transparent tunnels/obstacles into
    // three.js's back-to-front sort path (which previously sandwiched the
    // tunnel between the floor and itself and made it disappear).
    const floorGeo = new THREE.PlaneGeometry(ring.length_m, ring.width_m);
    const floorMat = new THREE.MeshBasicMaterial({ color: COLORS.floor });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, -cy);
    contentGroup.add(floor);

    const ringOutline = makeRectOutline(ring.length_m, ring.width_m, COLORS.ring, 0.06);
    ringOutline.position.set(cx, 0.005, -cy);
    contentGroup.add(ringOutline);

    // (Markers are drawn AFTER doors below, so the door slab doesn't
    // cover a marker placed inside the door footprint — e.g. marker E
    // at the middle of the bottom wall.)

    // ----- Doors (slab + flow arrows) ------------------------------------
    for (const d of ring.doors) {
      // Phase 12c — inactive doors are hidden from the planner view; they
      // remain in the DB so admins can re-enable them without losing the
      // edge geometry. Defaults to true for legacy rows that pre-date the
      // `is_active` column.
      if (d.is_active === false) continue;
      const flow = d.flow ?? 'both';
      // Prefer the structured edge geometry when the editor wrote it.
      // Legacy rows fall back to bbox inference of the polygon.
      const a = doorAnchorFromEdgeOrPolygon(d, ring.length_m, ring.width_m);

      // Slab: extruded thin box matching the polygon's bounding rect.
      const slabW = Math.abs(a.parallelLength);
      const slabD = 0.5; // perpendicular to wall, same as SVG
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(slabW, 0.05, slabD),
        new THREE.MeshBasicMaterial({ color: COLORS.doorSlab }),
      );
      // Position centred on the polygon's centroid, oriented along the wall.
      const wallAngle = Math.atan2(a.parallelY, a.parallelX);
      slab.position.copy(
        ringToWorld(a.cx + a.inwardNx * (slabD / 2), a.cy + a.inwardNy * (slabD / 2), 0.02),
      );
      slab.rotation.y = -wallAngle;
      contentGroup.add(slab);

      // Two parallel one-way arrows for two-way, one centred arrow otherwise.
      const armM = Math.min(1.2, Math.max(0.6, Math.abs(a.parallelLength) * 0.35));
      const lateralOffsetM =
        flow === 'both' ? Math.min(0.9, Math.max(0.4, Math.abs(a.parallelLength) * 0.22)) : 0;
      const arrowSpecs: { lateral: number; dir: 'in' | 'out' }[] =
        flow === 'in'
          ? [{ lateral: 0, dir: 'in' }]
          : flow === 'out'
            ? [{ lateral: 0, dir: 'out' }]
            : [
                { lateral: -lateralOffsetM, dir: 'in' },
                { lateral: lateralOffsetM, dir: 'out' },
              ];

      for (const spec of arrowSpecs) {
        const baseX = a.cx + a.parallelX * spec.lateral;
        const baseY = a.cy + a.parallelY * spec.lateral;
        const tipNx = spec.dir === 'in' ? a.inwardNx : a.outwardNx;
        const tipNy = spec.dir === 'in' ? a.inwardNy : a.outwardNy;
        const tipX = baseX + tipNx * armM;
        const tipY = baseY + tipNy * armM;
        const tailX = baseX - tipNx * armM;
        const tailY = baseY - tipNy * armM;

        // Shaft: a thin cylinder lying flat.
        const midX = (tailX + tipX) / 2;
        const midY = (tailY + tipY) / 2;
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 2 * armM - 0.3, 12),
          new THREE.MeshBasicMaterial({ color: COLORS.doorArrow }),
        );
        // Cylinder default axis is Y. Lay it along the inward direction:
        // rotate so its Y aligns with (tipNx, 0, -tipNy).
        const dirAngle = Math.atan2(tipNx, -tipNy); // world Y-rotation
        shaft.rotation.z = Math.PI / 2; // lay flat
        shaft.rotation.y = dirAngle - Math.PI / 2; // align with arrow direction
        // Hmm the rotation composition is fiddly — simplest: just use lookAt.
        shaft.position.copy(ringToWorld(midX, midY, 0.04));
        // Reset rotation and use lookAt:
        shaft.rotation.set(0, 0, 0);
        shaft.lookAt(ringToWorld(tipX, tipY, 0.04));
        // After lookAt, the cylinder's local Z faces the tip; but its long
        // axis is local Y. Rotate -90° around local X so the cylinder length
        // aligns with the direction we just looked at.
        shaft.rotateX(Math.PI / 2);
        contentGroup.add(shaft);

        // Head: cone pointing at the tip.
        const head = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.3, 16),
          new THREE.MeshBasicMaterial({ color: COLORS.doorArrow }),
        );
        head.position.copy(ringToWorld(tipX - tipNx * 0.15, tipY - tipNy * 0.15, 0.04));
        head.rotation.set(0, 0, 0);
        head.lookAt(ringToWorld(tipX, tipY, 0.04));
        head.rotateX(Math.PI / 2);
        contentGroup.add(head);

      }
    }

    // ----- Markers (yellow discs + letter labels) -----------------------
    // Drawn AFTER doors so a marker inside the door's slab footprint
    // (e.g. E at the bottom-wall mid-point) is still visible. The label
    // tells the venue installer which physical AprilTag goes where.
    for (const m of ring.markers) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.4, 24),
        new THREE.MeshBasicMaterial({ color: COLORS.marker }),
      );
      disc.rotation.x = -Math.PI / 2;
      // Higher Y than the door slab (0.02) so it draws on top.
      disc.position.copy(ringToWorld(m.x_m, m.y_m, 0.05));
      disc.renderOrder = RENDER_ORDER_OBSTACLE;
      contentGroup.add(disc);

      // Letter label as a text sprite. Positioned slightly INWARD from
      // the marker (toward the ring centre) so the label doesn't fall
      // outside the ring rect for corner markers.
      const cx = ring.length_m / 2;
      const cy = ring.width_m / 2;
      const inwardX = Math.sign(cx - m.x_m) || 0; // -1 / 0 / +1
      const inwardY = Math.sign(cy - m.y_m) || 0;
      const LABEL_OFFSET_M = 0.7;
      const labelSprite = makeTextSprite(m.label);
      labelSprite.scale.set(0.9, 0.9, 1);
      labelSprite.position.set(
        m.x_m + inwardX * LABEL_OFFSET_M,
        0.6, // a bit above the floor so it reads cleanly
        -(m.y_m + inwardY * LABEL_OFFSET_M),
      );
      contentGroup.add(labelSprite);
    }

    // ----- Course no-go zones (translucent floor polygons) ---------------
    for (const z of course.noGoZones) {
      const placed = z.polygonPointsMeters.map((p) => placeCoursePoint(p, placement, course));
      // Course coords are ring Y-up (parser flips at ingest). Shape lives
      // on the XZ floor: x stays as ring-x, ring-y maps to -z (same
      // negation `ringToWorld` does for full 3D points).
      const shape = new THREE.Shape(placed.map((p) => new THREE.Vector2(p.x, -p.y)));
      const geo = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: COLORS.noGo,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.015;
      contentGroup.add(mesh);
    }

    // ----- Obstacles: FBX models + procedural tunnels --------------------
    for (const o of course.obstacles) {
      const isSelected = selectedObstacleId === o.sourceId;
      const warnSeverity = warningsBySource.get(o.sourceId) ?? null;

      if (o.controlPointsMeters && o.controlPointsMeters.length > 1) {
        // Tunnel — procedural TubeGeometry along control points. Drawn:
        //   * OPAQUE — mixing transparent tube + transparent floor caused
        //     three.js's back-to-front sort to render the tube behind the
        //     floor and the user saw a thin slither.
        //   * radius 0.4 m, centred at y=0.45 → tube occupies y∈[0.05, 0.85].
        //     A dog-walk's plank sits at ~1 m, so the depth buffer correctly
        //     occludes the tube where the dog-walk passes over it (real
        //     agility courses do put tunnels under dog-walks, see user feedback).
        //   * MeshBasicMaterial — lighting-agnostic so the colour reads the
        //     same regardless of where the directional lights end up.
        const placedCps = placeControlPointsInRing(o.controlPointsMeters, placement, course);
        if (!placedCps || placedCps.length < 2) continue;
        // 0.30 m — real FCI tunnel diameter is 0.60 m. We previously
        // exaggerated to 0.40 m for visibility but tunnels then read
        // larger than they should next to real-size jumps; Jordi asked
        // for real size on both, so we drop back to the real radius.
        const TUBE_RADIUS_M = 0.3;
        const TUBE_CENTRE_Y = 0.35;
        // Control points are ring Y-up (post-parse flip). World z = -ring-y.
        const points = placedCps.map((p) => new THREE.Vector3(p.x, TUBE_CENTRE_Y, -p.y));
        const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
        const tubularSegments = Math.max(40, placedCps.length * 12);
        const geo = new THREE.TubeGeometry(curve, tubularSegments, TUBE_RADIUS_M, 16, false);
        // depthWrite:false means the tube draws its colour but doesn't update
        // the depth buffer. Combined with renderOrder=1 (tunnel) <
        // renderOrder=2 (obstacles), this guarantees a dog-walk / a-frame /
        // seesaw drawn after the tunnel passes its depth test against the
        // floor only — so the obstacle ALWAYS appears on top of the tunnel
        // it crosses, regardless of where the model's plank actually sits in Y.
        const tubeColor = TUNNEL_COLOR_BY_TYPE[o.obstacleType] ?? BRAND.teal;
        const mat = new THREE.MeshBasicMaterial({ color: tubeColor, depthWrite: false });
        const tube = new THREE.Mesh(geo, mat);
        tube.userData.obstacleSourceId = o.sourceId;
        tube.renderOrder = RENDER_ORDER_TUNNEL;
        contentGroup.add(tube);
        obstacleGroups.set(o.sourceId, tube as unknown as THREE.Group);
        // Tunnel halo sits at the entrance (matches the size-label position
        // we settled on) so warnings cluster visually with the obstacle
        // number chip. Bigger radius than a single-anchor obstacle because
        // tunnels have a larger footprint.
        addSelectionHalo(contentGroup, points[0]!, 1.1, isSelected, warnSeverity);

        // Size label ("3" / "4" / "5" / "6") near the tube's ENTRANCE,
        // offset ~50% of the first segment so the label sits clearly ON
        // the tube surface rather than at the geometric edge where it
        // gets clipped / lost in the tube's end cap. Drawn as plain dark
        // text directly on the tube — NOT as an obstacle-number chip —
        // so judges can tell at a glance that the digit is the tunnel
        // SIZE, not a sequence number. Dark text reads cleanly on all
        // four tunnel colours.
        const sizeLabel = TUNNEL_LABEL_BY_TYPE[o.obstacleType];
        if (sizeLabel && points.length > 0) {
          const entrance = points[0]!;
          const next = points[1] ?? entrance;
          // 50% between entrance and the next control point — typically
          // ~0.7 m into the tube. Far enough off the edge that the label
          // reads cleanly; close enough that it still labels the
          // entrance, not the middle of the tube.
          const labelPos = new THREE.Vector3(
            entrance.x + (next.x - entrance.x) * 0.5,
            TUBE_CENTRE_Y + 1.2,
            entrance.z + (next.z - entrance.z) * 0.5,
          );
          const labelSprite = makePlainTextSprite(sizeLabel);
          labelSprite.position.copy(labelPos);
          contentGroup.add(labelSprite);
        }

        continue;
      }

      const anchor = placeObstacleInRing(o, placement, course);
      if (!anchor) continue;
      const fbxFilename = OBSTACLE_FBX[o.obstacleType];
      const assetBaseUrl = (props.assetBaseUrl ?? '/obstacle-models').replace(/\/$/, '');
      const fbxUrl = fbxFilename === undefined ? undefined : `${assetBaseUrl}/${fbxFilename}`;
      const baseHeadingY = obstacleHeadingY(o.rotationDegrees, placement);
      // Per-type heading-axis correction (see OBSTACLE_HEADING_OFFSET_DEG).
      const offsetRad = ((OBSTACLE_HEADING_OFFSET_DEG[o.obstacleType] ?? 0) * Math.PI) / 180;
      const headingY = baseHeadingY + offsetRad;

      // Always add a placeholder pivot group so click selection has a target
      // even before the FBX resolves. The FBX gets attached when ready.
      const group = new THREE.Group();
      // Anchor is ring Y-up (post-parse flip). `ringToWorld` handles the
      // single negation to map ring +Y onto world -Z for the camera.
      group.position.copy(ringToWorld(anchor.x, anchor.y, 0));
      group.rotation.y = headingY;
      group.userData.obstacleSourceId = o.sourceId;
      contentGroup.add(group);
      obstacleGroups.set(o.sourceId, group);

      // Selection / warning halo on the floor under the obstacle.
      addSelectionHalo(group, new THREE.Vector3(0, 0.012, 0), 1.1, isSelected, warnSeverity);

      // Top-down stylized overlay on top of the FBX for the dog walk and
      // seesaw. The 0.40 m overlay width fully covers the 0.30 m FBX
      // plank, so the plank itself is hidden — but the support feet/legs
      // (perpendicular bars wider than 0.40 m) bleed past the overlay
      // edges, giving the obstacle its characteristic "feet" detail.
      // The overlay still provides the clean Smarter-style charcoal +
      // yellow-contact-cap silhouette that reads at planner zoom.
      if (o.obstacleType === 'DogWalk') {
        group.add(buildDogWalkOverlay());
      } else if (o.obstacleType === 'Seesaw') {
        group.add(buildSeesawOverlay());
      }

      // Procedural / overlay-only obstacles: skip the FBX entirely. We do
      // this when the overlay can't fully cover the FBX (AFrame's chevron
      // base extends past a 0.9 m wide overlay → white plank edges bleed
      // through), or when the FBX is unreadable at planner zoom (Weave's
      // pole stubs disappear into antialiasing), or when the FBX renders
      // as thin strips that don't read as the actual obstacle (long
      // jump). Same Smarter-style flat representation as the other
      // overlays.
      if (o.obstacleType === 'Weave') {
        group.add(buildWeaveOverlay());
      } else if (o.obstacleType === 'AFrame') {
        group.add(buildAFrameOverlay());
      } else if (o.obstacleType === 'LongJump') {
        group.add(buildLongJumpOverlay());
      } else if (o.obstacleType === 'Jump') {
        group.add(buildJumpOverlay());
      } else if (o.obstacleType === 'DoubleJump') {
        group.add(buildDoubleJumpOverlay());
      } else if (fbxUrl) {
        loadFbx(fbxUrl)
          .then((g) => {
            const clone = cloneFbx(g);
            // Pose the model on the floor. FBX models from this pack are
            // yUp with the base at y≈0, so no extra scale or translation is
            // needed beyond the group's own position+rotation.
            // Walk every mesh inside the clone to:
            //   1) Hide ultra-thin floor decals — long_jump.fbx ships with
            //      16 corner-pad meshes, each 0.3 cm tall in source, that
            //      collectively render as a red oval around the bars at
            //      planner zoom. We use the LOCAL geometry bbox (multiplied
            //      by the FBX→m scale) so the check is reliable regardless
            //      of where the clone sits in the scene graph.
            //   2) Bump renderOrder to 2 so obstacles draw on top of tunnels.
            //
            // We DELIBERATELY keep the FBX's original materials: replacing
            // them with a single brand colour per obstacle flattened the
            // model (jump bases vanished, contact zones merged with planks),
            // so the FBX's authored detail wins for now. Tunnels still get
            // per-size brand colours because they're rendered procedurally
            // and don't have FBX materials to preserve.
            const tint = SMARTER_TINT[o.obstacleType];
            clone.traverse((child) => {
              const mesh = child as THREE.Mesh;
              if (!(mesh as { isMesh?: boolean }).isMesh) return;
              const geom = mesh.geometry;
              if (geom && !geom.boundingBox) geom.computeBoundingBox?.();
              const lbb = geom?.boundingBox;
              if (lbb) {
                // FBXLoader bakes a 100x unit conversion into each mesh's
                // internal matrix (FBX cm → three.js m), so geometry-local
                // Δy is ALREADY in the same units as the final world
                // dimensions — don't multiply by FBX_TO_METERS again.
                // Threshold: hide anything < 1 cm tall (the long-jump FBX
                // has 16 such floor-decal meshes at 0.003 m).
                const localY = lbb.max.y - lbb.min.y;
                if (localY < 0.01) {
                  mesh.visible = false;
                  return;
                }
              }
              // Smarter-style tint: clone the FBX material per instance
              // and only change its colour. Keeps the imported material's
              // shading model, textures, and normals — only the base hue
              // shifts. That's the difference from the earlier failed
              // wholesale-replacement approach.
              if (tint !== undefined && mesh.material) {
                const recolour = (m: THREE.Material): THREE.Material => {
                  const c = m.clone();
                  const matWithColor = c as unknown as {
                    color?: { set: (value: THREE.ColorRepresentation) => void };
                  };
                  matWithColor.color?.set(tint);
                  return c;
                };
                mesh.material = Array.isArray(mesh.material)
                  ? mesh.material.map(recolour)
                  : recolour(mesh.material);
              }
              mesh.renderOrder = RENDER_ORDER_OBSTACLE;
            });
            group.add(clone);
            (sceneRef.current as { requestRender?: () => void } | null)?.requestRender?.();
          })
          .catch((err) => {
            // Fall back to a small marker disc so the user sees SOMETHING.
            // (We log to console rather than swallowing — model regressions
            // should be visible during dev.)
            // eslint-disable-next-line no-console
            console.warn(`Planner3D: failed to load ${fbxUrl}`, err);
            const fallback = new THREE.Mesh(
              new THREE.CylinderGeometry(0.3, 0.3, 0.4, 16),
              new THREE.MeshLambertMaterial({ color: BRAND.orange }),
            );
            fallback.position.y = 0.2;
            group.add(fallback);
            (sceneRef.current as { requestRender?: () => void } | null)?.requestRender?.();
          });
      } else {
        // Type without an FBX (Unknown) — small placeholder disc.
        const fallback = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16),
          new THREE.MeshLambertMaterial({ color: COLORS.noGo }),
        );
        fallback.position.y = 0.1;
        group.add(fallback);
      }
    }

    // ----- Numbers (sprite-based labels) ---------------------------------
    for (const n of course.numbers) {
      const placed = placeCoursePoint({ x: n.xMeters, y: n.yMeters }, placement, course);
      const sprite = makeTextSprite(n.text);
      // placed is ring Y-up (post-parse flip).
      sprite.position.copy(ringToWorld(placed.x, placed.y, 1.5));
      contentGroup.add(sprite);
    }

    (sceneRef.current as { requestRender?: () => void } | null)?.requestRender?.();
  }, [props, warningsBySource]);

  return (
    <div
      ref={containerRef}
      // Match the container's aspect to the ring's exact proportions so the
      // ring fills the canvas with no horizontal/vertical dead band. User
      // feedback: "horizontal size seems bigger in the render" — was caused
      // by aspect-square forcing a 1:1 viewport on a 29:27 ring.
      style={{ aspectRatio: `${props.ring.length_m} / ${props.ring.width_m}` }}
      className="w-full max-h-[80vh] bg-surface-2 border border-border rounded-2xl overflow-hidden"
      role="img"
      aria-label={props.ariaLabel}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRectOutline(
  lengthM: number,
  widthM: number,
  color: THREE.ColorRepresentation,
  lineWidth: number,
): THREE.LineSegments {
  // four-segment outline aligned to ring rect, centred on origin
  const hx = lengthM / 2;
  const hy = widthM / 2;
  const points = [
    new THREE.Vector3(-hx, 0, -hy),
    new THREE.Vector3(hx, 0, -hy),
    new THREE.Vector3(hx, 0, -hy),
    new THREE.Vector3(hx, 0, hy),
    new THREE.Vector3(hx, 0, hy),
    new THREE.Vector3(-hx, 0, hy),
    new THREE.Vector3(-hx, 0, hy),
    new THREE.Vector3(-hx, 0, -hy),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: lineWidth });
  return new THREE.LineSegments(geo, mat);
}

// Warning halo palette. Matches the WarningsPanel severity badges
// (`apps/web-planner/src/components/ui/Badge.tsx`):
//   critical → red, warning → yellow, info → sky.
// Selected-but-no-warning falls back to brand yellow so a user-click is
// still visually distinct against a dark floor.
const SEVERITY_HALO_COLOR: Record<WarningSeverity, string> = {
  get critical() { return themeColor('--ah-color-danger'); },
  get warning() { return themeColor('--ah-color-warning'); },
  get info() { return themeColor('--ah-color-info'); },
};
const SEVERITY_RANK: Record<WarningSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};
function severityRank(s: WarningSeverity): number {
  return SEVERITY_RANK[s];
}

/**
 * Draws a flat, translucent disc on the floor under an obstacle to flag
 * either a warning (colour by severity) or a user selection. Previously
 * this was a thin RingGeometry outline — a 0.08 m line was nearly
 * invisible at planner zoom against the dark floor, so the user couldn't
 * tell which obstacle a warning belonged to. A filled, alpha-blended disc
 * reads from across the ring while still letting the obstacle silhouette
 * and number chip show through.
 *
 *   - `warnSeverity` is null when the obstacle has no warning.
 *   - If both warning and selected, the warning colour wins (more urgent).
 *   - `depthWrite: false` so the disc doesn't sit in the depth buffer and
 *     occlude the obstacle's own floor-level materials.
 */
function addSelectionHalo(
  parent: THREE.Object3D,
  centerLocal: THREE.Vector3,
  radius: number,
  isSelected: boolean,
  warnSeverity: WarningSeverity | null,
): void {
  if (!isSelected && !warnSeverity) return;
  const color = warnSeverity != null ? SEVERITY_HALO_COLOR[warnSeverity] : COLORS.selected;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.copy(centerLocal);
  // Render after the floor but before obstacle FBX models so it sits
  // visually "under" them while their materials still draw on top.
  disc.renderOrder = 0;
  parent.add(disc);
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.geometry) m.geometry.dispose?.();
    const mat = m.material;
    if (mat) {
      if (Array.isArray(mat)) mat.forEach((mm) => { mm.dispose?.(); });
      else (mat).dispose?.();
    }
  });
}

interface DoorAnchorRing {
  cx: number;
  cy: number;
  inwardNx: number;
  inwardNy: number;
  outwardNx: number;
  outwardNy: number;
  parallelX: number;
  parallelY: number;
  parallelLength: number;
}

/**
 * Phase 12c: when the editor has written `side` + `start_m` + `end_m`,
 * derive the anchor directly from those fields (stable + deterministic);
 * otherwise fall back to the bbox-from-polygon path so legacy rows still
 * render correctly.
 */
function doorAnchorFromEdgeOrPolygon(
  door: {
    polygon_points_m: readonly { x: number; y: number }[];
    side?: string | null;
    start_m?: number | null;
    end_m?: number | null;
  },
  ringLenM: number,
  ringWidM: number,
): DoorAnchorRing {
  if (
    door.side &&
    door.start_m != null &&
    door.end_m != null &&
    door.end_m > door.start_m
  ) {
    const side = normalizeDoorSide(door.side);
    if (!side) return anchorDoorRing(door.polygon_points_m, ringLenM, ringWidM);
    const mid = (door.start_m + door.end_m) / 2;
    const len = door.end_m - door.start_m;
    switch (side) {
      case 'south':
        return {
          cx: mid,
          cy: 0,
          inwardNx: 0,
          inwardNy: 1,
          outwardNx: 0,
          outwardNy: -1,
          parallelX: 1,
          parallelY: 0,
          parallelLength: len,
        };
      case 'north':
        return {
          cx: mid,
          cy: ringWidM,
          inwardNx: 0,
          inwardNy: -1,
          outwardNx: 0,
          outwardNy: 1,
          parallelX: 1,
          parallelY: 0,
          parallelLength: len,
        };
      case 'west':
        return {
          cx: 0,
          cy: mid,
          inwardNx: 1,
          inwardNy: 0,
          outwardNx: -1,
          outwardNy: 0,
          parallelX: 0,
          parallelY: 1,
          parallelLength: len,
        };
      case 'east':
        return {
          cx: ringLenM,
          cy: mid,
          inwardNx: -1,
          inwardNy: 0,
          outwardNx: 1,
          outwardNy: 0,
          parallelX: 0,
          parallelY: 1,
          parallelLength: len,
        };
    }
  }
  return anchorDoorRing(door.polygon_points_m, ringLenM, ringWidM);
}

function anchorDoorRing(
  points: readonly { x: number; y: number }[],
  _ringLenM: number,
  ringWidM: number,
): DoorAnchorRing {
  const EPS = 0.05;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  if (minY <= EPS) {
    return {
      cx,
      cy,
      inwardNx: 0,
      inwardNy: 1,
      outwardNx: 0,
      outwardNy: -1,
      parallelX: 1,
      parallelY: 0,
      parallelLength: maxX - minX,
    };
  }
  if (maxY >= ringWidM - EPS) {
    return {
      cx,
      cy,
      inwardNx: 0,
      inwardNy: -1,
      outwardNx: 0,
      outwardNy: 1,
      parallelX: 1,
      parallelY: 0,
      parallelLength: maxX - minX,
    };
  }
  if (minX <= EPS) {
    return {
      cx,
      cy,
      inwardNx: 1,
      inwardNy: 0,
      outwardNx: -1,
      outwardNy: 0,
      parallelX: 0,
      parallelY: 1,
      parallelLength: maxY - minY,
    };
  }
  // Default: right wall
  return {
    cx,
    cy,
    inwardNx: -1,
    inwardNy: 0,
    outwardNx: 1,
    outwardNy: 0,
    parallelX: 0,
    parallelY: 1,
    parallelLength: maxY - minY,
  };
}

/** Build a text sprite using a canvas texture. Cheap, readable, no font-loading dance. */
function makeTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = themeColor('--ah-color-course-obstacle-dark');
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = themeColor('--ah-color-course-text');
  ctx.font = 'bold 56px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.9, 0.9, 1);
  return sprite;
}

/**
 * Plain text sprite — no background chip, just text. Used for the
 * tunnel size label ("3" / "4" / "5" / "6") which sits ON the coloured
 * tube and shouldn't look like an obstacle-number badge. Dark text reads
 * cleanly against all four tunnel colours (yellow, teal, orange, pink).
 *
 * Caller controls visual size via the returned sprite's `.scale` —
 * default 0.6 here, vs 0.9 for `makeTextSprite`, so tunnel sizes read
 * smaller than obstacle-number chips.
 */
function makePlainTextSprite(text: string, fontPx = 64, color?: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color ?? themeColor('--ah-color-course-obstacle-dark');
  ctx.font = `bold ${fontPx}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.6, 0.6, 1);
  return sprite;
}
