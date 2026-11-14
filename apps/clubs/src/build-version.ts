import type { BuildVersion } from "@agilityhub/ui";

/** Compiled in by `vite.config.ts` (`define`): what this bundle's `version.json` says. */
declare const __AGILITYHUB_BUILD__: BuildVersion;

/** FE-07: this bundle's own version and commit (the commit only in a CI `vite build`). */
export const RUNNING_BUILD: BuildVersion = __AGILITYHUB_BUILD__;
