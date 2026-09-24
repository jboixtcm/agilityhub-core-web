/**
 * BuildSessionExportV1 round-trip + structural tests (Phase 8, D-037).
 *
 * Loads a real Smarter fixture through course-core, builds a CoursePlacement,
 * runs the warning engine, and assembles a BuildSessionExportV1. The
 * assembled value must round-trip through the zod schema and carry the
 * fields the Unity prep doc promises.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  centerCourseInRing,
  parseSmarterTxt,
  runWarnings,
  type Ring,
} from '@agilityhub/course-core';
import {
  assertAprilTagMarkerPhysicalSizes,
  assertSixCanonicalMarkers,
  buildBuildSessionExportV1,
  buildSessionExportV1Schema,
  REQUIRED_RING_MARKER_LABELS,
  type BuildSessionExporterInput,
} from '../src/build-session-export.js';

function loadFixtureText(): string {
  // Source monorepo: <root>/fixtures/smarter; here the fixtures live in course-core.
  const path = resolve(
    __dirname,
    '..',
    '..',
    'course-core',
    'fixtures',
    'smarter',
    'jp-s-sw_993483_sadesign.txt',
  );
  return readFileSync(path, 'utf-8');
}

function demoRing(): Ring {
  return {
    id: 'ring-demo',
    label: 'Ring 1',
    lengthMeters: 30,
    widthMeters: 30,
    borderClearanceMeters: 0.5,
    doors: [],
    noGoZones: [],
    obstacleInventory: {
      Jump: 50,
      DoubleJump: 10,
      Tunnel3m: 10,
      Tunnel4m: 10,
      Tunnel5m: 10,
      Tunnel6m: 10,
      DogWalk: 5,
      AFrame: 5,
      Seesaw: 5,
      Weave: 5,
      LongJump: 5,
      Wall: 5,
      Tire: 5,
    },
  };
}

describe('BuildSessionExportV1 — assembly + round-trip', () => {
  const fixtureText = loadFixtureText();
  const { courseData: course } = parseSmarterTxt(fixtureText, {
    sourceFileName: 'jp-s-sw.txt',
  });
  const ring = demoRing();
  const placement = centerCourseInRing(course, ring);
  const warnings = runWarnings(course, placement, ring);
  const exportedAt = '2026-05-16T18:30:00.000Z';

  const exportV1 = buildBuildSessionExportV1({
    producer: 'agilityhub-web-planner@phase8-test',
    exportedAt,
    assetProfile: { profileId: 'generic-fci' },
    buildSession: {
      id: 'session-demo',
      placement_id: 'placement-demo',
      judge_id: 'judge-demo',
      status: 'not_started',
      selected_strategy: 'equipment_type',
      last_known_marker_id: null,
      started_at: null,
      completed_at: null,
      local_cache_version: 1,
    },
    obstacleStatuses: course.obstacles.map((o) => ({
      course_obstacle_id: o.id,
      status: 'not_placed' as const,
      updated_at: null,
    })),
    placement: {
      id: 'placement-demo',
      course_id: 'course-demo',
      venue_id: 'venue-demo',
      ring_id: ring.id,
      name: null,
      placement_mode: placement.placementMode,
      offset_x_m: placement.offsetXMeters,
      offset_y_m: placement.offsetYMeters,
      rotation_deg: placement.rotationDegrees,
      warning_threshold_m: 0.5,
      warnings_json: warnings,
      status: 'ready_to_build',
    },
    course: {
      id: 'course-demo',
      title: course.title,
      title_raw: course.titleRaw,
      source: 'smarter-agility',
      source_version: null,
      units: course.units === 'M' ? 'm' : 'ft',
      design_length_m: course.designLengthMeters,
      design_width_m: course.designWidthMeters,
      canvas_width: course.canvasWidth,
      canvas_height: course.canvasHeight,
      origin: course.origin,
      normalized_json: course,
    },
    theme: {
      id: null,
      palette_key: 'agilityhub',
      theme_json: {},
    },
    venue: {
      id: 'venue-demo',
      slug: 'demo-venue',
      name: 'Demo Partner Venue',
      country: 'ES',
      city: 'Barcelona',
      surface: 'artificial turf',
      indoor_outdoor: 'indoor',
    },
    ring: {
      id: ring.id,
      venue_id: 'venue-demo',
      name: ring.label,
      length_m: ring.lengthMeters,
      width_m: ring.widthMeters,
      border_clearance_m: ring.borderClearanceMeters,
      surface: 'artificial turf',
      doors: [],
      no_go_zones: [],
      // Phase 9e1 (D-A from anchoring-strategy-plan.md): exports now require
      // exactly 6 markers (A..F). Labels follow floor-plan reading order:
      // A/B/C across the top edge, then D/E/F across the bottom edge.
      markers: ['A', 'B', 'C', 'D', 'E', 'F'].map((label, i) => {
        const corners = [
          { x: 0.5, y: 29.5 }, // A — top-left
          { x: 15.0, y: 29.5 }, // B — top-mid
          { x: 29.5, y: 29.5 }, // C — top-right
          { x: 0.5, y: 0.5 }, // D — bottom-left
          { x: 15.0, y: 0.5 }, // E — bottom-mid
          { x: 29.5, y: 0.5 }, // F — bottom-right
        ];
        const c = corners[i]!;
        return {
          id: `marker-${label}`,
          label,
          marker_uid: `marker-uid-${label}`,
          role: 'reference',
          x_m: c.x,
          y_m: c.y,
          z_m: 0,
          rotation_y_deg: 0,
          physical_width_m: 0.19,
          physical_height_m: 0.19,
          is_fixed: true,
          is_active: true,
        };
      }),
    },
  });

  it('round-trips through the zod schema (no drift between exporter and schema)', () => {
    const parsed = buildSessionExportV1Schema.parse(exportV1);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.exportedAt).toBe(exportedAt);
  });

  it('JSON-serialises and re-parses cleanly (no Date / Set leakage)', () => {
    const text = JSON.stringify(exportV1);
    const reparsed = buildSessionExportV1Schema.parse(JSON.parse(text));
    expect(reparsed.buildSession.obstacle_statuses.length).toBe(course.obstacles.length);
    expect(reparsed.course.normalized_json.obstacles.length).toBe(course.obstacles.length);
  });

  it('carries the venue → ring → markers chain Unity needs to render', () => {
    expect(exportV1.venue.slug).toBe('demo-venue');
    // Phase 9e1 (D-A): exports now ship the full A..F pack.
    expect(exportV1.ring.markers).toHaveLength(6);
    expect(exportV1.ring.markers.map((m) => m.label).sort()).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
  });

  it('always carries an assetProfile fallback chain ending in "procedural"', () => {
    expect(exportV1.assetProfile.profileId).toBe('generic-fci');
    expect(
      exportV1.assetProfile.fallbackChain[exportV1.assetProfile.fallbackChain.length - 1],
    ).toBe('procedural');
  });

  it('preserves the CourseData snapshot verbatim (Unity drives obstacles from this)', () => {
    expect(exportV1.course.normalized_json.title).toBe(course.title);
    expect(exportV1.course.normalized_json.obstacles[0]?.obstacleType).toBe(
      course.obstacles[0]?.obstacleType,
    );
  });

  it('carries the placement warnings_json snapshot (D-019)', () => {
    // jp-s-sw_993483_sadesign centred in a 30×30 ring with default thresholds
    // produces zero warnings — but the field must always be a (possibly empty)
    // array, never undefined.
    expect(Array.isArray(exportV1.placement.warnings_json)).toBe(true);
  });

  it('rejects a tampered export (schemaVersion 0)', () => {
    const bad = { ...exportV1, schemaVersion: 0 as unknown as 1 };
    expect(() => buildSessionExportV1Schema.parse(bad)).toThrow();
  });

  it('rejects an export missing required marker fields', () => {
    const bad = {
      ...exportV1,
      ring: {
        ...exportV1.ring,
        markers: [{ ...exportV1.ring.markers[0]!, marker_uid: undefined } as never],
      },
    };
    expect(() => buildSessionExportV1Schema.parse(bad)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Phase 9e1 §5.4 — always-6 markers contract.
//
// The builder must FAIL FAST on any input ring that doesn't carry all six
// canonical labels A..F, with a message that names the venue + ring so a
// venue admin reading server logs can fix the right ring.
// ---------------------------------------------------------------------------

describe('BuildSessionExportV1 — always-6 marker contract (§5.4)', () => {
  // Reuse the fixture-driven `exportV1` from the round-trip describe block
  // as a base — the builder validator runs BEFORE the schema parse, so we
  // only need to mutate `ring.markers` to exercise the marker validator.
  // Going through a real fixture keeps the rest of the input legal.
  function baseInput(): BuildSessionExporterInput {
    const fixtureText = loadFixtureText();
    const { courseData: c } = parseSmarterTxt(fixtureText, {
      sourceFileName: 'jp-s-sw.txt',
    });
    const ring = demoRing();
    const placement = centerCourseInRing(c, ring);
    const warnings = runWarnings(c, placement, ring);

    return {
      producer: 'test',
      exportedAt: '2026-05-18T00:00:00.000Z',
      buildSession: {
        id: 'bs',
        placement_id: 'p',
        judge_id: null,
        status: 'in_progress',
        selected_strategy: 'equipment_type',
        last_known_marker_id: null,
        started_at: null,
        completed_at: null,
        local_cache_version: 1,
      },
      obstacleStatuses: [],
      placement: {
        id: 'p',
        course_id: 'c',
        venue_id: 'venue-demo',
        ring_id: ring.id,
        name: null,
        placement_mode: placement.placementMode,
        offset_x_m: placement.offsetXMeters,
        offset_y_m: placement.offsetYMeters,
        rotation_deg: placement.rotationDegrees,
        warning_threshold_m: 0.5,
        warnings_json: warnings,
        status: 'ready_to_build',
      },
      course: {
        id: 'course-demo',
        title: c.title,
        title_raw: c.titleRaw,
        source: 'smarter-agility',
        source_version: null,
        units: c.units === 'M' ? 'm' : 'ft',
        design_length_m: c.designLengthMeters,
        design_width_m: c.designWidthMeters,
        canvas_width: c.canvasWidth,
        canvas_height: c.canvasHeight,
        origin: c.origin,
        normalized_json: c,
      },
      theme: { id: null, palette_key: 'agilityhub', theme_json: {} },
      venue: {
        id: 'venue-demo',
        slug: 'demo-venue',
        name: 'Demo Partner Venue',
        country: 'ES',
        city: 'Barcelona',
        surface: 'artificial turf',
        indoor_outdoor: 'indoor',
      },
      ring: {
        id: ring.id,
        venue_id: 'venue-demo',
        name: ring.label,
        length_m: ring.lengthMeters,
        width_m: ring.widthMeters,
        border_clearance_m: ring.borderClearanceMeters,
        surface: 'artificial turf',
        doors: [],
        no_go_zones: [],
        markers: [],
      },
    };
  }

  function withMarkers(
    input: BuildSessionExporterInput,
    labels: string[],
  ): BuildSessionExporterInput {
    return {
      ...input,
      ring: {
        ...input.ring,
        markers: labels.map((label) => ({
          id: `marker-${label}`,
          label,
          marker_uid: `marker-uid-${label}`,
          role: 'reference',
          x_m: 1,
          y_m: 1,
          z_m: 0,
          rotation_y_deg: 0,
          physical_width_m: 0.19,
          physical_height_m: 0.19,
          is_fixed: true,
          is_active: true,
        })),
      },
    };
  }

  it('exposes REQUIRED_RING_MARKER_LABELS = A..F', () => {
    expect(REQUIRED_RING_MARKER_LABELS).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('throws when a ring has only 4 markers, naming the offending venue + ring', () => {
    const input = withMarkers(baseInput(), ['A', 'B', 'C', 'D']);
    expect(() => buildBuildSessionExportV1(input)).toThrowError(/demo-venue.*Ring 1.*got 4/);
  });

  it('throws when a ring has the wrong labels (e.g. duplicated A in place of F)', () => {
    const input = withMarkers(baseInput(), ['A', 'B', 'C', 'D', 'E', 'A']);
    // length is 6, but F is missing.
    expect(() => buildBuildSessionExportV1(input)).toThrowError(/missing.*F/);
  });

  it('throws when marker dimensions still describe the A4 sheet instead of the AprilTag square', () => {
    const input = withMarkers(baseInput(), ['A', 'B', 'C', 'D', 'E', 'F']);
    const stale = input.ring.markers.map((m, i) =>
      i === 0 ? { ...m, physical_width_m: 0.297, physical_height_m: 0.21 } : m,
    );
    expect(() =>
      assertAprilTagMarkerPhysicalSizes(stale, { venueSlug: 'demo-venue', ringName: 'Ring 1' }),
    ).toThrowError(/A4 paper|A4-sheet|non-square/);
    expect(() =>
      buildBuildSessionExportV1({
        ...input,
        ring: { ...input.ring, markers: stale },
      }),
    ).toThrowError(/A4 paper|A4-sheet|non-square/);
  });

  it('throws when marker dimensions are smaller than the production 190 mm square', () => {
    const input = withMarkers(baseInput(), ['A', 'B', 'C', 'D', 'E', 'F']);
    const tooSmall = input.ring.markers.map((m, i) =>
      i === 0 ? { ...m, physical_width_m: 0.08, physical_height_m: 0.08 } : m,
    );
    expect(() =>
      assertAprilTagMarkerPhysicalSizes(tooSmall, {
        venueSlug: 'demo-venue',
        ringName: 'Ring 1',
      }),
    ).toThrowError(/too-small|standard 0.19 m/);
    expect(() =>
      buildBuildSessionExportV1({
        ...input,
        ring: { ...input.ring, markers: tooSmall },
      }),
    ).toThrowError(/too-small|standard 0.19 m/);
  });

  it('accepts case-insensitive labels (a/B/c/D/e/F all canonical)', () => {
    const input = withMarkers(baseInput(), ['a', 'B', 'c', 'D', 'e', 'F']);
    expect(() => buildBuildSessionExportV1(input)).not.toThrow();
  });

  it('assertSixCanonicalMarkers — standalone API matches the builder gate', () => {
    expect(() =>
      assertSixCanonicalMarkers(['A', 'B', 'C', 'D', 'E', 'F'].map((label) => ({ label }))),
    ).not.toThrow();
    expect(() =>
      assertSixCanonicalMarkers(['A', 'B', 'C', 'D'].map((label) => ({ label }))),
    ).toThrow(/got 4/);
    expect(() =>
      assertSixCanonicalMarkers(['A', 'B', 'C', 'D', 'E', 'A'].map((label) => ({ label }))),
    ).toThrow(/missing.*F/);
  });
});

// ---------------------------------------------------------------------------
// Phase 12b — placement-level targeting metadata
//
// Acceptance per the Web-Planner data-contract task:
//   * Old exports (no display_name / course_type / grades / sizes /
//     is_training / scheduled_at / event_id on the placement) MUST still
//     parse — the schema applies `.default(...)` so the consumer reads
//     sensible neutral values.
//   * New exports MUST round-trip every new field verbatim.
//   * The DB check constraint on `course_type` is mirrored in the schema
//     (`'Jumping' | 'Agility' | null`); other strings reject.
// ---------------------------------------------------------------------------

describe('BuildSessionExportV1 — Phase 12b placement metadata', () => {
  // Reuse the legal A..F-marker fixture for the surrounding bundle. We
  // only mutate the `placement` block here, so a tiny ring + empty course
  // wrapper keeps the test focused.
  const fixtureText = loadFixtureText();
  const { courseData: course } = parseSmarterTxt(fixtureText, {
    sourceFileName: 'jp-s-sw.txt',
  });
  const ring = demoRing();
  const placement = centerCourseInRing(course, ring);
  const warnings = runWarnings(course, placement, ring);

  function makeInput(
    overrides: Partial<BuildSessionExporterInput['placement']> = {},
  ): BuildSessionExporterInput {
    return {
      producer: 'test',
      exportedAt: '2026-05-20T12:00:00.000Z',
      buildSession: {
        id: 'bs',
        placement_id: 'p',
        judge_id: null,
        status: 'not_started',
        selected_strategy: 'equipment_type',
        last_known_marker_id: null,
        started_at: null,
        completed_at: null,
        local_cache_version: 1,
      },
      obstacleStatuses: [],
      placement: {
        id: 'p',
        course_id: 'c',
        venue_id: 'venue-demo',
        ring_id: ring.id,
        name: null,
        placement_mode: placement.placementMode,
        offset_x_m: placement.offsetXMeters,
        offset_y_m: placement.offsetYMeters,
        rotation_deg: placement.rotationDegrees,
        warning_threshold_m: 0.5,
        warnings_json: warnings,
        status: 'ready_to_build',
        ...overrides,
      },
      course: {
        id: 'course-demo',
        title: course.title,
        title_raw: course.titleRaw,
        source: 'smarter-agility',
        source_version: null,
        units: course.units === 'M' ? 'm' : 'ft',
        design_length_m: course.designLengthMeters,
        design_width_m: course.designWidthMeters,
        canvas_width: course.canvasWidth,
        canvas_height: course.canvasHeight,
        origin: course.origin,
        normalized_json: course,
      },
      theme: { id: null, palette_key: 'agilityhub', theme_json: {} },
      venue: {
        id: 'venue-demo',
        slug: 'demo-venue',
        name: 'Demo Partner Venue',
        country: 'ES',
        city: 'Barcelona',
        surface: 'artificial turf',
        indoor_outdoor: 'indoor',
      },
      ring: {
        id: ring.id,
        venue_id: 'venue-demo',
        name: ring.label,
        length_m: ring.lengthMeters,
        width_m: ring.widthMeters,
        border_clearance_m: ring.borderClearanceMeters,
        surface: 'artificial turf',
        doors: [],
        no_go_zones: [],
        markers: ['A', 'B', 'C', 'D', 'E', 'F'].map((label) => ({
          id: `marker-${label}`,
          label,
          marker_uid: `marker-uid-${label}`,
          role: 'reference',
          x_m: 1,
          y_m: 1,
          z_m: 0,
          rotation_y_deg: 0,
          physical_width_m: 0.19,
          physical_height_m: 0.19,
          is_fixed: true,
          is_active: true,
        })),
      },
    };
  }

  it('defaults every new placement field when the caller omits them (back-compat)', () => {
    // The input shape mirrors what a pre-Phase-12b storage path would
    // hand us: no display_name / scheduled_at / event_id / course_type /
    // grades / sizes / is_training fields at all. The builder must fill
    // them with the neutral defaults and the schema must accept them.
    const out = buildBuildSessionExportV1(makeInput());

    expect(out.placement.display_name).toBeNull();
    expect(out.placement.scheduled_at).toBeNull();
    expect(out.placement.event_id).toBeNull();
    expect(out.placement.course_type).toBeNull();
    expect(out.placement.grades).toEqual([]);
    expect(out.placement.sizes).toEqual([]);
    expect(out.placement.is_training).toBe(false);
  });

  it('round-trips a fully populated training placement (no event, no date)', () => {
    const out = buildBuildSessionExportV1(
      makeInput({
        display_name: 'Saturday training — handlers ring',
        scheduled_at: null,
        event_id: null,
        course_type: 'Agility',
        grades: ['1', '2', '3'],
        sizes: ['XS', 'S', 'M', 'I', 'L'],
        is_training: true,
      }),
    );

    expect(out.placement.display_name).toBe('Saturday training — handlers ring');
    expect(out.placement.course_type).toBe('Agility');
    expect(out.placement.grades).toEqual(['1', '2', '3']);
    expect(out.placement.sizes).toEqual(['XS', 'S', 'M', 'I', 'L']);
    expect(out.placement.is_training).toBe(true);
    expect(out.placement.scheduled_at).toBeNull();
    expect(out.placement.event_id).toBeNull();

    // JSON-serialise + reparse to confirm we don't smuggle non-JSON
    // values (Set, Date, etc.) through the new fields.
    const parsed = buildSessionExportV1Schema.parse(JSON.parse(JSON.stringify(out)));
    expect(parsed.placement.grades).toEqual(['1', '2', '3']);
    expect(parsed.placement.sizes).toEqual(['XS', 'S', 'M', 'I', 'L']);
  });

  it('round-trips a scheduled event placement (Jumping + grade 0 + ALL size)', () => {
    const out = buildBuildSessionExportV1(
      makeInput({
        display_name: 'Sunday FCI Open — Jumping',
        scheduled_at: '2026-06-13T09:00:00.000Z',
        event_id: 'event-demo',
        course_type: 'Jumping',
        grades: ['0'],
        sizes: ['ALL'],
        is_training: false,
      }),
    );

    expect(out.placement.scheduled_at).toBe('2026-06-13T09:00:00.000Z');
    expect(out.placement.event_id).toBe('event-demo');
    expect(out.placement.course_type).toBe('Jumping');
    expect(out.placement.is_training).toBe(false);
  });

  it('rejects a placement.course_type outside the {Jumping, Agility, null} set', () => {
    // The DB check constraint allows only 'Jumping' | 'Agility' | NULL.
    // The schema mirrors that contract so a typo at the storage layer
    // surfaces at export time rather than after Unity has loaded the
    // file.
    expect(() =>
      buildBuildSessionExportV1(
        makeInput({ course_type: 'Steeplechase' as unknown as 'Jumping' }),
      ),
    ).toThrow();
  });

  it('parses a hand-crafted JSON that pre-dates the new placement fields', () => {
    // Build the export, then strip the new fields BEFORE handing it
    // back to the schema. The `.default(...)` modifiers must rehydrate
    // every missing field — this is the exact path an old saved export
    // takes when the AR app fetches it after upgrading.
    const out = buildBuildSessionExportV1(makeInput());
    const stripped = JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
    const placementJson = stripped.placement as Record<string, unknown>;
    delete placementJson.display_name;
    delete placementJson.scheduled_at;
    delete placementJson.event_id;
    delete placementJson.course_type;
    delete placementJson.grades;
    delete placementJson.sizes;
    delete placementJson.is_training;

    const reparsed = buildSessionExportV1Schema.parse(stripped);
    expect(reparsed.placement.display_name).toBeNull();
    expect(reparsed.placement.scheduled_at).toBeNull();
    expect(reparsed.placement.event_id).toBeNull();
    expect(reparsed.placement.course_type).toBeNull();
    expect(reparsed.placement.grades).toEqual([]);
    expect(reparsed.placement.sizes).toEqual([]);
    expect(reparsed.placement.is_training).toBe(false);
  });

  it('preserves the placement transform (rotation + flipX + flipY) alongside new metadata', () => {
    // The data contract calls out "persisted placement transform: rotation,
    // flip X, flip Y" as a hard requirement. Make sure plumbing the new
    // Phase 12b fields didn't accidentally drop or zero them.
    const out = buildBuildSessionExportV1(
      makeInput({
        rotation_deg: 90,
        flip_x_bool: true,
        flip_y_bool: false,
        course_type: 'Agility',
        grades: ['2'],
        sizes: ['M', 'I'],
      }),
    );
    expect(out.placement.rotation_deg).toBe(90);
    expect(out.placement.flip_x_bool).toBe(true);
    expect(out.placement.flip_y_bool).toBe(false);
    expect(out.placement.course_type).toBe('Agility');
    expect(out.placement.grades).toEqual(['2']);
  });
});
