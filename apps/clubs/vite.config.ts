import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * course-ui's FBX models, published at `/obstacle-models` as Planner3D reads them: the viewer's 3D
 * tab (S16 §2, E9-W04), as clubs-admin's D18 does (E9-W03).
 */
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
    // Keep MSW out of production; emit the public favicon explicitly.
    build: { copyPublicDir: mockEnabled },
    plugins: [
      {
        name: "app-favicon",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "favicon.svg",
            source: readFileSync(new URL("./public/favicon.svg", import.meta.url), "utf8"),
          });
        },
      },
      react(),
      tailwindcss(),
      obstacleModels(),
      // S11 R-11-07 (E7-W02): our own worker (`src/sw.ts`) for web push. The navigation fallback
      // to `/index.html` and its denylist of the same-site proxy routes live in the worker now.
      // `injectRegister: false`: only `main.tsx` registers it, and never with `VITE_MOCK=1`, where
      // the only worker on `/` is MSW's.
      VitePWA({
        devOptions: { enabled: false },
        filename: "sw.ts",
        injectManifest: {
          // INC-20: the mock world (and its worker) never goes into the production precache.
          // S16 (E9-W04): nor the viewer's 3D tab (three.js), loaded only when someone opens it.
          globIgnores: ["**/browser-*.js", "**/mockServiceWorker.js", "**/CourseViewer3D-*.js"],
        },
        injectRegister: false,
        manifest: false,
        registerType: "autoUpdate",
        srcDir: "src",
        strategies: "injectManifest",
      }),
    ],
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
      environment: "jsdom",
      exclude: [...configDefaults.exclude, "e2e/**"],
      hookTimeout: 15_000,
      setupFiles: "./src/test/setup.ts",
      testTimeout: 15_000,
    },
  };
});
