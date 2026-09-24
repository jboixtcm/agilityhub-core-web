import { describe, expect, it } from 'vitest';
import { decodeSmarterPayload, extractSmarterPayload } from '../src/parser/wrapper.js';
import { parseSmarterTxt } from '../src/parser/parse-smarter-txt.js';
import {
  SMARTER_RIGID_OBSTACLE_CODES,
  SMARTER_TUNNEL_CODES,
  SmarterSerializeError,
  buildSmarterDocument,
  serializeSmarterTxt,
  validateSmarterDocument,
  type SmarterCourseDraft,
  type SmarterDocument,
  type SmarterObstacleDraft,
} from '../src/writer/index.js';

const FIXED_NOW = new Date('2026-08-22T12:34:56.789Z');
const ENVIRONMENT = {
  now: () => FIXED_NOW,
  createLocalHashId: () => '00000000-0000-4000-8000-000000000001',
};

function mixedDraft(): SmarterCourseDraft {
  return {
    field: { lengthMeters: 40, widthMeters: 30 },
    courseType: 'A_A',
    metadata: { title: 'Smarter writer — Barça', designer: 'Jordi Boix Baró' },
    obstacles: [
      {
        kind: 'rigid',
        code: 'jb',
        ref: 'jump-1',
        xMeters: 2,
        yMeters: 3,
        angleDegrees: -10,
      },
      {
        kind: 'tunnel',
        code: 't4s',
        ref: 'tunnel-1',
        controlPointsMeters: [
          { x: 10, y: 20 },
          { x: 11, y: 21 },
          { x: 12, y: 21 },
          { x: 13, y: 20 },
        ],
      },
    ],
    numberGroups: {
      n1: [
        {
          text: 1,
          xMeters: 2.5,
          yMeters: 3.5,
          attachment: {
            obstacleRef: 'jump-1',
            connectionPoint: 'cp1',
            cp1Distance: 40,
            cp1AngleDegrees: 180,
            cp2Distance: 40,
            cp2AngleDegrees: 0,
          },
        },
      ],
      n2: [
        {
          text: 'A',
          xMeters: 11,
          yMeters: 22,
          attachment: {
            obstacleRef: 'tunnel-1',
            connectionPoint: 'cp2',
            cp1Distance: 31.5,
            cp1AngleDegrees: 125,
            cp2Distance: 54,
            cp2AngleDegrees: 305,
          },
          hideSegment: true,
        },
      ],
    },
    pathConfig: {
      n1: { showArrows: false },
      n2: { showLength: false, hidePathNumber: true },
    },
  };
}

