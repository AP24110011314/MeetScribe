/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The SPA calls the API with relative `/api/...` paths; in dev Vite proxies them to the
// backend. Inside docker compose VITE_PROXY_TARGET=http://api:8000 (see D10).
export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";

  return {
    plugins: [react()],
    css: {
      devSourcemap: false,
      postcss: isProduction ? "./postcss.config.prod.js" : "./postcss.config.js",
    },
    build: {
      sourcemap: false,
      cssCodeSplit: false,
    },
    server: {
      proxy: {
        "/api": {
          target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      environmentOptions: {
        jsdom: { url: "http://localhost:5173" },
      },
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
