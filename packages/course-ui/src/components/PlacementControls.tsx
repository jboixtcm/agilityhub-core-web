'use client';

import { formatLength, type UnitSystem } from '@agilityhub/course-core';
import { useState } from 'react';

import { Button } from './ui/Button.js';
import { Card, CardTitle } from './ui/Card.js';

interface Props {
  units: UnitSystem;
  /** The club's locale for the step lengths («0,50 m» in `ca`, R-16-17). */
  locale: string;
  labels: {
    readonly center: string;
    readonly flipHorizontal: string;
    readonly flipVertical: string;
    readonly nudgeDown: string;
    readonly nudgeLeft: string;
    readonly nudgeRight: string;
    readonly nudgeUp: string;
    readonly reset: string;
    readonly rotateFineLeft: string;
    readonly rotateFineRight: string;
    readonly rotateLeft: string;
    readonly rotateRight: string;
    readonly stepSize: string;
    readonly title: string;
  };
  disabled?: boolean;
  onNudge: (dxMeters: number, dyMeters: number) => void;
  onRotate: (deltaDegrees: number) => void;
  onFlipX: () => void;
  onFlipY: () => void;
  /** Reflects current placement.flipX so we can show an active "pressed" state. */
  flipX?: boolean;
  /** Reflects current placement.flipY so we can show an active "pressed" state. */
  flipY?: boolean;
  onCenter: () => void;
  onReset: () => void;
}

const STEP_OPTIONS_M = [0.1, 0.5, 1.0] as const;

export function PlacementControls({
  units,
  locale,
  labels,
  disabled,
  onNudge,
  onRotate,
  onFlipX,
  onFlipY,
  flipX,
  flipY,
  onCenter,
  onReset,
}: Props) {
  const [stepMeters, setStepMeters] = useState<number>(0.5);

  return (
    <Card>
      <CardTitle>{labels.title}</CardTitle>

      {/*
        CourseData and CoursePlacement now both live in ring Y-up
        (parser flips Smarter LT pixels at ingest — see
        `pxToRingMetersY` in packages/course-core/src/parser/coords.ts).
        So Up = +stepMeters, Down = -stepMeters, matching what the user
        sees on screen.
      */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div />
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => { onNudge(0, stepMeters); }}
          aria-label={labels.nudgeUp}
        >
          ↑
        </Button>
        <div />
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => { onNudge(-stepMeters, 0); }}
          aria-label={labels.nudgeLeft}
        >
          ←
        </Button>
        <Button size="sm" variant="neutral" disabled={disabled} onClick={onCenter}>
          {labels.center}
        </Button>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => { onNudge(stepMeters, 0); }}
          aria-label={labels.nudgeRight}
        >
          →
        </Button>
        <div />
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => { onNudge(0, -stepMeters); }}
          aria-label={labels.nudgeDown}
        >
          ↓
        </Button>
        <div />
      </div>

      <label className="block mb-3">
        <span className="block text-xs text-muted mb-1">{labels.stepSize}</span>
        <select
          value={stepMeters}
          onChange={(e) => { setStepMeters(Number.parseFloat(e.target.value)); }}
          disabled={disabled}
          className="block w-full bg-surface-2 text-text border border-border rounded-agh px-2 py-1 text-sm"
        >
          {STEP_OPTIONS_M.map((s) => (
            <option key={s} value={s}>
              {formatLength(s, units, { locale })}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => { onRotate(-90); }}>
          {labels.rotateLeft}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => { onRotate(90); }}>
          {labels.rotateRight}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => { onRotate(-1); }}>
          {labels.rotateFineLeft}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => { onRotate(1); }}>
          {labels.rotateFineRight}
        </Button>
      </div>

      {/* Flip H / V — mirror the course about its centroid. The button shows
          a pressed/active state when the corresponding flip is on so the user
          can tell at a glance whether the layout is mirrored. */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Button
          size="sm"
          variant={flipX ? 'primary' : 'outline'}
          disabled={disabled}
          onClick={onFlipX}
          aria-pressed={flipX ?? false}
          aria-label={labels.flipHorizontal}
        >
          ↔ {labels.flipHorizontal}
        </Button>
        <Button
          size="sm"
          variant={flipY ? 'primary' : 'outline'}
          disabled={disabled}
          onClick={onFlipY}
          aria-pressed={flipY ?? false}
          aria-label={labels.flipVertical}
        >
          ↕ {labels.flipVertical}
        </Button>
      </div>

      <Button size="sm" variant="neutral" disabled={disabled} onClick={onReset} className="w-full">
        {labels.reset}
      </Button>
    </Card>
  );
}
