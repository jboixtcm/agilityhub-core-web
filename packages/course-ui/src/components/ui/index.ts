/**
 * Phase 12c (audit Step 9 / docs/audit/15) — barrel for `components/ui/`.
 *
 * New code in Prompts 2-4 should import from this barrel:
 *   import { Card, Button, IconButton, EmptyState, CheckIcon } from '../components/ui/index.js';
 *
 * Existing deep imports (e.g. `../../components/ui/Card.js`) keep
 * working — we intentionally don't break them. The barrel just makes
 * the operational pages cleaner.
 */

export { Card, CardTitle } from './Card.js';
export type { CardDensity } from './Card.js';

export { Button } from './Button.js';
export type { ButtonVariant, ButtonSize } from './Button.js';

export { IconButton } from './IconButton.js';
export type { IconButtonVariant, IconButtonSize } from './IconButton.js';

export { SeverityBadge, NeutralBadge } from './Badge.js';

export { EmptyState } from './EmptyState.js';
export type { EmptyStateAction } from './EmptyState.js';

export {
  OpenIcon,
  EditIcon,
  RemoveIcon,
  CheckIcon,
  WarningIcon,
  ChevronRightIcon,
  CalendarIcon,
  VenueIcon,
  UserIcon,
  MenuIcon,
  CloseIcon,
  EXPORTED_ICON_NAMES,
} from './icons.js';
export type { IconProps } from './icons.js';
