import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

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
    plugins: [react(), tailwindcss()],
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
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: "./src/test/setup.ts",
    },
  };
});
