import type { ObstacleType } from "@agilityhub/course-core";

/** Rotate bar-style icons across the direction of travel, as in the 3D view. */
export const ICON_AXIS_OFFSET: Partial<Record<ObstacleType, number>> = {
  Jump: 90,
  DoubleJump: 90,
  Wall: 90,
  Tire: 90,
};

/** Horizontal dimensions of the contact overlays in the orthographic and SVG plans. */
export const CONTACT_FOOTPRINTS = {
  DogWalk: { lengthM: 11, widthM: 0.4 },
  AFrame: { lengthM: 4.2, widthM: 0.9 },
  Seesaw: { lengthM: 3.7, widthM: 0.4 },
} as const;

export const TUNNEL_RADIUS_M = 0.3;
