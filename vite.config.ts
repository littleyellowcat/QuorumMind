import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    exclude: ["node_modules", "dist", "skills"],
    setupFiles: "./vitest.setup.ts",
    globals: true
  }
});
