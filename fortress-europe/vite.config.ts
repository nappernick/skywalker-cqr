import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Everything (JS, CSS, the worker, map data) is inlined into one HTML file,
// because the published artifact must be a single self-contained page.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  worker: { format: "es" },
  build: {
    target: "es2022",
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
  },
});
