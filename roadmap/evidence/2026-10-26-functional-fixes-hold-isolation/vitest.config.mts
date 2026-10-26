import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "../../../apps/clubs/node_modules/vitest/dist/config.js";
import clubsConfig from "../../../apps/clubs/vite.config";

export default defineConfig(async (environment) =>
  mergeConfig(await clubsConfig(environment), {
    test: {
      include: [resolve(import.meta.dirname, "boundary-probe.test.tsx")],
      reporters: ["verbose"],
    },
  }),
);