describe('Smarter 10.1.2 writer', () => {
  it('builds deterministic metadata, inverse geometry, IDs, and multiple number groups', () => {
    const document = buildSmarterDocument(mixedDraft(), ENVIRONMENT);

    expect(document.outer).toMatchObject({
      export_version: 2,
      layout_version: 1,
      units: 'M',
      length: 40,
      width: 30,
      canvasWidth: 846,
      canvasHeight: 673,
      course_updated_at: Math.floor(FIXED_NOW.getTime() / 1_000),
      local_hash_id: '00000000-0000-4000-8000-000000000001',
    });
    expect(document.settings.datetime).toBe(FIXED_NOW.getTime());
    expect(document.settings.obstacles.jb?.['1']).toEqual({
      x: 40,
      y: 540,
      angle: 350,
      custom: {},
    });
    expect(document.settings.obstacles.t4s?.['2']).toEqual({
      cps: [
        [200, 200],
        [220, 180],
        [240, 180],
        [260, 200],
      ],
      custom: {},
    });
    expect(document.settings.numbers.n1?.['3']).toMatchObject({ oid: 1, ocp: 'cp1' });
    expect(document.settings.numbers.n2?.['4']).toMatchObject({
      text: 'A',
      oid: 2,
      ocp: 'cp2',
      hideSegment: true,
    });
    expect(document.settings.config.paths).toEqual({
      n1: { showArrows: false },
      n2: { showLength: false, hidePathNumber: true },
    });
  });

  it('serializes a Unicode-safe SAD wrapper with settings double-encoded', () => {
    const raw = serializeSmarterTxt(mixedDraft(), ENVIRONMENT);
    const outer = JSON.parse(decodeSmarterPayload(extractSmarterPayload(raw))) as {
      title: string;
      settings: string;
    };
    const settings = JSON.parse(outer.settings) as { version: string; numbers: unknown };

    expect(outer.title).toBe('Smarter writer — Barça');
    expect(settings.version).toBe('10.1.2');
    expect(settings.numbers).toBeTruthy();
  });

  it('round-trips supported physical geometry through the existing parser', () => {
    const raw = serializeSmarterTxt(mixedDraft(), ENVIRONMENT);
    const { courseData, warnings } = parseSmarterTxt(raw, { sourceFileName: 'writer.txt' });

    expect(warnings).toEqual([]);
    expect(courseData.title).toBe('Smarter writer — Barça');
    expect(courseData.obstacles).toHaveLength(2);
    expect(courseData.numbers).toHaveLength(2);
    expect(courseData.numbers.map((number) => number.sequenceKey).sort()).toEqual(['n1', 'n2']);
    expect(courseData.obstacles.find((obstacle) => obstacle.sourceCode === 'jb')).toMatchObject({
      xMeters: 2,
      yMeters: 3,
      rotationDegrees: 350,
    });
  });

  it('supports every physical code in the importer obstacle map', () => {
    const rigid: SmarterObstacleDraft[] = SMARTER_RIGID_OBSTACLE_CODES.map((code, index) => ({
      kind: 'rigid',
      code,
      ref: `rigid-${code}`,
      xMeters: index + 1,
      yMeters: 5,
      angleDegrees: index * 15,
    }));
    const tunnels: SmarterObstacleDraft[] = SMARTER_TUNNEL_CODES.map((code, index) => {
      // E0-W08: the source test gave `t2` 5 points, but the writer (expectedTunnelControlPointCount)
      // requires 3 for t2/t3s/t3; the test now follows the unchanged writer logic.
      const pointCount =
        code === 't2' || code === 't3s' || code === 't3'
          ? 3
          : code === 't4s' || code === 't4'
            ? 4
            : 5;
      return {
        kind: 'tunnel',
        code,
        ref: `tunnel-${code}`,
        controlPointsMeters: Array.from({ length: pointCount }, (_, pointIndex) => ({
          x: index + pointIndex + 1,
          y: pointIndex % 2 === 0 ? 10 : 11,
        })),
      };
    });

    const document = buildSmarterDocument(
      {
        field: { lengthMeters: 45, widthMeters: 30 },
        courseType: 'A_J',
        obstacles: [...rigid, ...tunnels],
      },
      ENVIRONMENT,
    );

    expect(Object.keys(document.settings.obstacles).sort()).toEqual(
      [...SMARTER_RIGID_OBSTACLE_CODES, ...SMARTER_TUNNEL_CODES].sort(),
    );
    expect(() => validateSmarterDocument(document)).not.toThrow();
  });

  it('round-trips exact FCI wingless, triple, and long-jump variant source codes', () => {
    const variantCodes = ['jw', 'tju', 'lj1', 'lj2', 'lj3', 'lj5'] as const;
    const raw = serializeSmarterTxt(
      {
        field: { lengthMeters: 40, widthMeters: 20 },
        courseType: 'A_J',
        obstacles: variantCodes.map((code, index) => ({
          kind: 'rigid' as const,
          code,
          ref: `variant-${code}`,
          xMeters: 5 + index * 4,
          yMeters: 10,
          angleDegrees: index * 20,
        })),
      },
      ENVIRONMENT,
    );

    const { courseData, warnings } = parseSmarterTxt(raw);
    expect(warnings).toEqual([]);
    expect(courseData.obstacles.map((obstacle) => obstacle.sourceCode).sort()).toEqual(
      [...variantCodes].sort(),
    );
    // The current normalized renderer does not have truthful shapes for these
    // variants. They remain physical/importable objects and retain sourceCode,
    // but deliberately render as Unknown rather than as the wrong equipment.
    expect(courseData.obstacles.every((obstacle) => obstacle.obstacleType === 'Unknown')).toBe(
      true,
    );
  });

  it('can label the field in feet while retaining meter-based canvas coordinates', () => {
    const draft = mixedDraft();
    const document = buildSmarterDocument(
      {
        ...draft,
        field: { lengthMeters: 29.8704, widthMeters: 32.9184, units: 'F' },
      },
      ENVIRONMENT,
    );

    expect(document.outer.units).toBe('F');
    expect(document.outer.length).toBe(98);
    expect(document.outer.width).toBe(108);
    expect(document.settings.obstacles.jb?.['1']).toMatchObject({ x: 40, y: 598.37 });
  });

  it('rejects duplicate refs, dangling number attachments, and invalid coordinates', () => {
    const draft = mixedDraft();
    expect(() =>
      buildSmarterDocument(
        { ...draft, obstacles: [draft.obstacles[0]!, draft.obstacles[0]!] },
        ENVIRONMENT,
      ),
    ).toThrowError(/Duplicate obstacle ref/);

    expect(() =>
      buildSmarterDocument(
        {
          ...draft,
          numberGroups: {
            n1: [
              {
                ...draft.numberGroups!.n1![0]!,
                attachment: {
                  ...draft.numberGroups!.n1![0]!.attachment,
                  obstacleRef: 'missing',
                },
              },
            ],
          },
        },
        ENVIRONMENT,
      ),
    ).toThrowError(/unknown obstacle/);

    expect(() =>
      buildSmarterDocument(
        {
          ...draft,
          obstacles: [
            {
              kind: 'rigid',
              code: 'jb',
              ref: 'bad',
              xMeters: Number.NaN,
              yMeters: 1,
              angleDegrees: 0,
            },
          ],
          numberGroups: {},
        },
        ENVIRONMENT,
      ),
    ).toThrowError(/finite number/);
  });

  it('rejects a structurally valid-looking document with a dangling oid', () => {
    const document = structuredClone(buildSmarterDocument(mixedDraft(), ENVIRONMENT));
    const entry = document.settings.numbers.n1?.['3'];
    if (entry === undefined) throw new Error('test fixture number missing');
    (entry as { oid: number }).oid = 999;
    (document.outer as { settings: string }).settings = JSON.stringify(document.settings);

    expect(() => validateSmarterDocument(document as SmarterDocument)).toThrowError(
      SmarterSerializeError,
    );
    expect(() => validateSmarterDocument(document as SmarterDocument)).toThrowError(
      /does not reference an obstacle/,
    );
  });
});
