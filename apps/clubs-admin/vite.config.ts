import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

/** course-ui's FBX models (D18's 3D tab, E9-W03), published at `/obstacle-models` as Planner3D reads them. */
const OBSTACLE_MODELS = resolve(
  import.meta.dirname,
  "../../packages/course-ui/assets/obstacle-models",
);

function obstacleModels(): Plugin {
  return {
    configureServer(server) {
      server.middlewares.use("/obstacle-models", (request, response, next) => {
        const file = (request.url ?? "").split("?")[0]?.replace(/^\//u, "") ?? "";
        if (!/^[\w.-]+\.fbx$/u.test(file)) {
          next();
          return;
        }
        try {
          const data = readFileSync(resolve(OBSTACLE_MODELS, file));
          response.setHeader("Content-Type", "application/octet-stream");
          response.end(data);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const file of readdirSync(OBSTACLE_MODELS).filter((name) => name.endsWith(".fbx"))) {
        this.emitFile({
          fileName: `obstacle-models/${file}`,
          source: readFileSync(resolve(OBSTACLE_MODELS, file)),
          type: "asset",
        });
      }
    },
    name: "course-ui-obstacle-models",
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const coreUrl = process.env.VITE_CORE_URL ?? env.VITE_CORE_URL ?? "http://localhost:8080";
  const idUrl = process.env.VITE_ID_URL ?? env.VITE_ID_URL ?? coreUrl;
  const mockEnabled = (process.env.VITE_MOCK ?? env.VITE_MOCK) === "1";
  const proxyHost = process.env.VITE_PROXY_HOST ?? env.VITE_PROXY_HOST;
  const proxyOrigin = process.env.VITE_PROXY_ORIGIN ?? env.VITE_PROXY_ORIGIN;
  const proxyHeaders =
    proxyHost === undefined
      ? {}
      : {
          headers: {
            Host: proxyHost,
            ...(proxyOrigin === undefined ? {} : { Origin: proxyOrigin }),
          },
        };

  return {
    plugins: [react(), tailwindcss(), obstacleModels()],
    server: mockEnabled
      ? {}
      : {
          proxy: {
            "/.well-known": { changeOrigin: true, target: idUrl, ...proxyHeaders },
            "/api": { changeOrigin: true, target: coreUrl, ...proxyHeaders },
            "/connect": { changeOrigin: true, target: idUrl, ...proxyHeaders },
            "/oauth2": { changeOrigin: true, target: idUrl, ...proxyHeaders },
          },
        },
    test: {
      // D19's «preset AgilityHub» reads the product theme from `tokens.css?raw` (E10-W01 round 2).
      css: { include: [/packages\/ui\/src\/tokens\.css/u] },
      environment: "jsdom",
      exclude: [...configDefaults.exclude, "e2e/**"],
      hookTimeout: 15_000,
      setupFiles: "./src/test/setup.ts",
      testTimeout: 15_000,
    },
  };
});
