import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiHost = process.env.QUORUMMIND_API_HOST ?? "127.0.0.1";
const apiPort = process.env.QUORUMMIND_API_PORT ?? "8787";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": `http://${apiHost}:${apiPort}`
    }
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)", "server/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    exclude: ["node_modules", "dist", "skills"],
    setupFiles: "./vitest.setup.ts",
    globals: true
  }
});
