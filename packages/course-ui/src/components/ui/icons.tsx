/**
 * Phase 12c (audit Step 9 / docs/audit/15) — inline SVG icon set for the
 * mobile-and-field UX pass. We intentionally do NOT install lucide-react
 * or heroicons; the operational pages need ~11 icons and pulling a
 * runtime dep just for that would bloat the planner bundle.
 *
 * Each icon is a 20×20 viewBox, currentColor stroke (so it inherits text
 * color via Tailwind utilities), 1.5 stroke width, aria-hidden by
 * default (icons are presentational — labels live on the IconButton).
 * Pass a `className` to scale or recolor.
 *
 * Required set (referenced by IconButton call sites in Prompts 2-4):
 *   OpenIcon, EditIcon, RemoveIcon, CheckIcon, WarningIcon,
 *   ChevronRightIcon, CalendarIcon, VenueIcon, UserIcon, MenuIcon,
 *   CloseIcon.
 *
 * The unit test in `tests/ui-foundation.test.tsx` asserts the exported
 * symbol set matches this list — keep them in sync.
 */
import type { ReactNode, SVGProps } from 'react';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox' | 'xmlns'>;

function Icon({
  paths,
  className = '',
  ...svgProps
}: IconProps & { paths: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...svgProps}
    >
      {paths}
    </svg>
  );
}

export function OpenIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      paths={
        <>
          <path d="M11 4h5v5" />
          <path d="M16 4 9 11" />
          <path d="M14 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
        </>
      }
    />
  );
}

export function EditIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      paths={
        <>
          <path d="M12 3.5 16.5 8 7 17.5 3 18l.5-4Z" />
          <path d="m11.5 4 4 4" />
        </>
      }
    />
  );
}

export function RemoveIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      paths={
        <>
          <path d="M5 5l10 10" />
          <path d="M15 5 5 15" />
        </>
      }
    />
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      paths={<path d="m4 10.5 4 4 8-9" />}
    />
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      paths={
        <>
          <path d="M10 3 2 17h16Z" />
          <path d="M10 8v4" />
          <path d="M10 14.5h.01" />
        </>
      }
    />
  );
}

export function ChevronRightIcon(props: IconProps) {
  return <Icon {...props} paths={<path d="m7 4 6 6-6 6" />} />;
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      paths={
        <>
          <rect x="3" y="4" width="14" height="13" rx="2" />
          <path d="M3 8h14" />
          <path d="M7 3v3" />
          <path d="M13 3v3" />
        </>
      }
    />
  );
}

export function VenueIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      paths={
        <>
          <path d="M3 9 10 4l7 5v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
          <path d="M8 18v-4h4v4" />
        </>
      }
    />
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      paths={
        <>
          <circle cx="10" cy="7.5" r="3" />
          <path d="M3.5 17c.5-3 3.4-5 6.5-5s6 2 6.5 5" />
        </>
      }
    />
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      paths={
        <>
          <path d="M3 6h14" />
          <path d="M3 10h14" />
          <path d="M3 14h14" />
        </>
      }
    />
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      paths={
        <>
          <path d="M5 5l10 10" />
          <path d="M15 5 5 15" />
        </>
      }
    />
  );
}

/**
 * The set of icon names this module exports. The unit test asserts the
 * runtime export shape matches this list. Keep in sync with the
 * `export function` lines above when adding/removing icons.
 */
export const EXPORTED_ICON_NAMES = [
  'OpenIcon',
  'EditIcon',
  'RemoveIcon',
  'CheckIcon',
  'WarningIcon',
  'ChevronRightIcon',
  'CalendarIcon',
  'VenueIcon',
  'UserIcon',
  'MenuIcon',
  'CloseIcon',
] as const;
