/** Smarter source codes supported by the FCI course writer. */
export const SMARTER_RIGID_OBSTACLE_CODES = [
  'jb',
  'j',
  'jw',
  'djb',
  'dj',
  'tju',
  'dw',
  'af',
  'ss',
  'w12',
  'lj4',
  'lj1',
  'lj2',
  'lj3',
  'lj5',
  'lj',
  'wb',
  'w',
  'tib',
  'ti',
] as const;

export const SMARTER_TUNNEL_CODES = ['t2', 't3s', 't3', 't4s', 't4', 't5s', 't5', 't6s', 't6'] as const;

export const SMARTER_PHYSICAL_OBSTACLE_CODES = [
  ...SMARTER_RIGID_OBSTACLE_CODES,
  ...SMARTER_TUNNEL_CODES,
] as const;

export type SmarterRigidObstacleCode = (typeof SMARTER_RIGID_OBSTACLE_CODES)[number];
export type SmarterTunnelCode = (typeof SMARTER_TUNNEL_CODES)[number];
export type SmarterPhysicalObstacleCode = (typeof SMARTER_PHYSICAL_OBSTACLE_CODES)[number];

/** Includes every grid-label origin observed in the production sample corpus. */
export type SmarterOrigin = 'LT' | 'LB' | 'RT' | 'RB' | 'CC' | 'LC' | 'RC' | 'CB';
export type SmarterUnit = 'M' | 'F';
export type SmarterCourseType = 'A_A' | 'A_J' | 'A_ZZ';
export type SmarterNumberGroupCode = `n${number}` | `l${number}`;

export interface SmarterPointMeters {
  readonly x: number;
  readonly y: number;
}

export interface SmarterFieldDraft {
  /** Internal dimensions are always meters, even when the output label is feet. */
  readonly lengthMeters: number;
  readonly widthMeters: number;
  readonly units?: SmarterUnit;
  readonly origin?: SmarterOrigin;
  /** Optional escape hatch for a known Smarter canvas; otherwise a safe LT canvas is generated. */
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
}

export interface SmarterCourseMetadataDraft {
  readonly title?: string;
  readonly type?: string;
  readonly grade?: string;
  readonly category?: string;
  readonly location?: string;
  readonly designer?: string;
  readonly organization?: string;
  readonly date?: string;
  readonly info?: string;
  readonly keywords?: string;
  readonly labels?: Readonly<Record<string, string>>;
}

export interface SmarterDisplayDraft {
  readonly hideTitle?: boolean;
  readonly spacing?: number;
  readonly hideGrid?: boolean;
  readonly showTotalLength?: boolean;
  readonly showCopyright?: boolean;
  readonly colorScheme?: string;
}

interface SmarterObstacleDraftBase {
  /** Draft-local reference. The writer replaces it with a generated numeric Smarter ID. */
  readonly ref: string;
  readonly custom?: Readonly<Record<string, unknown>>;
}

export interface SmarterRigidObstacleDraft extends SmarterObstacleDraftBase {
  readonly kind: 'rigid';
  readonly code: SmarterRigidObstacleCode;
  readonly xMeters: number;
  readonly yMeters: number;
  readonly angleDegrees: number;
}

export interface SmarterTunnelDraft extends SmarterObstacleDraftBase {
  readonly kind: 'tunnel';
  readonly code: SmarterTunnelCode;
  readonly controlPointsMeters: readonly SmarterPointMeters[];
  readonly locked?: boolean;
}

export type SmarterObstacleDraft = SmarterRigidObstacleDraft | SmarterTunnelDraft;

/** Course extras stored beside the obstacles: text boxes, start/finish lines, lines, no-go zones, arrows. */
export const SMARTER_EXTRA_CODES = ['te', 'SFLCP', 'LCP', 'at', 'ar'] as const;
export type SmarterExtraCode = (typeof SMARTER_EXTRA_CODES)[number];

/**
 * An extra element of the course. `entry` holds the Smarter fields verbatim (canvas units where
 * Smarter uses them: a text box's `width`, a line's `color`); the positions named in `pointsMeters`
 * are given in metres and written as canvas coordinates: key '' sets `x`/`y`, key '1' sets
 * `x1`/`y1`, key '2' sets `x2`/`y2`, and so on.
 */
export interface SmarterExtraDraft {
  readonly code: SmarterExtraCode;
  readonly entry: Readonly<Record<string, unknown>>;
  readonly pointsMeters?: Readonly<Record<string, SmarterPointMeters>>;
}

export interface SmarterNumberAttachmentDraft {
  readonly obstacleRef: string;
  readonly connectionPoint: 'cp1' | 'cp2';
  readonly cp1Distance: number;
  readonly cp1AngleDegrees: number;
  readonly cp2Distance: number;
  readonly cp2AngleDegrees: number;
}

