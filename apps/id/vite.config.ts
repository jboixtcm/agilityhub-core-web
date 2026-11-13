import { readFileSync } from "node:fs";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

import { contentSecurityPolicy } from "../../scripts/bundle-files.mjs";

import { PRIVACY_POLICY_EFFECTIVE_DATE } from "./src/privacy/privacy-policy.ts";
import { privacyPolicyBuildGuard } from "./src/privacy/release-guard.ts";

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
      // PRIV-01: a production build fails while the privacy policy of /privacy has no effective date.
      privacyPolicyBuildGuard(PRIVACY_POLICY_EFFECTIVE_DATE, { mock: mockEnabled }),
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
      // CFG-04: the Content-Security-Policy Caddy sends with this bundle, computed from its index.html.
      contentSecurityPolicy(),
      react(),
      tailwindcss(),
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
      hookTimeout: 15_000,
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: "./src/test/setup.ts",
      testTimeout: 15_000,
    },
  };
});
