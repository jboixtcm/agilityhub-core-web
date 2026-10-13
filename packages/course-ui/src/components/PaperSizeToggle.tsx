'use client';

/**
 * A4 / US Letter segmented switch for the marker print surfaces.
 *
 * Venues outside Europe do not have A4 in the tray, and a marker pack
 * that shrink-to-fits is not a cosmetic problem — the AR detector solves
 * the tag's pose from its printed 190 mm side, so the wrong paper is a
 * calibration bug. The switch is deliberately visible next to every
 * print affordance rather than buried in settings.
 *
 * The venue's `default_paper_size` column seeds this; the toggle is the
 * per-print override.
 */

import { PAPER_PRESETS, PAPER_SIZES } from '@agilityhub/course-core';
import type { PaperSize } from '@agilityhub/course-core';

interface PaperSizeToggleProps {
  readonly value: PaperSize;
  readonly onChange: (next: PaperSize) => void;
  readonly labels: {
    readonly a4: string;
    readonly description: (label: string, widthMm: number, heightMm: number) => string;
    readonly group: string;
    readonly letter: string;
  };
  /** `sm` for inline rows next to buttons, `md` for page toolbars. */
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

export function PaperSizeToggle({
  value,
  onChange,
  labels,
  size = 'sm',
  className = '',
}: PaperSizeToggleProps) {
  const height = size === 'md' ? 'min-h-[26px]' : 'min-h-[22px]';
  return (
    <div
      role="group"
      aria-label={labels.group}
      className={`inline-flex items-center gap-1 rounded-agh bg-surface p-1 ${className}`}
    >
      {PAPER_SIZES.map((paper) => {
        const preset = PAPER_PRESETS[paper];
        const active = value === paper;
        return (
          <button
            key={paper}
            type="button"
            aria-pressed={active}
            onClick={() => { onChange(paper); }}
            aria-label={labels[paper]}
            title={labels.description(labels[paper], preset.widthMm, preset.heightMm)}
            className={`${height} px-2 text-xs font-semibold rounded-agh ${
              active ? 'bg-warning text-[var(--ah-color-on-warning)]' : 'text-muted hover:text-text'
            }`}
          >
            {labels[paper]}
          </button>
        );
      })}
    </div>
  );
}
