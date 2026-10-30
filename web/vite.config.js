const path = require("node:path");
const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig(({ command }) => {
  if (command === "build" && !process.env.ADDON_WEB_OUTPUT_DIR) {
    throw new Error("ADDON_WEB_OUTPUT_DIR is required for an isolated web build");
  }
  return {
  plugins: [react()],
  root: __dirname,
  base: "./",
  build: {
    outDir: process.env.ADDON_WEB_OUTPUT_DIR ? path.resolve(process.env.ADDON_WEB_OUTPUT_DIR) : undefined,
    emptyOutDir: true,
    sourcemap: false,
    target: "es2018",
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  };
});