export interface SmarterNumberDraft {
  readonly text: string | number;
  readonly xMeters: number;
  readonly yMeters: number;
  readonly attachment: SmarterNumberAttachmentDraft;
  readonly hideSegment?: boolean;
}

export interface SmarterPathConfig {
  readonly showPaths?: boolean;
  readonly isStraight?: boolean;
  readonly showLength?: boolean;
  readonly showArrows?: boolean;
  readonly hidePathNumber?: boolean;
}

export interface SmarterCourseDraft {
  readonly field: SmarterFieldDraft;
  readonly courseType: SmarterCourseType;
  readonly obstacles: readonly SmarterObstacleDraft[];
  readonly numberGroups?: Readonly<
    Partial<Record<SmarterNumberGroupCode, readonly SmarterNumberDraft[]>>
  >;
  readonly metadata?: SmarterCourseMetadataDraft;
  readonly display?: SmarterDisplayDraft;
  readonly pathConfig?: Readonly<Partial<Record<SmarterNumberGroupCode, SmarterPathConfig>>>;
  readonly obstacleConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Text boxes, start/finish lines, lines, no-go zones and arrows (stored with the obstacles). */
  readonly extras?: readonly SmarterExtraDraft[];
  /** Advanced elements are preserved as typed JSON records by callers that already understand them. */
  readonly lines?: readonly Readonly<Record<string, unknown>>[];
  readonly logos?: readonly Readonly<Record<string, unknown>>[];
}

export interface SmarterWriterEnvironment {
  readonly now?: () => Date;
  readonly createLocalHashId?: () => string;
  readonly sourceIdStart?: number;
}

export interface SmarterRigidObstacleEntry {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly custom?: Readonly<Record<string, unknown>>;
}

export interface SmarterTunnelEntry {
  readonly cps: readonly (readonly [number, number])[];
  readonly custom: Readonly<Record<string, unknown>>;
  readonly locked?: boolean;
}

export type SmarterExtraEntry = Readonly<Record<string, unknown>>;

export type SmarterObstacleEntry = SmarterRigidObstacleEntry | SmarterTunnelEntry | SmarterExtraEntry;

export interface SmarterNumberEntry {
  readonly text: string | number;
  readonly x: number;
  readonly y: number;
  readonly oid: number;
  readonly ocp: 'cp1' | 'cp2';
  readonly cp1d: number;
  readonly cp1a: number;
  readonly cp2d: number;
  readonly cp2a: number;
  readonly hideSegment?: boolean;
}

export interface SmarterSettingsDocument {
  readonly version: '10.1.2';
  readonly dogs: Readonly<Record<string, never>>;
  readonly handlers: Readonly<Record<string, never>>;
  readonly obstacles: Readonly<Record<string, Readonly<Record<string, SmarterObstacleEntry>>>>;
  readonly numbers: Readonly<Record<string, Readonly<Record<string, SmarterNumberEntry>>>>;
  readonly lines: readonly Readonly<Record<string, unknown>>[];
  readonly logos: readonly Readonly<Record<string, unknown>>[];
  readonly config: {
    readonly paths: Readonly<Record<string, SmarterPathConfig>>;
    readonly obstacles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    readonly course: { readonly hoopersFlybyDistance: 1 };
  };
  readonly discipline: 'AG';
  readonly course_type: SmarterCourseType;
  readonly datetime: number;
}

export interface SmarterOuterDocument {
  readonly restore_id: null;
  readonly type: string;
  readonly course_type: string;
  readonly grade: string;
  readonly category: string;
  readonly location: string;
  readonly designer: string;
  readonly is_draft: false;
  readonly title: string;
  readonly title_raw: string;
  readonly hide_title: 0 | 1;
  readonly info: string;
  readonly keywords: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly origin: SmarterOrigin;
  readonly canvas_color: string;
  readonly grid_color: string;
  readonly gridLabels_color: string;
  readonly border_color: string;
  readonly frame_color: string;
  readonly color_sheme: string;
  readonly organization: string;
  readonly units: SmarterUnit;
  readonly length: number;
  readonly width: number;
  readonly spacing: number;
  readonly padding: { readonly top: 0; readonly bottom: 0; readonly left: 0; readonly right: 0 };
  readonly hide_spacing: 'auto';
  readonly hide_grid: 'auto' | 0 | 1;
  readonly show_total_length: 0 | 1;
  readonly show_copyright: boolean;
  readonly settings: string;
  readonly date: string;
  readonly is_template: 0;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly _info: string;
  readonly _initial_id: string;
  readonly layout_version: 1;
  readonly public_course_level_2: string;
  readonly course_updated_at: number;
  readonly local_hash_id: string;
  readonly export_version: 2;
}

/** Parsed writer result plus the exact outer payload that gets base64-encoded. */
export interface SmarterDocument {
  readonly outer: SmarterOuterDocument;
  readonly settings: SmarterSettingsDocument;
}
