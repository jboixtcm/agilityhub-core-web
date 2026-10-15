import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dev-only harness page (harness/main.tsx) for the browser checks of e2e/harness.spec.ts.
// `assets/` is served as the public directory, so the FBX models answer at /obstacle-models/*,
// the default `Planner3D.assetBaseUrl`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: resolve(import.meta.dirname, "assets"),
  root: resolve(import.meta.dirname, "harness"),
});
